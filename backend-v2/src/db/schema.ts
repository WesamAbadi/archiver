/**
 * Drizzle schema — ported from backend/prisma/schema.prisma.
 *
 * Single-admin personal archive: no accounts, no sign-up, no social features.
 * `users` holds exactly ONE row (the admin) so media/quota keep an owner and
 * don't need a schema change if multi-user ever returns.
 *
 * Deliberately NOT here: Like, Comment, View, DownloadJob (all social/download
 * features), and the old engagement counters + PUBLIC/UNLISTED sharing columns
 * — removed so the API can't expose a surface nobody can reach (single admin).
 */
import {
  pgTable,
  pgEnum,
  customType,
  text,
  varchar,
  boolean,
  integer,
  doublePrecision,
  bigint,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql, type SQL } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Search support (Phase 5 — see MIGRATION_PLAN.md §5)
// ---------------------------------------------------------------------------

/**
 * Postgres `tsvector`. Drizzle has no first-class type for it, and the search
 * columns are generated from the row's own columns, so the app never writes
 * them — this exists so the schema can describe them and migrations stay in
 * sync with what the database actually has.
 */
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

/**
 * The `archivedrop_normalize_text*` functions are created by migration 0002 —
 * Drizzle cannot model functions, so it cannot generate them. They are what
 * makes Arabic search work here:
 *
 *  - strips harakat/tashkeel and the tatweel elongation character
 *  - unifies letter variants (أإآٱ→ا, ىئ→ي, ة→ه, ؤ→و, ک→ك, ی→ي)
 *  - maps Arabic-Indic digits onto ASCII
 *  - removes the definite article `ال` (and وال/بال/فال/كال/لل) from each word,
 *    so `الصباح` and `صباح` are the same term
 *  - lowercases Latin and collapses whitespace
 *
 * A generated column's expression must be IMMUTABLE, and `array_to_string` is
 * only STABLE in Postgres, which is why the array form is its own declared
 * immutable wrapper rather than an inline call.
 *
 * Changing any of this requires a migration that DROPS and re-adds the
 * generated columns and their indexes — the vectors have to be recomputed.
 */
const normalizeText = (expr: SQL) => sql`archivedrop_normalize_text(${expr})`;
const normalizeTexts = (expr: SQL) => sql`archivedrop_normalize_texts(${expr})`;

// ---------------------------------------------------------------------------
// Enums (values match the old Prisma enums exactly)
// ---------------------------------------------------------------------------

export const platformEnum = pgEnum('platform', [
  'YOUTUBE',
  'SOUNDCLOUD',
  'TWITTER',
  'TIKTOK',
  'INSTAGRAM',
  'TWITCH',
  'REDDIT',
  'DIRECT',
]);

export const downloadStatusEnum = pgEnum('download_status', [
  'PENDING',
  'DOWNLOADING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
]);

export const sortOrderEnum = pgEnum('sort_order', ['NEWEST', 'OLDEST', 'TITLE', 'POPULAR']);

export const captionStatusEnum = pgEnum('caption_status', [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'SKIPPED',
]);

export const captionJobStatusEnum = pgEnum('caption_job_status', [
  'QUEUED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
]);

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  /** DB primary key (was Prisma cuid; we generate nanoid-style ids in app code) */
  id: varchar('id', { length: 32 }).primaryKey(),
  /** Login identity of the single admin (was the Google OAuth `sub` claim). */
  uid: varchar('uid', { length: 64 }).notNull().unique(),
  /** Optional — the admin has no account/profile, so this stays null. */
  email: varchar('email', { length: 255 }).unique(),
  displayName: varchar('display_name', { length: 255 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),

  // Preference kept for the UI's default sort
  sortOrder: sortOrderEnum('sort_order').notNull().default('NEWEST'),
});

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const mediaItems = pgTable(
  'media_items',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originalUrl: text('original_url').notNull(),
    platform: platformEnum('platform').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    downloadStatus: downloadStatusEnum('download_status').notNull().default('COMPLETED'),

    // Caption status tracking
    captionStatus: captionStatusEnum('caption_status').notNull().default('PENDING'),
    captionErrorMessage: text('caption_error_message'),
    captionGeneratedAt: timestamp('caption_generated_at', { withTimezone: true }),

    // Flattened metadata
    duration: integer('duration'), // seconds
    size: bigint('size', { mode: 'number' }).notNull().default(0),
    format: varchar('format', { length: 32 }).notNull().default(''),
    resolution: varchar('resolution', { length: 32 }),
    thumbnailUrl: text('thumbnail_url'),
    originalAuthor: text('original_author'),
    originalTitle: text('original_title'),
    originalDescription: text('original_description'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    hashtags: text('hashtags').array().notNull().default(sql`'{}'::text[]`),

    // AI metadata
    aiSummary: text('ai_summary'),
    aiKeywords: text('ai_keywords').array().notNull().default(sql`'{}'::text[]`),
    aiGeneratedAt: timestamp('ai_generated_at', { withTimezone: true }),

    // --- Full-text search (generated; the app never writes these) -----------
    //
    // Weighted so a title hit outranks a description hit and a tag hit sits
    // between them: A = title, B = tags, C = description/author.
    //
    // Deliberately NOT indexed: ai_summary / ai_keywords / hashtags /
    // original_title / original_description. Nothing writes them in v2 (uploads
    // are direct, there is no metadata scraper), so indexing them would grow
    // every vector and index for columns that are always NULL. Adding one later
    // means a migration that drops and re-adds the generated column, since the
    // vectors have to be recomputed for existing rows.
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', ${normalizeText(sql`coalesce(title, '')`)}), 'A') ||
          setweight(to_tsvector('simple', ${normalizeTexts(sql`tags`)}), 'B') ||
          setweight(to_tsvector('simple', ${normalizeText(sql`coalesce(description, '')`)}), 'C') ||
          setweight(to_tsvector('simple', ${normalizeText(sql`coalesce(original_author, '')`)}), 'C')`,
    ),

    /**
     * The same text flattened into one normalized string, for substring and
     * fuzzy matching (`ILIKE '%…%'`, `word_similarity`). Full-text search alone
     * can't find `صباح` inside `الصباح` once the article strip fails to apply to
     * a word the indexer saw differently — trigram covers what lexeme matching
     * misses.
     */
    searchText: text('search_text').generatedAlwaysAs(
      sql`${normalizeText(
        sql`coalesce(title, '') || ' ' || ${normalizeTexts(sql`tags`)} || ' ' || coalesce(description, '') || ' ' || coalesce(original_author, '')`,
      )}`,
    ),
  },
  (t) => [
    index('media_items_user_created_idx').on(t.userId, t.createdAt),
    index('media_items_caption_status_idx').on(t.captionStatus, t.createdAt),
    index('media_items_search_vector_idx').using('gin', t.searchVector),
    index('media_items_search_text_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
  ],
);

export const mediaFiles = pgTable(
  'media_files',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    mediaItemId: varchar('media_item_id', { length: 32 })
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    filename: text('filename').notNull(), // R2 object key
    originalName: text('original_name').notNull(),
    mimeType: varchar('mime_type', { length: 127 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    // Legacy B2 columns removed; R2 keys live in `filename`.
    isOriginal: boolean('is_original').notNull().default(true),
    format: varchar('format', { length: 32 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('media_files_media_item_idx').on(t.mediaItemId)],
);

// ---------------------------------------------------------------------------
// Captions
// ---------------------------------------------------------------------------

export const captions = pgTable(
  'captions',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    mediaItemId: varchar('media_item_id', { length: 32 })
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    language: varchar('language', { length: 16 }).notNull().default('auto'),
    isAutoGenerated: boolean('is_auto_generated').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('captions_media_item_idx').on(t.mediaItemId)],
);

export const captionSegments = pgTable(
  'caption_segments',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    captionId: varchar('caption_id', { length: 32 })
      .notNull()
      .references(() => captions.id, { onDelete: 'cascade' }),
    startTime: doublePrecision('start_time').notNull(),
    endTime: doublePrecision('end_time').notNull(),
    text: text('text').notNull(),
    confidence: doublePrecision('confidence'),

    /**
     * Transcript search — this is what lets the archive answer "which track
     * says this?" and return the timestamp to jump to. One weight: a lyric line
     * has no title/tag/description hierarchy.
     */
    searchVector: tsvector('search_vector').generatedAlwaysAs(
      sql`to_tsvector('simple', ${normalizeText(sql`coalesce(text, '')`)})`,
    ),
  },
  (t) => [
    index('caption_segments_caption_start_idx').on(t.captionId, t.startTime),
    index('caption_segments_search_vector_idx').using('gin', t.searchVector),
  ],
);

// ---------------------------------------------------------------------------
// Caption job queue (state lives in DB; execution will be Cloudflare Queues in Phase 2)
// ---------------------------------------------------------------------------

export const captionJobs = pgTable(
  'caption_jobs',
  {
    id: varchar('id', { length: 32 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mediaItemId: varchar('media_item_id', { length: 32 })
      .notNull()
      .references(() => mediaItems.id, { onDelete: 'cascade' }),
    status: captionJobStatusEnum('status').notNull().default('QUEUED'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    errorMessage: text('error_message'),
    processingStartedAt: timestamp('processing_started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('caption_jobs_status_idx').on(t.status, t.createdAt),
    index('caption_jobs_user_status_idx').on(t.userId, t.status),
  ],
);

// ---------------------------------------------------------------------------
// Admin sessions — opaque bearer tokens, server-side state (no JWT)
// ---------------------------------------------------------------------------

export const adminSessions = pgTable(
  'admin_sessions',
  {
    /** SHA-256 of the raw token. The raw value only ever exists client-side. */
    tokenHash: varchar('token_hash', { length: 64 }).primaryKey(),
    userId: varchar('user_id', { length: 32 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('admin_sessions_expires_idx').on(t.expiresAt),
    index('admin_sessions_user_idx').on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  mediaItems: many(mediaItems),
  captionJobs: many(captionJobs),
  sessions: many(adminSessions),
}));

export const adminSessionsRelations = relations(adminSessions, ({ one }) => ({
  user: one(users, { fields: [adminSessions.userId], references: [users.id] }),
}));

export const mediaItemsRelations = relations(mediaItems, ({ one, many }) => ({
  user: one(users, { fields: [mediaItems.userId], references: [users.id] }),
  files: many(mediaFiles),
  captions: many(captions),
  captionJobs: many(captionJobs),
}));

export const mediaFilesRelations = relations(mediaFiles, ({ one }) => ({
  mediaItem: one(mediaItems, {
    fields: [mediaFiles.mediaItemId],
    references: [mediaItems.id],
  }),
}));

export const captionsRelations = relations(captions, ({ one, many }) => ({
  mediaItem: one(mediaItems, {
    fields: [captions.mediaItemId],
    references: [mediaItems.id],
  }),
  segments: many(captionSegments),
}));

export const captionSegmentsRelations = relations(captionSegments, ({ one }) => ({
  caption: one(captions, {
    fields: [captionSegments.captionId],
    references: [captions.id],
  }),
}));

export const captionJobsRelations = relations(captionJobs, ({ one }) => ({
  user: one(users, { fields: [captionJobs.userId], references: [users.id] }),
  mediaItem: one(mediaItems, {
    fields: [captionJobs.mediaItemId],
    references: [mediaItems.id],
  }),
}));

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type MediaItem = typeof mediaItems.$inferSelect;
export type NewMediaItem = typeof mediaItems.$inferInsert;
export type MediaFile = typeof mediaFiles.$inferSelect;
export type NewMediaFile = typeof mediaFiles.$inferInsert;
export type Caption = typeof captions.$inferSelect;
export type NewCaption = typeof captions.$inferInsert;
export type CaptionSegment = typeof captionSegments.$inferSelect;
export type NewCaptionSegment = typeof captionSegments.$inferInsert;
export type CaptionJob = typeof captionJobs.$inferSelect;
export type NewCaptionJob = typeof captionJobs.$inferInsert;
export type AdminSession = typeof adminSessions.$inferSelect;
export type NewAdminSession = typeof adminSessions.$inferInsert;

export type Platform = (typeof platformEnum.enumValues)[number];
export type CaptionStatus = (typeof captionStatusEnum.enumValues)[number];
export type CaptionJobStatus = (typeof captionJobStatusEnum.enumValues)[number];

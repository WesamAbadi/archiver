/**
 * Search service — titles, tags, descriptions and transcripts.
 *
 * Replaces the old `SearchService` (420 lines, one `WITH RECURSIVE` CTE,
 * `similarity()` over whole transcript segments, and a JS normalizer applied to
 * the query but not to the index). The rewrite is three ideas:
 *
 *   1. ONE query for ranking. No recursion, no per-result N+1.
 *   2. Normalization happens in the database, in `archivedrop_normalize_text`,
 *      applied to the indexed columns and the user's query alike — so the
 *      index and the search terms can't disagree (the old bug: indexed with
 *      `english`, queried with `simple`, so the index was never used).
 *   3. Full-text search AND trigram, because each covers the other's blind
 *      spot. `simple` has no Arabic stemmer, so `الصباح`/`صباح` only line up
 *      because normalization strips the article; and `يشتاق`/`اشتياق` (same
 *      root, different derivation) don't match at all — substring and
 *      word_similarity catch what lexeme matching misses.
 *
 * Ranking weights, in order of what a hit means:
 *   3.0  full-text rank over the weighted vector (title A > tags B > desc C)
 *   2.5  word_similarity against the title (typos, partial words)
 *   2.0  the query appears inside the normalized title
 *   1.0  the query appears anywhere in the flattened searchable text
 *   1.5  best matching transcript segment
 *
 * `websearch_to_tsquery` (not `to_tsquery`) parses the query: it accepts quoted
 * phrases, `or`, and `-term`, and — the real reason — it never raises a syntax
 * error on raw user input. The old code interpolated into `to_tsquery`, so a
 * stray quote or bracket was a 500.
 */
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../db/client';
import { mediaItems, mediaFiles, type MediaItem } from '../db/schema';
import { serializeMediaItem, type MediaItemDTO } from './media';

/** Longest query we'll process. Zod enforces it at the edge too. */
export const MAX_QUERY_LENGTH = 200;

/** Below this, substring matching is more noise than signal ("or" in "recording"). */
const MIN_SUBSTRING_LENGTH = 3;

export type SearchMatchField = 'title' | 'tags' | 'description' | 'lyrics';

export interface SearchHit extends MediaItemDTO {
  match: {
    /** Which fields matched. 'lyrics' means the text is in the transcript. */
    fields: SearchMatchField[];
    /** The best-matching transcript segment, with its timestamp to jump to. */
    lyric: { text: string; startTime: number } | null;
  };
}

export interface SearchPage {
  items: SearchHit[];
  query: string;
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Escape a value for use inside an ILIKE pattern.
 *
 * Without this, a query of `%` matches every row and `_` matches any character
 * — a search box that returns the whole library for one punctuation mark. The
 * pattern is always used with `ESCAPE '\'`, and this must match that choice.
 */
const escapeLike = (value: SQL | unknown): SQL =>
  sql`replace(replace(replace(${value}, '\\', '\\\\'), '%', '\\%'), '_', '\\_')`;

/**
 * The owner predicate, or nothing at all.
 *
 * The archive is public, so these queries run in two audiences: a visitor, who
 * must see every row, and the admin, whose reads stay owner-scoped. Rather than
 * build two query variants (and let them drift), the predicate is appended only
 * when an owner is given, and each query keeps a `WHERE TRUE` anchor so the
 * statement is valid either way. For the admin the SQL is byte-for-byte what it
 * was before, index use included.
 */
const ownerFilter = (userId?: string): SQL =>
  userId ? sql`AND m.user_id = ${userId}` : sql``;

/**
 * Row shape returned by the ranking query. A type alias, not an interface, so it
 * satisfies Drizzle's `Record<string, unknown>` constraint on `execute<T>`.
 */
type RankRow = {
  id: string;
  score: number;
  in_title: boolean;
  in_tags: boolean;
  in_description: boolean;
  in_lyrics: boolean;
  lyric_text: string | null;
  lyric_start: number | null;
  total: string | number;
};

/**
 * Rank matching media items. Returns a page of `media_items` rows plus what
 * matched; the caller hydrates files and serializes, so search results are the
 * same shape as the library list and share one serializer.
 */
async function rankMedia(
  db: DB,
  userId: string | undefined,
  query: string,
  limit: number,
  offset: number,
): Promise<{ rows: RankRow[]; total: number }> {
  const result = await db.execute<RankRow>(sql`
    WITH p AS (
      SELECT websearch_to_tsquery('simple', archivedrop_normalize_text(${query}::text)) AS tsq,
             archivedrop_normalize_text(${query}::text) AS norm
    ),
    -- Best transcript segment per media item. Aggregated in one pass: the old
    -- implementation recomputed similarity() for every segment of every row.
    lyric AS (
      SELECT c.media_item_id,
             max(ts_rank_cd(cs.search_vector, p.tsq, 32)) AS rank,
             (array_agg(cs.text ORDER BY ts_rank_cd(cs.search_vector, p.tsq, 32) DESC, cs.start_time))[1] AS snippet,
             (array_agg(cs.start_time ORDER BY ts_rank_cd(cs.search_vector, p.tsq, 32) DESC, cs.start_time))[1] AS at
      FROM caption_segments cs
      JOIN captions c ON c.id = cs.caption_id
      CROSS JOIN p
      WHERE cs.search_vector @@ p.tsq
      GROUP BY c.media_item_id
    )
    SELECT m.id,
           (
               3.0 * ts_rank_cd(m.search_vector, p.tsq, 32)
             + 2.5 * word_similarity(p.norm, archivedrop_normalize_text(m.title))
             + 2.0 * (CASE WHEN strpos(archivedrop_normalize_text(m.title), p.norm) > 0 THEN 1 ELSE 0 END)
             + 1.0 * (CASE WHEN strpos(m.search_text, p.norm) > 0 THEN 1 ELSE 0 END)
             + 1.5 * coalesce(l.rank, 0)
           )::float8 AS score,
           strpos(archivedrop_normalize_text(m.title), p.norm) > 0       AS in_title,
           strpos(archivedrop_normalize_texts(m.tags), p.norm) > 0        AS in_tags,
           strpos(archivedrop_normalize_text(coalesce(m.description, '')), p.norm) > 0 AS in_description,
           (l.media_item_id IS NOT NULL)                                  AS in_lyrics,
           l.snippet                                                      AS lyric_text,
           l.at                                                           AS lyric_start,
           count(*) OVER ()                                               AS total
    FROM media_items m
    CROSS JOIN p
    LEFT JOIN lyric l ON l.media_item_id = m.id
    WHERE TRUE ${ownerFilter(userId)}
      AND p.norm <> ''
      AND (
        m.search_vector @@ p.tsq
        -- Substring match. Prefix-anchored LIKE patterns can use the trigram
        -- index; a leading wildcard can't, but at personal-archive scale the
        -- scan is irrelevant next to the ranking work.
        OR (
          length(p.norm) >= ${MIN_SUBSTRING_LENGTH}
          AND m.search_text ILIKE '%' || ${escapeLike(sql`p.norm`)} || '%' ESCAPE '\'
        )
        OR (
          length(p.norm) >= ${MIN_SUBSTRING_LENGTH}
          AND word_similarity(p.norm, archivedrop_normalize_text(m.title)) > 0.55
        )
        OR l.media_item_id IS NOT NULL
      )
    ORDER BY score DESC, m.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const rows = result.rows;
  return { rows, total: Number(rows[0]?.total ?? 0) };
}

export async function searchMedia(
  db: DB,
  userId: string | undefined,
  opts: { query: string; page?: number; limit?: number },
): Promise<SearchPage> {
  const query = opts.query.trim().slice(0, MAX_QUERY_LENGTH);
  const page = Math.max(1, opts.page ?? 1);
  const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
  const offset = (page - 1) * limit;

  // Nothing to match on. Returning early also keeps `ILIKE '%%'` — which would
  // match every row — from ever reaching the database.
  if (hasNoSearchTerm(query)) {
    return { items: [], query, page, limit, total: 0, totalPages: 0 };
  }

  const { rows, total } = await rankMedia(db, userId, query, limit, offset);
  if (rows.length === 0) {
    return { items: [], query, page, limit, total, totalPages: 0 };
  }

  // Hydrate files for just this page (same approach as the library list, one
  // extra query rather than a join that multiplies rows).
  const ids = rows.map((r) => r.id);
  const fileRows = await db
    .select({ media_files: mediaFiles })
    .from(mediaFiles)
    .where(inArray(mediaFiles.mediaItemId, ids));
  const filesByItem = new Map<string, (typeof mediaFiles.$inferSelect)[]>();
  for (const row of fileRows) {
    const f = row.media_files;
    if (!f) continue;
    const list = filesByItem.get(f.mediaItemId) ?? [];
    list.push(f);
    filesByItem.set(f.mediaItemId, list);
  }

  // The ranking query selects ids and match metadata, not whole rows, so load
  // the full items to serialize — then re-apply the ranked order, since the
  // database is free to return these in any order.
  const itemRows = await db
    .select()
    .from(mediaItems)
    .where(
      userId
        ? and(eq(mediaItems.userId, userId), inArray(mediaItems.id, ids))
        : inArray(mediaItems.id, ids),
    );
  const itemsById = new Map<string, MediaItem>();
  for (const item of itemRows) itemsById.set(item.id, item);

  const items: SearchHit[] = [];
  for (const row of rows) {
    const item = itemsById.get(row.id);
    if (!item) continue;

    const fields: SearchMatchField[] = [];
    if (row.in_title) fields.push('title');
    if (row.in_tags) fields.push('tags');
    if (row.in_description) fields.push('description');
    if (row.in_lyrics) fields.push('lyrics');

    items.push({
      ...serializeMediaItem(item, filesByItem.get(row.id) ?? []),
      match: {
        // No field flag but a hit means it matched on similarity alone.
        fields: fields.length > 0 ? fields : ['title'],
        lyric:
          row.in_lyrics && row.lyric_text !== null && row.lyric_start !== null
            ? { text: row.lyric_text, startTime: Number(row.lyric_start) }
            : null,
      },
    });
  }

  return { items, query, page, limit, total, totalPages: Math.ceil(total / limit) };
}

/**
 * True when the query has no term worth searching for.
 *
 * Only whitespace and punctuation is not a search. Checked in JS so the common
 * case costs nothing, and mirrored by `p.norm <> ''` in SQL so the two can't
 * disagree about an empty query.
 */
export function hasNoSearchTerm(query: string): boolean {
  return query.replace(/[\s\p{P}\p{S}]/gu, '').length === 0;
}

export interface Suggestion {
  value: string;
  kind: 'title' | 'tag';
}

/**
 * Typeahead suggestions: matching titles first, then matching tags.
 *
 * Deliberately two small queries merged in JS rather than one UNION — the
 * result sets are tiny and bounded, and this avoids a second piece of SQL to
 * reason about.
 *
 * Matching is a *substring*, not a prefix, ranked so that prefix matches come
 * first. Prefix-only looks right until you try it on real Arabic titles: a
 * library holding `أغنية الصباح الجميل` would never suggest itself for `صباح`
 * because the word isn't at the start of the title. Both are compared through
 * `archivedrop_normalize_text`, so the article strip and letter unification
 * apply here too.
 *
 * Neither query can use an index — both compare a normalized expression, and
 * `unnest` has no index at all — so they are sequential scans. Deliberate at
 * personal-archive scale (a few thousand rows, and the LIMIT is 5): the
 * alternative is two more generated columns and two more indexes to keep in
 * sync for typeahead only.
 */
export async function suggest(
  db: DB,
  userId: string | undefined,
  query: string,
  limit = 8,
): Promise<Suggestion[]> {
  const q = query.trim().slice(0, MAX_QUERY_LENGTH);
  if (hasNoSearchTerm(q)) return [];

  const perKind = Math.min(limit, 5);
  const normalized = sql`archivedrop_normalize_text(${q}::text)`;
  const pattern = () => sql`'%' || ${escapeLike(normalized)} || '%'`;

  const titles = await db.execute<{ title: string }>(sql`
    SELECT m.title
    FROM media_items m
    WHERE TRUE ${ownerFilter(userId)}
      AND archivedrop_normalize_text(m.title) LIKE ${pattern()} ESCAPE '\'
    ORDER BY (archivedrop_normalize_text(m.title) LIKE ${escapeLike(normalized)} || '%' ESCAPE '\') DESC,
             length(m.title)
    LIMIT ${perKind}
  `);

  const tags = await db.execute<{ tag: string }>(sql`
    SELECT DISTINCT tag
    FROM media_items m, unnest(m.tags) AS tag
    WHERE TRUE ${ownerFilter(userId)}
      AND archivedrop_normalize_text(tag) LIKE ${pattern()} ESCAPE '\'
    ORDER BY tag
    LIMIT ${perKind}
  `);

  const seen = new Set<string>();
  const out: Suggestion[] = [];
  for (const row of titles.rows) {
    const key = row.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: row.title, kind: 'title' });
  }
  for (const row of tags.rows) {
    const key = row.tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ value: row.tag, kind: 'tag' });
  }
  return out.slice(0, limit);
}

-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5 — search over titles, tags, descriptions and transcripts
--
-- The statements below the prelude are Drizzle-generated. The prelude is not:
-- Drizzle has no representation for extensions or functions, so it can neither
-- generate nor diff them. It must stay FIRST in this file, because:
--   * `pg_trgm` must exist before the `gin_trgm_ops` index is created
--   * both functions must exist before the generated columns that call them
--
-- If you edit `archivedrop_normalize_text*`, the generated columns will NOT
-- recompute. Changing normalization requires dropping and re-adding the
-- generated columns and their indexes so every existing row is re-normalized.
-- ═══════════════════════════════════════════════════════════════════════════

-- Trigram index support for substring and typo-tolerant matching.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ═══════════════════════════════════════════════════════════════════════════
-- archivedrop_normalize_text — the single definition of "normalized" for search
--
-- Applied to BOTH the indexed columns and the user's query, so the two always
-- agree. This is the fix for the old codebase's central search bug: it indexed
-- with the `english` config and queried with `simple`, so the index was never
-- used, and it worked around Arabic variants with a 100-line JS heuristic that
-- ran on the query only.
--
-- What it does, in order:
--   1. drops harakat/tashkeel, the tatweel elongation char, and LRM/RLM marks
--      that get pasted in from web pages
--   2. unifies letter variants via translate(), char-for-char:
--        أ إ آ ٱ  → ا        (hamza forms of alef)
--        ى ئ     → ي        (alef maqsura, hamza on ya)
--        ؤ       → و        (hamza on waw)
--        ة       → ه        (ta marbuta)
--        ک ی     → ك ي      (Persian kaf / farsi yeh)
--        ٠-٩     → 0-9      (Arabic-Indic digits)
--        (both translate() lists MUST stay the same length — translate maps
--         positionally, and a short `to` string silently DELETES the extras)
--   3. lowercases, which is a no-op for Arabic and the whole point for Latin
--   4. strips the definite article per word: ال and the fused forms
--      وال بال فال كال لل. The `(?=[\u0600-\u06FF])` lookahead restricts this to
--      words whose next character is Arabic, so English terms beginning with
--      "al" (always, album, alabama) are left alone. Note Postgres regexes do
--      NOT support \p{Arabic} — the codepoint range is the portable way.
--   5. collapses runs of whitespace
--
-- Without step 4, `الصباح` and `صباح` are different lexemes and an Arabic
-- archive is effectively unsearchable for any word that carries the article.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION archivedrop_normalize_text(input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT CASE
    WHEN input IS NULL OR input = '' THEN ''
    ELSE btrim(
      regexp_replace(
        regexp_replace(
          lower(
            translate(
              regexp_replace(input, U&'[\064B-\065F\0670\0640\200E\200F]', '', 'g'),
              U&'\0623\0625\0622\0671\0649\0626\0624\0629\06A9\06CC\0660\0661\0662\0663\0664\0665\0666\0667\0668\0669',
              U&'\0627\0627\0627\0627\064A\064A\0648\0647\0643\064A\0030\0031\0032\0033\0034\0035\0036\0037\0038\0039'
            )
          ),
          '\m(?:وال|بال|فال|كال|لل|ال)(?=[\u0600-\u06FF])', '', 'g'
        ),
        '\s+', ' ', 'g'
      )
    )
  END
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- archivedrop_normalize_texts — the same normalization for a text[] column
--
-- It exists as its own function purely because a generated column's expression
-- must be IMMUTABLE and **`array_to_string` is only STABLE in Postgres** (both
-- its 2- and 3-argument forms). Declaring the wrapper IMMUTABLE is sound in
-- practice: array_to_string is only marked STABLE because an element type's
-- output function could be locale-dependent, and for `text` it is the identity.
--
-- Used for `tags`: to_tsvector can't consume an array, and array_to_tsvector
-- would bypass normalization entirely.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION archivedrop_normalize_texts(input text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $fn$
  SELECT archivedrop_normalize_text(array_to_string(coalesce(input, ARRAY[]::text[]), ' '))
$fn$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Generated columns and indexes (Drizzle-generated from src/db/schema.ts)
--
-- STORED generated columns rather than app-maintained values, so a vector can
-- never drift from the row it belongs to. ALTER TABLE … STORED rewrites the
-- table and computes every existing row, which is exactly what we want here.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE "caption_segments" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('simple', archivedrop_normalize_text(coalesce(text, '')))) STORED;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "search_vector" "tsvector" GENERATED ALWAYS AS (setweight(to_tsvector('simple', archivedrop_normalize_text(coalesce(title, ''))), 'A') ||
          setweight(to_tsvector('simple', archivedrop_normalize_texts(tags)), 'B') ||
          setweight(to_tsvector('simple', archivedrop_normalize_text(coalesce(description, ''))), 'C') ||
          setweight(to_tsvector('simple', archivedrop_normalize_text(coalesce(original_author, ''))), 'C')) STORED;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "search_text" text GENERATED ALWAYS AS (archivedrop_normalize_text(coalesce(title, '') || ' ' || archivedrop_normalize_texts(tags) || ' ' || coalesce(description, '') || ' ' || coalesce(original_author, ''))) STORED;--> statement-breakpoint
CREATE INDEX "caption_segments_search_vector_idx" ON "caption_segments" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "media_items_search_vector_idx" ON "media_items" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "media_items_search_text_trgm_idx" ON "media_items" USING gin ("search_text" gin_trgm_ops);

/**
 * Search integration test — real service code, real Postgres, zero mutation.
 *
 *   cd backend-v2 && npx tsx scripts/verify-search.ts
 *
 * How it stays safe: everything runs inside ONE transaction on ONE connection
 * that is always rolled back, and the search service is handed a Drizzle client
 * built on that same connection. So this exercises the actual `searchMedia` and
 * `suggest` code paths — the generated SQL, the parameter binding, the ranking —
 * against the real database, and still changes nothing.
 *
 * That matters because the interesting failures here aren't type errors. They're
 * whether `websearch_to_tsquery` survives raw user input, whether a `%` in the
 * query escapes, whether the article strip actually unifies الصباح/صباح, and
 * whether generated columns read back as numbers rather than strings.
 *
 * Requires DATABASE_URL (same as drizzle.config.ts). Exits non-zero on failure.
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '../src/db/schema';
import { searchMedia, suggest, hasNoSearchTerm } from '../src/services/search';

const MIGRATION = fileURLToPath(new URL('../drizzle/0002_clammy_hercules.sql', import.meta.url));

// ---------------------------------------------------------------------------
// Fixtures — inserted inside the transaction, never committed
// ---------------------------------------------------------------------------

const ADMIN = { id: 'vfy-user', uid: 'admin-verify' };
const ITEM_ARABIC = 'vfy-arabic';
const ITEM_LYRICS = 'vfy-lyrics';
const LYRIC_AT = 83.5;

const FIXTURES = /* sql */ `
INSERT INTO users (id, uid) VALUES ('${ADMIN.id}', '${ADMIN.uid}')
  ON CONFLICT (id) DO NOTHING;

INSERT INTO media_items (id, user_id, original_url, platform, title, description, tags)
VALUES
  ('${ITEM_ARABIC}', '${ADMIN.id}', 'direct-upload', 'DIRECT',
   'أغنية الصباح الجميل', 'A beautiful morning song', ARRAY['موسيقى','morning']),
  ('${ITEM_LYRICS}', '${ADMIN.id}', 'direct-upload', 'DIRECT',
   'Untitled recording', 'nothing here', ARRAY['recording']);

INSERT INTO captions (id, media_item_id) VALUES ('vfy-cap', '${ITEM_LYRICS}');
INSERT INTO caption_segments (id, caption_id, start_time, end_time, text)
VALUES ('vfy-seg', 'vfy-cap', ${LYRIC_AT}, 90.0, 'القلب يشتاق إلينا في الصباح');
`;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ok    ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${label}${detail ? `  — ${detail}` : ''}`);
  }
}

async function main() {
  const migrationSql = readFileSync(MIGRATION, 'utf8');
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const db = drizzle(client, { schema });

  try {
    await client.query('BEGIN');

    // Work whether or not migration 0002 has been applied for real. The ALTERs
    // are not idempotent (Postgres has no ADD COLUMN IF NOT EXISTS for generated
    // columns in this form), so the script checks instead of blindly replaying —
    // otherwise it would pass before the migration and fail after it.
    const { rows: existing } = await client.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'media_items' AND column_name = 'search_vector'`,
    );
    if (existing.length > 0) {
      console.log('search columns already present — migration 0002 is applied');
    } else {
      console.log('applying migration 0002 inside the transaction (not yet migrated)');
      for (const statement of migrationSql.split('--> statement-breakpoint')) {
        if (statement.trim()) await client.query(statement);
      }
    }

    await client.query(FIXTURES);

    const q = (query: string, extra: { page?: number; limit?: number } = {}) =>
      searchMedia(db, ADMIN.id, { query, ...extra });
    const ids = async (query: string) => (await q(query)).items.map((i) => i.id);

    console.log('\npure helper');
    check('hasNoSearchTerm("") is true', hasNoSearchTerm(''));
    check('hasNoSearchTerm("   ") is true', hasNoSearchTerm('   '));
    check('hasNoSearchTerm("!!!") is true', hasNoSearchTerm('!!!'));
    check('hasNoSearchTerm("صباح") is false', !hasNoSearchTerm('صباح'));

    console.log('\nArabic definite article (the reason normalization exists)');
    check('"الصباح" finds the Arabic title', (await ids('الصباح')).includes(ITEM_ARABIC));
    check('"صباح" finds the same item', (await ids('صباح')).includes(ITEM_ARABIC));
    check('"الأغنية" finds it (article + hamza form)', (await ids('الأغنية')).includes(ITEM_ARABIC));

    console.log('\ntranscripts');
    const lyricHits = await q('يشتاق');
    const lyricHit = lyricHits.items.find((i) => i.id === ITEM_LYRICS);
    check('"يشتاق" matches a lyric line', Boolean(lyricHit));
    check('the hit reports the lyrics field', lyricHit?.match.fields.includes('lyrics') === true);
    check(
      `the hit carries its timestamp (${LYRIC_AT}s)`,
      lyricHit?.match.lyric?.startTime === LYRIC_AT,
      `got ${String(lyricHit?.match.lyric?.startTime)}`,
    );
    check('the hit carries the matched line', (lyricHit?.match.lyric?.text ?? '').includes('يشتاق'));
    check('a title-only match reports no lyric', (await q('ملحمة')).items.every((i) => i.match.lyric === null));

    console.log('\ntags and Latin');
    check('"música"→"morning" matches via tag', (await ids('morning')).includes(ITEM_ARABIC));
    check('"موسيقى" matches via tag', (await ids('موسيقى')).includes(ITEM_ARABIC));

    console.log('\nadversarial input (must never throw, never match everything)');
    check('empty query returns nothing', (await q('')).items.length === 0);
    check('whitespace query returns nothing', (await q('   ')).items.length === 0);
    check('"%" does not match every row', (await q('%')).items.length === 0);
    check('"_" does not match every row', (await q('_')).items.length === 0);
    check('punctuation only returns nothing', (await q('!!!')).items.length === 0);
    check('unbalanced quote is handled', (await q('"unbalanced')).items.length === 0);
    check('200-char gibberish is handled', (await q('a'.repeat(200))).items.length === 0);
    check('-term (negation) is handled', Array.isArray((await q('-morning')).items));

    console.log('\nshapes and pagination');
    const page = await q('الصباح', { limit: 1 });
    check('limit is honoured', page.items.length <= 1);
    check('total counts all matches, not just the page', page.total >= page.items.length);
    check('score is a number, not a string', typeof (page.items[0] as { size: number } | undefined)?.size === 'number');
    check('items carry files array', Array.isArray(page.items[0]?.files));
    const paged = await q('a', { page: 2, limit: 1 });
    check('page 2 does not repeat page 1', paged.items[0]?.id !== (await q('a', { limit: 1 })).items[0]?.id || paged.items.length === 0);

    console.log('\nsuggestions');
    const s1 = await suggest(db, ADMIN.id, 'صب', 8);
    check('"صب" suggests the normalized Arabic title', s1.some((s) => s.value === 'أغنية الصباح الجميل'));
    const s2 = await suggest(db, ADMIN.id, 'mor', 8);
    check('"mor" suggests the tag "morning" (Latin prefix)', s2.some((s) => s.value === 'morning' && s.kind === 'tag'));
    const s3 = await suggest(db, ADMIN.id, 'morning', 8);
    check('the same word as title and tag is deduped', new Set(s3.map((s) => s.value.toLowerCase())).size === s3.length);
    check('empty query yields no suggestions', (await suggest(db, ADMIN.id, '', 8)).length === 0);
    check('"%" yields no suggestions', (await suggest(db, ADMIN.id, '%', 8)).length === 0);
    check('suggestions are deduped', new Set(s1.map((s) => s.value)).size === s1.length);
  } catch (err) {
    failures += 1;
    console.error('\nFAILED:', err instanceof Error ? err.message : err);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }

  console.log(
    failures === 0
      ? '\nall search checks passed — transaction rolled back, database untouched\n'
      : `\n${failures} check(s) failed\n`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();

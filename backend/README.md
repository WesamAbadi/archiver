# ArchiveDrop API

Cloudflare Workers + Hono + Drizzle (Postgres via Hyperdrive) + R2. The rewrite described in [`../MIGRATION_PLAN.md`](../MIGRATION_PLAN.md).

## Layout

```
src/
  index.ts          Hono app entry (CORS, errors, routes, queue consumer, cron)
  env.ts            Shared bindings type
  auth/             admin credential check + DB sessions + middleware
  db/               Drizzle client (Hyperdrive) + schema
  lib/id.ts         nanoid ids
  queue/            messages.ts (typed contract) + consumer.ts (ack/retry + cron)
  routes/           auth.ts, media.ts, captions.ts, search.ts
  services/         r2.ts (presign), users.ts, media.ts, captions.ts, groq.ts, search.ts
drizzle/            generated migrations (0002's search prelude is hand-written)
scripts/            verify + dry-run tooling (see "Verifying" below)
test/               vitest unit tests
```

## Setup

Uses **pnpm** (as does the frontend) — one package manager for the repo.

```bash
pnpm install

# Local secrets for `wrangler dev` (same keys as production — see .env.example):
cp .dev.vars.example .dev.vars

# Database migrations (reads DATABASE_URL from .env):
cp .env.example .env        # fill in DATABASE_URL only
npx drizzle-kit generate
npx drizzle-kit migrate

pnpm typecheck
pnpm test
pnpm dev                    # wrangler dev on http://localhost:8787
```

### Environment variables — where each one lives

| Variable | Production | Local dev | Notes |
|---|---|---|---|
| `R2_BUCKET_NAME` | `wrangler.jsonc` vars | `wrangler.jsonc` vars | committed, non-secret |
| `CORS_ORIGINS` | `wrangler.jsonc` vars | `wrangler.jsonc` vars | comma-separated origins |
| `ADMIN_USERNAME` | `wrangler.jsonc` vars (optional) | `.dev.vars` | defaults to `admin` |
| `ADMIN_PASSWORD` | `wrangler secret put` | `.dev.vars` | the single admin password |
| `GROQ_API_KEY` | `wrangler secret put` | `.dev.vars` | console.groq.com → API Keys |
| `GROQ_MODEL` (optional) | `wrangler secret put` | `.dev.vars` | default `whisper-large-v3-turbo` |
| `R2_ACCOUNT_ID` | `wrangler secret put` | `.dev.vars` | Cloudflare account id |
| `R2_ACCESS_KEY_ID` | `wrangler secret put` | `.dev.vars` | R2 S3 API token (read+write) |
| `R2_SECRET_ACCESS_KEY` | `wrangler secret put` | `.dev.vars` | R2 S3 API token secret |
| `DATABASE_URL` | — (Hyperdrive binding) | `.env` | direct Postgres URL for drizzle-kit; optional `wrangler dev` fallback |

Rule of thumb: **one value, one place.** Vars that aren't secrets are committed in `wrangler.jsonc`; secrets never touch git (`.dev.vars` and `.env` are gitignored).

## Cloudflare setup (production)

> Steps 0, 3, 4, 5 and the R2 bucket (step 1) are done ✅. Work through the rest in order.

0. **Auth** — `npx wrangler login` ✅ (done)
1. **R2 bucket** — ✅ (done: `archivedrop-media`)
   ```bash
   npx wrangler r2 bucket create archivedrop-media
   ```
2. **R2 S3 API token** — Dashboard → R2 → Manage API Tokens → *Object Read & Write*, scoped to `archivedrop-media`. You get an Access Key ID + Secret (and the account ID is on the R2 overview page).
3. **Worker** — already created when you ran `wrangler secret put` ✅ (done)
4. **Hyperdrive** — ✅ (done: id `db89e4c4ee6a4492b4aaf11cb44474f8`, already in `wrangler.jsonc`).
   Use Neon's **direct** endpoint (no `-pooler`) — Hyperdrive pools globally on its own.
   ```bash
   DBURL=$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2-)
   npx wrangler hyperdrive create archivedrop-db --connection-string="$DBURL"
   ```
   Paste the returned id into `wrangler.jsonc` (`hyperdrive[0].id`).
5. **Queues** — ✅ (done: `caption-jobs`, `caption-jobs-dlq`). The DLQ relationship is configured in `wrangler.jsonc` (NOT a CLI flag — wrangler v4 removed it, which is why `--dead-letter-queue` errored):
   ```bash
   npx wrangler queues create caption-jobs-dlq     # DLQ first...
   npx wrangler queues create caption-jobs         # ...then the main queue
   ```
   (Consumer wiring incl. `dead_letter_queue` is already in `wrangler.jsonc` and applies on `deploy`.)
6. **Remaining secrets** — full reference in `.env.example`:
   ```bash
   npx wrangler secret put ADMIN_PASSWORD     # the single admin login
   npx wrangler secret put GROQ_API_KEY
   npx wrangler secret put R2_ACCOUNT_ID      # cd44a0798b65c58ebc57781fe5e86016
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   ```
7. **Bucket CORS** (required for browser PUTs) — allow `PUT, GET` from your frontend origin, expose `ETag` (dashboard → R2 → bucket → CORS policy).
8. **Deploy** — `pnpm deploy`, then verify: `curl https://<worker-domain>/health`
9. **CORS** — add your production Pages URL to `CORS_ORIGINS` in `wrangler.jsonc` and redeploy.

## Troubleshooting

**`Authentication error [code: 10000]` on every command, targeting an account id you don't recognise.**
Wrangler caches the last-used account in `node_modules/.cache/wrangler/wrangler-account.json` and reuses it blindly — even after that account stops being accessible. Check with `npx wrangler whoami` (or `curl .../client/v4/memberships`); if the cached id isn't in the list, delete the cache file:

```bash
rm -f node_modules/.cache/wrangler/wrangler-account.json
```

Or pin the account explicitly for a command: `CLOUDFLARE_ACCOUNT_ID=<id> npx wrangler ...`.

**Reads return stale data — a write succeeds, then the next read doesn't see it (`SUM(size)` reads back 0).**
**Hyperdrive query caching is ON by default** (`"caching": { "disabled": false }`) and
it caches by exact SQL text. Any query that is byte-identical on every call — an
aggregate like `SELECT COALESCE(SUM(size),0) …` with a fixed `WHERE` — becomes a
permanent cache hit and keeps serving the result from whenever it was first run.

This is not a small annoyance. It breaks every read-after-write path, most
visibly `GET /api/media/quota` (upload succeeds, quota stays 0) and
`GET /api/media/:id/caption-status` (**transcription appears stuck forever**,
because the polling SQL is identical on every poll). It was worth ~nothing here
— a single-admin archive — while inventing a whole class of phantom bugs.

Fix (connection pooling and edge routing are unaffected):

```bash
npx wrangler hyperdrive get <config-id>                      # expect caching.disabled: true
npx wrangler hyperdrive update <config-id> --caching-disabled
```

`scripts/smoke-storage.sh` asserts this in step 5, and prints these instructions
when it fails — a direct DB check showing the row exists while the API reads 0 is
the signature.

## Verifying the storage path

The two scripts below are the difference between "it deploys" and "it works".
Both need the admin password, because they log in against the real API:

```bash
ADMIN_PASSWORD='…' ./scripts/smoke-storage.sh     # login → presign → PUT → confirm → quota → delete
ADMIN_PASSWORD='…' ./scripts/verify-playback.sh   # signed playback URL + real R2 deletion
```

`smoke-storage.sh` step 3 is the important one: it PUTs real bytes to R2, which
is the only way to prove the S3 token can **write**. A read-only token signs
presigned URLs happily (signing is local math) and only fails when bytes are
sent — so this cannot be verified by inspecting the token.

`verify-playback.sh` additionally asserts that the bucket is **private** (the raw
key must be rejected without a signature) and that deleting an item really
removes the R2 object, confirmed by re-requesting the same signed URL and
expecting a 404.

### Migrations and search — no password, no mutation

```bash
npx tsx scripts/dryrun-migration.ts drizzle/0002_clammy_hercules.sql   # apply, then roll back
npx tsx scripts/verify-search.ts                                      # 30 checks, then roll back
```

Both open ONE connection, run inside ONE transaction, and roll back in a
`finally` — there is no flag to commit. `dryrun-migration.ts` catches the class of
failure that matters most here: Drizzle can't model extensions or functions, so
those parts of a migration are hand-written and never covered by `db:generate`.
It reports which statements applied and which search columns/indexes exist.

`verify-search.ts` runs the **real** `searchMedia` / `suggest` code against the
real database (a Drizzle client built on that same transaction), so it covers the
things a type checker can't: whether `websearch_to_tsquery` survives a quote or a
bracket, whether `%` escapes instead of matching every row, and whether generated
columns read back as numbers. It works whether or not 0002 has been applied.

## Upload flow (presigned, nothing big transits the Worker)

```
1. POST /api/media/upload/start   { filename, mimeType, size, title, ... }
   -> quota checked -> media row created -> { mediaItemId, uploadUrl }
2. browser: PUT file -> uploadUrl (R2 directly, XHR progress events)
3. POST /api/media/upload/confirm { mediaItemId, filename, mimeType, size, duration }
   -> object verified via R2 head -> file row recorded
   -> audio: caption job created + sent to CAPTION_QUEUE
```

`duration` (seconds) is measured **in the browser** from the file's container
metadata and sent with the confirm call. A direct-to-R2 upload means the API
never sees the bytes, so the browser is the only place the real value exists.
Images (and anything the browser can't decode) send `null` — the UI already
renders `—` — because a cosmetic field must never be able to fail an upload.

## Transcription pipeline (Phase 2)

```
upload confirm ──send──> CAPTION_QUEUE ──> queue() consumer
                                             ├─ claim job (atomic, DB state)
                                             ├─ presign R2 GET (10 min)
                                             ├─ POST api.groq.com/.../audio/transcriptions
                                             │    model=whisper-large-v3-turbo
                                             │    url=<presigned R2 URL>   <- Groq fetches, no 25MB limit
                                             │    response_format=verbose_json
                                             │    timestamp_granularities[]=segment
                                             ├─ normalize segments -> caption + caption_segments
                                             ├─ COMPLETED (ack)                          
                                             └─ failure: transient -> retry w/ backoff (1,4,9 min, cap 1h)
                                                         permanent/attempts exhausted -> FAILED (ack)
                                                                        after max_retries -> DLQ
cron (*/5 min): reclaim stuck PROCESSING jobs + re-send QUEUED jobs (self-healing)
```

Reliability properties (none of which the old system had):
- Attempt counts + state live in Postgres (survive deploys), not memory
- Double-delivery safe: atomic claim means redelivered jobs no-op
- Stuck PROCESSING jobs auto-reclaimed after 15 min
- `GROQ_API_KEY` never exposed to clients; Groq errors never leak verbatim

## Auth model (single admin)

There are **no accounts, no sign-up and no OAuth**. One admin logs in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`:

```
POST /api/auth/login  { username, password }
  -> constant-time credential check (both fields SHA-256'd first)
  -> ensures the single `users` owner row exists (uid = username)
  -> issues a 256-bit random token; only its SHA-256 is stored
  -> { token, expiresAt, user }

Authorization: Bearer <token>   on every /api/media request
  -> UPDATE admin_sessions ... WHERE token_hash = ? AND expires_at > now()
     (one atomic statement: validates, enforces expiry, touches last_used_at)
```

Why sessions instead of JWTs: revocation works (logout is instant, expiry is real),
and there is no signing secret to manage. The token never reaches the database in
raw form, so a DB leak yields no usable sessions.

## Search (Phase 5)

Normalization lives in Postgres, in `archivedrop_normalize_text()` — created by
migration `0002` and applied to the indexed columns *and* the user's query, so
the two cannot disagree. That was the old codebase's central search bug: it
indexed with the `english` tsvector config and queried with `simple`, so the
index was never used, and Arabic variants were handled by a JS heuristic that ran
on the query only.

What the function does: strips harakat/tatweel, unifies letter variants
(`أإآٱ→ا`, `ىئ→ي`, `ة→ه`, Arabic-Indic digits), lowercases, and removes the
definite article per word (`ال` and وال/بال/فال/كال/لل). Without that last step
`الصباح` and `صباح` are different lexemes and an Arabic archive is unsearchable.
The article strip is guarded by an Arabic-codepoint lookahead so English words
beginning with `al` are untouched.

Two kinds of matching, because each covers the other's blind spot:

- **tsvector + GIN** over a weighted generated column — title `A`, tags `B`,
description/author `C`. `simple` config: Postgres has no Arabic stemmer, so
`يشتاق`/`اشتياق` (same root, different derivation) will *not* match each other.
- **pg_trgm + ILIKE/`word_similarity`** over a flattened normalized column — for
substrings, typos and partial words, and for `صباح` inside `الصباح`.

Transcripts are searched too: `caption_segments.search_vector` is its own
generated column, and a hit returns the best matching line with its timestamp,
which the UI turns into a `?t=` deep link into the player.

> Changing `archivedrop_normalize_text` does **not** recompute existing vectors.
> Normalization changes need a migration that drops and re-adds the generated
> columns so every row is re-indexed.

## API (Phases 1–2, 5)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | — |
| POST | `/api/auth/login` | username + password → session token |
| POST | `/api/auth/logout` | revoke the presented session token |
| GET | `/api/auth/me` | validate a stored token (used on app boot) |
| GET | `/api/media` | list own items (page/limit) |
| GET | `/api/media/quota` | storage used/limit |
| GET | `/api/media/:id` | owned item |
| PATCH | `/api/media/:id` | title/description/visibility/tags |
| DELETE | `/api/media/:id` | item + R2 objects |
| POST | `/api/media/upload/start` | presigned PUT |
| POST | `/api/media/upload/confirm` | verify + record + enqueue transcription |
| GET | `/api/media/:id/captions` | captions with segments (auth + ownership) |
| GET | `/api/media/:id/caption-status` | caption status + active job info |
| POST | `/api/media/:id/captions/generate` | (re)generate captions |
| PUT | `/api/media/:id/captions/:captionId` | bulk-replace segments (editor) |
| DELETE | `/api/media/:id/captions/:captionId` | delete captions |
| GET | `/api/search` | `?q=&page=&limit=` — titles, tags, descriptions, transcripts |
| GET | `/api/search/suggestions` | `?q=&limit=` — typeahead titles + tags |

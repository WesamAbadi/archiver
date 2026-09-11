# ArchiveDrop API v2

Cloudflare Workers + Hono + Drizzle (Postgres via Hyperdrive) + R2. The rewrite described in [`../MIGRATION_PLAN.md`](../MIGRATION_PLAN.md).

## Layout

```
src/
  index.ts          Hono app entry (CORS, errors, route mounting)
  env.ts            Shared bindings type
  auth/             Google ID token verify (jose) + session JWTs + middleware
  db/               Drizzle client (Hyperdrive) + schema
  lib/id.ts         nanoid ids
  routes/           auth.ts, media.ts
  services/         r2.ts (presign + ops), users.ts, media.ts
test/               vitest unit tests
```

## Setup

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL

npx drizzle-kit generate    # SQL migration from the schema
npx drizzle-kit migrate     # apply it

npm run typecheck
npm test
npm run dev                 # wrangler dev (uses DATABASE_URL locally)
```

## Cloudflare setup (production)

1. **R2 bucket** — create `archivedrop-media` (name configurable via `vars.R2_BUCKET_NAME`).
2. **R2 S3 API token** — R2 → Manage API Tokens → Object Read & Write, scoped to the bucket. Then:
   ```bash
   npx wrangler secret put R2_ACCOUNT_ID
   npx wrangler secret put R2_ACCESS_KEY_ID
   npx wrangler secret put R2_SECRET_ACCESS_KEY
   ```
3. **Hyperdrive** —
   ```bash
   npx wrangler hyperdrive create archivedrop-db --connection-string="postgres://user:pass@host/db"
   ```
   and paste the returned id into `wrangler.jsonc`.
4. **Secrets** —
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put JWT_SECRET
   ```
5. **Bucket CORS** (required for browser PUTs) — S3 API or dashboard, allow `PUT, GET` from your app origin, expose `ETag`.
6. `npm run deploy`

## Upload flow (presigned, nothing big transits the Worker)

```
1. POST /api/media/upload/start   { filename, mimeType, size, title, ... }
   -> quota checked -> media row created -> { mediaItemId, uploadUrl }
2. browser: PUT file -> uploadUrl (R2 directly, XHR progress events)
3. POST /api/media/upload/confirm { mediaItemId, filename, mimeType, size }
   -> object verified via R2 head -> file row recorded -> caption job (Phase 2)
```

## API (Phase 1)

| Method | Path | Notes |
|---|---|---|
| GET | `/health` | — |
| POST | `/api/auth/google` | Google ID token → session JWT |
| GET | `/api/media` | list own items (page/limit/visibility) |
| GET | `/api/media/quota` | storage used/limit |
| GET | `/api/media/:id` | owned item |
| PATCH | `/api/media/:id` | title/description/visibility/tags |
| DELETE | `/api/media/:id` | item + R2 objects |
| POST | `/api/media/upload/start` | presigned PUT |
| POST | `/api/media/upload/confirm` | verify + record |

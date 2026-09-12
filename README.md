# ArchiveDrop

A private, single-owner media archive. Upload audio, video or images straight to
your own storage, get a timestamped transcript back automatically, edit it, and
search across titles, tags, notes **and lyrics**.

Rebuilt end to end on Cloudflare. The old Express + Prisma + React app was
deleted; [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) records what was replaced and
why (the old code is still reachable in git history).

## How it works

```
browser ──PUT file──────────────► R2 bucket          (bytes never touch the API)
   │                                 ▲
   │ 1. start  2. confirm            │ presigned URL
   ▼                                 │
Worker (Hono) ──enqueue──► Cloudflare Queue ──► Groq Whisper │ Google Gemini
   │                                              │ segments + timestamps
   ▼                                              ▼
Neon Postgres (via Hyperdrive) ◄────────── transcript + segments
```

- **Uploads never transit the Worker.** The API issues a presigned PUT; the
  browser sends the file to R2 directly, with progress events.
- **Transcription is a queue, not a timer.** A DB-backed job row plus Cloudflare
  Queues, with retries, a DLQ and a cron sweep that re-sends dropped messages.
- **Search runs in Postgres.** Arabic normalization lives in the database and is
  applied to both the indexed columns and the query, so they can't disagree.
- **The transcription provider is a setting, not a deploy.** Settings →
  Transcription chooses between Groq Whisper (default — real decoded timestamps)
  and Google Gemini, and the model id for either.

## Stack

| Piece | What |
|---|---|
| `backend/` | Hono on Cloudflare Workers — Drizzle ORM, R2, Queues, cron |
| `frontend/` | React 19 + Vite + Tailwind 4 on Cloudflare Pages |
| Database | Neon Postgres, reached through Hyperdrive |
| Storage | Cloudflare R2 (private bucket, presigned URLs) |
| Transcription | Groq Whisper (default) or Google Gemini — provider and model chosen in Settings |

There is deliberately **no root package manifest**: the Worker and the Pages site
are independent deployables with separate lockfiles. Install and run each one
where it lives — see its README.

## Running locally

Two terminals. Node 20+ and pnpm.

```bash
cd backend   && pnpm install && pnpm dev    # Worker → http://localhost:8787
cd frontend  && pnpm install && pnpm dev    # Site   → http://localhost:5173
```

The frontend dev server proxies `/api` to the Worker, so no CORS setup is needed
locally. Each app's README covers secrets, migrations and deploy.

## Deploying

```bash
cd backend  && pnpm deploy
cd frontend && pnpm build && npx wrangler pages deploy dist --project-name archivedrop
```

## Auth

Single admin, no accounts. One username and password (`ADMIN_USERNAME` /
`ADMIN_PASSWORD`); the comparison is constant-time and fails closed if the
password isn't configured. Sessions are opaque tokens stored server-side as
SHA-256 hashes, so they are revocable and expire.

Login is throttled in two layers, because the endpoint is the only
unauthenticated surface: a Cloudflare rate limit at the edge (per IP, per
location), and a global failure counter on the admin row that locks the account
for 15 minutes after 8 failures and clears on any successful login. The edge
limit alone wouldn't be enough — its counters are per location, so it can be
walked around by changing IP.

## Docs

- [`MIGRATION_PLAN.md`](./MIGRATION_PLAN.md) — the migration itself: decisions,
  defects found in the old app, phase status, open questions.
- [`backend/README.md`](./backend/README.md) — env vars, migrations, the upload
  and transcription pipelines, deploy traps.
- [`frontend/README.md`](./frontend/README.md) — the API-origin rule, structure,
  and the conventions the UI follows.

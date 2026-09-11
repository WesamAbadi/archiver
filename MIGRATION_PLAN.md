# ArchiveDrop — Cloudflare Migration Plan

> Status tracker for the full rewrite of ArchiveDrop onto Cloudflare (Workers + Pages + R2) with Groq Whisper transcription.
> Last updated: 2026-09-12 — **Phase 1 code complete** (infra binding/setup pending, see `backend-v2/README.md`)

---

## 1. Goal

Rebuild ArchiveDrop as a polished, production-ready system:

- **Frontend** → Cloudflare Pages (React + Vite, cleaned up)
- **Backend** → Cloudflare Workers + Hono (fresh rewrite)
- **Storage** → Cloudflare R2 (replaces Backblaze B2)
- **Transcription** → Groq Whisper (`whisper-large-v3-turbo`) with real timestamps (replaces Gemini transcription)
- **Database** → Postgres via Hyperdrive + Drizzle ORM

Non-goals for v1: URL downloads (yt-dlp), social features (likes/comments/feed/trending), Redis/Bull queues, Socket.IO.

---

## 2. Decisions (locked)

| # | Decision | Choice | Notes |
|---|----------|--------|-------|
| 1 | Platform downloads (yt-dlp can't run on Workers) | **Drop URL downloads for now** | Direct uploads only at launch. Can add external downloader service or third-party API later without architecture changes. |
| 2 | Database | **Postgres + Drizzle** | Keep Postgres (schema/search knowledge carries over), Workers-native ORM via Hyperdrive. Provider TBD (see open questions). |
| 3 | Rebuild style | **Fresh rewrite on Hono** | Reuse schema + lessons learned, not old code. Preserve API shape where sensible. |
| 4 | Feature scope | **Personal archive focus** | Archive, uploads, captions/lyrics, search, public/private sharing. Likes/comments/feed cut for now. |
| 5 | Transcription | **Groq Whisper** | `verbose_json` response → real `segments[{start, end, text}]` → maps 1:1 into `caption_segments`. Deletes all Gemini timestamp heuristics. |

---

## 3. Analysis — problems found (do not carry these over)

### 3.1 Backend architecture blockers (cannot run on Workers)

- [x] Identified — all replaced in the rewrite
- Express + `server.listen` → Hono on Workers
- Socket.IO → job-status polling (v1), Durable Objects WebSocket (optional v2)
- Multer disk uploads → **presigned direct browser→R2 uploads** (also fixes the 100MB-in-RAM `fs.readFileSync` issue)
- Prisma classic → Drizzle + Hyperdrive
- `spawn('yt-dlp')` / `youtube-dl-exec` / `ytdl-core` / `soundcloud-downloader` / `soundcloud.ts` → dropped (decision #1)
- `ffmpeg-static`, `fluent-ffmpeg`, `sharp` → dropped (native binaries)
- Bull + Redis deps (unused in code) → Cloudflare Queues
- `setInterval` queue processor in `CaptionJobService` → Queues consumer + cron cleanup
- In-memory state (`UploadCancellationService`, rate counters, `isProcessing`) → DB/Queue state
- `uploads/` temp dir + `fs.*` everywhere → R2 streams

**Latent killer bug:** every `GET /api/media` constructs `new MediaDownloadService()` → constructor creates `new CaptionJobService()` → **starts another `setInterval` queue processor per request**. Leaks intervals, spawns competing processors → duplicate caption jobs, rate-limit bypass.

### 3.2 Backend logic bugs (silently broken today)

- [ ] Batch direct uploads write OAuth UID as `mediaItem.userId` (not DB user ID) → multi-file uploads invisible/orphaned — *do not reproduce*
- [ ] Socket room key mismatch: frontend joins `user:<oauth-uid>`, caption queue emits to `user:<dbUserId>` → all queue/progress events lost
- [ ] UploadModal `jobIdRef.current` never set → Cancel button posts no job ID → **upload cancellation never worked**
- [ ] Unreachable routes: `GET /popular-tags`, `GET /test-cdn` declared after `GET /:id` in `routes/media.ts`
- [ ] Security: `GET /api/media/:id/captions` + `/comments` have **no auth/ownership check**; `/api/auth/debug` public; view tracking unauthenticated; CORS allows any `*.vercel.app` / `*.nglocalhost.com`
- [ ] Storage-limit check runs **after** upload to B2 + DB insert → orphaned data (check before issuing presigned URL instead)
- [ ] `BackblazeService.getDownloadUrl` guesses `f005` cluster subdomain from bucket ID → R2 + custom domain deletes this class of bug
- [ ] SoundCloud "corruption detection" (null-byte %, size estimated at assumed 128kbps) rejects valid files — dropped entirely
- [ ] ~400-line duplicated SoundCloud download functions ×2 — dropped
- [ ] 100+ lines of `validateAndConvertTimestamp` heuristics un-hallucinating Gemini MM:SS timestamps — **replaced by Whisper's real timestamps**
- [ ] Stuck caption jobs: crash mid-job leaves `PROCESSING` forever (no reclaim); rate counters reset on restart
- [ ] `ensureUserExists` copy-pasted 4×; BigInt serialization copy-pasted 6×
- [ ] ~40 `as any`, `@ts-ignore` on Prisma calls, `strict: false` in all tsconfigs
- [ ] 300-line `WITH RECURSIVE` search query; `searchVector` indexed with `english` config but queried with `simple` (Arabic normalization never hits the index)
- [ ] Zero tests
- [ ] `console.log` emoji logging; request logger monkey-patches `res.send`

### 3.3 Frontend bugs

- [ ] **Design system doesn't exist**: `LoginPage`, `SettingsPage`, `SearchPage`, `Card`, `PageHeader` use `var(--accent-blue)`, `var(--bg-card)`, `var(--text-primary)` etc. — **none are defined anywhere** (not in `index.css`, not in Tailwind config). Half the app renders with fallback/transparent colors. Biggest visual fix.
- [ ] Auth double-`/api`: `lib/auth.ts` fetches `${VITE_API_URL}/api/auth/google` while `VITE_API_URL` already ends in `/api` → `api/api/auth/google` in dev
- [ ] `VITE_API_URL` consumed 3 different ways (api.ts, auth.ts, SocketContext) + `VITE_IS_DEV` flag
- [ ] Settings page sends nested `preferences` object; backend `PATCH /user/profile` expects flat fields → **preferences silently never save**
- [ ] Fake "Pro User" / "Verified Account" badges hardcoded in Settings
- [ ] Data-fetching anarchy: `lib/api.ts` axios instance exists but WatchPage/DashboardPage/CaptionEditorPage bypass it with raw `axios('/api/…')` (no auth headers); react-query v3 in some pages, `useEffect`+state in others; `window.dispatchEvent('upload-completed')` custom-event bus as glue
- [ ] Caption editor undo/redo breaks after 50 actions (`historyIndex` not adjusted when history shifts)
- [ ] `AudioView` takes ~25 untyped props (`props: any`); 700–900-line single-file pages; inline `<style>` blocks per component
- [ ] ErrorBoundary used in exactly one place
- [ ] Dead deps: `react-infinite-scroll-component`, `react-dropzone`, `react-hook-form`, `hls.js` (no `.m3u8` ever produced), lodash, `@types/lodash`
- [ ] SocketContext URL/path logic welded to old `server.wesamabadi.com` Vercel setup
- [ ] Legacy watch components pass `getCaptionStatusIcon`/`getCaptionStatusText` as props but never define them (crash risk if rendered)

### 3.4 Keep / salvage

- [x] Prisma schema (`backend/prisma/schema.prisma`) → port to Drizzle: `User`, `MediaItem`, `MediaFile`, `Caption`, `CaptionSegment` (keep); `DownloadJob`, `Like`, `Comment`, `View` (cut for v1)
- [x] Caption editor UX concept (timeline, drag/resize segments, undo/redo) — good idea, buggy implementation; rebuild clean
- [x] Arabic/RTL support (fonts, normalization utils in `arabicTextUtils.ts`) — carry over the utils
- [x] Caption job state machine (`QUEUED → PROCESSING → COMPLETED/FAILED`) — keep semantics, move execution to Queues
- [x] Visibility model (`PRIVATE/PUBLIC/UNLISTED` + `publicId`) — keep

---

## 4. Target architecture

```
frontend/            React + Vite → Cloudflare Pages
backend/ (new)       Cloudflare Workers + Hono + Drizzle
  ├─ routes/         auth, media, captions, search   (Zod-validated, typed)
  ├─ services/       r2.ts (presign + objects), groq.ts (Whisper), quota.ts
  ├─ db/             Drizzle schema ported from Prisma
  └─ jobs/           Queue consumer: transcription · Cron: cleanup/stuck-job reclaim
R2                   user files + custom delivery domain (presigned PUT for private)
Postgres             via Hyperdrive (Drizzle) — provider TBD
Groq Whisper         verbose_json → segments → caption_segments rows
```

**Upload flow (presigned, nothing through the Worker):**
1. Client requests presigned URL (server checks quota **first**)
2. Browser `PUT`s file directly to R2
3. Client confirms → server records `media_file` row
4. If audio/video → enqueue transcription job

**Transcription flow:**
1. Queue consumer receives job → stream file from R2
2. POST to Groq `/audio/transcriptions` (`response_format: verbose_json`, `timestamp_granularities[]=segment`)
3. Map segments → `caption_segments` rows → `COMPLETED`; failures retry via Queue retries → DLQ
4. **Constraint:** Groq 25MB per-request limit → cap file size in v1, chunk later if needed

**Realtime:** v1 = poll job-status endpoint; v2 optional = Durable Object per user with WebSocket hibernation.

---

## 5. Phased plan

### Phase 1 — Backend skeleton + storage (foundation) — **code complete, infra setup pending**
- [x] Scaffold Hono project + wrangler config (env bindings: R2, Hyperdrive, secrets) → `backend-v2/`
- [x] Port Prisma schema → Drizzle (v1 tables only) → `backend-v2/src/db/schema.ts` + generated migration `drizzle/0000_*.sql`
- [x] Google auth on Workers: verify ID token via `jose` against Google JWKS → `src/auth/index.ts`
- [x] JWT session issuance/verification (`jose`, HS256) + requireAuth/optionalAuth middleware
- [x] R2 service: presigned PUT/GET via aws4fetch, delete/head via binding → `src/services/r2.ts`
- [x] Media CRUD routes (list/get/patch/delete) with ownership checks; static routes registered before `/:id` (old unreachable-routes bug can't recur)
- [x] Presigned upload flow: `/upload/start` (quota check FIRST → media row → presigned PUT) → browser PUT → `/upload/confirm` (R2 head verify → quota re-check → file row)
- [x] Storage quota via SQL SUM (was: load all rows into JS); MIME allowlist; Zod validation on every route
- [x] Vitest unit tests (key scheme, MIME allowlist, JWT round-trip) — 10 passing; `tsc --noEmit` strict-clean
- [ ] Shared types package (frontend + backend) — defer to Phase 4
- [ ] **Decision point:** pick Postgres provider (Neon vs alternatives — compare at start of phase)
- [ ] Infra setup checklist (see `backend-v2/README.md`): create R2 bucket, S3 API token, Hyperdrive binding, secrets, bucket CORS

**Phase 1 build layout:**
```
backend-v2/
  src/index.ts        Hono app (CORS allowlist from env, error handler, /health)
  src/env.ts          Shared bindings type
  src/auth/           Google JWKS verify + session JWT + middleware
  src/db/             schema.ts (Drizzle) + client.ts (Hyperdrive/local fallback)
  src/routes/         auth.ts, media.ts (upload start/confirm lifecycle)
  src/services/       r2.ts, users.ts, media.ts
  src/lib/id.ts       nanoid
  test/               vitest
  drizzle/            generated SQL migrations
```

### Phase 2 — Groq Whisper transcription
- [ ] Cloudflare Queues setup + consumer binding
- [ ] Groq service: stream R2 → Groq API → parse `verbose_json`
- [ ] Write `captions` + `caption_segments` rows; status machine updates
- [ ] Retries + failure states + stuck-job reclaim (cron)
- [ ] 25MB limit handling (size cap in v1; document chunking path for later)
- [ ] Caption editor API: get / create / update segments / delete (auth-checked)

### Phase 3 — Realtime progress
- [ ] v1: job-status polling endpoint (`GET /media/:id/caption-status`)
- [ ] Frontend polls during upload/transcription
- [ ] (Optional v2) Durable Object WebSocket for push updates

### Phase 4 — Frontend cleanup
- [ ] **Define the missing CSS variable design system** (or purge it) — tokens for colors/text/bg/borders in `index.css` + Tailwind
- [ ] Unify all data fetching on react-query + single `api.ts` (kill raw `axios('/api/…')` calls)
- [ ] Fix auth double-`/api` prefix; one canonical `VITE_API_URL` convention
- [ ] Rewire UploadModal to presigned flow (progress from upload + job polling)
- [ ] Fix Settings save payload (flat fields); remove fake badges
- [ ] Rebuild caption editor state (fix undo/redo history bug)
- [ ] Delete dead deps; componentize giant pages; typed props everywhere
- [ ] Pages deploy config (SPA fallback, env vars)

### Phase 5 — Search
- [ ] Simplified weighted tsvector + pg_trgm query (single sane query, no recursive CTE)
- [ ] Fix tsvector config mismatch; wire Arabic normalization into indexing + query
- [ ] Search + suggestions endpoints with Zod validation

### Phase 6 — Production hardening
- [ ] Security pass: auth on captions/comments-by-id, remove debug route, strict CORS, rate limiting
- [ ] Vitest: services (r2, groq, quota) + route integration tests
- [ ] Observability: structured logging (Workers logs), error tracking
- [ ] R2 custom domain + caching for delivery
- [ ] Deploy: Pages + Worker + R2 + Queues + cron; smoke test E2E
- [ ] Data migration: move existing B2 files → R2 (if old data should be kept)

---

## 6. Open questions

- [ ] Postgres provider: Neon vs Supabase vs RDS Proxy/Hyperdrive pricing + fit (decide at Phase 1 start)
- [ ] Keep old B2 data? If yes, plan a one-off migration script (B2 → R2 with same key layout)
- [ ] Groq model choice: `whisper-large-v3-turbo` (fast/cheap) vs `whisper-large-v3` (accuracy) — benchmark on real audio
- [ ] File size cap for v1 (25MB Groq limit): hard cap at upload, or allow larger files and chunk later?
- [ ] Domain strategy: custom domain for R2 delivery + Worker API (e.g. `cdn.` / `api.` subdomains)
- [ ] Old repo fate: freeze `backend/`+`frontend/` in place and build `backend-v2/` alongside, or delete-and-replace in place?

---

## 7. Reference — key old-code locations (for lookup during rewrite)

| Thing | Where |
|---|---|
| DB schema | `backend/prisma/schema.prisma` |
| Search vector migration | `backend/prisma/migrations/20250628183218_add_search_vector/migration.sql` |
| Caption status semantics | `backend/src/services/CaptionJobService.ts` |
| Whisper replacement target | `backend/src/services/CaptionService.ts` (Gemini + timestamp heuristics) |
| Arabic text utils (keep) | `backend/src/utils/arabicTextUtils.ts` |
| Caption editor UX to rebuild | `frontend/src/pages/CaptionEditorPage.tsx` |
| Design-token usage (undefined vars) | `frontend/src/pages/LoginPage.tsx`, `SettingsPage.tsx`, `components/common/*` |
| Old B2 service (deleted) | `backend/src/services/BackblazeService.ts` |

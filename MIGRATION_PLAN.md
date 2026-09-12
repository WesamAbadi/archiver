# ArchiveDrop — Cloudflare Migration Plan

> Status tracker for the full rewrite of ArchiveDrop onto Cloudflare (Workers + Pages + R2) with Groq Whisper transcription.
> Last updated: 2026-09-12 — **Phases 1, 2, 4 and 5 complete and deployed** (Worker `archivedrop-api` + Pages `archivedrop` live in account `cd44a079…`; Hyperdrive, both queues and all five Worker secrets are set). Auth is single-admin login — **no OAuth, no accounts**.
> **Where it stands:** Phases 1–2 (backend), **Phase 4 (frontend)**, **Phase 5 (search)** and the **Phase 6 cutover** are complete, deployed and verified end-to-end against real storage *and real Arabic audio*. The frontend was rebuilt fresh rather than patched, and is live on Cloudflare Pages. Remaining work is the rest of Phase 6 (hardening).
>
> **Verified end-to-end in a real browser**, not just with curl: admin login → library → UI upload (image *and* audio) with progress → auto-enqueued transcription → Groq Whisper returned real timestamps → transcript rendered → caption editor edit + undo + save persisted → playback from a signed R2 URL (3s file, duration decoded, no error). Test data cleaned up; library and DB back to empty.
>
> **Then validated against real Arabic audio.** A real 7.1 MB Arabic track was uploaded (not by me): Whisper detected `Arabic`, produced **32 real timestamped segments** over 4:12, and the job completed on the **first attempt** with 0 retries — so the synthetic-tone caveat is closed for a file of this size. Search was rebuilt and verified on that same real corpus: `القدس` and `قدس` both return the *title* and the lyric at **47.02s**, `جبريلا` returns its line at **01:03**, and the library→search→player path runs end to end (the `?t=` deep link seeks the `<audio>` element to exactly 47.02).
>
> **Three production defects surfaced during that verification** — all invisible to curl-based testing: missing **bucket CORS** (would have blocked every browser upload), **`PUT` missing from the API's CORS allowMethods** (the caption editor could not save at all), and **Hyperdrive query caching** serving stale reads. See §3.2.

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
| 2 | Database | **Postgres + Drizzle** | **Neon** (free tier), reached via Hyperdrive `archivedrop-db`. Use Neon's direct endpoint — no `-pooler`. |
| 3 | Rebuild style | **Fresh rewrite on Hono** | Reuse schema + lessons learned, not old code. Preserve API shape where sensible. |
| 4 | Feature scope | **Personal archive focus** | Archive, uploads, captions/lyrics, search. Likes/comments/feed **and** public sharing cut entirely (not deferred). |
| 5 | Transcription | **Groq Whisper** | `verbose_json` response → real `segments[{start, end, text}]` → maps 1:1 into `caption_segments`. Deletes all Gemini timestamp heuristics. |
| 6 | Naming / branding | **Keep `ArchiveDrop`, no renames** | Product name is already consistent everywhere in code, UI and infra (`archivedrop-api` Worker, `archivedrop-media` bucket, `archivedrop-db` Hyperdrive). Local folder + GitHub repo stay `archiver` — cosmetic only, zero code references. The `-v2` dir suffixes were temporary scaffolding and are gone — `backend/` and `frontend/` are now the only copies, and the old Express + React app was deleted (still in git history). |
| 7 | Auth / accounts | **Single admin, no accounts** | One `ADMIN_USERNAME`/`ADMIN_PASSWORD` login. Google OAuth + session JWTs removed; sessions are opaque tokens in `admin_sessions` (revocable, expiring, SHA-256 stored). `users` keeps exactly one owner row so media/quota stay owner-scoped. No sign-up, no profiles. Engagement columns (`view_count`/`like_count`/`comment_count`) and sharing fields (`visibility`/`public_id`) dropped in migration `0001`. |

---

## 3. Analysis — problems found (do not carry these over)

> Paths in this section point at the **deleted** old app. It is no longer in the
> working tree — check out the commit before the cutover to read it. Kept because
> the *reasons* are what stop the same mistakes coming back in a rewrite.

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

#### Found and fixed during the v2 storage verification (not carried over — these were ours)

Two defects that only appeared once real bytes moved through the real infrastructure.
Both are recorded here because they are the kind that unit tests and `curl` cannot catch.

- [x] **Missing R2 bucket CORS policy** — `archivedrop-media` had *no* CORS configuration at all. A presigned PUT with `Content-Type: image/png` is not a CORS-safelisted request, so the browser sends an `OPTIONS` preflight first; with no policy it returned **403 with no `Access-Control-Allow-Origin`**, and the response to the PUT itself also lacked the header. Net effect: **every browser upload would have failed**, while `smoke-storage.sh` passed, because `curl` ignores CORS entirely. Found by replaying the browser's actual preflight (`OPTIONS` with `Origin` + `Access-Control-Request-Method: PUT`). Now configured for `http://localhost:5173` and `https://archivedrop.pages.dev`, methods `GET/PUT/HEAD`, header `content-type`, exposing `etag`. A disallowed origin is still refused (403).
- [x] **`PUT` missing from the API's CORS `allowMethods`** — the caption editor saves segments with `PUT /api/media/:id/captions/:captionId`, so its preflight was rejected and **saving a transcript failed outright**, surfacing only as a bare "Could not reach the server" in the UI. Every curl-based test passed, because curl does not send a preflight. This is the general trap: a method the frontend uses but the allowlist omits dies *in browsers only*. Found by driving the real UI. `PUT` added, with a comment in `src/index.ts` saying why it must stay.
- [x] **Hyperdrive query caching serving stale reads** — caching was **on by default** (`"caching": { "disabled": false }`), and it keys on exact SQL text. `GET /api/media/quota` runs a byte-identical aggregate on every call, so after the first run it was a permanent cache hit: the upload succeeded, the row existed with `size = 70`, the list endpoint returned it, and quota still read **0**. Worse, `GET /:id/caption-status` would have behaved the same way — **transcription would appear stuck forever**, which is exactly the "it spins and never finishes" symptom this whole rebuild exists to kill. Fixed with `wrangler hyperdrive update <id> --caching-disabled`; connection pooling and edge routing are unaffected, and a single-admin archive loses nothing. `smoke-storage.sh` step 5 now diagnoses this explicitly.

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
- [ ] ~~Visibility model (`PRIVATE/PUBLIC/UNLISTED` + `publicId`) — keep~~ **DROPPED**: a single admin has no public surface. Columns + the `visibility` enum were removed in migration `0001`; social engagement counters went with them.

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
Postgres             Neon via Hyperdrive (Drizzle) — direct endpoint, no -pooler
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

### Phase 1 — Backend skeleton + storage (foundation) — **complete and deployed**
- [x] Scaffold Hono project + wrangler config (env bindings: R2, Hyperdrive, secrets) → `backend/`
- [x] Port Prisma schema → Drizzle (v1 tables only) → `backend/src/db/schema.ts` + generated migration `drizzle/0000_*.sql`
- [x] ~~Google auth on Workers via `jose`~~ → **replaced by single-admin login** (constant-time credential check, both fields SHA-256'd before compare) → `src/auth/index.ts`
- [x] ~~JWT sessions (HS256)~~ → **replaced by opaque DB sessions**: random 256-bit token, only its SHA-256 stored, expiry enforced in the lookup query, revocable on logout → `src/services/sessions.ts`
- [x] R2 service: presigned PUT/GET via aws4fetch, delete/head via binding → `src/services/r2.ts`
- [x] Media CRUD routes (list/get/patch/delete) with ownership checks; static routes registered before `/:id` (old unreachable-routes bug can't recur)
- [x] Presigned upload flow: `/upload/start` (quota check FIRST → media row → presigned PUT) → browser PUT → `/upload/confirm` (R2 head verify → quota re-check → file row)
- [x] Storage quota via SQL SUM (was: load all rows into JS); MIME allowlist; Zod validation on every route
- [x] Vitest unit tests (key scheme, MIME allowlist, admin credential check, session tokens) — 36 passing; `tsc --noEmit` strict-clean
- [ ] Shared types package (frontend + backend) — defer to Phase 4
- [x] Postgres provider decided: **Neon** (see §6)
- [x] Infra: R2 bucket `archivedrop-media`, R2 S3 API token, Hyperdrive `archivedrop-db`, secrets, Worker + Pages deployed
- [x] R2 token verified as **Object Read & Write** — proven by PUTting real bytes, not by inspecting the token (a read-only key signs presigned URLs happily, so only an actual write settles it)
- [x] Bucket CORS policy set on `archivedrop-media` for the Pages origins + localhost — **it did not exist**, and its absence would have failed every browser upload while `curl`-based tests passed

**Phase 1 build layout:**
```
backend/
  src/index.ts        Hono app (CORS allowlist from env, error handler, /health)
  src/env.ts          Shared bindings type
  src/auth/           admin credential check + session middleware
  src/db/             schema.ts (Drizzle) + client.ts (Hyperdrive/local fallback)
  src/routes/         auth.ts, media.ts (upload start/confirm lifecycle)
  src/services/       r2.ts, users.ts, media.ts
  src/lib/id.ts       nanoid
  test/               vitest
  drizzle/            generated SQL migrations
```

### Phase 2 — Groq Whisper transcription — **complete and deployed**
- [x] Cloudflare Queues consumer + producer binding (`src/queue/`), per-message ack/retry, DLQ configured in wrangler.jsonc
- [x] Groq service (`src/services/groq.ts`): **url mode** — Groq fetches audio from a 10-min presigned R2 GET URL, so the 25MB request limit doesn't apply and no bytes transit the Worker; `verbose_json` + segment granularity → real timestamps
- [x] Caption service (`src/services/captions.ts`): DB-backed state machine (QUEUED→PROCESSING→COMPLETED/FAILED), atomic claim (double-delivery safe), attempt counting in Postgres (survives deploys)
- [x] Retries: transient Groq errors (408/429/5xx/network) → `msg.retry({delaySeconds})` with quadratic backoff 1/4/9 min (cap 1h); permanent (400/401/403/404/413) → fail fast; max_retries→DLQ
- [x] Cron (*/5 min): reclaim stuck PROCESSING (>15 min) + re-send QUEUED jobs (covers dropped messages, self-healing)
- [x] Caption routes: list w/ segments, caption-status polling, generate (re-enqueue), bulk segment save, delete — all auth + ownership checked (fixes old unauthenticated transcripts)
- [x] Auto-enqueue wired into upload/confirm (audio only in v1; video needs an audio-extraction step — noted below)
- [x] Unit tests for parsing/normalization/backoff/error-classification (36 passing total incl. auth); strict tsc clean
- [x] Infra: both queues created (`caption-jobs`, `caption-jobs-dlq`) + `GROQ_API_KEY` set
- [ ] Note: 25MB Groq url-mode limit still applies to the *fetched file* per request — large files above dev-tier limits need chunking later (open question)
- [ ] Video files: Whisper takes audio-only via url; add audio extraction (or accept audio-only) before enabling video

### Phase 3 — Realtime progress
- [x] v1: job-status polling endpoint (`GET /media/:id/caption-status`) — built in Phase 2, auth-checked
- [x] Frontend polls during upload/transcription — `useCaptionStatus`, 4s interval, stops on a terminal state (verified in the browser: a real upload went `QUEUED` → `COMPLETED` with no reload)
- [ ] (Optional v2) Durable Object WebSocket for push updates

### Phase 4 — Frontend rebuild — **built and deployed**

Decision (supersedes "clean up `frontend/`"): **rebuild fresh** against the v2 API. Patching ~6 interwoven view components that all carried the old architecture would have preserved the problem. Everything below was a checkbox in the old "cleanup" list and is now either fixed structurally or impossible by construction.

**Stack:** React 19 · Vite 8 · Tailwind 4 · TanStack Query 5 · React Router 7 · TypeScript strict (`noUncheckedIndexedAccess`, `noUnusedLocals`)

- [x] **A real design system** — Tailwind v4 `@theme` tokens that *generate* utilities (`bg-surface`, `text-ink-muted`, `font-display`…). This is the specific fix for the old UI: it referenced `var(--accent-blue)` / `var(--bg-card)` names **defined nowhere**, so large areas silently fell back to transparent/inherited colours. Direction is archival/editorial — warm near-black, paper-white (never pure white), one amber accent used with intent, Fraunces display + Inter Tight + JetBrains Mono for timecodes, plus focus-visible rings and `prefers-reduced-motion`.
- [x] **Admin login** (username/password, reveal toggle, inline errors including the 503 "not configured" case); guards remember where you were headed
- [x] **One API convention** — `src/lib/env.ts` normalizes `VITE_API_URL` to an **origin** (strips a stray `/api`, so the double-prefix bug can't recur); a single `fetch` client (`src/lib/api.ts`) owns auth headers, error normalization, and 401 → clear session. No page touches raw axios.
- [x] **Upload rewired to presigned direct-to-R2** — start → `XMLHttpRequest` PUT with real progress (`fetch` cannot report upload progress, the one deliberate exception) → confirm → `caption-status` polling. A 403 names the R2 permission, because "signing succeeds, transfer fails" is otherwise baffling.
- [x] **Polling replaces Socket.IO** — 4s interval, stops on a terminal state; can't get stuck "connected" the way the old socket did
- [x] **Social UI gone by construction** — no comments, likes, views, feed or public sharing anywhere
- [x] **Navbar** with a real sign-out and a live quota meter
- [x] **Caption editor with correct undo/redo** — `src/lib/useUndoableState.ts` keeps genuine past/present/future stacks (the old editor spliced two entries and duplicated lines), coalesces typing per segment so Ctrl+Z undoes a sentence rather than a keystroke, bounds history at 200, and validates before save (empty text, `end <= start`, overlaps). Dirty-state guard on unload.
- [x] **Arabic/RTL done properly** — `src/lib/rtl.ts` is the one implementation (the old regex was duplicated across two components with different ranges, so header and body disagreed). Direction is decided by character *majority*, so a mostly-Latin line with one Arabic word isn't scrambled, with a real Arabic font stack.
- [x] **Settings** reads real quota from Postgres — no fake "Pro"/"Verified" badges
- [x] **New backend route this required:** `GET /api/media/:id/files/:fileId/url`. `presignedGetUrl` already existed but **no route exposed it**, so no stored file was playable. Short-lived (6h) URLs are issued per request instead of being embedded in list responses.

**SPA fallback gotcha (cost a failed deploy):** Cloudflare now **rejects** the classic `_redirects` rule `/* /index.html 200` with `Infinite loop detected` (code 100324) — because Pages strips `.html`, `/index.html` → `/index` matches `/*` again. The deploy fails outright. Replaced with a `200.html` catch-all emitted at build time by a small Vite plugin (`spaFallback` in `vite.config.ts`).

### Phase 5 — Search — **complete, deployed and verified on real Arabic audio**

- [x] **Normalization moved into Postgres** — `archivedrop_normalize_text()` (migration `0002`), applied to the indexed columns *and* the query, so index and search terms cannot disagree. This is the fix for the old mismatch (indexed `english`, queried `simple`, so the GIN index was never used) and it replaces the 100-line JS variant heuristic that ran on the query only. Handles harakat/tatweel, letter variants (`أإآٱ→ا`, `ىئ→ي`, `ة→ه`, `ؤ→و`, `ک→ہ`, Arabic-Indic digits), Latin lowercasing, and the definite article per word.
- [x] **Weighted tsvector, generated + STORED** — title `A`, tags `B`, description/author `C`; GIN index on each. Generated columns, not app-maintained values, so a vector can never drift from its row.
- [x] **pg_trgm alongside full text** — a flattened normalized `search_text` column with a `gin_trgm_ops` index drives substring and fuzzy matching, which is what rescues the cases the `simple` config can't: `صباح` inside `الصباح`, and typos.
- [x] **Transcripts are searchable** — `caption_segments.search_vector` is its own generated column; a hit returns the best-matching line **and its timestamp**, which the UI turns into a `?t=` deep link that seeks the player.
- [x] **One query, no recursion** — replaces the old 420-line `WITH RECURSIVE` CTE with a single ranked query (a small CTE aggregates the best segment per item; no N+1, no per-row `similarity()` over every segment). Ranking: full-text rank 3.0, title `word_similarity` 2.5, substring-in-title 2.0, transcript 1.5, anywhere-in-text 1.0.
- [x] Search + suggestions endpoints (`GET /api/search`, `GET /api/search/suggestions`) with Zod validation, auth, and ownership scoping inside the service
- [x] Frontend search page: query held in the URL (linkable, refresh-safe, back-button-safe), debounced input, keyboard-navigable suggestion list, match chips (`title`/`tags`/`description`/`lyrics`), lyric snippets rendered with `dir="rtl"` and the matched term highlighted
- [x] Library search box now hands off to `/search` instead of filtering the 24 rows on screen and calling it search

**Notes worth keeping:**

- `websearch_to_tsquery`, not `to_tsquery` — it accepts quoted phrases and `-term` and, the real reason, **never raises a syntax error on raw user input**. The old code interpolated into `to_tsquery`, so a stray quote was a 500.
- Every value goes through `escapeLike`: without it a query of `%` matches *every row* and `_` matches any character. Guarded in TS (`hasNoSearchTerm`) **and** in SQL (`p.norm <> ''`) so an empty query can't reach `ILIKE '%%'`.
- Substring matching is skipped below 3 characters, otherwise `or` matches "recording" across the library.
- Still no Arabic **stemmer**: `يشتاق` and `اشتياق` share a root and do not match each other. Word-level morphology is the next step if it proves to matter, and it needs real data to justify rather than a guess.
- Two Postgres facts worth not re-learning: **`array_to_string` is STABLE, not IMMUTABLE** (so it can't appear in a generated column — hence the declared-immutable `archivedrop_normalize_texts` wrapper), and **`\p{Arabic}` is not supported in Postgres regexes** (use a codepoint range).
- **`duration` was never recorded** — surfaced by search, where the card read `— · 7.1 MB · MP3`. With a direct-to-R2 upload the API never sees the bytes, so the only source is the browser: `readMediaDuration()` reads the container metadata (no decoding) and `POST /media/upload/confirm` stores it. Undecodable files and images resolve `null` instead of failing the upload, which is why the read is gated to audio/video mime types and bounded by a timeout. Verified in a browser: MP3 → `0:07`, MP4 → `0:04`, PNG → `null`.
- **Corrected: a stale bundle is not a caching problem.** An earlier note here blamed Pages for caching `index.html`, and used that to explain why a re-upload made ~10 minutes after the duration fix still stored `NULL`. That was wrong. Measured, the shell carries `cache-control: max-age=0, must-revalidate` **and no `ETag`/`Last-Modified`**, so no browser can reuse it without checking the server — the shell is always fresh on navigation. The two real causes were an **already-open tab** (still running the JS it loaded before the deploy — no header can fix that) and, for the false failure in testing, a browser-automation `open` on the URL it was already on, which never navigated.
- **Cache policy is now explicit** in `frontend/public/_headers` (migration-plan-shaped lesson: an implicit default is not a guarantee). The shell is pinned to `no-cache, max-age=0, must-revalidate`; `/assets/*` is `public, max-age=31536000, immutable`, which is safe because Vite content-hashes every filename. Assets previously revalidated on **every** load (300 bytes each); they now transfer **0 bytes**. Verified by fetching from a page loaded *before* the deploy — it saw the new policy with no cache-busting.
- `_headers` gotcha worth not re-learning: matching rules **merge** and a repeated header is **joined with a comma**, so a catch-all `Cache-Control` plus a specific one produces a malformed value. The asset rule detaches (`! Cache-Control`) the inherited value before setting its own.
- **A transcript does not end when the audio does.** The Arabic track's last lyric segment ended at **252.116s**, but the stored file measures **231.672s** — 20 seconds of trailing instrumental the lyrics never cover. Backfilling `duration` from the transcript would have recorded a number 9% too long, which is why the value now in the database was measured with `ffprobe` against the object in R2 instead. Worth remembering before deriving any other duration from segments.

### Phase 6 — Production hardening
- [x] **Cutover: the old code is gone.** `backend-v2/`/`frontend-v2/` renamed to `backend/`/`frontend/`, the Express + Prisma + React app deleted (191 files, −28.5k lines), the vestigial root npm-workspace manifest removed, and the backend moved off npm onto pnpm so the repo has one package manager and one lockfile per app. Nothing about the deployed Worker or Pages project changed — only where the source lives.
- [x] Security: every route auth + ownership checked, no debug route, CORS from an explicit allowlist
- [x] **Login abuse protection, two layers** (verified against production, not just in tests).
  - Edge: `LOGIN_RATE_LIMITER` binding in `wrangler.jsonc`, 10 requests/60s per IP — 11 requests in a minute returned a real `429` with `Retry-After: 60`.
  - Global: `failed_login_attempts` + `locked_until` on the single admin row (migration `0003`), policy in `src/auth/throttle.ts`. The 8th failure locks for 15 minutes and refuses the *correct* password with `Retry-After: 900`; any successful login clears it. This is the layer that matters — the binding's counters are **per Cloudflare location**, so IP rotation walks around them, while a counter on the one admin row cannot be.
  - Deliberate trade-off: a global lock is a denial-of-service lever (anyone can lock the owner out by failing repeatedly). Chosen over unlimited guessing; the lock is short and self-clearing, so the cost is a wait, not an exposure.
- [x] **Vitest abuse suite** — `test/security.test.ts`, 51 tests. It drives the real routers and the real `requireAuth` against a fake DB that *throws on any property access*, which turns "all 16 protected routes 401 without querying the database" into a checked property. Plus login payload validation, throttle count/lock/clear, and the CORS allowlist (including a regression guard that `PUT` stays advertised — its absence broke the caption editor in browsers only). Total 115 tests, up from 44.
- [ ] Still uncovered: `groq.ts` error classification and quota boundary cases; no DB-backed route integration tests (the suite fakes the database, so it cannot catch a bad SQL statement)
- [ ] Observability: structured logging (Workers logs), error tracking
- [ ] R2 custom domain + caching for delivery
- [x] Deploy: Worker + R2 + Queues + cron — live; Pages: single `archivedrop` project (the interim `archivedrop-app` / `archivedrop-v2` projects were deleted once the rebuild was verified)
- [x] E2E storage path verified: `backend/scripts/smoke-storage.sh` (login → presign → PUT → confirm → quota → delete) and `scripts/verify-playback.sh` (signed playback URL serves the real bytes; unsigned key refused; delete removes the R2 object, proven by re-requesting the same signed URL)
- [x] Migrations are testable without touching the database: `scripts/dryrun-migration.ts <file>` applies a migration in a transaction and always rolls back, so the hand-written parts Drizzle can't generate (extensions, functions) are provable before they run for real. `scripts/verify-search.ts` runs the real search service inside the same kind of rolled-back transaction — 30 checks over SQL semantics, Arabic normalization and adversarial input, no writes.
- [x] Hyperdrive query caching **disabled** — it was on by default and broke read-after-write
- [x] Data migration: **not needed** — decided to start fresh (§6), so there is no B2 → R2 script

---

## 6. Open questions

- [x] Postgres provider: **Neon**, via Hyperdrive `archivedrop-db` (`db89e4c4…`). Direct endpoint only — Hyperdrive pools globally, so Neon's PgBouncer would stack two poolers.
- [x] **Old B2 data: start fresh.** Decided — no migration script. The R2 bucket stays empty and the old library is abandoned.
- [x] **Groq model: `whisper-large-v3-turbo` on real audio.** A real 7.1 MB Arabic track transcribed on the first attempt into 32 timestamped segments with `language: Arabic` detected. `GROQ_MODEL` remains the escape hatch to `whisper-large-v3` (more accurate, also translates) if accuracy disappoints on other material.
- [ ] **Groq account tier: partly settled.** 7.1 MB works (free tier caps *fetched* files at 25 MB in url mode). Still untested: a file near or above 25 MB, and what Groq actually returns when one is sent — that error should be classified per manent and surfaced in `captionErrorMessage`, not retried to the DLQ. Chunking only if a real file needs it.
- [ ] Shared types package (frontend + backend) — the client types in `frontend/src/lib/types.ts` are still hand-written copies of the serializers. Low risk (a mismatch shows up as a type error at the call site) but it is a copy.
- [ ] Video transcription: extract audio track (where? client-side pre-upload vs separate service) or keep audio-only for v1
- [ ] Domain strategy: custom domain for R2 delivery + Worker API (e.g. `cdn.` / `api.` subdomains)
- [x] Old repo fate: built alongside in `-v2` dirs, then **delete-and-replace in place** — done, `backend/`/`frontend/` are the only copies. Repo name `archiver` intentionally unchanged (decision #6).

---

## 7. Reference

The old app's files are gone from the working tree; §3's table of findings is the
summary of what mattered in them. Anything that needs reading can be recovered
from git history — the cutover commit is the boundary.

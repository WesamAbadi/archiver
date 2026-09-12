# ArchiveDrop — frontend

The web app: React SPA on Cloudflare Pages, talking to the Worker in `../backend/`.

**Stack:** React 19 · Vite 8 · Tailwind 4 · TanStack Query 5 · React Router 7 ·
TypeScript in strict mode (`noUncheckedIndexedAccess`, `noUnusedLocals`).

---

## Running it

```bash
pnpm install
pnpm dev              # http://localhost:5173
```

Dev proxies `/api` to `http://localhost:8787`, so run the Worker alongside:

```bash
cd ../backend && pnpm dev
```

`VITE_API_URL` may stay **empty** in dev (the proxy makes it same-origin).

---

## The one environment rule

`VITE_API_URL` is an **API origin only**:

```
""                                        → same-origin (dev proxy)
https://archivedrop-api.<sub>.workers.dev → workers.dev
https://api.yourdomain.com                → custom domain
```

No trailing slash, **no `/api` suffix** — `src/lib/env.ts` appends `/api` itself
and strips a stray suffix if one sneaks in. The old codebase read this variable
three different ways, which is how `api/api/auth/google` happened.

Production value lives in `.env.production`, which **is tracked on purpose**
(the origin is not a secret, and a fresh clone should build against the right
Worker).

---

## Layout

```
src/
  lib/            env, api client, cn, formatters, mediaMeta, rtl, useUndoableState, useDebounced
  components/ui/  Button, TextField, Modal, Badge, Spinner, EmptyState, Highlight, toast
  components/     AppShell (nav + quota meter)
  features/
    auth/         session store, hooks, LoginPage, guards
    media/        every media + caption query/mutation (one place)
    library/      LibraryPage, MediaCard, UploadDialog
    search/       SearchPage + its queries (results keyed by term, not by page)
    watch/        WatchPage, TranscriptPanel
    editor/       CaptionEditorPage
    settings/     SettingsPage, TranscriptionSettings (provider + model), api.ts
```

Three conventions worth keeping:

- **Nothing calls `fetch` directly.** Everything goes through `src/lib/api.ts`,
  so auth headers, error shape and 401 handling can't drift per page.
- **Nothing invents a colour.** Use the Tailwind tokens from `src/index.css`
  (`bg-surface`, `text-ink-muted`, `border-border-strong`…). They are real
  `@theme` tokens, so they generate utilities.
- **`MediaCard` is the only card.** The library and search results render the
  same component; search just passes `match`, which adds the matched-field chips
  and the lyric line and retargets the card's link to `/watch/:id?t=…`.

---

## Deploying to Cloudflare Pages

```bash
pnpm build
npx wrangler pages deploy dist --project-name archivedrop
```

### Caching (`public/_headers`)

Vite copies `public/` into `dist/` verbatim, so `public/_headers` ships with every
deploy and picks the cache policy for both kinds of thing served:

| Path | `Cache-Control` | Why |
|---|---|---|
| everything (the shell) | `no-cache, max-age=0, must-revalidate` | The shell names the hashed bundles, so a stale copy means running an older app, possibly against a newer API. It carries **no `ETag` or `Last-Modified`**, so a browser has nothing to revalidate with and must fetch it fresh on every navigation — a deploy can't be invisible to someone who navigates during it. |
| `/assets/*` | `public, max-age=31536000, immutable` | Vite puts a content hash in every filename, so the bytes at a name never change and a new build always emits a new name. Nothing to go stale. |

Measured, not assumed: on a repeat load the assets used to revalidate (300 bytes
per asset, every load); they now transfer **0 bytes**.

Two things to know before editing this file:

- **Rules merge.** A header set by two matching rules is joined with a comma, so a
  catch-all `Cache-Control` plus a specific one yields
  `public, max-age=0, must-revalidate, public, max-age=31536000, immutable`. That is
  why the asset rule detaches (`! Cache-Control`) the catch-all value before
  setting its own instead of layering under it. Verified after deploying: the
  asset returns exactly `public, max-age=31536000, immutable`.
- **A stale tab is not a caching problem.** An already-open tab keeps running the
  JavaScript it loaded, and no header can change that — reload it. If that ever
  needs to be automatic, the fix is a build-id the app polls, not caching.

### Traps that will bite you

**1. Do not add a `_redirects` SPA rule.** The classic
`/* /index.html 200` is now **rejected** by Cloudflare with
`Infinite loop detected` (code 100324) — Pages strips `.html`, so `/index.html`
→ `/index` matches `/*` again. It doesn't just warn: **the deploy fails**.
SPA fallback comes from `200.html`, which `vite.config.ts` emits at build time
by copying `index.html`. Deep links (`/watch/abc`, `/settings`) then return 200.

**2. `--force` is for project *creation* only.** This project exists, so deploys
run directly against Pages. Don't pass `--force` to `pages deploy`.

**3. Create the project via the API, not `wrangler pages project create`.**
Wrangler's newer create flow can register an **empty Worker with the same name**
before falling back to classic Pages. If it then errors, that Worker is left
behind. It has no versions and no routes, so it serves no traffic — but it shows
in the dashboard as a duplicate row ("No active routes"), and it is invisible to
both `pages project list` and the `workers/scripts` list, so nothing warns you:

```bash
curl -X POST -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/pages/projects" \
  -d '{"name":"archivedrop","production_branch":"main"}'
```

To check for an orphan, `GET /workers/scripts/<name>`: **10007**
("does not exist") = clean, **10222** ("has no versions") = an empty Worker is
sitting there. Remove it with `DELETE /workers/scripts/<name>`; the Pages project
is unaffected.

The API origin is baked into the bundle at build time — **switching to a custom
domain means rebuilding and redeploying**, not just editing a config.

The Worker only accepts requests from origins in its `CORS_ORIGINS` var, so a new
Pages domain must be added there (and the Worker redeployed) or every call 401s
at the preflight.

# TrendSignal

TrendSignal is a keyword-driven market intelligence platform that monitors news sources and the
blogs of leading technology, consulting, AI, and cybersecurity companies, centralizes relevant
content, and highlights emerging trends and strategic signals. The interface is in French by
default; the codebase, comments, tests, and documentation are in English.

## Product overview

- **Dashboard** — KPIs, top trends, search, filters, and a responsive article grid.
- **Trends** — 24h/7d/30d trend scores, growth, source diversity, and related articles.
- **Keywords** — the monitored topic list with per-keyword detection stats.
- **Sources** — monitored publishers and their collection health.

TrendSignal indexes public article **metadata** (title, short excerpt, date, image, link) — never
full article bodies — and always sends readers back to the original publisher.

## Architecture

```text
RSS/Atom/Sitemap/HTML  →  GitHub Action (scheduled)  →  TypeScript collectors
  →  normalize + validate + dedupe  →  keyword match + relevance  →  trend calculation
  →  data branch JSON  →  React static site  →  GitHub Pages
```

There is **no backend**. The deployed browser only ever reads static JSON published to
`public/data/` at build time (see `src/data/client.ts`). Everything else — fetching publishers,
scoring, and persistence — runs inside GitHub Actions. See `docs/architecture.md` for details and
`docs/data-model.md` for the full data contracts and scoring formulas.

## Prerequisites

- Node.js 22 (see `.nvmrc`) and npm (no other package manager — `package-lock.json` is committed)

## Install

```bash
npm ci
cp .env.example .env   # optional; used for VITE_* variables in local dev
```

## Local development

```bash
npm run dev        # Vite dev server
npm run build       # tsc -b && vite build
npm run preview     # serve the production build locally
```

The app reads `VITE_DATA_BASE_URL` (default `./data`) at runtime and expects `public/data/*.json`
to exist — see **Demo data** below to populate it for local development.

## Demo data (deterministic, no live network)

```bash
npm run generate:demo
```

This runs the full pipeline (collect → normalize → dedupe → keyword-match → score → trends →
publish) against local fixture sources served over a throwaway `127.0.0.1` HTTP server
(`scripts/fixture-server.ts`, `tests/fixtures/**`), then writes the validated result to
`public/data/`. No live publisher is ever contacted for demo data. Re-run it any time to refresh
the local dataset.

> **Known limitation:** the fixture articles carry fixed 2026-08 publication dates. `generate:demo`
> uses the real wall clock as its reference time (so `lastSuccessfulScanAt` is always fresh and the
> dashboard never opens with a stale-data banner), but this means the **24h** trend tab can look
> sparse depending on how long ago those fixed dates fall relative to today — the 7d/30d tabs stay
> populated. This is a property of using static fixtures for a demo, not a pipeline defect.

## Collection (fixtures vs. live)

```bash
npm run collect:fixtures   # tsx scripts/collect.ts --fixtures — same fixture server as above
npm run collect            # tsx scripts/collect.ts — reads config/sources.yml, live network
```

`collect` accepts `--data-dir=<path>` (default `data`), `--source-id=<id>`, `--full-refresh`
(ignore HTTP conditional-request caching), and `--dry-run` (compute everything, write nothing).
Live collection is never run in CI — only the scheduled/manual `refresh-and-deploy` workflow uses
it, against a real `data` branch checkout.

## Tests

```bash
npm run lint
npm run typecheck
npm run test          # Vitest: pipeline unit tests + component tests, all fixture/mock-based
npm run test:e2e       # Playwright, against a built app served with npm run preview
```

Playwright needs a built app with demo data present first:

```bash
npm run generate:demo && npm run build && npm run test:e2e
```

Live-source tests never run in CI (see `.github/workflows/ci.yml`); adapters are tested against
fixtures served by a local, throwaway HTTP server (`scripts/fixture-server.ts`) so RSS/sitemap/HTML
parsing and JSON-LD/Open Graph extraction are exercised end-to-end without touching a live
publisher.

## GitHub Pages setup

1. In the repository settings, set **Pages → Source** to **GitHub Actions**.
2. Push to `main` (or run `refresh-and-deploy` manually) — the workflow builds and deploys.
3. The app uses `HashRouter`, so no server-side rewrite rules are needed for a Pages subpath.
4. `VITE_BASE_PATH` is computed from the repository name in the workflow
   (`/${{ github.event.repository.name }}/`) — no owner/repo is hard-coded in source. For a
   user/org root Pages site (`username.github.io`), override `VITE_BASE_PATH` to `/`.

## GitHub Actions setup

- `.github/workflows/ci.yml` — lint, typecheck, unit tests, build, and a separate Playwright job.
  Runs on pull requests and pushes to `main`. Never touches a live publisher.
- `.github/workflows/refresh-and-deploy.yml` — collects live data, publishes validated JSON to the
  `data` branch, builds, and deploys to Pages. Runs on push to `main`, on a schedule
  (`17 */6 * * *`, i.e. every six hours at a non-zero minute), and manually via
  `workflow_dispatch` with `full_refresh`, `source_id`, and `dry_run` inputs.
- Both workflows use the default `GITHUB_TOKEN` (never a PAT) with per-job minimal permissions, and
  pin third-party actions to a full commit SHA with a version comment.

No repository secrets are required for the default setup.

## Data branch bootstrap

`refresh-and-deploy.yml` checks whether a `data` branch already exists (`git ls-remote`). If it
does, it's checked out into `./data-branch` as a git worktree; if not, an orphan `data` branch is
created there automatically — no manual bootstrap step is required. See `docs/data-model.md` for
the branch's file layout.

## Adding a source or keyword

- From the UI: the **Ajouter** button on the Sources/Keywords pages opens the repository's
  `add-source` / `add-keyword` GitHub Issue form.
- Directly: edit `config/sources.yml` / `config/keywords.yml` and open a pull request. See
  `docs/adding-a-source.md` for the required validation step before setting `enabled: true`.

`config/sources.yml` currently ships with 49 declared sources, 29 of them live-validated and
enabled (spanning consulting, technology, cybersecurity, AI, and media) as of 2026-08-23 — see the
header comment in that file for the validation method. The rest are documented candidates kept
`enabled: false` with `feedUrl: REPLACE_AFTER_VALIDATION` until someone validates a real endpoint.

After changing a source definition, run `npx tsx scripts/audit-sources.ts` to check what each
source actually contributes — health alone does not distinguish a working source from one that
fetches successfully but yields no usable article. See `docs/architecture.md`.

## Limitations

- MVP-scope generic HTML/sitemap adapters use metadata extraction only (JSON-LD → Open Graph →
  standard `<meta>` → publisher-specific `<meta>` names declared per source); no headless browser
  and no source-specific scraping beyond that.
- Some publishers block the collector outright. Wired answers HTTP 403 to every request regardless
  of headers while serving the same URL to a browser — anti-bot protection keyed on the client's
  TLS fingerprint. Circumventing that is out of scope by design (AGENTS.md #9), so the source is
  kept `enabled: false` with the reason recorded in `config/sources.yml`.
- Consulting firms publish flagship research a few times a quarter rather than daily, so their
  articles are naturally sparser in the dashboard's most-recent window than the daily news feeds.
- Demo/fixture data has fixed calendar dates, so the 24h trend view can be sparse right after
  `generate:demo` depending on real-world timing (see **Demo data** above).
- Relevance and trend scoring use deterministic, documented heuristics (no paid AI API), tuned for
  a reasonable first cut rather than empirically calibrated against months of real traffic.
- `public/data/keywords-public.json` is a small addition beyond the six files explicitly listed in
  the spec's example loading order — it's a public, generation-time projection of
  `config/keywords.yml` (id, labels, category, synonym count, enabled) that the Keywords page and
  article keyword badges need but that isn't derivable from the other five files. It's validated
  and versioned exactly like the rest of `generated/`.
- `js-yaml` was added as a pipeline dependency (not in the spec's stack list) because
  `config/*.yml` needs a YAML parser and none of the listed packages provide one.

## Attribution

TrendSignal indexes public metadata. Rights remain with original publishers; every article links
back to the source for the full content.

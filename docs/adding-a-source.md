# Adding a source

Sources are declarative config in `config/sources.yml`, reviewed and merged through Git like any
other code change — there is no admin UI, and the browser never writes to this file.

## 1. Open an issue (optional but recommended)

Use the **Ajouter** button on the Sources page, or open a
[**Add a source**](../.github/ISSUE_TEMPLATE/add-source.yml) issue directly. This is a proposal;
someone still needs to validate the endpoint and open a pull request.

## 2. Find the real feed URL — never guess one

- Check the publisher's site footer/head for an RSS/Atom `<link rel="alternate">`, or try the
  common paths (`/feed`, `/feed/`, `/rss`, `/rss.xml`, `/blog/feed/`).
- If there's no feed, check for an XML sitemap (`/sitemap.xml`).
- If neither exists, `collectionMode: html` can work against a listing page, but it's the least
  reliable option and should be a last resort.

**Never invent, guess, or leave a placeholder feed URL enabled.** If you can't find or validate a
real endpoint, add the source with `enabled: false` and `feedUrl: REPLACE_AFTER_VALIDATION`.

## 3. Validate it live before enabling it

```bash
curl -sI -A "TrendSignalBot/1.0 (+https://github.com/<owner>/<repo>)" "<feed-url>"
curl -s  -A "TrendSignalBot/1.0 (+https://github.com/<owner>/<repo>)" "<feed-url>" | head -c 300
```

Confirm:

- A `200` (or a `301`/`302` that lands on a `200`) response.
- The body actually looks like what `collectionMode` expects — `<rss` / `<feed` for
  `rss`/`atom`, `<urlset` for `sitemap`, real HTML with article links for `html`.
- For `sitemap`/`html` sources, that the linked article pages carry JSON-LD (`Article`,
  `NewsArticle`, or `BlogPosting`) or Open Graph metadata — that's what
  `scripts/adapters/html-metadata.ts` extracts (title, `datePublished`, description, image).

If your machine or sandbox cannot reach publisher domains, run the **Probe source candidates**
workflow instead (`workflow_dispatch`). It performs the same checks from a GitHub runner —
declared feeds, conventional paths, `robots.txt` sitemaps, then a metadata sample through the
production extractor — and prints a per-candidate verdict. Add the publisher to `CANDIDATES` in
`scripts/probe-source-candidates.ts`, or probe an arbitrary site locally with
`npx tsx scripts/probe-source-candidates.ts --homepage=<url>`.

Only set `enabled: true` once you've done this. Every currently-enabled source in
`config/sources.yml` was validated this way — see the header comment at the top of that file for
the method and date.

## 4. Add the entry

```yaml
- id: acme-blog # stable, kebab-case, unique
  name: Acme Blog
  company: Acme Corp
  category: technology # consulting | technology | cybersecurity | artificial-intelligence | media
  homepageUrl: https://acme.example.com/blog
  collectionMode: rss # rss | atom | sitemap | html
  feedUrl: https://acme.example.com/blog/feed/ # or REPLACE_AFTER_VALIDATION
  enabled: true # only if the endpoint above was actually validated
  priority: 5 # 0-10, used as source authority in trend scoring
  language: en # fr | en
  maxItemsPerRun: 30
  includePaths: [] # substrings a URL's path must contain (sitemap/html only)
  excludePaths: [] # substrings that exclude a URL's path (sitemap/html only)
  dateMetaNames: [] # publisher-specific <meta name="..."> holding the date (see below)
```

`feedUrl` for `collectionMode: sitemap` may point at either a `<urlset>` or a
`<sitemapindex>`; an index is resolved by following its most recently modified child
sitemaps.

Prefer a sitemap over a listing page when a publisher offers one: a listing page links
its whole navigation menu before any article, whereas a sitemap is dated and article-dense.
Use `includePaths`/`excludePaths` to keep the selection on thought-leadership sections and
away from people profiles, press releases, and service pages.

`dateMetaNames` is the escape hatch for publishers whose pages carry no JSON-LD, no
`article:published_time`, and no standard date meta — PwC, for instance, exposes the
publication date only as `<meta name="pwcReleaseDate">`. List those names here rather than
special-casing the publisher in the extractor. Leave it empty unless a source genuinely
needs it; see the extraction chain in `docs/architecture.md`.

Run `npm run validate:config` locally to confirm the file still parses and every id stays
unique, then `npx tsx scripts/audit-sources.ts --source-id=<id>` to see what the source
actually yields — a source can be "healthy" while contributing no usable article.

## 5. Open a pull request

CI (`.github/workflows/ci.yml`) runs lint/typecheck/tests/build against fixtures — it does not
contact your new source. The next scheduled or manual `refresh-and-deploy` run will attempt it for
real, isolate any failure (one bad source never blocks the others), and the Sources page will show
its health on the next deploy.

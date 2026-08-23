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

**Never invent or guess a feed URL.** If you cannot find and validate a real endpoint, do not add
the source at all — `config/sources.yml` holds only sources that actually collect, so a candidate
that cannot be reached is left out (or removed) with the reason recorded in the file's header
comment, rather than parked as a permanently-disabled placeholder.

## 3. Validate it live before enabling it

A quick look with `curl` is a useful first pass:

```bash
curl -s -A "TrendSignalBot/1.0 (+https://github.com/<owner>/<repo>)" "<feed-url>" | head -c 300
```

Confirm the body actually looks like what `collectionMode` expects — `<rss` / `<feed` for
`rss`/`atom`, `<urlset` or `<sitemapindex>` for `sitemap`, real HTML with article links for
`html`. Watch for an `<?xml-stylesheet?>` processing instruction before `<rss` (McKinsey and
Fortinet both have one) — the feed is still valid.

**`curl` alone is not a validation.** Three failure modes it will not show you:

- **HTTP 200 with an HTML app shell** for a `.xml` path (IBM, Sopra Steria). The status is fine;
  the body is a single-page app.
- **200 to `curl`, 403 to the collector** — several CDNs fingerprint the TLS handshake, so Node's
  `fetch` is rejected where `curl` is not (Wired, Ars Technica, BCG). We do not work around this.
- **Pages with no publication date in static HTML**, rendered client-side (Anthropic). The
  adapter drops every such page, so the source yields nothing.

So finish with the audit harness, which runs the real adapters exactly as the workflow does:

```bash
npx tsx scripts/audit-sources.ts --source-id=<id>
```

Only set `enabled: true` once that reports real, recent, keyword-matching articles. Every source
in `config/sources.yml` was validated this way — see the header comment at the top of that file.

If your machine or sandbox cannot reach publisher domains at all, run the **Probe source
candidates** workflow (`workflow_dispatch`) instead of the two steps above. It performs the same
checks from a GitHub runner — declared feeds, conventional paths, `robots.txt` sitemaps, then a
metadata sample through the production extractor — using the collector's own `fetchWithPolicy`,
so it reproduces the 403-to-the-collector case that `curl` hides. Add the publisher to
`CANDIDATES` in `scripts/probe-source-candidates.ts`, or probe one ad hoc with
`--homepage=<url>`; its `audit_source_id` input runs the audit harness on the same runner.

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

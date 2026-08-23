# Data model

## Data branch layout

```text
articles/YYYY/MM.json        # full archive, grouped by UTC publication month
state/http-cache.json        # per-source ETag/Last-Modified, for conditional requests
state/run-history.json       # last N pipeline runs (trigger, counts, duration)
state/source-state.json      # per-source known URLs + consecutive-failure tracking
generated/articles-latest.json
generated/manifest.json
generated/source-health.json
generated/sources-public.json
generated/statistics.json
generated/trends.json
generated/keywords-public.json
```

Only `generated/*.json` is ever copied into `public/data/` and shipped to the browser
(`scripts/publish-data.ts`). `articles/`, `state/http-cache.json`, `state/run-history.json`, and
`state/source-state.json` are internal collector state and are never exposed through Pages.

`generated/articles-latest.json` holds at most the 500 most recent articles that matched at least
one enabled keyword — the initial dashboard load never ships the full archive.

## Browser-facing files and load order

The client (`src/data/client.ts`) loads `manifest.json` first, then uses its `generatedAt` as a
cache-busting query parameter (`?v=<generatedAt>`) for every other file, and validates every
response with Zod (`src/data/schemas.ts`) before rendering anything.

| File                   | Purpose                                             |
| ---------------------- | --------------------------------------------------- |
| `manifest.json`        | `DataManifest` — versions, counts, and the file map |
| `articles-latest.json` | `Article[]`                                         |
| `trends.json`          | `Trend[]`                                           |
| `statistics.json`      | `Statistics` — KPI counts + per-keyword stats       |
| `sources-public.json`  | `PublicSource[]`                                    |
| `source-health.json`   | `SourceHealth[]`                                    |
| `keywords-public.json` | `KeywordPublic[]` — see note below                  |

> **`keywords-public.json` is a small, deliberate addition** beyond the six files the spec calls
> out by example. The Keywords page and the article keyword badges need keyword labels/categories,
> which live in `config/keywords.yml` (declarative config on `main`, not collected data) — but
> nothing in the spec's file list carries that to the browser. Rather than bundle YAML into the
> client, the pipeline publishes a public projection (id, bilingual labels, category, synonym
> count, enabled) alongside the rest of `generated/`, validated and versioned the same way.
> Internal matching detail (`terms`, `excludedTerms`, `weight`) is intentionally not shipped.

## Core types

```ts
type SourceCategory =
  'consulting' | 'technology' | 'cybersecurity' | 'artificial-intelligence' | 'media';

interface Article {
  id: string; // SHA-256 of the normalized canonical URL
  title: string;
  url: string;
  canonicalUrl: string;
  sourceId: string;
  sourceName: string;
  company: string;
  sourceCategory: SourceCategory;
  publishedAt: string; // ISO 8601 UTC
  discoveredAt: string; // ISO 8601 UTC
  updatedAt?: string;
  summary: string; // plain text, <= 320 chars
  imageUrl?: string;
  language: 'fr' | 'en' | 'unknown';
  tags: string[]; // publisher-supplied, normalized (see below)
  matchedKeywordIds: string[];
  tagMatchedIds: string[]; // reached via a tag alias; not yet scored
  relevanceScore: number; // 0-100
  trendScore?: number; // 0-100, from the matching keyword's best 7d trend
}
```

See `src/types/index.ts` (browser) and `scripts/schemas.ts` (pipeline) for the full set of types —
`KeywordDefinition`/`KeywordConfig`, `PublicSource`/`SourceConfig`, `SourceHealth`, `Trend`,
`DataManifest`, `Statistics`.

## Publisher tags (`scripts/tags.ts`)

Sources that tag their own articles are a higher-precision signal than a term appearing in a
summary: a tag is an assertion by the publisher, not an incidental occurrence. Collection reads
them from `<category>` (RSS — by far the richest channel), and from JSON-LD `keywords`,
`article:tag` and `<meta name="keywords">` on article pages.

They are messy, so `normalizeTags` splits comma-joined values, strips decoration, drops a small
stoplist of editorial rubrics (`uncategorized`, `company news`, `week in review`, …),
de-duplicates on a case/accent/separator-folded key, and caps the count per article.

Mapping a tag onto the vocabulary is separate, and deliberately so: a keyword's `aliases` list
holds the spellings publishers use for it, and `matchKeywordsByTags` matches them by **exact
equality** on the folded key — never as a substring. `terms` need word boundaries because they
hunt a concept inside prose; a tag is already a discrete label, so `AI Bots` must not count as
the alias `ai`.

The result lands in `tagMatchedIds`, kept **separate from `matchedKeywordIds`**: relevance and
trends still run on the text-matching model alone, so the extra recall tags provide can be
measured from published data before it is allowed to move any score.

## Relevance scoring (`scripts/scoring.ts`)

Deterministic, 0–100, capped:

```text
Title matches       up to 45   (15 pts per distinct matched keyword found in the title)
Summary matches     up to 25   (10 pts per distinct matched keyword found in the summary)
Keyword weight      up to 10   (round(7 × average weight of matched keywords))
Source priority     up to 10   (the source's configured priority, 0-10, used directly)
Recency             up to 10   (10 if ≤24h, 7 if ≤72h, 4 if ≤7d, 2 if ≤30d, else 0)
```

Components are summed and clamped to `[0, 100]`. Keyword matching itself
(`scripts/keyword-match.ts`) is Unicode-aware and case-insensitive, using a lookbehind/lookahead
word-boundary regex (`(?<![\p{L}\p{N}])term(?![\p{L}\p{N}])`) so short terms like `AI`/`IA`/`IAM`
never match as a substring of a longer word, and accented terms (`souveraineté`) match correctly
regardless of surrounding punctuation. A keyword's `excludedTerms` suppress a match only where the
excluded phrase's span overlaps the matched term's span, so `"AI"` still matches
`"AI governance"` even though the keyword also excludes an unrelated phrase.

## Trend scoring (`scripts/compute-trends.ts`)

One `Trend` entry per enabled keyword × timeframe (`24h`, `7d`, `30d`), comparing the current
window to the immediately preceding, equal-length window:

```text
35% normalized publication volume    (this keyword's count / the busiest keyword's count, this run)
30% publication acceleration         (growth vs. the previous window, squashed to 0-1 around 0%=0.5)
20% distinct source diversity        (distinct sources this window / 5, capped at 1)
15% weighted source authority        (average configured priority of the leading sources / 10)
```

`growthRate` is `null` (not a division by zero, not an infinite percentage) whenever the previous
window had zero articles — the acceleration component then falls back to a neutral `0.5` if there
is at least one article this window, `0` otherwise, so a single fresh article can't alone reach the
high end of the score.

Status thresholds:

```text
80-100  Breakout    (also requires >= 2 distinct sources AND >= 2 articles this window)
65-79   Emerging
45-64   Rising
25-44   Stable
0-24    Declining if growthRate < 0, otherwise Stable
```

## Configuration (`config/*.yml`)

- `config/categories.yml` — the five `SourceCategory` values with bilingual labels.
- `config/keywords.yml` — `KeywordDefinition`-shaped entries: id, bilingual labels, category,
  `terms`, `aliases`, optional `excludedTerms`, `weight`, `enabled`.
- `config/sources.yml` — `PublicSource`-shaped entries plus collector-only fields (`feedUrl`,
  `language`, `maxItemsPerRun`, `includePaths`, `excludePaths`). A source's `feedUrl` is only ever
  a real, validated endpoint when `enabled: true`; otherwise it's the literal string
  `REPLACE_AFTER_VALIDATION` — see `docs/adding-a-source.md`.

All three are parsed and validated with Zod at pipeline start (`scripts/config-loader.ts`,
`npm run validate:config`); an invalid config file fails the run before any network request is
made.

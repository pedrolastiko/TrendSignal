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
generated/events.json
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

| File                   | Purpose                                              |
| ---------------------- | ---------------------------------------------------- |
| `manifest.json`        | `DataManifest` — versions, counts, and the file map  |
| `articles-latest.json` | `Article[]`                                          |
| `trends.json`          | `Trend[]`                                            |
| `statistics.json`      | `Statistics` — KPI counts + per-keyword stats        |
| `sources-public.json`  | `PublicSource[]`                                     |
| `source-health.json`   | `SourceHealth[]`                                     |
| `keywords-public.json` | `KeywordPublic[]` — see note below                   |
| `events.json`          | `EventsFile` — upcoming events + event-source health |

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

## Events (`scripts/collect-events.ts`, `scripts/events/`)

Events are a separate dataset from articles. An event's date lies ahead, so it must not feed trend
scoring or the "latest articles" ordering, and an article date and an event date answer different
questions. They are collected in the same run (`scripts/collect.ts`), published as
`generated/events.json`, and listed in the manifest (`files['events.json']`, `eventCount`).
`events.json` is `{ generatedAt, events: EventItem[], sources: EventSourceStatus[] }`; the schemas
are in `scripts/schemas.ts` (generation) and `src/data/schemas.ts` (browser).

**Sources** are declared in `config/event-sources.yml` (`ics`, `rss`, `jsonld`, `cncf-events`):

- `ics`: an iCalendar feed. Times with a `TZID` are converted to UTC through `Intl`; a floating
  time is read as UTC; `VALUE=DATE` events are all-day. Cancelled events are skipped. The response
  must contain `BEGIN:VCALENDAR`, so an HTML app shell is an error, not zero events.
- `rss`: an events feed where each item's `pubDate` is the **event start**. A start at exactly
  00:00:00 in the feed's own offset is read as an all-day event on the date as written.
- `jsonld`: a listing page whose linked pages each carry a schema.org `Event` in JSON-LD. The
  listing is only used to find links (`includePaths`, required, filters them; same host, each page
  fetched once, at most 60 per run). The event is read from the page: name, `startDate`/`endDate`,
  description, `eventAttendanceMode`, location. A date-only `startDate` is an all-day event, and a
  date-only `endDate` is the last day, inclusive; an offset written `+0000` is accepted; a time
  with no offset is read as UTC. Cancelled and postponed events are skipped. The event's URL is
  the one that was fetched, not the one the page claims. No link on the listing, or no Event on
  any linked page, is an error, so a layout change shows up in the health instead of as "no events".
- `techconf-ca`: techconf.ca, a community list of Canadian tech conferences, from its upcoming and
  past pages; see "Dates the organiser has not confirmed" below.
- `observability-360`: the hand-maintained calendar page of observability-360.com. Each event
  appears twice on the page (a card and a summary row), so blocks are merged on their link; dates
  are written for people ("23-24 Oct 2025") and parsed, a place of "Virtual" or "Online" is an
  online event. No block, or none with a date, is an error.
- `curated`: a YAML file under `config/` (`config/event-series.yml`) kept by hand, for conferences
  whose organisers cannot be collected (Black Hat, RSAC and Gartner answer 403) or that are not
  listings (DEF CON, re:Invent, Microsoft Ignite and Build). Nothing is fetched. Each series lists
  its editions with the URL the date was read at, the day it was checked and a status.
- `cncf-events`: cncf.io's WordPress REST API (`lf_event`), a source-specific adapter. The data is
  under `meta`, not `acf`; the country comes from the `lf-country` terms.

**Which events are kept**, in this order (`scripts/events/build.ts`):

1. A usable title, a parseable start and a safe `http(s)` URL.
2. Not a call for proposals (`CFP …`, "call for papers/speakers", a `CFP` category).
3. Not over: for all-day events the end is exclusive, so a one-day event ends the next midnight
   UTC; a timed event with no end is assumed to last two hours.
4. Not more than 548 days ahead.
5. **In scope**: every online event, plus in-person and hybrid events in North America (United
   States, Canada, Mexico). An explicit country code settles it; otherwise the text is searched
   for the area, a country or a conference town, and a location ending in a US state or Canadian
   province ("Half Moon Bay, CA"; only abbreviations that are not also an ISO country code, so
   "Mumbai, IN" or "Berlin, DE" never match); a source declared `region: north-america`
   vouches for its in-person events unless a country says otherwise.
6. It matches at least one enabled keyword, unless the source sets `includeUnmatched: true`.

**Format**: when the publisher declares an attendance mode (schema.org `eventAttendanceMode`,
or a `VirtualLocation`), it is used as is: online, offline (in person) or mixed (hybrid). Otherwise
it is read from the text: `online` when the title or location says so (webinar, webcast, virtual, online…), a
title ends in "Call", or the summary says the event itself is online ("online event", "virtual
summit", "held online"). A bare "online" in the summary does not count: "online authentication"
describes the topic, not the event. `hybrid` when the text says so or says both. Otherwise
`in-person`. **Kind** is `conference` for conference/summit/forum/seminar/workshop/expo and the
usual `…Con` names, `webinar` for any other online event, else `event`.

**Relevance** reuses the article components minus recency, so it is 0–90:
title matches (up to 45) + summary matches (up to 25) + keyword weight (up to 10) + source
priority (up to 10).

**Identity and de-duplication**: `id` is the SHA-256 of the normalized URL plus `#` plus the start,
so a recurring event keeps one id per date; a listing page that stands for many events adds the
conference's name to it so ids do not collide. Entries are merged when they are:

- the same id, or the same company, normalized title and start (one event listed twice);
- the same conference starting the same day, whoever lists it. "Same conference" means the same
  name once the year, ordinal, accents, spacing and punctuation are folded away ("BSides" and
  "B|Sides" match) and a compatible place (a missing one matches anything; otherwise one's city
  appears in the other's location). The confirmed entry stays, then the better-scored one, which is how KubeCon on CNCF's
  page and on a sponsor's collapses to one;
- an estimated date and a confirmed date of the same conference within 45 days: the estimate goes
  (and a confirmed entry is never the one dropped in the same-day case, whatever the scores).

Two conferences are never merged on a similar title alone: a different city or a different day
keeps both.

**Dates the organiser has not confirmed**: every event has a `dateStatus`. `estimated` means the
organiser has not confirmed the date, for one of two reasons. Either the date was **projected**:
the latest known edition's calendar day is assumed to repeat one year later (29 February becomes 28
February in a common year, the length of the edition is kept) and `estimatedFrom` holds that
edition's first day; an edition older than a year is not projected, since it may no longer run. Or
it was **reported** by listings but not by the organiser, and `estimatedFrom` is absent. The
browser shows a "Date not confirmed" badge and says which of the two, can filter to confirmed dates
only, and exports such an event as `STATUS:TENTATIVE`.

For `techconf-ca`, each conference series (identified as above) is resolved in this order:

1. a hand-checked date in the source's `knownEditions`, with its own `confirmed` or `unconfirmed`
   status;
2. an edition already listed as upcoming, used as is but flagged `estimated` (reported by a list, so
   no `estimatedFrom`): a list reports a date, it is not the organiser stating it;
3. otherwise projected from the latest edition on the past page.

"A new date is already known" is judged by those lists and `knownEditions`; the conferences' own
sites are not crawled, since the past page carries no links. `confirmed` is only for a date the
organiser, or the venue hosting it, states. The upcoming page also marks an event's own window
(`today >= dateTimestamp('<start>') && today <= dateTimestamp('<end>')`), which is how an end date
is read; a window that does not start on the event's first day is a call for papers and is ignored.

**Failures**: a source that fails keeps its previous events that are still upcoming and has its
health degraded (`warning` after one failure, `error` after three); the others carry on. Events
failures never abort the run. `--source-id=<id>` refreshes one event source and carries over the
rest. Only upcoming events are published: there is no history.

The browser drops events that ended since the data was generated, shows times in the reader's
zone (all-day events in UTC dates), and builds the `.ics` file locally (`src/lib/ics.ts`).

/**
 * Normalization for publisher-supplied article tags (RSS `<category>`, JSON-LD
 * `keywords`, `article:tag`, `<meta name="keywords">`).
 *
 * Tags are an assertion by the publisher about its own article, which makes them a
 * higher-precision signal than a term appearing somewhere in a summary. They are also
 * far messier than a curated vocabulary: the survey behind this module (see
 * `scripts/survey-article-tags.ts`) found the same concept spelled five different ways
 * across sources — `ai`, `artificial intelligence`, `ai & ml`, `ai and ml`,
 * `ai & machine learning` — alongside a large share of values that are not topics at
 * all but editorial rubrics: `news`, `company`, `uncategorized`, `week in review`.
 *
 * This module only cleans and filters. Mapping a tag onto a keyword is the job of the
 * keyword `aliases` list, so the controlled vocabulary stays reviewable in config
 * rather than growing itself from whatever publishers happen to emit.
 */

/**
 * Values that describe where a post sits in a publication's own workflow rather than
 * what it is about. Kept deliberately narrow: anything arguably topical (`research`,
 * `hardware`, `education`) stays in, because dropping a real topic is worse than
 * keeping a vague one — an unmapped tag costs nothing until someone gives it an alias.
 */
const EDITORIAL_TAGS = new Set([
  'uncategorized',
  'news',
  'company',
  'company news',
  'corporate',
  'product news',
  'announcement',
  'announcements',
  'launch',
  'week in review',
  'exclusive',
  'featured',
  'general',
  'update',
  'updates',
  'blog',
  'blogs',
  'press release',
  'press releases',
  'our insights',
  'newsletter',
]);

/** Publishers occasionally put a whole sentence in `keywords`; that is prose, not a tag. */
const MAX_TAG_LENGTH = 60;
const MIN_TAG_LENGTH = 2;
/** InfoQ emits ~11 tags per article; the cap keeps a pathological feed from dominating. */
const MAX_TAGS_PER_ARTICLE = 12;

/** Case- and accent-insensitive key used for de-duplication and alias lookup. */
export function tagKey(tag: string): string {
  return tag
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, ' ')
    .replace(/&/g, 'and')
    .trim();
}

/**
 * Splits comma-joined values and strips decoration, without applying the editorial
 * stoplist — the tag survey needs to see every value a publisher emits, including the
 * rubrics, since that is how the stoplist above was derived in the first place.
 *
 * Order matters: surrounding whitespace and quotes come off before the leading `#`, or
 * the anchor never sees it in a value like `" #AI "`.
 */
export function splitAndCleanTags(rawValues: (string | undefined | null)[]): string[] {
  const cleaned: string[] = [];

  for (const raw of rawValues) {
    if (!raw) continue;
    for (const part of raw.split(/[,;|]/)) {
      const tag = part
        .replace(/^["'\s]+|["'\s]+$/g, '')
        .replace(/^#/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (tag.length < MIN_TAG_LENGTH || tag.length > MAX_TAG_LENGTH) continue;
      cleaned.push(tag);
    }
  }

  return cleaned;
}

/**
 * Production normalization: cleans, drops editorial rubrics, de-duplicates on the
 * normalized key while preserving the publisher's own casing for display, and caps the
 * count.
 */
export function normalizeTags(rawValues: (string | undefined | null)[]): string[] {
  const byKey = new Map<string, string>();

  for (const tag of splitAndCleanTags(rawValues)) {
    const key = tagKey(tag);
    if (!key || EDITORIAL_TAGS.has(key)) continue;
    if (!byKey.has(key)) byKey.set(key, tag);
  }

  return [...byKey.values()].slice(0, MAX_TAGS_PER_ARTICLE);
}

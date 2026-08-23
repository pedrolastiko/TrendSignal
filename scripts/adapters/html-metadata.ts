import * as cheerio from 'cheerio';
import { isSafeUrl } from '../normalize.ts';
import { normalizeTags } from '../tags.ts';
import type { RawArticleCandidate } from './types.ts';

const ARTICLE_TYPES = new Set(['Article', 'NewsArticle', 'BlogPosting']);

interface JsonLdNode {
  '@type'?: string | string[];
  '@graph'?: JsonLdNode[];
  headline?: string;
  name?: string;
  datePublished?: string;
  dateModified?: string;
  description?: string;
  image?: string | { url?: string } | (string | { url?: string })[];
  inLanguage?: string;
  keywords?: string | string[];
}

function isArticleType(node: JsonLdNode): boolean {
  const type = node['@type'];
  if (!type) return false;
  const types = Array.isArray(type) ? type : [type];
  return types.some((t) => ARTICLE_TYPES.has(t));
}

function flattenJsonLd(nodes: unknown): JsonLdNode[] {
  const flat: JsonLdNode[] = [];
  const list = Array.isArray(nodes) ? nodes : [nodes];
  for (const node of list) {
    if (!node || typeof node !== 'object') continue;
    const typed = node as JsonLdNode;
    if (typed['@graph']) flat.push(...flattenJsonLd(typed['@graph']));
    else flat.push(typed);
  }
  return flat;
}

function extractImageFromJsonLd(image: JsonLdNode['image']): string | undefined {
  if (!image) return undefined;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) {
    const first = image[0];
    return typeof first === 'string' ? first : first?.url;
  }
  return image.url;
}

function findArticleJsonLd($: cheerio.CheerioAPI): JsonLdNode | undefined {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    const raw = $(script).contents().text();
    try {
      const parsed: unknown = JSON.parse(raw);
      const nodes = flattenJsonLd(parsed);
      const article = nodes.find(isArticleType);
      if (article) return article;
    } catch {
      // Malformed JSON-LD block; skip it and try the next one.
    }
  }
  return undefined;
}

function meta($: cheerio.CheerioAPI, selector: string): string | undefined {
  const value = $(selector).attr('content');
  return value?.trim() || undefined;
}

/**
 * Tag channels an article page can carry, in the order they are trusted. Of these only
 * `<meta name="keywords">` is currently populated anywhere in `config/sources.yml`
 * (Oliver Wyman), but JSON-LD `keywords` and `article:tag` are the two standard ways to
 * express the same thing, so a publisher adopting either is picked up without a change
 * here.
 */
function extractTags($: cheerio.CheerioAPI, jsonLd: JsonLdNode | undefined): string[] {
  const jsonLdKeywords = jsonLd?.keywords;
  return normalizeTags([
    ...(Array.isArray(jsonLdKeywords) ? jsonLdKeywords : [jsonLdKeywords]),
    ...$('meta[property="article:tag"]')
      .map((_, el) => $(el).attr('content'))
      .get(),
    meta($, 'meta[name="keywords"]'),
  ]);
}

/**
 * Standard (non-JSON-LD, non-Open-Graph) publication-date metadata, in the order
 * publishers most commonly use it. This is priority 3 of the documented extraction
 * chain; without it, any publisher that ships neither JSON-LD nor
 * `article:published_time` yields no date and is dropped entirely.
 */
const STANDARD_DATE_SELECTORS = [
  'meta[itemprop="datePublished"]',
  'meta[name="datePublished"]',
  'meta[name="publish-date"]',
  'meta[name="publication_date"]',
  'meta[name="pubdate"]',
  'meta[name="date"]',
  'meta[name="DC.date.issued"]',
  'meta[name="dc.date.issued"]',
  'meta[name="parsely-pub-date"]',
  'meta[name="sailthru.date"]',
];

function findStandardDate($: cheerio.CheerioAPI): string | undefined {
  for (const selector of STANDARD_DATE_SELECTORS) {
    const value = meta($, selector);
    if (value) return value;
  }
  // Semantic <time> element, e.g. <time datetime="..." itemprop="datePublished">
  const timeAttr = $('time[datetime]').first().attr('datetime');
  return timeAttr?.trim() || undefined;
}

export interface MetadataExtractionOptions {
  /**
   * Publisher-specific `<meta name="...">` names carrying the publication date,
   * tried after the standard selectors above (priority 4 of the extraction chain).
   * Declared per source in config/sources.yml so vendor quirks stay out of this
   * generic extractor — e.g. PwC exposes only `pwcReleaseDate`.
   */
  dateMetaNames?: string[];
}

/**
 * Extracts article metadata following the priority order: JSON-LD > Open Graph >
 * standard HTML metadata > source-specific selectors. Returns null when no usable
 * title/date is found.
 */
export function extractArticleMetadata(
  html: string,
  pageUrl: string,
  options: MetadataExtractionOptions = {},
): RawArticleCandidate | null {
  const $ = cheerio.load(html);
  const jsonLd = findArticleJsonLd($);

  const title =
    jsonLd?.headline ??
    jsonLd?.name ??
    meta($, 'meta[property="og:title"]') ??
    meta($, 'meta[name="title"]') ??
    $('title').first().text().trim() ??
    undefined;

  const sourceSpecificDate = options.dateMetaNames
    ?.map((name) => meta($, `meta[name="${name}"]`))
    .find((value): value is string => Boolean(value));

  const publishedAt =
    jsonLd?.datePublished ??
    meta($, 'meta[property="article:published_time"]') ??
    findStandardDate($) ??
    sourceSpecificDate ??
    undefined;

  if (!title || !publishedAt) return null;
  const publishedDate = new Date(publishedAt);
  if (Number.isNaN(publishedDate.getTime())) return null;

  const updatedAtRaw = jsonLd?.dateModified ?? meta($, 'meta[property="article:modified_time"]');
  const updatedDate = updatedAtRaw ? new Date(updatedAtRaw) : undefined;

  const summary =
    jsonLd?.description ??
    meta($, 'meta[property="og:description"]') ??
    meta($, 'meta[name="description"]') ??
    '';

  const imageUrlRaw = extractImageFromJsonLd(jsonLd?.image) ?? meta($, 'meta[property="og:image"]');
  const imageUrl = imageUrlRaw && isSafeUrl(imageUrlRaw) ? imageUrlRaw : undefined;

  const language =
    jsonLd?.inLanguage?.startsWith('fr') || $('html').attr('lang')?.startsWith('fr')
      ? 'fr'
      : undefined;

  return {
    title,
    url: pageUrl,
    publishedAt: publishedDate.toISOString(),
    updatedAt:
      updatedDate && !Number.isNaN(updatedDate.getTime()) ? updatedDate.toISOString() : undefined,
    summary,
    imageUrl,
    language,
    tags: extractTags($, jsonLd),
  };
}

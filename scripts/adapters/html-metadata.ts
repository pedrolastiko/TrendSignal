import * as cheerio from 'cheerio';
import { isSafeUrl } from '../normalize.ts';
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
 * Extracts article metadata following the priority order: JSON-LD > Open Graph
 * > standard HTML metadata. Returns null when no usable title/date is found.
 */
export function extractArticleMetadata(html: string, pageUrl: string): RawArticleCandidate | null {
  const $ = cheerio.load(html);
  const jsonLd = findArticleJsonLd($);

  const title =
    jsonLd?.headline ??
    jsonLd?.name ??
    meta($, 'meta[property="og:title"]') ??
    $('title').first().text().trim() ??
    undefined;

  const publishedAt =
    jsonLd?.datePublished ?? meta($, 'meta[property="article:published_time"]') ?? undefined;

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
  };
}

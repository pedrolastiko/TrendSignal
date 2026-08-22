import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';

const TRACKING_PARAM_PATTERNS = [/^utm_/i, /^gclid$/i, /^fbclid$/i, /^mc_cid$/i, /^mc_eid$/i];

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

export function isSafeUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

/** Normalizes a URL for canonical comparison: lowercases host, strips tracking params, sorts params, drops fragment/trailing slash. */
export function normalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = '';
  url.hostname = url.hostname.toLowerCase();

  const keptParams: [string, string][] = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key))) continue;
    keptParams.push([key, value]);
  }
  keptParams.sort(([a], [b]) => a.localeCompare(b));
  url.search = '';
  for (const [key, value] of keptParams) {
    url.searchParams.append(key, value);
  }

  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = pathname;

  return url.toString();
}

export function deterministicArticleId(canonicalUrl: string): string {
  return createHash('sha256').update(canonicalUrl).digest('hex');
}

/** Strips HTML/scripts, decodes entities via cheerio's text extraction, and collapses whitespace. */
export function stripHtml(html: string): string {
  const $ = cheerio.load(html);
  $('script, style').remove();
  const text = $.root().text();
  return text.replace(/\s+/g, ' ').trim();
}

export function truncateSummary(text: string, maxLength = 320): string {
  const clean = stripHtml(text);
  if (clean.length <= maxLength) return clean;
  const truncated = clean.slice(0, maxLength - 1);
  const lastSpace = truncated.lastIndexOf(' ');
  const safe = lastSpace > maxLength * 0.6 ? truncated.slice(0, lastSpace) : truncated;
  return `${safe}…`;
}

export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const FRENCH_HINT_PATTERN = /[àâäéèêëîïôöùûüçœ]|(\ble[s]?\b|\bdes\b|\bune?\b|\bpour\b|\bavec\b)/i;

/** Simple heuristic when a source-declared language is unavailable; source config language is preferred. */
export function guessLanguage(text: string): 'fr' | 'en' | 'unknown' {
  if (!text || text.trim().length < 20) return 'unknown';
  return FRENCH_HINT_PATTERN.test(text) ? 'fr' : 'en';
}

import { describe, expect, it } from 'vitest';
import {
  deterministicArticleId,
  guessLanguage,
  isSafeUrl,
  normalizeUrl,
  stripHtml,
  truncateSummary,
} from '../../../scripts/normalize.ts';

describe('normalizeUrl', () => {
  it('strips known tracking parameters', () => {
    const result = normalizeUrl('https://example.com/blog/post?utm_source=x&utm_medium=y&id=42');
    expect(result).toBe('https://example.com/blog/post?id=42');
  });

  it('removes gclid, fbclid, mc_cid and mc_eid', () => {
    const result = normalizeUrl('https://example.com/a?gclid=1&fbclid=2&mc_cid=3&mc_eid=4');
    expect(result).toBe('https://example.com/a');
  });

  it('lowercases the hostname and drops the fragment', () => {
    const result = normalizeUrl('https://Example.COM/Path#section');
    expect(result).toBe('https://example.com/Path');
  });

  it('drops a trailing slash on non-root paths', () => {
    expect(normalizeUrl('https://example.com/post/')).toBe('https://example.com/post');
    expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('sorts remaining query params deterministically', () => {
    const a = normalizeUrl('https://example.com/x?b=2&a=1');
    const b = normalizeUrl('https://example.com/x?a=1&b=2');
    expect(a).toBe(b);
  });
});

describe('isSafeUrl', () => {
  it('accepts http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
  });

  it('rejects javascript:, file:, and other custom protocols', () => {
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeUrl('file:///etc/passwd')).toBe(false);
    expect(isSafeUrl('data:text/html,hi')).toBe(false);
  });

  it('rejects unparsable strings', () => {
    expect(isSafeUrl('not a url')).toBe(false);
  });
});

describe('deterministicArticleId', () => {
  it('is deterministic for the same canonical URL', () => {
    const url = 'https://example.com/article';
    expect(deterministicArticleId(url)).toBe(deterministicArticleId(url));
  });

  it('differs for different canonical URLs', () => {
    expect(deterministicArticleId('https://example.com/a')).not.toBe(
      deterministicArticleId('https://example.com/b'),
    );
  });

  it('produces a 64-character hex string (SHA-256)', () => {
    expect(deterministicArticleId('https://example.com/a')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('stripHtml', () => {
  it('removes tags and scripts, decodes entities, and collapses whitespace', () => {
    const html = '<p>Hello&nbsp;<strong>world</strong></p><script>alert(1)</script>   trailing';
    const result = stripHtml(html);
    expect(result).not.toContain('<');
    expect(result).not.toContain('alert(1)');
    expect(result).toContain('Hello');
    expect(result).toContain('world');
    expect(result).not.toMatch(/\s{2,}/);
  });
});

describe('truncateSummary', () => {
  it('leaves short text untouched', () => {
    expect(truncateSummary('Short summary.')).toBe('Short summary.');
  });

  it('truncates to at most 320 characters at a word boundary with an ellipsis', () => {
    const long = 'word '.repeat(100);
    const result = truncateSummary(long);
    expect(result.length).toBeLessThanOrEqual(320);
    expect(result.endsWith('…')).toBe(true);
  });

  it('strips HTML before truncating', () => {
    const result = truncateSummary('<p>Hello <b>world</b></p>');
    expect(result).toBe('Hello world');
  });
});

describe('guessLanguage', () => {
  it('detects French via accented characters', () => {
    expect(guessLanguage('La souveraineté numérique est une priorité stratégique majeure')).toBe(
      'fr',
    );
  });

  it('defaults to English for plain ASCII business text', () => {
    expect(guessLanguage('The quarterly roadmap update has no particular relevance')).toBe('en');
  });

  it('returns unknown for very short text', () => {
    expect(guessLanguage('Hi')).toBe('unknown');
  });
});

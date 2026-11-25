import { describe, expect, it } from 'vitest';
import {
  buildLinkedInShareText,
  buildLinkedInShareUrl,
  buildShareExcerpt,
} from '../../../src/lib/linkedinShare';

describe('buildShareExcerpt', () => {
  it('returns the summary unchanged when it is already short enough', () => {
    expect(buildShareExcerpt('A short summary.')).toBe('A short summary.');
  });

  it('truncates on a word boundary and appends an ellipsis', () => {
    const summary = 'word '.repeat(60).trim();
    const excerpt = buildShareExcerpt(summary, 20);
    expect(excerpt.length).toBeLessThanOrEqual(21);
    expect(excerpt.endsWith('…')).toBe(true);
    expect(excerpt.endsWith(' …')).toBe(false);
  });

  it('trims surrounding whitespace before measuring length', () => {
    expect(buildShareExcerpt('  padded  ')).toBe('padded');
  });
});

describe('buildLinkedInShareUrl', () => {
  it('encodes the article URL as the only query parameter', () => {
    const url = buildLinkedInShareUrl('https://example.com/a?x=1&y=2');
    expect(url).toBe(
      'https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fexample.com%2Fa%3Fx%3D1%26y%3D2',
    );
  });
});

describe('buildLinkedInShareText', () => {
  const article = {
    title: 'Zero Trust adoption accelerates',
    summary: 'Enterprises are moving faster than expected on Zero Trust architectures.',
    url: 'https://example.com/articles/zero-trust',
  };

  it('includes the opinion prompt, a quoted excerpt, the title, and the link', () => {
    const text = buildLinkedInShareText(article, 'My take:');
    expect(text).toContain('My take:');
    expect(text).toContain(`« ${article.summary} »`);
    expect(text).toContain(article.title);
    expect(text).toContain(article.url);
  });

  it('quotes a truncated excerpt for a long summary', () => {
    const longSummary = 'word '.repeat(80).trim();
    const text = buildLinkedInShareText({ ...article, summary: longSummary }, 'My take:');
    expect(text).toContain('…');
    expect(text).not.toContain(longSummary);
  });
});

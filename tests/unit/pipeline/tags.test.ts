import { describe, expect, it } from 'vitest';
import { normalizeTags, tagKey } from '../../../scripts/tags.ts';

describe('normalizeTags', () => {
  it('splits comma-joined values and trims decoration', () => {
    expect(normalizeTags(['  #AI , Cloud Security ;  Zero Trust '])).toEqual([
      'AI',
      'Cloud Security',
      'Zero Trust',
    ]);
  });

  it('drops editorial rubrics that describe a section, not a topic', () => {
    expect(normalizeTags(['Uncategorized', 'Company News', 'Ransomware'])).toEqual(['Ransomware']);
  });

  it('de-duplicates on the normalized key while keeping the first spelling seen', () => {
    expect(normalizeTags(['Generative AI', 'generative ai', 'GENERATIVE-AI'])).toEqual([
      'Generative AI',
    ]);
  });

  it('rejects one-character values and prose-length values', () => {
    const prose = 'a'.repeat(61);
    expect(normalizeTags(['x', prose, 'ok'])).toEqual(['ok']);
  });

  it('caps how many tags a single article can contribute', () => {
    const many = Array.from({ length: 30 }, (_, i) => `tag-${i}`);
    expect(normalizeTags(many)).toHaveLength(12);
  });

  it('handles null and undefined entries', () => {
    expect(normalizeTags([undefined, null, 'AI'])).toEqual(['AI']);
  });
});

describe('tagKey', () => {
  it('folds case, accents, separators and ampersands', () => {
    expect(tagKey('Sécurité  du_Cloud')).toBe('securite du cloud');
    expect(tagKey('AI & ML')).toBe('ai and ml');
    expect(tagKey('ai-and-ml')).toBe('ai and ml');
  });
});

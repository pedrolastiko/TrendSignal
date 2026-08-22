import { describe, expect, it } from 'vitest';
import { matchKeywords } from '../../../scripts/keyword-match.ts';
import type { KeywordConfig } from '../../../scripts/schemas.ts';

function keyword(overrides: Partial<KeywordConfig>): KeywordConfig {
  return {
    id: 'test-keyword',
    labels: { fr: 'Test', en: 'Test' },
    category: 'technology',
    terms: ['test'],
    excludedTerms: [],
    weight: 1,
    enabled: true,
    ...overrides,
  };
}

describe('matchKeywords', () => {
  it('matches a short acronym as a whole word only', () => {
    const ai = keyword({ id: 'ai', terms: ['AI'] });
    const positive = matchKeywords({ title: 'New AI product launched', summary: '' }, [ai]);
    expect(positive.matchedKeywordIds).toContain('ai');

    const negative = matchKeywords({ title: 'A pair of scissors', summary: '' }, [ai]);
    expect(negative.matchedKeywordIds).not.toContain('ai');

    const substring = matchKeywords({ title: 'Send an email today', summary: '' }, [ai]);
    expect(substring.matchedKeywordIds).not.toContain('ai');
  });

  it('is case-insensitive', () => {
    const ai = keyword({ id: 'ai', terms: ['AI'] });
    const result = matchKeywords({ title: 'ai governance framework', summary: '' }, [ai]);
    expect(result.matchedKeywordIds).toContain('ai');
  });

  it('is Unicode-aware and matches accented French terms', () => {
    const sovereignty = keyword({ id: 'sovereignty', terms: ['souveraineté numérique'] });
    const result = matchKeywords({ title: 'La souveraineté numérique en question', summary: '' }, [
      sovereignty,
    ]);
    expect(result.matchedKeywordIds).toContain('sovereignty');
  });

  it('does not match a term embedded inside a longer accented word', () => {
    const sovereignty = keyword({ id: 'sovereignty', terms: ['numérique'] });
    const result = matchKeywords({ title: 'Numériquement parlant', summary: '' }, [sovereignty]);
    expect(result.matchedKeywordIds).not.toContain('sovereignty');
  });

  it('respects excludedTerms and suppresses false-positive matches', () => {
    const sovereignty = keyword({
      id: 'digital-sovereignty',
      terms: ['sovereignty'],
      excludedTerms: ['political sovereignty'],
    });
    const excluded = matchKeywords(
      { title: 'A debate on political sovereignty in Europe', summary: '' },
      [sovereignty],
    );
    expect(excluded.matchedKeywordIds).not.toContain('digital-sovereignty');

    const included = matchKeywords(
      { title: 'Digital sovereignty investments accelerate', summary: '' },
      [sovereignty],
    );
    expect(included.matchedKeywordIds).toContain('digital-sovereignty');
  });

  it('skips disabled keywords', () => {
    const disabled = keyword({ id: 'disabled', terms: ['widget'], enabled: false });
    const result = matchKeywords({ title: 'A new widget', summary: '' }, [disabled]);
    expect(result.matchedKeywordIds).not.toContain('disabled');
  });

  it('tracks title and summary matches separately', () => {
    const kw = keyword({ id: 'kw', terms: ['ransomware'] });
    const result = matchKeywords(
      { title: 'Ransomware group strikes again', summary: 'No mention of the term here.' },
      [kw],
    );
    expect(result.titleMatchedIds).toContain('kw');
    expect(result.summaryMatchedIds).not.toContain('kw');
  });
});

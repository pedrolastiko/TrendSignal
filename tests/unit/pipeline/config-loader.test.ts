import { describe, expect, it } from 'vitest';
import {
  loadCategoriesConfig,
  loadKeywordsConfig,
  loadSourcesConfig,
} from '../../../scripts/config-loader.ts';

describe('config-loader (validates the real repository config files)', () => {
  it('loads and validates config/sources.yml with at least 20 sources and 8 enabled', () => {
    const sources = loadSourcesConfig();
    expect(sources.length).toBeGreaterThanOrEqual(20);
    expect(sources.filter((s) => s.enabled).length).toBeGreaterThanOrEqual(8);
    for (const source of sources) {
      if (source.enabled) {
        expect(source.feedUrl).not.toBe('REPLACE_AFTER_VALIDATION');
      }
    }
  });

  it('gives every source a real feed URL, never a placeholder', () => {
    // Sources that cannot be collected are removed from the config rather than parked
    // as permanently-disabled placeholders, so no entry should carry the sentinel.
    for (const source of loadSourcesConfig()) {
      expect(source.feedUrl).not.toBe('REPLACE_AFTER_VALIDATION');
      expect(source.feedUrl).toMatch(/^https?:\/\//);
    }
  });

  it('gives every sitemap and html source at least one includePath', () => {
    // Without a path filter these adapters crawl an entire site's navigation, which is
    // how Deloitte ended up contributing almost nothing.
    for (const source of loadSourcesConfig()) {
      if (source.collectionMode === 'sitemap' || source.collectionMode === 'html') {
        expect(source.includePaths.length).toBeGreaterThan(0);
      }
    }
  });

  it('has unique source ids', () => {
    const sources = loadSourcesConfig();
    const ids = new Set(sources.map((s) => s.id));
    expect(ids.size).toBe(sources.length);
  });

  it('loads and validates config/keywords.yml with bilingual labels', () => {
    const keywords = loadKeywordsConfig();
    expect(keywords.length).toBeGreaterThan(0);
    for (const keyword of keywords) {
      expect(keyword.labels.fr.length).toBeGreaterThan(0);
      expect(keyword.labels.en.length).toBeGreaterThan(0);
      expect(keyword.terms.length).toBeGreaterThan(0);
    }
  });

  it('has unique keyword ids', () => {
    const keywords = loadKeywordsConfig();
    const ids = new Set(keywords.map((k) => k.id));
    expect(ids.size).toBe(keywords.length);
  });

  it('loads and validates config/categories.yml', () => {
    const categories = loadCategoriesConfig();
    expect(categories.length).toBe(5);
  });
});

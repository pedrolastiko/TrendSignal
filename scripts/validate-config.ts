import { loadCategoriesConfig, loadKeywordsConfig, loadSourcesConfig } from './config-loader.ts';

function run(): void {
  const sources = loadSourcesConfig();
  const keywords = loadKeywordsConfig();
  const categories = loadCategoriesConfig();

  const sourceIds = new Set<string>();
  for (const source of sources) {
    if (sourceIds.has(source.id)) throw new Error(`Duplicate source id: ${source.id}`);
    sourceIds.add(source.id);
    if (source.enabled && source.feedUrl === 'REPLACE_AFTER_VALIDATION') {
      throw new Error(`Source "${source.id}" is enabled but has no validated feedUrl`);
    }
  }

  const keywordIds = new Set<string>();
  for (const keyword of keywords) {
    if (keywordIds.has(keyword.id)) throw new Error(`Duplicate keyword id: ${keyword.id}`);
    keywordIds.add(keyword.id);
  }

  console.log(
    `Configuration valid: ${sources.length} sources (${sources.filter((s) => s.enabled).length} enabled), ` +
      `${keywords.length} keywords (${keywords.filter((k) => k.enabled).length} enabled), ${categories.length} categories.`,
  );
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}

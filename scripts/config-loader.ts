import { readFileSync } from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import {
  categoriesConfigFileSchema,
  keywordsConfigFileSchema,
  sourcesConfigFileSchema,
  type KeywordConfig,
  type SourceConfig,
} from './schemas.ts';

export class ConfigValidationError extends Error {}

function readYamlFile(path: string): unknown {
  const raw = readFileSync(path, 'utf-8');
  return loadYaml(raw);
}

export function loadSourcesConfig(path = 'config/sources.yml'): SourceConfig[] {
  const parsed = sourcesConfigFileSchema.safeParse(readYamlFile(path));
  if (!parsed.success) {
    throw new ConfigValidationError(`Invalid ${path}: ${parsed.error.message}`);
  }
  return parsed.data.sources;
}

export function loadKeywordsConfig(path = 'config/keywords.yml'): KeywordConfig[] {
  const parsed = keywordsConfigFileSchema.safeParse(readYamlFile(path));
  if (!parsed.success) {
    throw new ConfigValidationError(`Invalid ${path}: ${parsed.error.message}`);
  }
  return parsed.data.keywords;
}

export function loadCategoriesConfig(path = 'config/categories.yml') {
  const parsed = categoriesConfigFileSchema.safeParse(readYamlFile(path));
  if (!parsed.success) {
    throw new ConfigValidationError(`Invalid ${path}: ${parsed.error.message}`);
  }
  return parsed.data.categories;
}

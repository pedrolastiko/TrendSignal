import type {
  Article,
  DataManifest,
  KeywordPublic,
  PublicSource,
  SourceHealth,
  Statistics,
  Trend,
} from '../types';
import {
  articlesFileSchema,
  dataManifestSchema,
  keywordsFileSchema,
  sourceHealthFileSchema,
  sourcesPublicFileSchema,
  statisticsSchema,
  trendsFileSchema,
} from './schemas';

const DATA_BASE_URL = import.meta.env.VITE_DATA_BASE_URL ?? './data';

export class DataLoadError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'DataLoadError';
  }
}

async function fetchJson(path: string, version?: string): Promise<unknown> {
  const url = version
    ? `${DATA_BASE_URL}/${path}?v=${encodeURIComponent(version)}`
    : `${DATA_BASE_URL}/${path}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new DataLoadError(`Failed to load ${path}: HTTP ${response.status}`);
  }
  try {
    return await response.json();
  } catch (error) {
    throw new DataLoadError(`Failed to parse ${path} as JSON`, error);
  }
}

export async function loadManifest(): Promise<DataManifest> {
  const raw = await fetchJson('manifest.json');
  const parsed = dataManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DataLoadError('manifest.json failed schema validation', parsed.error);
  }
  return parsed.data;
}

export interface TrendSignalData {
  manifest: DataManifest;
  articles: Article[];
  trends: Trend[];
  statistics: Statistics;
  sources: PublicSource[];
  sourceHealth: SourceHealth[];
  keywords: KeywordPublic[];
}

export async function loadAllData(): Promise<TrendSignalData> {
  const manifest = await loadManifest();
  const version = manifest.generatedAt;

  const [articlesRaw, trendsRaw, statisticsRaw, sourcesRaw, sourceHealthRaw, keywordsRaw] =
    await Promise.all([
      fetchJson('articles-latest.json', version),
      fetchJson('trends.json', version),
      fetchJson('statistics.json', version),
      fetchJson('sources-public.json', version),
      fetchJson('source-health.json', version),
      fetchJson('keywords-public.json', version),
    ]);

  const articles = articlesFileSchema.safeParse(articlesRaw);
  if (!articles.success)
    throw new DataLoadError('articles-latest.json failed schema validation', articles.error);

  const trends = trendsFileSchema.safeParse(trendsRaw);
  if (!trends.success)
    throw new DataLoadError('trends.json failed schema validation', trends.error);

  const statistics = statisticsSchema.safeParse(statisticsRaw);
  if (!statistics.success)
    throw new DataLoadError('statistics.json failed schema validation', statistics.error);

  const sources = sourcesPublicFileSchema.safeParse(sourcesRaw);
  if (!sources.success)
    throw new DataLoadError('sources-public.json failed schema validation', sources.error);

  const sourceHealth = sourceHealthFileSchema.safeParse(sourceHealthRaw);
  if (!sourceHealth.success)
    throw new DataLoadError('source-health.json failed schema validation', sourceHealth.error);

  const keywords = keywordsFileSchema.safeParse(keywordsRaw);
  if (!keywords.success)
    throw new DataLoadError('keywords-public.json failed schema validation', keywords.error);

  return {
    manifest,
    articles: articles.data,
    trends: trends.data,
    statistics: statistics.data,
    sources: sources.data,
    sourceHealth: sourceHealth.data,
    keywords: keywords.data,
  };
}

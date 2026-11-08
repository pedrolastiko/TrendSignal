import type { ZodError } from 'zod';
import type {
  Article,
  DataManifest,
  EventsFile,
  KeywordPublic,
  PublicSource,
  SourceHealth,
  Statistics,
  Trend,
} from '../types';
import {
  articlesFileSchema,
  dataManifestSchema,
  eventsFileSchema,
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

/** "name failed schema validation (path: reason)": says which field, never what the data held. */
function validationMessage(name: string, error: ZodError): string {
  const issue = error.issues[0];
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
  return `${name} failed schema validation${issue ? ` (${where}${issue.message})` : ''}`;
}

export async function loadManifest(): Promise<DataManifest> {
  const raw = await fetchJson('manifest.json');
  const parsed = dataManifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new DataLoadError(validationMessage('manifest.json', parsed.error), parsed.error);
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
  /** Null when the published data predates events, or when `events.json` could not be used. */
  events: EventsFile | null;
  /** Why `events` is null although the manifest lists a file; the rest of the data is unaffected. */
  eventsError?: string;
}

/**
 * Events are an optional extra: a missing, unreachable or unreadable `events.json` must not take
 * the dashboard down with it. The usual cause is an older cached build reading newer data.
 */
async function loadEvents(
  path: string | undefined,
  version: string,
): Promise<{ events: EventsFile | null; eventsError?: string }> {
  if (!path) return { events: null };
  try {
    const parsed = eventsFileSchema.safeParse(await fetchJson(path, version));
    if (!parsed.success)
      return { events: null, eventsError: validationMessage('events.json', parsed.error) };
    return { events: parsed.data };
  } catch (error) {
    return {
      events: null,
      eventsError: error instanceof Error ? error.message : 'events.json failed to load',
    };
  }
}

export async function loadAllData(): Promise<TrendSignalData> {
  const manifest = await loadManifest();
  const version = manifest.generatedAt;

  const [
    articlesRaw,
    trendsRaw,
    statisticsRaw,
    sourcesRaw,
    sourceHealthRaw,
    keywordsRaw,
    eventsResult,
  ] = await Promise.all([
    fetchJson('articles-latest.json', version),
    fetchJson('trends.json', version),
    fetchJson('statistics.json', version),
    fetchJson('sources-public.json', version),
    fetchJson('source-health.json', version),
    fetchJson('keywords-public.json', version),
    loadEvents(manifest.files['events.json'], version),
  ]);

  const articles = articlesFileSchema.safeParse(articlesRaw);
  if (!articles.success)
    throw new DataLoadError(
      validationMessage('articles-latest.json', articles.error),
      articles.error,
    );

  const trends = trendsFileSchema.safeParse(trendsRaw);
  if (!trends.success)
    throw new DataLoadError(validationMessage('trends.json', trends.error), trends.error);

  const statistics = statisticsSchema.safeParse(statisticsRaw);
  if (!statistics.success)
    throw new DataLoadError(
      validationMessage('statistics.json', statistics.error),
      statistics.error,
    );

  const sources = sourcesPublicFileSchema.safeParse(sourcesRaw);
  if (!sources.success)
    throw new DataLoadError(validationMessage('sources-public.json', sources.error), sources.error);

  const sourceHealth = sourceHealthFileSchema.safeParse(sourceHealthRaw);
  if (!sourceHealth.success)
    throw new DataLoadError(
      validationMessage('source-health.json', sourceHealth.error),
      sourceHealth.error,
    );

  const keywords = keywordsFileSchema.safeParse(keywordsRaw);
  if (!keywords.success)
    throw new DataLoadError(
      validationMessage('keywords-public.json', keywords.error),
      keywords.error,
    );

  return {
    manifest,
    articles: articles.data,
    trends: trends.data,
    statistics: statistics.data,
    sources: sources.data,
    sourceHealth: sourceHealth.data,
    keywords: keywords.data,
    ...eventsResult,
  };
}

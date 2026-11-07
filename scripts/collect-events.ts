import pLimit from 'p-limit';
import { collectEventsFromIcs } from './adapters/events-ics.ts';
import { collectEventsFromJsonLd } from './adapters/events-jsonld.ts';
import { collectEventsFromRss } from './adapters/events-rss.ts';
import { collectEventsFromCncf } from './adapters/source-specific/cncf-events.ts';
import type { EventAdapterResult } from './adapters/types.ts';
import { buildEvent, deduplicateEvents, hasEnded } from './events/build.ts';
import { disabledSourceHealth, updateSourceHealth } from './source-health.ts';
import type {
  EventItem,
  EventSourceConfig,
  EventSourceStatus,
  EventsFile,
  KeywordConfig,
  SourceHealth,
} from './schemas.ts';

const CONCURRENCY = 3;

export interface CollectEventsOptions {
  sources: EventSourceConfig[];
  keywords: KeywordConfig[];
  /** The previous events.json: last known good events and health for sources not refreshed. */
  previous: EventsFile | null;
  now: Date;
  repositoryUrl?: string;
  /** Refresh only this source; the others keep their previous events and health. */
  targetSourceId?: string;
}

export interface CollectEventsSummary {
  targeted: number;
  succeeded: number;
  failed: number;
  collected: number;
  kept: number;
}

function runAdapter(
  source: EventSourceConfig,
  repositoryUrl: string | undefined,
): Promise<EventAdapterResult> {
  switch (source.collectionMode) {
    case 'ics':
      return collectEventsFromIcs(source, repositoryUrl);
    case 'rss':
      return collectEventsFromRss(source, repositoryUrl);
    case 'jsonld':
      return collectEventsFromJsonLd(source, repositoryUrl);
    case 'cncf-events':
      return collectEventsFromCncf(source, repositoryUrl);
  }
}

/**
 * Collects events from every enabled source. A source that fails is isolated: it keeps its
 * previous events (still upcoming ones) and has its health degraded, and the rest carry on.
 */
export async function collectEvents(
  options: CollectEventsOptions,
): Promise<{ file: EventsFile; summary: CollectEventsSummary }> {
  const { sources, keywords, previous, now, repositoryUrl, targetSourceId } = options;

  const previousEvents = previous?.events ?? [];
  const previousById = new Map(previousEvents.map((e) => [e.id, e]));
  const previousHealth = new Map((previous?.sources ?? []).map((s) => [s.id, s.health]));
  const stillUpcoming = (sourceId: string) =>
    previousEvents.filter((e) => e.sourceId === sourceId && !hasEnded(e, now));

  const events: EventItem[] = [];
  const health = new Map<string, SourceHealth>();
  const summary: CollectEventsSummary = {
    targeted: 0,
    succeeded: 0,
    failed: 0,
    collected: 0,
    kept: 0,
  };
  const limit = pLimit(CONCURRENCY);

  await Promise.all(
    sources.map((source) =>
      limit(async () => {
        if (!source.enabled) {
          health.set(source.id, disabledSourceHealth(source.id, previousHealth.get(source.id)));
          return;
        }
        if (targetSourceId && source.id !== targetSourceId) {
          events.push(...stillUpcoming(source.id));
          const prior = previousHealth.get(source.id);
          if (prior) health.set(source.id, prior);
          return;
        }

        summary.targeted += 1;
        try {
          const result = await runAdapter(source, repositoryUrl);
          const built = result.candidates
            .map((c) => buildEvent(c, source, keywords, previousById, now))
            .filter((e): e is EventItem => e !== null)
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
            .slice(0, source.maxItemsPerRun);

          summary.succeeded += 1;
          summary.collected += result.candidates.length;
          events.push(...built);
          health.set(
            source.id,
            updateSourceHealth(
              source.id,
              true,
              previousHealth.get(source.id),
              {
                success: true,
                itemsFetched: result.candidates.length,
                newItems: built.filter((e) => !previousById.has(e.id)).length,
                responseTimeMs: result.responseTimeMs,
              },
              now,
            ),
          );
        } catch (error) {
          summary.failed += 1;
          events.push(...stillUpcoming(source.id));
          health.set(
            source.id,
            updateSourceHealth(
              source.id,
              true,
              previousHealth.get(source.id),
              { success: false, itemsFetched: 0, newItems: 0, error },
              now,
            ),
          );
        }
      }),
    ),
  );

  const deduped = deduplicateEvents(events);
  summary.kept = deduped.length;

  const statuses: EventSourceStatus[] = sources
    .map((source) => ({
      id: source.id,
      name: source.name,
      company: source.company,
      homepageUrl: source.homepageUrl,
      collectionMode: source.collectionMode,
      enabled: source.enabled,
      health: health.get(source.id) ?? disabledSourceHealth(source.id, undefined),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    file: { generatedAt: now.toISOString(), events: deduped, sources: statuses },
    summary,
  };
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAllData } from '../../../src/data/client';

const GENERATED_AT = '2026-11-08T00:00:00.000Z';

const manifest = (files: Record<string, string>) => ({
  schemaVersion: '1',
  generatedAt: GENERATED_AT,
  lastSuccessfulScanAt: GENERATED_AT,
  articleCount: 0,
  sourceCount: 0,
  activeKeywordCount: 0,
  files,
});

const baseFiles = {
  'articles-latest.json': 'articles-latest.json',
  'trends.json': 'trends.json',
  'statistics.json': 'statistics.json',
  'sources-public.json': 'sources-public.json',
  'source-health.json': 'source-health.json',
  'keywords-public.json': 'keywords-public.json',
};

const event = (overrides: Record<string, unknown> = {}) => ({
  id: 'a'.repeat(64),
  title: 'Webinar',
  url: 'https://example.com/e',
  sourceId: 's',
  sourceName: 'S',
  company: 'C',
  sourceCategory: 'cybersecurity',
  startsAt: '2026-12-01T15:00:00.000Z',
  allDay: false,
  kind: 'webinar',
  format: 'online',
  summary: '',
  language: 'en',
  matchedKeywordIds: [],
  relevanceScore: 40,
  discoveredAt: GENERATED_AT,
  ...overrides,
});

const health = {
  sourceId: 's',
  status: 'healthy',
  itemsFetched: 1,
  newItems: 0,
  consecutiveFailures: 0,
};

function serve(files: Record<string, unknown>, events?: { body?: unknown; status?: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = String(input);
      const name = url.split('/').pop()?.split('?')[0] ?? '';
      if (name === 'manifest.json') return Response.json(manifest(files as Record<string, string>));
      if (name === 'events.json') {
        if (events?.status && events.status !== 200)
          return new Response('nope', { status: events.status });
        return Response.json(
          events?.body ?? { generatedAt: GENERATED_AT, events: [], sources: [] },
        );
      }
      const bodies: Record<string, unknown> = {
        'articles-latest.json': [],
        'trends.json': [],
        'statistics.json': {
          generatedAt: GENERATED_AT,
          articleCount: 0,
          activeSourceCount: 0,
          activeKeywordCount: 0,
          lastSuccessfulScanAt: GENERATED_AT,
          articlesByCategory: {},
          keywordStats: [],
        },
        'sources-public.json': [],
        'source-health.json': [],
        'keywords-public.json': [],
      };
      return Response.json(bodies[name] ?? {});
    }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('loading the published data', () => {
  it('reads events when the file is valid', async () => {
    serve(
      { ...baseFiles, 'events.json': 'events.json' },
      { body: { generatedAt: GENERATED_AT, events: [event()], sources: [] } },
    );
    const data = await loadAllData();
    expect(data.events?.events).toHaveLength(1);
    expect(data.events?.events[0]?.dateStatus).toBe('confirmed'); // defaulted for older files
    expect(data.eventsError).toBeUndefined();
  });

  it('accepts a source collected in a way this build has never heard of, with no homepage', async () => {
    // What an older cached build used to reject, taking the whole app down with it.
    const sources = ['techconf-ca', 'curated', 'some-mode-added-next-year'].map(
      (collectionMode, i) => ({
        id: `s${i}`,
        name: `Source ${i}`,
        company: 'C',
        collectionMode,
        enabled: true,
        health: { ...health, sourceId: `s${i}` },
      }),
    );
    serve(
      { ...baseFiles, 'events.json': 'events.json' },
      { body: { generatedAt: GENERATED_AT, events: [], sources } },
    );
    const data = await loadAllData();
    expect(data.events?.sources.map((s) => s.collectionMode)).toEqual([
      'techconf-ca',
      'curated',
      'some-mode-added-next-year',
    ]);
    expect(data.eventsError).toBeUndefined();
  });

  it('keeps the rest of the app working when events.json is invalid, and says which field', async () => {
    serve(
      { ...baseFiles, 'events.json': 'events.json' },
      {
        body: { generatedAt: GENERATED_AT, events: [event({ relevanceScore: 500 })], sources: [] },
      },
    );
    const data = await loadAllData();
    expect(data.events).toBeNull();
    expect(data.eventsError).toMatch(
      /^events\.json failed schema validation \(events\.0\.relevanceScore: /,
    );
    // The articles, trends and the rest are untouched.
    expect(data.articles).toEqual([]);
    expect(data.statistics.articleCount).toBe(0);
  });

  it('keeps the rest of the app working when events.json cannot be fetched', async () => {
    serve({ ...baseFiles, 'events.json': 'events.json' }, { status: 404 });
    const data = await loadAllData();
    expect(data.events).toBeNull();
    expect(data.eventsError).toMatch(/events\.json.*404/);
  });

  it('treats a manifest without events.json as "no events yet", without an error', async () => {
    serve(baseFiles);
    const data = await loadAllData();
    expect(data.events).toBeNull();
    expect(data.eventsError).toBeUndefined();
  });

  it('still fails loudly when a file the app depends on is invalid, naming the field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const name = String(input).split('/').pop()?.split('?')[0] ?? '';
        if (name === 'manifest.json') return Response.json(manifest(baseFiles));
        if (name === 'articles-latest.json') return Response.json([{ title: 'no id, no url' }]);
        return Response.json([]);
      }),
    );
    await expect(loadAllData()).rejects.toThrow(
      /^articles-latest\.json failed schema validation \(0\.id: /,
    );
  });
});

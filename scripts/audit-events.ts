/**
 * Live check for event sources, the events counterpart of audit-sources.ts: runs the real
 * adapters through the collector's own fetch policy and prints what would be published.
 * A source may only be `enabled: true` once this shows real, upcoming, in-scope events.
 *
 *   npx tsx scripts/audit-events.ts [--source-id=<id>]
 *
 * A `~` after a date marks one the organiser has not confirmed.
 *
 * Hits live publishers, so it is never part of CI. Writes nothing.
 */
import { loadEventScope, loadEventSourcesConfig, loadKeywordsConfig } from './config-loader.ts';
import { collectEvents } from './collect-events.ts';
import { resolveRepositoryUrl } from './repository-url.ts';

async function main(): Promise<void> {
  const sourceId = process.argv.find((a) => a.startsWith('--source-id='))?.slice(12);
  const sources = loadEventSourcesConfig()
    // Audit even sources that are still disabled: that is how they earn being enabled.
    .map((s) => ({ ...s, enabled: true }))
    .filter((s) => !sourceId || s.id === sourceId);
  if (sources.length === 0) throw new Error(`No event source matches ${sourceId ?? ''}`);

  const { file, summary } = await collectEvents({
    sources,
    keywords: loadKeywordsConfig(),
    previous: null,
    now: new Date(),
    repositoryUrl: resolveRepositoryUrl(),
    scope: loadEventScope(),
  });

  for (const status of file.sources) {
    const own = file.events.filter((e) => e.sourceId === status.id);
    console.log(
      `\n== ${status.id}: ${status.health.status}, ${status.health.itemsFetched} fetched, ${own.length} kept` +
        (status.health.lastError ? `, error: ${status.health.lastError}` : ''),
    );
    for (const event of own.slice(0, 20)) {
      console.log(
        `   ${event.startsAt.slice(0, 10)}${event.dateStatus === 'estimated' ? '~' : ' '} ${event.format.padEnd(9)} ${(event.continent ?? '-').padEnd(13)} ` +
          `${event.title.slice(0, 60)} [${event.matchedKeywordIds.join(',') || '-'}]`,
      );
    }
  }
  console.log(`\n${JSON.stringify(summary)}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

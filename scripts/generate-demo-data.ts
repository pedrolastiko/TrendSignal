import { rm } from 'node:fs/promises';
import { collect } from './collect.ts';
import { publish } from './publish-data.ts';

const DEMO_DATA_DIR = '.demo-data';

async function run(): Promise<void> {
  await rm(DEMO_DATA_DIR, { recursive: true, force: true });
  // Uses the real wall clock (not a pinned date) so `lastSuccessfulScanAt` is always fresh and the
  // dashboard never opens with a stale-data banner. Fixture articles carry fixed 2026-08 dates, so
  // the 24h trend tab may be sparse depending on how long ago they fall relative to today — see the
  // "Demo data" limitation in README.md.
  await collect({ fixtures: true, dataDir: DEMO_DATA_DIR, dryRun: false });
  await publish({ dataDir: DEMO_DATA_DIR, outDir: 'public/data' });
  console.log('Demo data generated in public/data (source: fixture pipeline run).');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

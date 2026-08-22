import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  articlesFileSchema,
  dataManifestSchema,
  keywordsFileSchema,
  sourceHealthFileSchema,
  sourcesPublicFileSchema,
  statisticsSchema,
  trendsFileSchema,
} from './schemas.ts';

const FILES: { name: string; schema: { parse: (data: unknown) => unknown } }[] = [
  { name: 'manifest.json', schema: dataManifestSchema },
  { name: 'articles-latest.json', schema: articlesFileSchema },
  { name: 'trends.json', schema: trendsFileSchema },
  { name: 'statistics.json', schema: statisticsSchema },
  { name: 'sources-public.json', schema: sourcesPublicFileSchema },
  { name: 'source-health.json', schema: sourceHealthFileSchema },
  { name: 'keywords-public.json', schema: keywordsFileSchema },
];

export interface PublishOptions {
  dataDir: string;
  outDir: string;
}

function parseArgs(argv: string[]): PublishOptions {
  const options: PublishOptions = { dataDir: 'data', outDir: 'public/data' };
  for (const arg of argv) {
    if (arg.startsWith('--data-dir=')) options.dataDir = arg.slice('--data-dir='.length);
    else if (arg.startsWith('--out-dir=')) options.outDir = arg.slice('--out-dir='.length);
  }
  return options;
}

export async function publish({ dataDir, outDir }: PublishOptions): Promise<void> {
  const generatedDir = join(dataDir, 'generated');

  // Validate every file before copying any of them, so a single invalid file can never
  // leave outDir in a partially-updated state — "must not deploy" means all or nothing.
  for (const { name, schema } of FILES) {
    const raw = await readFile(join(generatedDir, name), 'utf-8');
    schema.parse(JSON.parse(raw)); // throws on invalid data
    console.log(`Validated ${name}`);
  }

  await mkdir(outDir, { recursive: true });
  for (const { name } of FILES) {
    await copyFile(join(generatedDir, name), join(outDir, name));
    console.log(`Published ${name}`);
  }
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  publish(parseArgs(process.argv.slice(2))).catch((error: unknown) => {
    console.error('Publish failed — generated data is invalid and will not be deployed.');
    console.error(error);
    process.exitCode = 1;
  });
}

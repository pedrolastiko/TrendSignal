import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ZodType } from 'zod';
import type { Article } from './schemas.ts';

export async function readJsonFile<T>(path: string, schema: ZodType<T>, fallback: T): Promise<T> {
  if (!existsSync(path)) return fallback;
  const raw = await readFile(path, 'utf-8');
  if (!raw.trim()) return fallback;
  const parsed = schema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Invalid data at ${path}: ${parsed.error.message}`);
  }
  return parsed.data;
}

export async function writeJsonFile(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function articleMonthKey(article: Article): { year: string; month: string } {
  const date = new Date(article.publishedAt);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return { year, month };
}

export async function loadArticleArchive(dataDir: string): Promise<Article[]> {
  const archiveDir = join(dataDir, 'articles');
  if (!existsSync(archiveDir)) return [];

  const years = await readdir(archiveDir).catch(() => []);
  const articles: Article[] = [];
  for (const year of years) {
    const yearDir = join(archiveDir, year);
    const files = await readdir(yearDir).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await readFile(join(yearDir, file), 'utf-8');
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) articles.push(...(parsed as Article[]));
    }
  }
  return articles;
}

/** Writes the full deduplicated article set back to monthly archive files, grouped by UTC publication month. */
export async function saveArticleArchive(dataDir: string, articles: Article[]): Promise<void> {
  const byMonth = new Map<string, Article[]>();
  for (const article of articles) {
    const { year, month } = articleMonthKey(article);
    const key = `${year}/${month}`;
    const list = byMonth.get(key) ?? [];
    list.push(article);
    byMonth.set(key, list);
  }

  for (const [key, list] of byMonth) {
    const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
    await writeJsonFile(join(dataDir, 'articles', `${key}.json`), sorted);
  }
}

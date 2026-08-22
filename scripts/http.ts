import type { HttpCacheEntry } from './schemas.ts';

export const USER_AGENT_BASE = 'TrendSignalBot/1.0';
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_RETRIES = 2;
export const MAX_REDIRECTS = 5;
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10 MB

function buildUserAgent(repositoryUrl?: string): string {
  return repositoryUrl ? `${USER_AGENT_BASE} (+${repositoryUrl})` : USER_AGENT_BASE;
}

export class HttpFetchError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'HttpFetchError';
  }
}

export interface FetchResult {
  body: string;
  status: number;
  etag?: string;
  lastModified?: string;
  notModified: boolean;
  responseTimeMs: number;
}

function isTransient(error: unknown): boolean {
  if (error instanceof HttpFetchError && error.status !== undefined) {
    return error.status >= 500 || error.status === 429;
  }
  return true;
}

async function fetchOnce(
  url: string,
  cacheEntry: HttpCacheEntry | undefined,
  repositoryUrl?: string,
): Promise<FetchResult> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new HttpFetchError(`Unsupported protocol: ${parsed.protocol}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const start = Date.now();

  const headers: Record<string, string> = { 'User-Agent': buildUserAgent(repositoryUrl) };
  if (cacheEntry?.etag) headers['If-None-Match'] = cacheEntry.etag;
  if (cacheEntry?.lastModified) headers['If-Modified-Since'] = cacheEntry.lastModified;

  try {
    const response = await fetch(url, {
      headers,
      redirect: 'follow',
      signal: controller.signal,
    });
    const responseTimeMs = Date.now() - start;

    if (response.status === 304) {
      return { body: '', status: 304, notModified: true, responseTimeMs };
    }
    if (!response.ok) {
      throw new HttpFetchError(`HTTP ${response.status} for ${url}`, response.status);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > MAX_RESPONSE_BYTES) {
      throw new HttpFetchError(`Response too large for ${url}`);
    }

    const body = await response.text();
    if (body.length > MAX_RESPONSE_BYTES) {
      throw new HttpFetchError(`Response too large for ${url}`);
    }

    return {
      body,
      status: response.status,
      etag: response.headers.get('etag') ?? undefined,
      lastModified: response.headers.get('last-modified') ?? undefined,
      notModified: false,
      responseTimeMs,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithPolicy(
  url: string,
  cacheEntry: HttpCacheEntry | undefined,
  repositoryUrl?: string,
): Promise<FetchResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fetchOnce(url, cacheEntry, repositoryUrl);
    } catch (error) {
      lastError = error;
      if (attempt === MAX_RETRIES || !isTransient(error)) break;
      await sleep(2 ** attempt * 500);
    }
  }
  throw lastError instanceof Error ? lastError : new HttpFetchError(String(lastError));
}

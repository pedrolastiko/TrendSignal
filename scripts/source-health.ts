import type { SourceHealth } from './schemas.ts';

const WARNING_THRESHOLD = 1;
const ERROR_THRESHOLD = 3;
const MAX_ERROR_MESSAGE_LENGTH = 200;

export function classifyHealthStatus(
  enabled: boolean,
  consecutiveFailures: number,
): SourceHealth['status'] {
  if (!enabled) return 'disabled';
  if (consecutiveFailures >= ERROR_THRESHOLD) return 'error';
  if (consecutiveFailures >= WARNING_THRESHOLD) return 'warning';
  return 'healthy';
}

/** Strips stack traces, absolute file paths, and headers/tokens from an error before it can reach public health JSON. */
export function sanitizeErrorMessage(error: unknown): string {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const firstLine = rawMessage.split('\n')[0] ?? '';
  const withoutPaths = firstLine
    .replace(/\/[^\s]+/g, '[path]')
    .replace(/[A-Za-z]:\\[^\s]+/g, '[path]');
  const withoutAuth = withoutPaths.replace(/(authorization|token|bearer)\b.*/gi, '$1: [redacted]');
  return withoutAuth.slice(0, MAX_ERROR_MESSAGE_LENGTH);
}

export interface FetchAttempt {
  success: boolean;
  itemsFetched: number;
  newItems: number;
  responseTimeMs?: number;
  error?: unknown;
}

export function updateSourceHealth(
  sourceId: string,
  enabled: boolean,
  previous: SourceHealth | undefined,
  attempt: FetchAttempt,
  now: Date = new Date(),
): SourceHealth {
  const nowIso = now.toISOString();
  const consecutiveFailures = attempt.success ? 0 : (previous?.consecutiveFailures ?? 0) + 1;

  return {
    sourceId,
    status: classifyHealthStatus(enabled, consecutiveFailures),
    lastAttemptAt: nowIso,
    lastSuccessAt: attempt.success ? nowIso : previous?.lastSuccessAt,
    responseTimeMs: attempt.responseTimeMs,
    itemsFetched: attempt.itemsFetched,
    newItems: attempt.newItems,
    consecutiveFailures,
    lastError: attempt.success ? undefined : sanitizeErrorMessage(attempt.error),
  };
}

export function disabledSourceHealth(
  sourceId: string,
  previous: SourceHealth | undefined,
): SourceHealth {
  return {
    sourceId,
    status: 'disabled',
    lastAttemptAt: previous?.lastAttemptAt,
    lastSuccessAt: previous?.lastSuccessAt,
    itemsFetched: 0,
    newItems: 0,
    consecutiveFailures: previous?.consecutiveFailures ?? 0,
  };
}

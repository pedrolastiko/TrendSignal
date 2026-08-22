import { describe, expect, it } from 'vitest';
import {
  classifyHealthStatus,
  sanitizeErrorMessage,
  updateSourceHealth,
} from '../../../scripts/source-health.ts';

describe('classifyHealthStatus', () => {
  it('is disabled when the source is not enabled, regardless of failures', () => {
    expect(classifyHealthStatus(false, 0)).toBe('disabled');
    expect(classifyHealthStatus(false, 5)).toBe('disabled');
  });

  it('is healthy with zero consecutive failures', () => {
    expect(classifyHealthStatus(true, 0)).toBe('healthy');
  });

  it('transitions to warning then error as failures accumulate', () => {
    expect(classifyHealthStatus(true, 1)).toBe('warning');
    expect(classifyHealthStatus(true, 2)).toBe('warning');
    expect(classifyHealthStatus(true, 3)).toBe('error');
    expect(classifyHealthStatus(true, 10)).toBe('error');
  });
});

describe('sanitizeErrorMessage', () => {
  it('strips absolute file paths', () => {
    const message = sanitizeErrorMessage(
      new Error('ENOENT: /home/runner/work/repo/secrets.json not found'),
    );
    expect(message).not.toContain('/home/runner');
    expect(message).toContain('[path]');
  });

  it('strips only the first line of a stack trace', () => {
    const error = new Error('Request failed');
    error.stack = 'Error: Request failed\n    at fetch (/app/node_modules/x.js:1:1)';
    const message = sanitizeErrorMessage(error);
    expect(message).not.toContain('node_modules');
  });

  it('redacts authorization/token-looking content', () => {
    const message = sanitizeErrorMessage(new Error('failed with authorization: Bearer abc123'));
    expect(message).not.toContain('abc123');
  });

  it('truncates very long messages', () => {
    const message = sanitizeErrorMessage(new Error('x'.repeat(500)));
    expect(message.length).toBeLessThanOrEqual(200);
  });
});

describe('updateSourceHealth', () => {
  const now = new Date('2026-08-22T12:00:00.000Z');

  it('resets consecutiveFailures to 0 on success', () => {
    const previous = {
      sourceId: 's1',
      status: 'error' as const,
      itemsFetched: 0,
      newItems: 0,
      consecutiveFailures: 4,
    };
    const result = updateSourceHealth(
      's1',
      true,
      previous,
      { success: true, itemsFetched: 5, newItems: 2 },
      now,
    );
    expect(result.consecutiveFailures).toBe(0);
    expect(result.status).toBe('healthy');
    expect(result.lastSuccessAt).toBe(now.toISOString());
  });

  it('increments consecutiveFailures on failure and preserves lastSuccessAt', () => {
    const previous = {
      sourceId: 's1',
      status: 'healthy' as const,
      itemsFetched: 5,
      newItems: 1,
      consecutiveFailures: 0,
      lastSuccessAt: '2026-08-20T00:00:00.000Z',
    };
    const result = updateSourceHealth(
      's1',
      true,
      previous,
      { success: false, itemsFetched: 0, newItems: 0, error: new Error('timeout') },
      now,
    );
    expect(result.consecutiveFailures).toBe(1);
    expect(result.lastSuccessAt).toBe('2026-08-20T00:00:00.000Z');
    expect(result.lastError).toBeDefined();
  });
});

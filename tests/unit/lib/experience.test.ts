import { beforeEach, describe, expect, it } from 'vitest';
import { formatMessage } from '../../../src/lib/format';
import { UPCOMING_TOLERANCE_MS, isUpcoming } from '../../../src/lib/upcoming';
import { isTypingTarget, nextCardIndex } from '../../../src/lib/shortcuts';
import { applyTheme, readStoredThemePreference, resolveTheme } from '../../../src/lib/theme';
import { isNewArticle, parseLastSeen } from '../../../src/lib/whatsNew';

describe('theme helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system when nothing is stored', () => {
    expect(readStoredThemePreference()).toBe('system');
  });

  it('reads a stored preference', () => {
    window.localStorage.setItem('trendsignal:v1:theme', JSON.stringify('dark'));
    expect(readStoredThemePreference()).toBe('dark');
  });

  it.each(['{broken', JSON.stringify('purple'), JSON.stringify(42)])(
    'falls back to system for the corrupted value %s',
    (raw) => {
      window.localStorage.setItem('trendsignal:v1:theme', raw);
      expect(readStoredThemePreference()).toBe('system');
    },
  );

  it('resolves explicit preferences without consulting the system', () => {
    expect(resolveTheme('dark')).toBe('dark');
    expect(resolveTheme('light')).toBe('light');
  });

  it('applies the resolved theme to the document root', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('keyboard shortcut helpers', () => {
  it('moves through cards and clamps at both ends', () => {
    expect(nextCardIndex(-1, 5, 1)).toBe(0);
    expect(nextCardIndex(-1, 5, -1)).toBe(0);
    expect(nextCardIndex(2, 5, 1)).toBe(3);
    expect(nextCardIndex(2, 5, -1)).toBe(1);
    expect(nextCardIndex(4, 5, 1)).toBe(4);
    expect(nextCardIndex(0, 5, -1)).toBe(0);
    expect(nextCardIndex(0, 0, 1)).toBe(-1);
  });

  it('treats form controls and editable regions as typing targets', () => {
    expect(isTypingTarget(document.createElement('input'))).toBe(true);
    expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    expect(isTypingTarget(document.createElement('button'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('what is new helpers', () => {
  const lastSeen = Date.parse('2026-11-01T00:00:00.000Z');

  it('parses only valid timestamps', () => {
    expect(parseLastSeen('2026-11-01T00:00:00.000Z')).toBe(lastSeen);
    expect(parseLastSeen('not a date')).toBeNull();
    expect(parseLastSeen(null)).toBeNull();
    expect(parseLastSeen(123)).toBeNull();
  });

  it('flags only articles discovered after the last visit', () => {
    expect(isNewArticle({ discoveredAt: '2026-11-02T00:00:00.000Z' }, lastSeen)).toBe(true);
    expect(isNewArticle({ discoveredAt: '2026-10-31T00:00:00.000Z' }, lastSeen)).toBe(false);
    expect(isNewArticle({ discoveredAt: '2026-11-01T00:00:00.000Z' }, lastSeen)).toBe(false);
  });

  it('never flags anything on a first visit or with an unparseable date', () => {
    expect(isNewArticle({ discoveredAt: '2026-11-02T00:00:00.000Z' }, null)).toBe(false);
    expect(isNewArticle({ discoveredAt: 'garbage' }, lastSeen)).toBe(false);
  });
});

describe('formatMessage', () => {
  it('fills placeholders and leaves unknown ones untouched', () => {
    expect(formatMessage('{count} new since {date}', { count: 3, date: 'Nov 1' })).toBe(
      '3 new since Nov 1',
    );
    expect(formatMessage('{missing} stays', {})).toBe('{missing} stays');
  });
});

describe('isUpcoming', () => {
  const now = Date.parse('2026-11-07T12:00:00.000Z');

  it('flags dates clearly in the future', () => {
    expect(isUpcoming('2026-12-03T09:00:00.000Z', now)).toBe(true);
    expect(isUpcoming(new Date(now + UPCOMING_TOLERANCE_MS + 1000).toISOString(), now)).toBe(true);
  });

  it('does not flag past dates, or clock drift within the tolerance', () => {
    expect(isUpcoming('2026-11-01T00:00:00.000Z', now)).toBe(false);
    expect(isUpcoming(new Date(now).toISOString(), now)).toBe(false);
    expect(isUpcoming(new Date(now + UPCOMING_TOLERANCE_MS).toISOString(), now)).toBe(false);
  });

  it('ignores unparseable dates', () => {
    expect(isUpcoming('garbage', now)).toBe(false);
  });
});

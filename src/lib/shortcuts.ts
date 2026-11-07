export const CARD_SELECTOR = '[data-article-card]';
export const SEARCH_INPUT_ID = 'dashboard-search';
/** How long the `g` prefix of a "go to" chord stays armed. */
export const CHORD_TIMEOUT_MS = 1500;

export const GO_TO_ROUTES: Record<string, string> = {
  d: '/',
  t: '/trends',
  e: '/events',
  k: '/keywords',
  s: '/sources',
};

/** Single-key shortcuts must never fire while the user is typing or choosing in a control. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Index of the card to focus when moving `direction` from `current` (-1 = none focused). */
export function nextCardIndex(current: number, count: number, direction: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return 0;
  return Math.min(count - 1, Math.max(0, current + direction));
}

/** Waits for an element that a route change has yet to render (data may still be loading). */
export function focusWhenAvailable(id: string, attempts = 40, intervalMs = 50): void {
  const tryFocus = (remaining: number) => {
    const el = document.getElementById(id);
    if (el) {
      el.focus();
      return;
    }
    if (remaining > 0) window.setTimeout(() => tryFocus(remaining - 1), intervalMs);
  };
  tryFocus(attempts);
}

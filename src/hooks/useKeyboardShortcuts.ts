import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CARD_SELECTOR,
  CHORD_TIMEOUT_MS,
  GO_TO_ROUTES,
  SEARCH_INPUT_ID,
  focusWhenAvailable,
  isTypingTarget,
  nextCardIndex,
} from '../lib/shortcuts';

interface Options {
  enabled: boolean;
  onHelp: () => void;
}

function moveCardFocus(direction: 1 | -1): void {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(CARD_SELECTOR));
  const active = document.activeElement;
  const current = cards.findIndex((card) => card === active || card.contains(active));
  const index = nextCardIndex(current, cards.length, direction);
  cards[index]?.focus();
}

/**
 * Global single-key shortcuts. Disabled while typing in a field and when the user turns
 * them off (WCAG 2.1.4 requires single-character shortcuts to be switchable).
 */
export function useKeyboardShortcuts({ enabled, onHelp }: Options): void {
  const navigate = useNavigate();
  const chordArmedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;

      const armed =
        chordArmedAt.current !== null && Date.now() - chordArmedAt.current <= CHORD_TIMEOUT_MS;
      chordArmedAt.current = null;

      if (armed && event.key in GO_TO_ROUTES) {
        event.preventDefault();
        navigate(GO_TO_ROUTES[event.key] as string);
        return;
      }

      switch (event.key) {
        case 'g':
          chordArmedAt.current = Date.now();
          break;
        case '/':
          event.preventDefault();
          if (document.getElementById(SEARCH_INPUT_ID)) {
            document.getElementById(SEARCH_INPUT_ID)?.focus();
          } else {
            navigate('/');
            focusWhenAvailable(SEARCH_INPUT_ID);
          }
          break;
        case 'j':
          moveCardFocus(1);
          break;
        case 'k':
          moveCardFocus(-1);
          break;
        case 'o': {
          const card = document.activeElement?.closest(CARD_SELECTOR);
          // `click()` keeps the link's own target and rel attributes in force.
          card?.querySelector<HTMLAnchorElement>('a[data-article-link]')?.click();
          break;
        }
        case '?':
          event.preventDefault();
          onHelp();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, navigate, onHelp]);
}

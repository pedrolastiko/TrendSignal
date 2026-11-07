import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])';

export function ShortcutsDialog({
  open,
  onClose,
  shortcutsEnabled,
  onShortcutsEnabledChange,
}: {
  open: boolean;
  onClose: () => void;
  shortcutsEnabled: boolean;
  onShortcutsEnabledChange: (enabled: boolean) => void;
}) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog, and hand it back to whatever opened it on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();
    return () => {
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [open]);

  if (!open) return null;

  const rows: { keys: string[]; label: string }[] = [
    { keys: ['/'], label: t.shortcuts.focusSearch },
    { keys: ['j'], label: t.shortcuts.nextArticle },
    { keys: ['k'], label: t.shortcuts.previousArticle },
    { keys: ['o'], label: t.shortcuts.openArticle },
    { keys: ['g', 'd'], label: t.shortcuts.goDashboard },
    { keys: ['g', 't'], label: t.shortcuts.goTrends },
    { keys: ['g', 'k'], label: t.shortcuts.goKeywords },
    { keys: ['g', 's'], label: t.shortcuts.goSources },
    { keys: ['?'], label: t.shortcuts.help },
  ];

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    // Keep Tab inside the modal.
    const focusable = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        onKeyDown={onKeyDown}
        className="relative w-full max-w-md rounded-card border border-border bg-card p-5 shadow-xl"
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 id="shortcuts-title" className="text-lg font-semibold text-ink">
            {t.shortcuts.title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t.common.close}
            className="rounded-control border border-border p-1.5 text-ink hover:bg-surface"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <p className="mb-4 text-sm text-muted">{t.shortcuts.description}</p>

        <ul className="mb-4 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-ink">{row.label}</span>
              <span className="flex shrink-0 items-center gap-1 text-muted">
                {row.keys.map((key, index) => (
                  <span key={`${key}-${index}`} className="flex items-center gap-1">
                    {index > 0 && <span className="text-xs">{t.shortcuts.then}</span>}
                    <kbd className="rounded border border-border bg-surface px-1.5 py-0.5 font-mono text-xs text-ink">
                      {key}
                    </kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <label className="flex items-start gap-3 rounded-control border border-border p-3 text-sm">
          <input
            type="checkbox"
            checked={shortcutsEnabled}
            onChange={(e) => onShortcutsEnabledChange(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="block font-medium text-ink">{t.shortcuts.enabled}</span>
            <span className="block text-xs text-muted">{t.shortcuts.enabledHint}</span>
          </span>
        </label>
      </div>
    </div>
  );
}

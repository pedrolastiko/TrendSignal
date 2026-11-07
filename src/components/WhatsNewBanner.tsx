import { Sparkles } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { formatArticleDate, formatMessage } from '../lib/format';

export function WhatsNewBanner({
  count,
  lastSeenAt,
  onlyNew,
  onToggleOnlyNew,
  onMarkSeen,
}: {
  count: number;
  lastSeenAt: number;
  onlyNew: boolean;
  onToggleOnlyNew: () => void;
  onMarkSeen: () => void;
}) {
  const { t, locale } = useI18n();
  const plural = new Intl.PluralRules(locale).select(count) === 'one';
  const message = formatMessage(plural ? t.whatsNew.summaryOne : t.whatsNew.summaryOther, {
    count,
    date: formatArticleDate(new Date(lastSeenAt).toISOString(), locale),
  });

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-card px-4 py-3"
    >
      <p className="flex items-center gap-2 text-sm text-ink">
        <Sparkles size={16} className="text-primary" aria-hidden="true" />
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-pressed={onlyNew}
          onClick={onToggleOnlyNew}
          className={`rounded-control border px-3 py-1.5 text-sm font-medium ${
            onlyNew
              ? 'border-primary bg-primary text-on-primary'
              : 'border-border text-ink hover:bg-surface'
          }`}
        >
          {onlyNew ? t.whatsNew.showAll : t.whatsNew.showNew}
        </button>
        <button
          type="button"
          onClick={onMarkSeen}
          className="rounded-control border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
        >
          {t.whatsNew.markSeen}
        </button>
      </div>
    </div>
  );
}

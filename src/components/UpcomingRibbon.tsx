import { CalendarClock } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { formatArticleDate } from '../lib/format';

/**
 * Marks an item whose date is still ahead (an event, webinar, release…). The icon and the
 * word carry the meaning, so it does not rely on colour.
 * `ribbon` is a flag pinned to a card's image; `inline` is a pill for dense rows.
 */
export function UpcomingRibbon({
  publishedAt,
  variant,
}: {
  publishedAt: string;
  variant: 'ribbon' | 'inline';
}) {
  const { t, locale } = useI18n();
  const content = (
    <>
      <CalendarClock size={14} aria-hidden="true" />
      <span>{t.article.upcoming}</span>
      <span aria-hidden="true">·</span>
      <span>{formatArticleDate(publishedAt, locale)}</span>
    </>
  );

  if (variant === 'inline') {
    return (
      <span
        data-upcoming
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary"
      >
        {content}
      </span>
    );
  }

  return (
    <span
      data-upcoming
      className="absolute left-0 top-3 z-10 inline-flex items-center gap-1.5 rounded-r-control bg-primary px-3 py-1.5 text-xs font-semibold text-on-primary shadow-md"
    >
      {content}
    </span>
  );
}

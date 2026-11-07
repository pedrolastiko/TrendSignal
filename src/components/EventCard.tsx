import { CalendarPlus, ExternalLink, MapPin } from 'lucide-react';
import type { EventItem, KeywordPublic } from '../types';
import { useI18n } from '../hooks/useI18n';
import { CATEGORY_LABELS } from '../data/categories';
import { formatEventWhen } from '../lib/events';
import { downloadEventIcs } from '../lib/ics';

/** Words carry the type and the format, so the badges never rely on colour alone. */
export function EventBadges({ event }: { event: EventItem }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">
        {t.events.kind[event.kind]}
      </span>
      <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-ink">
        {t.events.format[event.format]}
      </span>
    </div>
  );
}

export function EventCard({
  event,
  keywordsById,
}: {
  event: EventItem;
  keywordsById: Map<string, KeywordPublic>;
}) {
  const { t, locale } = useI18n();
  const keywords = event.matchedKeywordIds.flatMap((id) => {
    const keyword = keywordsById.get(id);
    return keyword ? [{ id, label: keyword.labels[locale] }] : [];
  });

  return (
    // The data attributes let the `j`/`k`/`o` keyboard shortcuts work on events too.
    <article
      data-article-card
      data-event-card
      tabIndex={-1}
      className="flex scroll-mt-20 flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <EventBadges event={event} />
        <span className="text-xs text-muted">{CATEGORY_LABELS[event.sourceCategory][locale]}</span>
      </div>

      <h3 className="text-base font-semibold leading-snug text-ink">{event.title}</h3>

      <p className="text-sm font-medium text-ink">{formatEventWhen(event, locale)}</p>

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <span className="font-medium text-ink">{event.company}</span>
        {event.location && (
          <>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1">
              <MapPin size={12} aria-hidden="true" />
              {event.location}
            </span>
          </>
        )}
      </p>

      {keywords.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t.article.matchedKeywords}>
          {keywords.map((keyword) => (
            <li
              key={keyword.id}
              className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
            >
              {keyword.label}
            </li>
          ))}
        </ul>
      )}

      {event.summary && <p className="line-clamp-3 text-sm text-muted">{event.summary}</p>}

      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <a
          href={event.url}
          target="_blank"
          rel="noopener noreferrer"
          data-article-link
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-control border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-on-primary"
        >
          {t.events.viewEvent}
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">({t.common.externalLink})</span>
        </a>
        <button
          type="button"
          onClick={() => downloadEventIcs(event)}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-medium text-ink hover:bg-surface"
        >
          <CalendarPlus size={14} aria-hidden="true" />
          {t.events.addToCalendar}
        </button>
      </div>
    </article>
  );
}

import { Link } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { EventBadges } from './EventCard';
import { filterEvents, DEFAULT_EVENT_FILTERS, formatEventWhen } from '../lib/events';
import type { EventItem } from '../types';

const WIDGET_SIZE = 3;

/** The next few events, preferring those that match a tracked keyword. */
export function UpcomingEvents({ events }: { events: EventItem[] }) {
  const { t, locale } = useI18n();
  const upcoming = filterEvents(events, DEFAULT_EVENT_FILTERS);
  const onTopic = upcoming.filter((e) => e.matchedKeywordIds.length > 0);
  const shown = (onTopic.length >= WIDGET_SIZE ? onTopic : upcoming).slice(0, WIDGET_SIZE);
  if (shown.length === 0) return null;

  return (
    <section
      className="mb-6 rounded-card border border-border bg-card p-4"
      aria-labelledby="upcoming-events-title"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2
          id="upcoming-events-title"
          className="flex items-center gap-2 text-sm font-semibold text-ink"
        >
          <CalendarDays size={16} aria-hidden="true" />
          {t.events.widget.title}
        </h2>
        <Link
          to="/events"
          className="text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {t.events.widget.viewAll}
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {shown.map((event) => (
          <li
            key={event.id}
            className="flex flex-col gap-1.5 rounded-control border border-border p-3"
          >
            <EventBadges event={event} />
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold leading-snug text-ink hover:underline"
            >
              {event.title}
              <span className="sr-only"> ({t.common.externalLink})</span>
            </a>
            <p className="text-xs text-muted">{formatEventWhen(event, locale)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

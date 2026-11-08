import { useMemo, useState } from 'react';
import { useI18n } from '../hooks/useI18n';
import { useTrendSignalData, isStale } from '../hooks/useTrendSignalData';
import { EventCard } from '../components/EventCard';
import { LoadingState, ErrorState, EmptyState, StaleBanner } from '../components/States';
import { HealthBadge } from '../components/StatusBadge';
import {
  DEFAULT_EVENT_FILTERS,
  filterEvents,
  formatDayHeading,
  groupEventsByDay,
  type EventFilters,
  type EventPeriod,
} from '../lib/events';
import { formatMessage } from '../lib/format';
import type { EventFormat, EventSourceStatus } from '../types';

function chipClass(active: boolean): string {
  return `rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active ? 'border-primary bg-primary text-on-primary' : 'border-border text-ink hover:bg-surface'
  }`;
}

const FORMATS: EventFormat[] = ['online', 'in-person', 'hybrid'];
const PERIODS: EventPeriod[] = ['all', '7d', '30d', '90d'];

export function EventsPage() {
  const { t, locale } = useI18n();
  const { state, reload } = useTrendSignalData();
  const [filters, setFilters] = useState<EventFilters>(DEFAULT_EVENT_FILTERS);
  const update = (patch: Partial<EventFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const events = state.status === 'ready' ? state.data.events : null;
  const visible = useMemo(
    () => (events ? filterEvents(events.events, filters) : []),
    [events, filters],
  );

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;

  const { data } = state;
  const keywordsById = new Map(data.keywords.map((k) => [k.id, k]));
  const groups = groupEventsByDay(visible);
  const plural = new Intl.PluralRules(locale).select(visible.length) === 'one';
  const count = formatMessage(plural ? t.events.countOne : t.events.countOther, {
    count: visible.length,
  });

  const keywordOptions = events
    ? Array.from(new Set(events.events.flatMap((e) => e.matchedKeywordIds)))
        .flatMap((id) => {
          const keyword = keywordsById.get(id);
          return keyword ? [{ value: id, label: keyword.labels[locale] }] : [];
        })
        .sort((a, b) => a.label.localeCompare(b.label))
    : [];
  const sourceOptions = (events?.sources ?? [])
    .filter((s) => s.enabled)
    .map((s) => ({ value: s.id, label: s.name }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">{t.events.title}</h1>
        <p className="text-sm text-muted">{t.events.subtitle}</p>
      </div>

      {events === null ? (
        <EmptyState
          message={
            data.eventsError
              ? `${t.events.states.loadFailed} (${data.eventsError})`
              : t.events.states.unavailable
          }
        />
      ) : (
        <>
          {isStale(events.generatedAt) && <StaleBanner />}

          <div className="mb-6 flex flex-col gap-4 rounded-card border border-border bg-card p-4">
            <div>
              <p id="events-kind-label" className="mb-2 text-xs font-medium text-muted">
                {t.events.filters.kind}
              </p>
              <div
                role="group"
                aria-labelledby="events-kind-label"
                className="flex flex-wrap gap-2"
              >
                {(
                  [
                    ['all', t.events.filters.kindAll],
                    ['webinar', t.events.filters.kindWebinar],
                    ['conference', t.events.filters.kindConference],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={filters.kind === value}
                    onClick={() => update({ kind: value })}
                    className={chipClass(filters.kind === value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <EventSelect
                id="events-filter-format"
                label={t.events.filters.format}
                value={filters.format}
                onChange={(v) => update({ format: v as EventFilters['format'] })}
                options={[
                  { value: 'all', label: t.events.filters.formatAll },
                  ...FORMATS.map((f) => ({ value: f, label: t.events.format[f] })),
                ]}
              />
              <EventSelect
                id="events-filter-keyword"
                label={t.dashboard.filters.keyword}
                value={filters.keywordId}
                onChange={(v) => update({ keywordId: v })}
                options={[{ value: 'all', label: t.dashboard.filters.all }, ...keywordOptions]}
              />
              <EventSelect
                id="events-filter-source"
                label={t.dashboard.filters.source}
                value={filters.sourceId}
                onChange={(v) => update({ sourceId: v })}
                options={[{ value: 'all', label: t.dashboard.filters.all }, ...sourceOptions]}
              />
              <EventSelect
                id="events-filter-date-status"
                label={t.events.filters.dateStatus}
                value={filters.dateStatus}
                onChange={(v) => update({ dateStatus: v as EventFilters['dateStatus'] })}
                options={[
                  { value: 'all', label: t.events.filters.dateStatusAll },
                  { value: 'confirmed', label: t.events.filters.dateStatusConfirmed },
                ]}
              />
              <EventSelect
                id="events-filter-period"
                label={t.events.filters.period}
                value={filters.period}
                onChange={(v) => update({ period: v as EventPeriod })}
                options={PERIODS.map((p) => ({
                  value: p,
                  label:
                    p === 'all'
                      ? t.events.filters.periodAll
                      : t.events.filters[`period${p}` as 'period7d' | 'period30d' | 'period90d'],
                }))}
              />
            </div>
          </div>

          <p className="mb-4 text-sm text-muted" role="status">
            {count}
          </p>

          {groups.length === 0 ? (
            <EmptyState message={t.events.states.empty} />
          ) : (
            <div className="flex flex-col gap-8">
              {groups.map((group) => (
                <section key={group.dayKey} aria-labelledby={`day-${group.dayKey}`}>
                  <h2 id={`day-${group.dayKey}`} className="mb-3 text-sm font-semibold text-ink">
                    {formatDayHeading(group.dayKey, locale)}
                  </h2>
                  <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                    {group.events.map((event) => (
                      <EventCard key={event.id} event={event} keywordsById={keywordsById} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          <EventSources sources={events.sources} />
        </>
      )}
    </div>
  );
}

function EventSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-muted">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-border px-3 py-2 text-sm text-ink"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function EventSources({ sources }: { sources: EventSourceStatus[] }) {
  const { t, locale } = useI18n();
  if (sources.length === 0) return null;
  const format = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <details className="mt-10 rounded-card border border-border bg-card p-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">
        {t.events.sources.title} ({sources.length})
      </summary>
      <ul className="mt-3 flex flex-col gap-2">
        {sources.map((source) => (
          <li
            key={source.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm text-ink"
          >
            {source.homepageUrl ? (
              <a
                href={source.homepageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline-offset-2 hover:underline"
              >
                {source.name}
                <span className="sr-only"> ({t.common.externalLink})</span>
              </a>
            ) : (
              <span className="font-medium text-ink">{source.name}</span>
            )}
            <span className="flex flex-wrap items-center gap-3 text-xs text-muted">
              <span>
                {source.health.itemsFetched} {t.events.sources.events}
              </span>
              {source.health.lastSuccessAt && (
                <span>
                  {t.events.sources.lastSuccess}:{' '}
                  {format.format(new Date(source.health.lastSuccessAt))}
                </span>
              )}
              <HealthBadge status={source.health.status} />
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

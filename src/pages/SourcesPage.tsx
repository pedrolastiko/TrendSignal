import { Plus } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useTrendSignalData } from '../hooks/useTrendSignalData';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { HealthBadge } from '../components/StatusBadge';
import { CATEGORY_LABELS } from '../data/categories';
import { buildIssueUrl } from '../lib/issueUrl';

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
  }).format(date);
}

export function SourcesPage() {
  const { t, locale } = useI18n();
  const { state, reload } = useTrendSignalData();
  const [hiddenIds, setHiddenIds, resetHidden] = useLocalStorage<string[]>('hidden-sources', []);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;

  const { data } = state;
  const healthById = new Map(data.sourceHealth.map((h) => [h.sourceId, h]));
  const addSourceUrl = buildIssueUrl('add-source.yml');

  const toggleHidden = (id: string) => {
    setHiddenIds(hiddenIds.includes(id) ? hiddenIds.filter((h) => h !== id) : [...hiddenIds, id]);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t.sources.title}</h1>
          <p className="text-sm text-muted">{t.sources.subtitle}</p>
        </div>
        <a
          href={addSourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus size={16} aria-hidden="true" />
          {t.sources.add}
        </a>
      </div>

      {hiddenIds.length > 0 && (
        <button
          type="button"
          onClick={resetHidden}
          className="mb-4 text-sm font-medium text-primary underline-offset-2 hover:underline"
        >
          {t.common.reset} ({hiddenIds.length})
        </button>
      )}

      {data.sources.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-white">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t.sources.company}</th>
                <th className="px-4 py-3">{t.sources.category}</th>
                <th className="px-4 py-3">{t.sources.homepage}</th>
                <th className="px-4 py-3">{t.sources.collectionMethod}</th>
                <th className="px-4 py-3">{t.sources.lastAttempt}</th>
                <th className="px-4 py-3">{t.sources.lastSuccess}</th>
                <th className="px-4 py-3">{t.sources.itemCount}</th>
                <th className="px-4 py-3">{t.sources.consecutiveFailures}</th>
                <th className="px-4 py-3">{t.sources.health}</th>
                <th className="px-4 py-3 text-right">{t.sources.hideLocally}</th>
              </tr>
            </thead>
            <tbody>
              {data.sources.map((source) => {
                const health = healthById.get(source.id);
                const hidden = hiddenIds.includes(source.id);
                return (
                  <tr
                    key={source.id}
                    className={`border-b border-border last:border-0 ${hidden ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink">{source.name}</p>
                      <p className="text-xs text-muted">{source.company}</p>
                    </td>
                    <td className="px-4 py-3">{CATEGORY_LABELS[source.category][locale]}</td>
                    <td className="px-4 py-3">
                      <a
                        href={source.homepageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary underline-offset-2 hover:underline"
                      >
                        {new URL(source.homepageUrl).hostname}
                      </a>
                    </td>
                    <td className="px-4 py-3 uppercase text-xs text-muted">
                      {source.collectionMode}
                    </td>
                    <td className="px-4 py-3">{formatDate(health?.lastAttemptAt, locale)}</td>
                    <td className="px-4 py-3">{formatDate(health?.lastSuccessAt, locale)}</td>
                    <td className="px-4 py-3">{health?.itemsFetched ?? 0}</td>
                    <td className="px-4 py-3">{health?.consecutiveFailures ?? 0}</td>
                    <td className="px-4 py-3">
                      <HealthBadge
                        status={health?.status ?? (source.enabled ? 'warning' : 'disabled')}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleHidden(source.id)}
                        aria-pressed={hidden}
                        className="rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface"
                      >
                        {hidden ? t.sources.showLocally : t.sources.hideLocally}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

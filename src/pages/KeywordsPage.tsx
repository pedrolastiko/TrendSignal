import { Plus } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useTrendSignalData } from '../hooks/useTrendSignalData';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { CATEGORY_LABELS } from '../data/categories';
import { buildIssueUrl } from '../lib/issueUrl';
import type { SourceCategory } from '../types';

function formatDate(iso: string | undefined, locale: string): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
  }).format(date);
}

export function KeywordsPage() {
  const { t, locale } = useI18n();
  const { state, reload } = useTrendSignalData();
  const [hiddenIds, setHiddenIds, resetHidden] = useLocalStorage<string[]>('hidden-keywords', []);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;

  const { data } = state;
  const statsById = new Map(data.statistics.keywordStats.map((s) => [s.id, s]));
  const addKeywordUrl = buildIssueUrl('add-keyword.yml');

  const toggleHidden = (id: string) => {
    setHiddenIds(hiddenIds.includes(id) ? hiddenIds.filter((h) => h !== id) : [...hiddenIds, id]);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t.keywords.title}</h1>
          <p className="text-sm text-muted">{t.keywords.subtitle}</p>
        </div>
        <a
          href={addKeywordUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <Plus size={16} aria-hidden="true" />
          {t.keywords.add}
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

      {data.keywords.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="overflow-x-auto rounded-card border border-border bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs font-medium uppercase text-muted">
              <tr>
                <th className="px-4 py-3">{t.keywords.labelFr}</th>
                <th className="px-4 py-3">{t.keywords.labelEn}</th>
                <th className="px-4 py-3">{t.keywords.category}</th>
                <th className="px-4 py-3">{t.keywords.synonyms}</th>
                <th className="px-4 py-3">{t.keywords.lastDetection}</th>
                <th className="px-4 py-3">{t.keywords.articleCount}</th>
                <th className="px-4 py-3">{t.keywords.enabled}</th>
                <th className="px-4 py-3 text-right">{t.keywords.hideLocally}</th>
              </tr>
            </thead>
            <tbody>
              {data.keywords.map((keyword) => {
                const stat = statsById.get(keyword.id);
                const hidden = hiddenIds.includes(keyword.id);
                return (
                  <tr
                    key={keyword.id}
                    className={`border-b border-border last:border-0 ${hidden ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 font-medium text-ink">{keyword.labels.fr}</td>
                    <td className="px-4 py-3 text-muted">{keyword.labels.en}</td>
                    <td className="px-4 py-3">
                      {CATEGORY_LABELS[keyword.category as SourceCategory]?.[locale] ??
                        keyword.category}
                    </td>
                    <td className="px-4 py-3">{keyword.synonymCount}</td>
                    <td className="px-4 py-3">{formatDate(stat?.lastDetectedAt, locale)}</td>
                    <td className="px-4 py-3">{stat?.articleCount ?? 0}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                          keyword.enabled
                            ? 'border-success/30 bg-success/10 text-success'
                            : 'border-border bg-surface text-muted'
                        }`}
                      >
                        {keyword.enabled ? t.keywords.enabled : t.keywords.disabled}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => toggleHidden(keyword.id)}
                        aria-pressed={hidden}
                        title={t.keywords.localPreferenceNote}
                        className="rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-surface"
                      >
                        {hidden ? t.keywords.showLocally : t.keywords.hideLocally}
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

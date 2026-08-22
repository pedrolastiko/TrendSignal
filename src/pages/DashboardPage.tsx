import { useMemo, useState, type ReactNode } from 'react';
import Fuse from 'fuse.js';
import { FileText, Tags, Rss, Clock, RefreshCw } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useTrendSignalData, isStale } from '../hooks/useTrendSignalData';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { KpiCard } from '../components/KpiCard';
import { ArticleCard } from '../components/ArticleCard';
import { LoadingState, ErrorState, EmptyState, StaleBanner } from '../components/States';
import { TrendStatusBadge } from '../components/StatusBadge';
import { CATEGORY_LABELS, SOURCE_CATEGORIES } from '../data/categories';
import type { Article, SourceCategory } from '../types';

type SortOption = 'newest' | 'relevance' | 'trend';
type DateOption = 'all' | '24h' | '7d' | '30d';

function withinDateRange(publishedAt: string, range: DateOption): boolean {
  if (range === 'all') return true;
  const hours = { '24h': 24, '7d': 24 * 7, '30d': 24 * 30 }[range];
  const published = new Date(publishedAt).getTime();
  if (Number.isNaN(published)) return false;
  return (Date.now() - published) / (1000 * 60 * 60) <= hours;
}

function formatDateTime(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function DashboardPage() {
  const { t, locale } = useI18n();
  const { state, reload } = useTrendSignalData();
  const [query, setQuery] = useState('');
  const [keywordFilter, setKeywordFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | SourceCategory>('all');
  const [dateFilter, setDateFilter] = useState<DateOption>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const debouncedQuery = useDebouncedValue(query, 250);

  const fuse = useMemo(() => {
    if (state.status !== 'ready') return null;
    return new Fuse(state.data.articles, {
      keys: ['title', 'summary', 'company', 'sourceName'],
      threshold: 0.3,
    });
  }, [state]);

  if (state.status === 'loading') {
    return (
      <PageShell reload={reload}>
        <LoadingState />
      </PageShell>
    );
  }

  if (state.status === 'error') {
    return (
      <PageShell reload={reload}>
        <ErrorState message={state.message} onRetry={reload} />
      </PageShell>
    );
  }

  const { data } = state;
  const keywordsById = new Map(data.keywords.map((k) => [k.id, k]));

  const searched =
    debouncedQuery.trim() && fuse ? fuse.search(debouncedQuery).map((r) => r.item) : data.articles;

  const filtered: Article[] = searched.filter((article) => {
    if (keywordFilter !== 'all' && !article.matchedKeywordIds.includes(keywordFilter)) return false;
    if (sourceFilter !== 'all' && article.sourceId !== sourceFilter) return false;
    if (categoryFilter !== 'all' && article.sourceCategory !== categoryFilter) return false;
    if (!withinDateRange(article.publishedAt, dateFilter)) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'relevance') return b.relevanceScore - a.relevanceScore;
    if (sortBy === 'trend') return (b.trendScore ?? 0) - (a.trendScore ?? 0);
    return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
  });

  const topTrends = [...data.trends]
    .filter((trend) => trend.timeframe === '24h')
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const stale = isStale(data.statistics.lastSuccessfulScanAt);

  return (
    <PageShell reload={reload}>
      {stale && <StaleBanner />}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label={t.dashboard.kpiArticles}
          value={String(data.statistics.articleCount)}
          icon={FileText}
        />
        <KpiCard
          label={t.dashboard.kpiKeywords}
          value={String(data.statistics.activeKeywordCount)}
          icon={Tags}
        />
        <KpiCard
          label={t.dashboard.kpiSources}
          value={String(data.statistics.activeSourceCount)}
          icon={Rss}
        />
        <KpiCard
          label={t.dashboard.kpiLastScan}
          value={formatDateTime(data.statistics.lastSuccessfulScanAt, locale)}
          icon={Clock}
        />
      </div>

      {topTrends.length > 0 && (
        <section
          className="mb-6 rounded-card border border-border bg-white p-4"
          aria-label={t.dashboard.topTrends}
        >
          <h2 className="mb-3 text-sm font-semibold text-ink">{t.dashboard.topTrends}</h2>
          <ul className="flex flex-wrap gap-2">
            {topTrends.map((trend) => (
              <li
                key={trend.id}
                className="flex items-center gap-2 rounded-control border border-border px-3 py-1.5"
              >
                <span className="text-sm font-medium text-ink">{trend.label}</span>
                <TrendStatusBadge status={trend.status} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-6 flex flex-col gap-3 rounded-card border border-border bg-white p-4">
        <label className="sr-only" htmlFor="dashboard-search">
          {t.dashboard.searchPlaceholder}
        </label>
        <input
          id="dashboard-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.dashboard.searchPlaceholder}
          className="w-full rounded-control border border-border px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-3">
          <FilterSelect
            id="filter-keyword"
            label={t.dashboard.filters.keyword}
            value={keywordFilter}
            onChange={setKeywordFilter}
            options={uniqueKeywordOptions(data.articles, keywordsById, locale)}
          />
          <FilterSelect
            id="filter-source"
            label={t.dashboard.filters.source}
            value={sourceFilter}
            onChange={setSourceFilter}
            options={data.sources.map((s) => ({ value: s.id, label: s.name }))}
          />
          <FilterSelect
            id="filter-category"
            label={t.dashboard.filters.category}
            value={categoryFilter}
            onChange={(v) => setCategoryFilter(v as 'all' | SourceCategory)}
            options={SOURCE_CATEGORIES.map((c) => ({
              value: c,
              label: CATEGORY_LABELS[c][locale],
            }))}
          />
          <FilterSelect
            id="filter-date"
            label={t.dashboard.filters.date}
            value={dateFilter}
            onChange={(v) => setDateFilter(v as DateOption)}
            options={[
              { value: '24h', label: t.trends.timeframe24h },
              { value: '7d', label: t.trends.timeframe7d },
              { value: '30d', label: t.trends.timeframe30d },
            ]}
          />
          <div className="flex flex-col gap-1 text-xs font-medium text-muted">
            <label htmlFor="filter-sort">{t.dashboard.filters.sortBy}</label>
            <select
              id="filter-sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="rounded-control border border-border px-3 py-2 text-sm text-ink"
            >
              <option value="newest">{t.dashboard.filters.sortNewest}</option>
              <option value="relevance">{t.dashboard.filters.sortRelevance}</option>
              <option value="trend">{t.dashboard.filters.sortTrend}</option>
            </select>
          </div>
        </div>
      </div>

      {sorted.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {sorted.map((article) => (
            <ArticleCard key={article.id} article={article} keywordsById={keywordsById} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function uniqueKeywordOptions(
  articles: Article[],
  keywordsById: Map<string, { labels: { fr: string; en: string } }>,
  locale: 'fr' | 'en',
): { value: string; label: string }[] {
  const ids = new Set<string>();
  articles.forEach((a) => a.matchedKeywordIds.forEach((id) => ids.add(id)));
  return Array.from(ids).map((id) => ({
    value: id,
    label: keywordsById.get(id)?.labels[locale] ?? id,
  }));
}

function FilterSelect({
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
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1 text-xs font-medium text-muted">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-control border border-border px-3 py-2 text-sm text-ink"
      >
        <option value="all">{t.dashboard.filters.all}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function PageShell({ children, reload }: { children: ReactNode; reload: () => void }) {
  const { t } = useI18n();
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{t.dashboard.title}</h1>
          <p className="text-sm text-muted">{t.dashboard.subtitle}</p>
        </div>
        <button
          type="button"
          onClick={reload}
          title={t.dashboard.refreshHint}
          className="inline-flex items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        >
          <RefreshCw size={16} aria-hidden="true" />
          {t.dashboard.refresh}
        </button>
      </div>
      {children}
    </div>
  );
}

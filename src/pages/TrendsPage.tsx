import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowDownRight, ArrowUpRight, Minus, Users } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useTrendSignalData } from '../hooks/useTrendSignalData';
import { LoadingState, ErrorState, EmptyState } from '../components/States';
import { TrendStatusBadge } from '../components/StatusBadge';
import { CATEGORY_LABELS, SOURCE_CATEGORIES } from '../data/categories';
import type { SourceCategory, Trend, TrendTimeframe } from '../types';

function GrowthIndicator({ growthRate }: { growthRate: number | null }) {
  if (growthRate === null) {
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Minus size={14} aria-hidden="true" /> —
      </span>
    );
  }
  const positive = growthRate > 0;
  const flat = growthRate === 0;
  const Icon = flat ? Minus : positive ? ArrowUpRight : ArrowDownRight;
  const color = flat ? 'text-muted' : positive ? 'text-success' : 'text-danger';
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${color}`}>
      <Icon size={14} aria-hidden="true" />
      {positive ? '+' : ''}
      {growthRate}%
    </span>
  );
}

export function TrendsPage() {
  const { t, locale } = useI18n();
  const { state, reload } = useTrendSignalData();
  const [timeframe, setTimeframe] = useState<TrendTimeframe>('24h');
  const [category, setCategory] = useState<'all' | string>('all');
  const [sourceCategory, setSourceCategory] = useState<'all' | SourceCategory>('all');

  const chartData = useMemo(() => {
    if (state.status !== 'ready') return [];
    return state.data.trends
      .filter((trend) => trend.timeframe === timeframe)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((trend) => ({ label: trend.label, score: trend.score }));
  }, [state, timeframe]);

  if (state.status === 'loading') return <LoadingState />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={reload} />;

  const { data } = state;
  const sourcesById = new Map(data.sources.map((s) => [s.id, s]));
  const articlesById = new Map(data.articles.map((a) => [a.id, a]));

  const filtered: Trend[] = data.trends.filter((trend) => {
    if (trend.timeframe !== timeframe) return false;
    if (category !== 'all' && trend.keywordId !== category) return false;
    if (sourceCategory !== 'all') {
      const hasSourceInCategory = trend.leadingSourceIds.some(
        (id) => sourcesById.get(id)?.category === sourceCategory,
      );
      if (!hasSourceInCategory) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">{t.trends.title}</h1>
        <p className="text-sm text-muted">{t.trends.subtitle}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-3 rounded-card border border-border bg-white p-4">
        <div className="flex gap-1" role="group" aria-label={t.dashboard.filters.date}>
          {(['24h', '7d', '30d'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeframe(tf)}
              aria-pressed={timeframe === tf}
              className={`rounded-control border px-3 py-2 text-sm font-medium ${
                timeframe === tf
                  ? 'border-primary bg-primary text-white'
                  : 'border-border text-ink hover:bg-surface'
              }`}
            >
              {t.trends[`timeframe${tf}` as const]}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted">
          <label htmlFor="trends-filter-keyword">{t.dashboard.filters.keyword}</label>
          <select
            id="trends-filter-keyword"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-control border border-border px-3 py-2 text-sm text-ink"
          >
            <option value="all">{t.dashboard.filters.all}</option>
            {data.keywords.map((k) => (
              <option key={k.id} value={k.id}>
                {k.labels[locale]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1 text-xs font-medium text-muted">
          <label htmlFor="trends-filter-category">{t.dashboard.filters.category}</label>
          <select
            id="trends-filter-category"
            value={sourceCategory}
            onChange={(e) => setSourceCategory(e.target.value as 'all' | SourceCategory)}
            className="rounded-control border border-border px-3 py-2 text-sm text-ink"
          >
            <option value="all">{t.dashboard.filters.all}</option>
            {SOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c][locale]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="mb-6 h-64 rounded-card border border-border bg-white p-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis type="number" domain={[0, 100]} stroke="#6B7280" fontSize={12} />
              <YAxis type="category" dataKey="label" width={140} stroke="#6B7280" fontSize={12} />
              <Tooltip />
              <Bar dataKey="score" fill="#0F172A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filtered.map((trend) => (
            <article key={trend.id} className="rounded-card border border-border bg-white p-4">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="text-base font-semibold text-ink">{trend.label}</h2>
                <TrendStatusBadge status={trend.status} />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-xs text-muted">{t.trends.score}</dt>
                  <dd className="font-semibold text-ink">{trend.score}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t.trends.volume}</dt>
                  <dd className="font-semibold text-ink">{trend.articleCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t.trends.growth}</dt>
                  <dd>
                    <GrowthIndicator growthRate={trend.growthRate} />
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">{t.trends.sourceCount}</dt>
                  <dd className="inline-flex items-center gap-1 font-semibold text-ink">
                    <Users size={14} aria-hidden="true" />
                    {trend.distinctSourceCount}
                  </dd>
                </div>
              </dl>

              {trend.leadingSourceIds.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted">{t.trends.leadingSources}</p>
                  <ul className="mt-1 flex flex-wrap gap-1.5">
                    {trend.leadingSourceIds.map((id) => (
                      <li
                        key={id}
                        className="rounded-full border border-border px-2 py-0.5 text-xs text-ink"
                      >
                        {sourcesById.get(id)?.name ?? id}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {trend.relatedArticleIds.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-muted">{t.trends.relatedArticles}</p>
                  <ul className="mt-1 flex flex-col gap-1">
                    {trend.relatedArticleIds.slice(0, 3).map((id) => {
                      const article = articlesById.get(id);
                      if (!article) return null;
                      return (
                        <li key={id}>
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary underline-offset-2 hover:underline"
                          >
                            {article.title}
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

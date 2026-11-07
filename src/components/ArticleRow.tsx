import { ExternalLink } from 'lucide-react';
import type { Article, KeywordPublic } from '../types';
import { useI18n } from '../hooks/useI18n';
import { CATEGORY_LABELS } from '../data/categories';
import { formatArticleDate } from '../lib/format';
import { NewBadge } from './ArticleCard';

/** Dense one-entry-per-row alternative to `ArticleCard`: no image or excerpt, title is the link. */
export function ArticleRow({
  article,
  keywordsById,
  isNew = false,
}: {
  article: Article;
  keywordsById: Map<string, KeywordPublic>;
  isNew?: boolean;
}) {
  const { t, locale } = useI18n();
  const keywords = article.matchedKeywordIds.flatMap((id) => {
    const keyword = keywordsById.get(id);
    return keyword ? [{ id, label: keyword.labels[locale] }] : [];
  });

  return (
    <article
      data-article-card
      tabIndex={-1}
      className="flex scroll-mt-20 flex-col gap-1.5 px-4 py-3 hover:bg-surface sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {isNew && <NewBadge />}
          <span className="font-medium text-ink">{article.company}</span>
          <span aria-hidden="true">·</span>
          <span>{CATEGORY_LABELS[article.sourceCategory][locale]}</span>
          <span aria-hidden="true">·</span>
          <span>{formatArticleDate(article.publishedAt, locale)}</span>
        </div>
        <h3 className="text-sm font-semibold leading-snug text-ink">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            data-article-link
            className="inline-flex items-start gap-1.5 hover:underline"
          >
            {article.title}
            <ExternalLink size={12} className="mt-1 shrink-0" aria-hidden="true" />
            <span className="sr-only">({t.common.externalLink})</span>
          </a>
        </h3>
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
      </div>
      <span
        className="shrink-0 text-xs text-muted"
        aria-label={`${t.article.relevance}: ${article.relevanceScore}`}
      >
        {t.article.relevance}: {article.relevanceScore}
      </span>
    </article>
  );
}

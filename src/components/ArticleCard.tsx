import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Article, KeywordPublic } from '../types';
import { useI18n } from '../hooks/useI18n';
import { CATEGORY_LABELS } from '../data/categories';

const PLACEHOLDER_IMAGE = `${import.meta.env.BASE_URL}images/article-placeholder.svg`;
/** Tag-heavy publishers emit a dozen per article; the card shows the first few. */
const MAX_VISIBLE_TAGS = 5;

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function ArticleCard({
  article,
  keywordsById,
}: {
  article: Article;
  keywordsById: Map<string, KeywordPublic>;
}) {
  const { t, locale } = useI18n();
  const [imgError, setImgError] = useState(false);
  const showImage = Boolean(article.imageUrl) && !imgError;

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      <div className="aspect-[16/9] w-full bg-surface">
        <img
          src={showImage ? article.imageUrl : PLACEHOLDER_IMAGE}
          alt={showImage ? t.article.imageAlt : t.article.placeholderAlt}
          loading="lazy"
          onError={() => setImgError(true)}
          className="h-full w-full object-cover"
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="font-medium text-ink">{article.company}</span>
          <span aria-hidden="true">·</span>
          <span>{article.sourceName}</span>
          <span className="ml-auto rounded-full border border-border px-2 py-0.5">
            {CATEGORY_LABELS[article.sourceCategory][locale]}
          </span>
        </div>

        <h3 className="text-base font-semibold leading-snug text-ink">{article.title}</h3>

        {article.matchedKeywordIds.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t.article.matchedKeywords}>
            {article.matchedKeywordIds.map((id) => {
              const keyword = keywordsById.get(id);
              if (!keyword) return null;
              return (
                <li
                  key={id}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                >
                  {keyword.labels[locale]}
                </li>
              );
            })}
          </ul>
        )}

        <p className="line-clamp-4 text-sm text-muted">{article.summary}</p>

        {article.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label={t.article.publisherTags}>
            {article.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
              <li
                key={tag}
                className="rounded-full border border-border px-2 py-0.5 text-xs text-muted"
              >
                {tag}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-auto flex items-center justify-between pt-2 text-xs text-muted">
          <span>{formatDate(article.publishedAt, locale)}</span>
          <span aria-label={`${t.article.relevance}: ${article.relevanceScore}`}>
            {t.article.relevance}: {article.relevanceScore}
          </span>
        </div>

        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-control border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-white"
        >
          {t.article.readMore}
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">({t.common.externalLink})</span>
        </a>
      </div>
    </article>
  );
}

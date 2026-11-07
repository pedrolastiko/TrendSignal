import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import type { Article, KeywordPublic } from '../types';
import { useI18n } from '../hooks/useI18n';
import { CATEGORY_LABELS } from '../data/categories';
import { formatArticleDate } from '../lib/format';
import { isUpcoming } from '../lib/upcoming';
import { UpcomingRibbon } from './UpcomingRibbon';

const PLACEHOLDER_IMAGE = `${import.meta.env.BASE_URL}images/article-placeholder.svg`;
/** Tag-heavy publishers emit a dozen per article; the card shows the first few. */
const MAX_VISIBLE_TAGS = 5;

export function NewBadge() {
  const { t } = useI18n();
  return (
    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-on-primary">
      {t.whatsNew.badge}
    </span>
  );
}

export function ArticleCard({
  article,
  keywordsById,
  sourceLogoUrl,
  isNew = false,
}: {
  article: Article;
  keywordsById: Map<string, KeywordPublic>;
  /** Publisher logo, shown when the article has no usable image of its own. */
  sourceLogoUrl?: string;
  /** Discovered since the reader last marked the feed as seen. */
  isNew?: boolean;
}) {
  const { t, locale } = useI18n();
  const [imageFailed, setImageFailed] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);

  // Two independent failure flags rather than one: a broken article image must still
  // let the logo be tried, and a broken logo must still fall through to the placeholder.
  const variant: 'article' | 'logo' | 'placeholder' =
    article.imageUrl && !imageFailed
      ? 'article'
      : sourceLogoUrl && !logoFailed
        ? 'logo'
        : 'placeholder';

  const imageSrc =
    variant === 'article'
      ? article.imageUrl
      : variant === 'logo'
        ? sourceLogoUrl
        : PLACEHOLDER_IMAGE;
  const imageAlt =
    variant === 'article'
      ? t.article.imageAlt
      : variant === 'logo'
        ? `${article.company} — ${t.article.logoAlt}`
        : t.article.placeholderAlt;

  return (
    <article
      data-article-card
      tabIndex={-1}
      className="flex scroll-mt-20 flex-col overflow-hidden rounded-card border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative aspect-[16/9] w-full bg-surface">
        {isUpcoming(article.publishedAt) && (
          <UpcomingRibbon publishedAt={article.publishedAt} variant="ribbon" />
        )}
        <img
          src={imageSrc}
          alt={imageAlt}
          loading="lazy"
          onError={() => (variant === 'article' ? setImageFailed(true) : setLogoFailed(true))}
          // A logo is not a 16:9 photograph: cropping it to fill would cut the wordmark,
          // so it is contained and padded on the muted surface instead.
          className={
            variant === 'logo'
              ? 'h-full w-full object-contain p-8'
              : variant === 'placeholder'
                ? 'h-full w-full object-cover dark:brightness-75'
                : 'h-full w-full object-cover'
          }
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {isNew && <NewBadge />}
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
          <span>{formatArticleDate(article.publishedAt, locale)}</span>
          <span aria-label={`${t.article.relevance}: ${article.relevanceScore}`}>
            {t.article.relevance}: {article.relevanceScore}
          </span>
        </div>

        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          data-article-link
          className="mt-1 inline-flex items-center justify-center gap-2 rounded-control border border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary hover:text-on-primary"
        >
          {t.article.readMore}
          <ExternalLink size={14} aria-hidden="true" />
          <span className="sr-only">({t.common.externalLink})</span>
        </a>
      </div>
    </article>
  );
}

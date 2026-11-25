const EXCERPT_MAX_LENGTH = 220;

/** Truncates on a word boundary so the quoted excerpt never cuts a word in half. */
export function buildShareExcerpt(summary: string, maxLength = EXCERPT_MAX_LENGTH): string {
  const trimmed = summary.trim();
  if (trimmed.length <= maxLength) return trimmed;
  const cut = trimmed.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * LinkedIn's share endpoint only accepts a `url` parameter — it dropped `title`/`summary`
 * support years ago and always derives the post's link preview from the target page's own
 * Open Graph tags. There is no way to pre-fill the post body via this URL, which is why
 * the caller must also offer the suggested text for the user to paste in by hand.
 */
export function buildLinkedInShareUrl(articleUrl: string): string {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`;
}

/** Suggested post text: a prompt for the reader's own opinion, a quote of the article's
 * opening, and the link — ready to paste into the LinkedIn composer. */
export function buildLinkedInShareText(
  article: { title: string; summary: string; url: string },
  opinionPrompt: string,
): string {
  const excerpt = buildShareExcerpt(article.summary);
  return [opinionPrompt, '', `« ${excerpt} »`, '', article.title, article.url].join('\n');
}

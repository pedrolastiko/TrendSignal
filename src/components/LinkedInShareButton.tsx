import { useEffect, useRef, useState } from 'react';
import { Linkedin } from 'lucide-react';
import type { Article } from '../types';
import { useI18n } from '../hooks/useI18n';
import { buildLinkedInShareText, buildLinkedInShareUrl } from '../lib/linkedinShare';

type Status = 'idle' | 'copied' | 'manual';

const COPIED_MESSAGE_MS = 6000;

/**
 * LinkedIn's share dialog can't be pre-filled with post text (see `linkedinShare.ts`), so
 * this copies a suggested "opinion + article excerpt + link" post to the clipboard and
 * opens the share dialog for the reader to paste it into. When the Clipboard API is
 * unavailable (insecure context, denied permission), it falls back to showing the text in
 * a selectable field instead of silently failing.
 */
export function LinkedInShareButton({
  article,
  compact = false,
}: {
  article: Pick<Article, 'title' | 'summary' | 'url'>;
  /** Icon-only rendering for dense layouts (e.g. the compact article row). */
  compact?: boolean;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<Status>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const shareText = buildLinkedInShareText(article, t.article.shareLinkedInOpinionPrompt);

  useEffect(() => {
    if (status !== 'copied') return undefined;
    const timer = window.setTimeout(() => setStatus('idle'), COPIED_MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (status === 'manual') textareaRef.current?.select();
  }, [status]);

  const handleShare = async () => {
    window.open(buildLinkedInShareUrl(article.url), '_blank', 'noopener,noreferrer');
    try {
      await navigator.clipboard.writeText(shareText);
      setStatus('copied');
    } catch {
      setStatus('manual');
    }
  };

  return (
    <div className={compact ? undefined : 'mt-1'}>
      <button
        type="button"
        onClick={() => void handleShare()}
        aria-label={t.article.shareLinkedIn}
        title={t.article.shareLinkedIn}
        className={
          compact
            ? 'inline-flex shrink-0 items-center justify-center rounded-control border border-border p-2 text-muted hover:border-primary hover:text-primary'
            : 'inline-flex items-center justify-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-medium text-ink hover:border-primary hover:text-primary'
        }
      >
        <Linkedin size={compact ? 16 : 14} aria-hidden="true" />
        {!compact && t.article.shareLinkedIn}
      </button>

      {status === 'copied' && (
        <p role="status" className="mt-2 text-xs text-muted">
          {t.article.shareLinkedInCopied}
        </p>
      )}

      {status === 'manual' && (
        <div className="mt-2 flex flex-col gap-1.5">
          <p role="status" className="text-xs text-muted">
            {t.article.shareLinkedInManual}
          </p>
          <textarea
            ref={textareaRef}
            readOnly
            value={shareText}
            aria-label={t.article.shareLinkedInTextLabel}
            rows={5}
            className="w-full rounded-control border border-border bg-surface p-2 text-xs text-ink"
            onFocus={(event) => event.currentTarget.select()}
          />
        </div>
      )}
    </div>
  );
}

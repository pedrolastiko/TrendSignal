import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';

export function LoadingState() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-card border border-border bg-white py-16 text-muted">
      <Loader2 className="animate-spin" size={28} aria-hidden="true" />
      <p role="status">{t.dashboard.states.loading}</p>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-card border border-danger/30 bg-white py-16 text-center text-ink"
    >
      <AlertTriangle className="text-danger" size={28} aria-hidden="true" />
      <p className="font-medium">{t.dashboard.states.error}</p>
      {message && <p className="max-w-md text-sm text-muted">{message}</p>}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-control border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          {t.dashboard.refresh}
        </button>
      )}
    </div>
  );
}

export function EmptyState({ message }: { message?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-white py-16 text-center text-muted">
      <Inbox size={28} aria-hidden="true" />
      <p>{message ?? t.dashboard.states.empty}</p>
    </div>
  );
}

export function StaleBanner() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-control border border-warning/40 bg-warning/10 px-4 py-2 text-sm text-ink"
    >
      <AlertTriangle size={16} className="text-warning" aria-hidden="true" />
      {t.dashboard.states.stale}
    </div>
  );
}

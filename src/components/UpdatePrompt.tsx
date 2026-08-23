import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useI18n } from '../hooks/useI18n';

export function UpdatePrompt() {
  const { t } = useI18n();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  const dismiss = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-card border border-border bg-white p-4 shadow-xl sm:inset-x-auto sm:right-4"
    >
      <p className="text-sm text-ink">{needRefresh ? t.update.available : t.update.offlineReady}</p>
      <div className="flex shrink-0 items-center gap-2">
        {needRefresh && (
          <button
            type="button"
            onClick={() => void updateServiceWorker(true)}
            className="flex items-center gap-1.5 rounded-control bg-primary px-3 py-1.5 text-sm font-medium text-white"
          >
            <RefreshCw size={14} aria-hidden="true" />
            {t.update.reload}
          </button>
        )}
        <button
          type="button"
          onClick={dismiss}
          className="rounded-control border border-border px-3 py-1.5 text-sm font-medium text-ink hover:bg-surface"
        >
          {t.update.dismiss}
        </button>
      </div>
    </div>
  );
}

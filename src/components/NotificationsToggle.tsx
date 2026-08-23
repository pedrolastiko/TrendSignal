import { Bell, BellOff, BellRing } from 'lucide-react';
import { useI18n } from '../hooks/useI18n';
import { useArticleNotifications } from '../hooks/useArticleNotifications';

export function NotificationsToggle({ className = '' }: { className?: string }) {
  const { t } = useI18n();
  const { supported, permission, enabled, enable, disable } = useArticleNotifications();

  if (!supported) {
    return (
      <p className={`flex items-center gap-2 text-xs text-muted ${className}`}>
        <BellOff size={14} aria-hidden="true" />
        {t.notifications.unsupported}
      </p>
    );
  }

  if (permission === 'denied') {
    return (
      <p className={`flex items-center gap-2 text-xs text-muted ${className}`}>
        <BellOff size={14} aria-hidden="true" />
        {t.notifications.denied}
      </p>
    );
  }

  if (enabled) {
    return (
      <button
        type="button"
        onClick={disable}
        title={t.notifications.hint}
        className={`flex items-center gap-2 rounded-control border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success transition-colors hover:bg-success/20 ${className}`}
      >
        <BellRing size={16} aria-hidden="true" />
        {t.notifications.enabled}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void enable()}
      title={t.notifications.hint}
      className={`flex items-center gap-2 rounded-control border border-border px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-surface ${className}`}
    >
      <Bell size={16} aria-hidden="true" />
      {t.notifications.enable}
    </button>
  );
}

import { CheckCircle2, AlertCircle, XCircle, PauseCircle, type LucideIcon } from 'lucide-react';
import type { SourceHealthStatus, TrendStatus } from '../types';
import { useI18n } from '../hooks/useI18n';

const healthConfig: Record<SourceHealthStatus, { icon: LucideIcon; className: string }> = {
  healthy: { icon: CheckCircle2, className: 'text-success bg-success/10 border-success/30' },
  warning: { icon: AlertCircle, className: 'text-warning bg-warning/10 border-warning/30' },
  error: { icon: XCircle, className: 'text-danger bg-danger/10 border-danger/30' },
  disabled: { icon: PauseCircle, className: 'text-muted bg-surface border-border' },
};

export function HealthBadge({ status }: { status: SourceHealthStatus }) {
  const { t } = useI18n();
  const { icon: Icon, className } = healthConfig[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${className}`}
    >
      <Icon size={14} aria-hidden="true" />
      {t.sources.healthStatus[status]}
    </span>
  );
}

const trendConfig: Record<TrendStatus, string> = {
  breakout: 'text-danger bg-danger/10 border-danger/30',
  emerging: 'text-warning bg-warning/10 border-warning/30',
  rising: 'text-success bg-success/10 border-success/30',
  stable: 'text-muted bg-surface border-border',
  declining: 'text-muted bg-surface border-border',
};

export function TrendStatusBadge({ status }: { status: TrendStatus }) {
  const { t } = useI18n();
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${trendConfig[status]}`}
    >
      {t.trends.status[status]}
    </span>
  );
}

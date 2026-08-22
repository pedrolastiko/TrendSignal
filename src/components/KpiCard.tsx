import type { LucideIcon } from 'lucide-react';

export function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
}) {
  return (
    <div className="flex items-center gap-4 rounded-card border border-border bg-white p-4 shadow-sm">
      <div className="flex h-11 w-11 items-center justify-center rounded-control bg-primary/10 text-primary">
        <Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-medium text-muted">{label}</p>
        <p className="text-xl font-semibold text-ink">{value}</p>
      </div>
    </div>
  );
}

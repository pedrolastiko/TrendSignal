import { useI18n } from '../hooks/useI18n';
import { CATEGORY_LABELS, SOURCE_CATEGORIES } from '../data/categories';
import type { SourceCategory } from '../types';

export type CategoryValue = 'all' | SourceCategory;

/** One-click source-category filter. Counts reflect the other active filters, so a chip
 *  shows how many articles it would leave rather than the global total. */
export function CategoryFilter({
  value,
  onChange,
  counts,
}: {
  value: CategoryValue;
  onChange: (value: CategoryValue) => void;
  counts: Record<CategoryValue, number>;
}) {
  const { t, locale } = useI18n();
  const options: { value: CategoryValue; label: string }[] = [
    { value: 'all', label: t.dashboard.filters.all },
    ...SOURCE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c][locale] })),
  ];

  return (
    <section
      aria-labelledby="category-filter-label"
      className="mb-4 rounded-card border border-border bg-card p-4"
    >
      <h2 id="category-filter-label" className="mb-3 text-sm font-semibold text-ink">
        {t.dashboard.filters.category}
      </h2>
      <div role="group" aria-labelledby="category-filter-label" className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary bg-primary text-on-primary'
                  : 'border-border text-ink hover:bg-surface'
              }`}
            >
              {option.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  active ? 'bg-on-primary/20' : 'bg-surface text-muted'
                }`}
              >
                {counts[option.value]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

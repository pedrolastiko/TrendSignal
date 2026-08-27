import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HealthBadge, TrendStatusBadge } from '../../../src/components/StatusBadge';
import { I18nProvider } from '../../../src/hooks/useI18n';
import type { SourceHealthStatus, TrendStatus } from '../../../src/types';

function renderHealth(status: SourceHealthStatus) {
  return render(
    <I18nProvider>
      <HealthBadge status={status} />
    </I18nProvider>,
  );
}

function renderTrend(status: TrendStatus) {
  return render(
    <I18nProvider>
      <TrendStatusBadge status={status} />
    </I18nProvider>,
  );
}

describe('HealthBadge', () => {
  it.each<[SourceHealthStatus, string]>([
    ['healthy', 'Healthy'],
    ['warning', 'Warning'],
    ['error', 'Error'],
    ['disabled', 'Disabled'],
  ])('renders the correct label for status "%s"', (status, label) => {
    renderHealth(status);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders distinguishable content beyond color for each status (non-color indicator)', () => {
    const { container: healthy } = renderHealth('healthy');
    const { container: error } = renderHealth('error');
    expect(healthy.querySelector('svg')?.outerHTML).not.toBe(error.querySelector('svg')?.outerHTML);
  });
});

describe('TrendStatusBadge', () => {
  it.each<[TrendStatus, string]>([
    ['breakout', 'Breakout'],
    ['emerging', 'Emerging'],
    ['rising', 'Rising'],
    ['stable', 'Stable'],
    ['declining', 'Declining'],
  ])('renders the correct label for status "%s"', (status, label) => {
    renderTrend(status);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EmptyState, ErrorState, LoadingState, StaleBanner } from '../../../src/components/States';
import { I18nProvider } from '../../../src/hooks/useI18n';

function withI18n(children: ReactNode) {
  return render(<I18nProvider>{children}</I18nProvider>);
}

describe('LoadingState', () => {
  it('announces loading via role=status', () => {
    withI18n(<LoadingState />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading data…');
  });
});

describe('EmptyState', () => {
  it('renders the default empty message', () => {
    withI18n(<EmptyState />);
    expect(screen.getByText('No article matches these filters.')).toBeInTheDocument();
  });

  it('renders a custom message when provided', () => {
    withI18n(<EmptyState message="Nothing to show" />);
    expect(screen.getByText('Nothing to show')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('renders as an alert with the error message and calls onRetry', () => {
    const onRetry = vi.fn();
    withI18n(<ErrorState message="HTTP 500" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('HTTP 500');
    fireEvent.click(screen.getByRole('button'));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('does not render a retry button when onRetry is omitted', () => {
    withI18n(<ErrorState message="HTTP 500" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('StaleBanner', () => {
  it('renders a status region warning about stale data', () => {
    withI18n(<StaleBanner />);
    expect(screen.getByRole('status')).toHaveTextContent('more than 24 hours old');
  });
});

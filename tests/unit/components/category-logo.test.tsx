import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CategoryFilter, type CategoryValue } from '../../../src/components/CategoryFilter';
import { Logo } from '../../../src/components/Logo';
import { I18nProvider } from '../../../src/hooks/useI18n';

const counts: Record<CategoryValue, number> = {
  all: 8,
  consulting: 3,
  technology: 2,
  cybersecurity: 3,
  'artificial-intelligence': 0,
  media: 0,
};

function renderFilter(value: CategoryValue, onChange = vi.fn()) {
  render(
    <I18nProvider>
      <CategoryFilter value={value} onChange={onChange} counts={counts} />
    </I18nProvider>,
  );
  return onChange;
}

describe('CategoryFilter', () => {
  it('renders one button per category plus All, each with its count', () => {
    renderFilter('all');
    const group = screen.getByRole('group', { name: 'Category' });
    expect(group.querySelectorAll('button')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'All 8' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consulting 3' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Media 0' })).toBeInTheDocument();
  });

  it('marks only the active category as pressed', () => {
    renderFilter('technology');
    expect(screen.getByRole('button', { name: 'Technology 2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'All 8' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Consulting 3' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('reports the chosen category, and All to clear it', () => {
    const onChange = renderFilter('consulting');
    fireEvent.click(screen.getByRole('button', { name: 'Cybersecurity 3' }));
    expect(onChange).toHaveBeenLastCalledWith('cybersecurity');
    fireEvent.click(screen.getByRole('button', { name: 'All 8' }));
    expect(onChange).toHaveBeenLastCalledWith('all');
  });

  it('uses French labels when the interface is French', () => {
    window.localStorage.setItem('trendsignal:v1:ui-locale', '"fr"');
    renderFilter('all');
    expect(screen.getByRole('button', { name: 'Conseil 3' })).toBeInTheDocument();
    window.localStorage.clear();
  });
});

describe('Logo', () => {
  it('is decorative and sized as requested', () => {
    const { container } = render(<Logo size={48} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '48');
    expect(svg).toHaveAttribute('height', '48');
  });
});

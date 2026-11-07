import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { ArticleCard } from '../../../src/components/ArticleCard';
import { ArticleRow } from '../../../src/components/ArticleRow';
import { PreferencesPanel } from '../../../src/components/PreferencesPanel';
import { ShortcutsDialog } from '../../../src/components/ShortcutsDialog';
import { WhatsNewBanner } from '../../../src/components/WhatsNewBanner';
import { I18nProvider } from '../../../src/hooks/useI18n';
import { ThemeProvider } from '../../../src/hooks/useTheme';
import { useKeyboardShortcuts } from '../../../src/hooks/useKeyboardShortcuts';
import type { Article, KeywordPublic } from '../../../src/types';

function article(overrides: Partial<Article> = {}): Article {
  return {
    id: 'a1',
    title: 'Zero Trust adoption accelerates',
    url: 'https://example.com/a1',
    canonicalUrl: 'https://example.com/a1',
    sourceId: 's1',
    sourceName: 'Example Blog',
    company: 'Example Co',
    sourceCategory: 'cybersecurity',
    publishedAt: '2026-08-20T10:00:00.000Z',
    discoveredAt: '2026-08-20T10:05:00.000Z',
    summary: 'A short summary.',
    language: 'en',
    tags: [],
    matchedKeywordIds: ['zero-trust'],
    tagMatchedIds: [],
    relevanceScore: 72,
    ...overrides,
  };
}

const keywordsById = new Map<string, KeywordPublic>([
  [
    'zero-trust',
    {
      id: 'zero-trust',
      labels: { fr: 'Zero Trust', en: 'Zero Trust' },
      category: 'cybersecurity',
      synonymCount: 3,
      enabled: true,
    },
  ],
]);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('PreferencesPanel', () => {
  function renderPanel() {
    return render(
      <I18nProvider>
        <ThemeProvider>
          <PreferencesPanel />
        </ThemeProvider>
      </I18nProvider>,
    );
  }

  it('applies and persists the chosen theme', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('trendsignal:v1:theme')).toBe('"dark"');

    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('switches the interface language and the document lang', () => {
    renderPanel();
    expect(document.documentElement.lang).toBe('en');
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(document.documentElement.lang).toBe('fr');
    expect(screen.getByRole('button', { name: 'Sombre' })).toBeInTheDocument();
  });
});

describe('keyboard shortcuts', () => {
  function Harness({
    enabled = true,
    onHelp = () => {},
  }: {
    enabled?: boolean;
    onHelp?: () => void;
  }) {
    useKeyboardShortcuts({ enabled, onHelp });
    const location = useLocation();
    return (
      <div>
        <span data-testid="path">{location.pathname}</span>
        <input aria-label="field" />
        <article data-article-card tabIndex={-1} aria-label="one">
          <a
            data-article-link
            href="https://example.com/1"
            target="_blank"
            rel="noopener noreferrer"
          >
            one
          </a>
        </article>
        <article data-article-card tabIndex={-1} aria-label="two" />
      </div>
    );
  }

  function renderHarness(props: { enabled?: boolean; onHelp?: () => void } = {}) {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="*" element={<Harness {...props} />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('moves focus between cards with j and k', () => {
    renderHarness();
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByLabelText('one')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'j' });
    expect(screen.getByLabelText('two')).toHaveFocus();
    fireEvent.keyDown(window, { key: 'k' });
    expect(screen.getByLabelText('one')).toHaveFocus();
  });

  it('opens the focused card link with o', () => {
    renderHarness();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    fireEvent.keyDown(window, { key: 'j' });
    fireEvent.keyDown(window, { key: 'o' });
    expect(click).toHaveBeenCalledTimes(1);
    click.mockRestore();
  });

  it('navigates with a g-then-letter chord', () => {
    renderHarness();
    fireEvent.keyDown(window, { key: 'g' });
    fireEvent.keyDown(window, { key: 't' });
    expect(screen.getByTestId('path')).toHaveTextContent('/trends');
  });

  it('opens help with ?', () => {
    const onHelp = vi.fn();
    renderHarness({ onHelp });
    fireEvent.keyDown(window, { key: '?' });
    expect(onHelp).toHaveBeenCalledTimes(1);
  });

  it('ignores keys typed into a field, or pressed with a modifier', () => {
    const onHelp = vi.fn();
    renderHarness({ onHelp });
    fireEvent.keyDown(screen.getByLabelText('field'), { key: '?' });
    fireEvent.keyDown(window, { key: 'j', ctrlKey: true });
    expect(onHelp).not.toHaveBeenCalled();
    expect(screen.getByLabelText('one')).not.toHaveFocus();
  });

  it('does nothing when disabled', () => {
    const onHelp = vi.fn();
    renderHarness({ enabled: false, onHelp });
    fireEvent.keyDown(window, { key: '?' });
    fireEvent.keyDown(window, { key: 'j' });
    expect(onHelp).not.toHaveBeenCalled();
    expect(screen.getByLabelText('one')).not.toHaveFocus();
  });
});

describe('ShortcutsDialog', () => {
  function Host() {
    const [open, setOpen] = useState(true);
    const [enabled, setEnabled] = useState(true);
    return (
      <I18nProvider>
        <button onClick={() => setOpen(true)}>opener</button>
        <ShortcutsDialog
          open={open}
          onClose={() => setOpen(false)}
          shortcutsEnabled={enabled}
          onShortcutsEnabledChange={setEnabled}
        />
        <span data-testid="enabled">{String(enabled)}</span>
      </I18nProvider>
    );
  }

  it('is a labelled modal that moves focus in, and closes on Escape', () => {
    render(<Host />);
    const dialog = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('lets the reader switch single-key shortcuts off', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('checkbox', { name: /single-key shortcuts/i }));
    expect(screen.getByTestId('enabled')).toHaveTextContent('false');
  });
});

describe('what is new UI', () => {
  it('shows a New badge on cards and rows only when flagged', () => {
    const { rerender } = render(
      <I18nProvider>
        <ArticleCard article={article()} keywordsById={keywordsById} isNew />
        <ArticleRow article={article({ id: 'a2' })} keywordsById={keywordsById} isNew />
      </I18nProvider>,
    );
    expect(screen.getAllByText('New')).toHaveLength(2);

    rerender(
      <I18nProvider>
        <ArticleCard article={article()} keywordsById={keywordsById} />
        <ArticleRow article={article({ id: 'a2' })} keywordsById={keywordsById} />
      </I18nProvider>,
    );
    expect(screen.queryByText('New')).not.toBeInTheDocument();
  });

  it('renders a compact row with a safe external title link', () => {
    render(
      <I18nProvider>
        <ArticleRow article={article()} keywordsById={keywordsById} />
      </I18nProvider>,
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveTextContent('Zero Trust adoption accelerates');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('pluralises the summary and wires the banner actions', () => {
    const onToggle = vi.fn();
    const onMark = vi.fn();
    const { rerender } = render(
      <I18nProvider>
        <WhatsNewBanner
          count={1}
          lastSeenAt={Date.parse('2026-11-01T00:00:00Z')}
          onlyNew={false}
          onToggleOnlyNew={onToggle}
          onMarkSeen={onMark}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^1 new article since/);
    fireEvent.click(screen.getByRole('button', { name: 'Show only new' }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as seen' }));
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onMark).toHaveBeenCalledTimes(1);

    rerender(
      <I18nProvider>
        <WhatsNewBanner
          count={4}
          lastSeenAt={Date.parse('2026-11-01T00:00:00Z')}
          onlyNew
          onToggleOnlyNew={onToggle}
          onMarkSeen={onMark}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole('status')).toHaveTextContent(/^4 new articles since/);
    expect(screen.getByRole('button', { name: 'Show all' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('upcoming ribbon', () => {
  const future = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  it('shows a ribbon with the date on a card whose date is in the future', () => {
    const { container } = render(
      <I18nProvider>
        <ArticleCard article={article({ publishedAt: future })} keywordsById={keywordsById} />
      </I18nProvider>,
    );
    const ribbon = container.querySelector('[data-upcoming]');
    expect(ribbon).not.toBeNull();
    expect(ribbon).toHaveTextContent('Upcoming');
  });

  it('shows an inline marker on a compact row whose date is in the future', () => {
    const { container } = render(
      <I18nProvider>
        <ArticleRow article={article({ publishedAt: future })} keywordsById={keywordsById} />
      </I18nProvider>,
    );
    expect(container.querySelector('[data-upcoming]')).toHaveTextContent('Upcoming');
  });

  it('shows nothing for an already published article', () => {
    const { container } = render(
      <I18nProvider>
        <ArticleCard article={article({ publishedAt: past })} keywordsById={keywordsById} />
        <ArticleRow
          article={article({ id: 'a2', publishedAt: past })}
          keywordsById={keywordsById}
        />
      </I18nProvider>,
    );
    expect(container.querySelector('[data-upcoming]')).toBeNull();
  });
});

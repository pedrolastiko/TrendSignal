import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { EventCard } from '../../../src/components/EventCard';
import { UpcomingEvents } from '../../../src/components/UpcomingEvents';
import { I18nProvider } from '../../../src/hooks/useI18n';
import type { EventItem, KeywordPublic } from '../../../src/types';

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

const soon = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

function event(overrides: Partial<EventItem> = {}): EventItem {
  return {
    id: 'e1',
    title: 'Webinar: Zero Trust in practice',
    url: 'https://example.com/e/1',
    sourceId: 's1',
    sourceName: 'Source',
    company: 'Example Co',
    sourceCategory: 'cybersecurity',
    startsAt: soon(10),
    allDay: false,
    kind: 'webinar',
    format: 'online',
    summary: 'A short summary.',
    language: 'en',
    matchedKeywordIds: ['zero-trust'],
    relevanceScore: 40,
    discoveredAt: '2026-11-07T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => window.localStorage.clear());

describe('EventCard', () => {
  const renderCard = (e: EventItem) =>
    render(
      <I18nProvider>
        <EventCard event={e} keywordsById={keywordsById} />
      </I18nProvider>,
    );

  it('shows the type and format in words, the company, location and matched keyword', () => {
    renderCard(event({ kind: 'conference', format: 'hybrid', location: 'Toronto, Canada' }));
    expect(screen.getByText('Conference')).toBeInTheDocument();
    expect(screen.getByText('Hybrid')).toBeInTheDocument();
    expect(screen.getByText('Example Co')).toBeInTheDocument();
    expect(screen.getByText('Toronto, Canada')).toBeInTheDocument();
    expect(screen.getByText('Zero Trust')).toBeInTheDocument();
  });

  it('links out with safe attributes', () => {
    renderCard(event());
    const link = screen.getByRole('link', { name: /View event/ });
    expect(link).toHaveAttribute('href', 'https://example.com/e/1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('saves a calendar file when asked', () => {
    const createObjectURL = vi.fn(() => 'blob:fake');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderCard(event());
    fireEvent.click(screen.getByRole('button', { name: 'Add to calendar' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = (createObjectURL.mock.calls[0] as unknown as [Blob])[0];
    expect(blob.type).toContain('text/calendar');
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    click.mockRestore();
  });

  it('is reachable by the article keyboard shortcuts', () => {
    const { container } = renderCard(event());
    const card = container.querySelector('article');
    expect(card).toHaveAttribute('data-article-card');
    expect(card?.querySelector('a[data-article-link]')).not.toBeNull();
  });
});

describe('UpcomingEvents', () => {
  const renderWidget = (events: EventItem[]) =>
    render(
      <MemoryRouter>
        <I18nProvider>
          <UpcomingEvents events={events} />
        </I18nProvider>
      </MemoryRouter>,
    );

  it('lists the next three events and links to the Events page', () => {
    renderWidget(
      [1, 2, 3, 4].map((n) => event({ id: `e${n}`, title: `Event ${n}`, startsAt: soon(n) })),
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'View all events' })).toHaveAttribute(
      'href',
      '/events',
    );
  });

  it('skips events that are already over, and renders nothing when none is left', () => {
    const { container } = renderWidget([event({ startsAt: soon(-3) })]);
    expect(container).toBeEmptyDOMElement();
  });

  it('prefers events on tracked topics when there are enough of them', () => {
    const offTopic = event({
      id: 'off',
      title: 'Off topic',
      startsAt: soon(1),
      matchedKeywordIds: [],
    });
    const onTopic = [2, 3, 4].map((n) =>
      event({ id: `on${n}`, title: `On topic ${n}`, startsAt: soon(n) }),
    );
    renderWidget([offTopic, ...onTopic]);
    expect(screen.queryByText(/Off topic/)).not.toBeInTheDocument();
    expect(screen.getByText(/On topic 2/)).toBeInTheDocument();
  });
});

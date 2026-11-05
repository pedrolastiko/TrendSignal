import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArticleCard } from '../../../src/components/ArticleCard';
import { I18nProvider } from '../../../src/hooks/useI18n';
import type { Article, KeywordPublic } from '../../../src/types';

function baseArticle(overrides: Partial<Article> = {}): Article {
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
    summary: 'A short summary of the article.',
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

function renderCard(article: Article, sourceLogoUrl?: string) {
  return render(
    <I18nProvider>
      <ArticleCard article={article} keywordsById={keywordsById} sourceLogoUrl={sourceLogoUrl} />
    </I18nProvider>,
  );
}

describe('ArticleCard', () => {
  it('renders the placeholder image when no imageUrl is provided', () => {
    renderCard(baseArticle({ imageUrl: undefined }));
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toContain('article-placeholder.svg');
  });

  it('renders the remote image when imageUrl is provided', () => {
    renderCard(baseArticle({ imageUrl: 'https://example.com/photo.jpg' }));
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
  });

  it('falls back to the placeholder when the remote image fails to load', () => {
    renderCard(baseArticle({ imageUrl: 'https://example.com/broken.jpg' }));
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(img.getAttribute('src')).toContain('article-placeholder.svg');
  });

  it('renders the matched keyword badge', () => {
    renderCard(baseArticle());
    expect(screen.getByText('Zero Trust')).toBeInTheDocument();
  });

  it('renders an external link with safe rel/target attributes', () => {
    renderCard(baseArticle());
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(link).toHaveAttribute('href', 'https://example.com/a1');
  });

  it('shows the title and relevance score', () => {
    renderCard(baseArticle());
    expect(screen.getByText('Zero Trust adoption accelerates')).toBeInTheDocument();
    expect(screen.getByText(/72/)).toBeInTheDocument();
  });
});

describe('ArticleCard publisher tags', () => {
  it('renders publisher tags and caps how many are shown', () => {
    const tags = ['Cloud', 'Zero Trust', 'IAM', 'SASE', 'Ransomware', 'Quantum'];
    render(
      <I18nProvider>
        <ArticleCard article={baseArticle({ tags })} keywordsById={keywordsById} />
      </I18nProvider>,
    );
    expect(screen.getByText('Cloud')).toBeInTheDocument();
    expect(screen.getByText('Ransomware')).toBeInTheDocument();
    // Sixth tag is beyond the cap.
    expect(screen.queryByText('Quantum')).not.toBeInTheDocument();
  });

  it('renders no tag list when the publisher supplied none', () => {
    render(
      <I18nProvider>
        <ArticleCard article={baseArticle({ tags: [] })} keywordsById={keywordsById} />
      </I18nProvider>,
    );
    expect(screen.queryByLabelText(/tags/i)).not.toBeInTheDocument();
  });
});

describe('ArticleCard publisher logo fallback', () => {
  const LOGO = 'https://example.com/logo.png';

  it('shows the publisher logo instead of the placeholder when the article has no image', () => {
    renderCard(baseArticle({ imageUrl: undefined }), LOGO);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe(LOGO);
    // A logo is not a 16:9 photograph; cropping it would cut the wordmark.
    expect(img.className).toContain('object-contain');
  });

  it('prefers the article image over the logo when both exist', () => {
    renderCard(baseArticle({ imageUrl: 'https://example.com/photo.jpg' }), LOGO);
    const img = screen.getByRole('img');
    expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
    expect(img.className).toContain('object-cover');
  });

  it('falls back to the logo when the article image fails to load', () => {
    renderCard(baseArticle({ imageUrl: 'https://example.com/broken.jpg' }), LOGO);
    const img = screen.getByRole('img');
    fireEvent.error(img);
    expect(screen.getByRole('img').getAttribute('src')).toBe(LOGO);
  });

  it('falls back to the placeholder when the logo itself fails to load', () => {
    renderCard(baseArticle({ imageUrl: undefined }), LOGO);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toContain('article-placeholder.svg');
  });

  it('chains both failures: broken article image, then broken logo, then placeholder', () => {
    renderCard(baseArticle({ imageUrl: 'https://example.com/broken.jpg' }), LOGO);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toBe(LOGO);
    fireEvent.error(screen.getByRole('img'));
    expect(screen.getByRole('img').getAttribute('src')).toContain('article-placeholder.svg');
  });

  it('names the publisher in the logo alt text', () => {
    renderCard(baseArticle({ imageUrl: undefined, company: 'Acme Corp' }), LOGO);
    expect(screen.getByRole('img').getAttribute('alt')).toContain('Acme Corp');
  });

  it('keeps the placeholder when the source declared no logo', () => {
    renderCard(baseArticle({ imageUrl: undefined }));
    expect(screen.getByRole('img').getAttribute('src')).toContain('article-placeholder.svg');
  });

  it('leaves the placeholder filling the frame, as it did before logos existed', () => {
    renderCard(baseArticle({ imageUrl: undefined }));
    const img = screen.getByRole('img');
    // Only a logo is contained-and-padded; the placeholder artwork is drawn to fill 16:9.
    expect(img.className).toContain('object-cover');
    expect(img.className).not.toContain('object-contain');
  });
});

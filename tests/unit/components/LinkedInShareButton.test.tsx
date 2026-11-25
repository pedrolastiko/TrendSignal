import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { LinkedInShareButton } from '../../../src/components/LinkedInShareButton';
import { I18nProvider } from '../../../src/hooks/useI18n';

const article = {
  title: 'Zero Trust adoption accelerates',
  summary: 'Enterprises are moving faster than expected on Zero Trust architectures.',
  url: 'https://example.com/a1',
};

function renderButton(compact = false) {
  return render(
    <I18nProvider>
      <LinkedInShareButton article={article} compact={compact} />
    </I18nProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  // @ts-expect-error -- test-only cleanup of a property we define per test
  delete navigator.clipboard;
});

describe('LinkedInShareButton', () => {
  it('opens the LinkedIn share dialog for the article URL', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /linkedin/i }));

    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining('linkedin.com/sharing/share-offsite'),
      '_blank',
      'noopener,noreferrer',
    );
    expect(openSpy).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent(article.url)),
      expect.anything(),
      expect.anything(),
    );
    // Let the clipboard promise (and the state update it triggers) settle before the test ends.
    await waitFor(() => expect(writeText).toHaveBeenCalled());
  });

  it('copies a suggested post combining an opinion prompt, the excerpt, and the link', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /linkedin/i }));

    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const copiedText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedText).toContain(article.summary);
    expect(copiedText).toContain(article.title);
    expect(copiedText).toContain(article.url);
    expect(await screen.findByRole('status')).toHaveTextContent(/copi|copied/i);
  });

  it('falls back to a selectable text field when the clipboard write fails', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });

    renderButton();
    fireEvent.click(screen.getByRole('button', { name: /linkedin/i }));

    const textarea = await screen.findByRole('textbox');
    expect((textarea as HTMLTextAreaElement).value).toContain(article.title);
  });

  it('renders icon-only in compact mode', () => {
    renderButton(true);
    expect(screen.getByRole('button', { name: /linkedin/i })).toBeInTheDocument();
  });
});

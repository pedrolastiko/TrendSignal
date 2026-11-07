import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.json': 'application/json',
  '.ics': 'text/calendar',
};

const DAY_MS = 24 * 60 * 60 * 1000;
const pad = (n: number) => String(n).padStart(2, '0');
const RFC822_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const RFC822_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Renders `{{BASE_URL}}` and relative-date tokens in fixture text. `{{IN_DAYS:N:KIND}}` is the
 * date N days after `now`, so event fixtures stay upcoming whenever the demo is generated:
 * ICS_DATE `20261109`, ICS_UTC `20261109T150000Z`, ICS_LOCAL `20261109T100000`,
 * SLASH `2026/11/09`, ISO_DATE `2026-11-09`, ISO_OFFSET `2026-11-09T15:00:00+0000`,
 * ISO_LOCAL `2026-11-09T15:00:00`, RFC822 `Mon, 09 Nov 2026 15:00:00 +0000`, RFC822_MIDNIGHT `… 00:00:00 +0000`.
 */
export function renderFixtureText(text: string, baseUrl: string, now: Date = new Date()): string {
  return text
    .replaceAll('{{BASE_URL}}', baseUrl)
    .replace(/\{\{IN_DAYS:(-?\d+):([A-Z_0-9]+)\}\}/g, (match, days: string, kind: string) => {
      const d = new Date(now.getTime() + Number(days) * DAY_MS);
      const date = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
      const slash = `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}`;
      const rfc = `${RFC822_DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${RFC822_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      switch (kind) {
        case 'ICS_DATE':
          return date;
        case 'ICS_UTC':
          return `${date}T150000Z`;
        case 'ICS_LOCAL':
          return `${date}T100000`;
        case 'SLASH':
          return slash;
        case 'ISO_DATE':
          return slash.replaceAll('/', '-');
        case 'ISO_OFFSET':
          return `${slash.replaceAll('/', '-')}T15:00:00+0000`;
        case 'ISO_LOCAL':
          return `${slash.replaceAll('/', '-')}T15:00:00`;
        case 'RFC822':
          return `${rfc} 15:00:00 +0000`;
        case 'RFC822_MIDNIGHT':
          return `${rfc} 00:00:00 +0000`;
        default:
          return match;
      }
    });
}

export interface FixtureServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

/** Serves static fixture files over local HTTP so the real HTTP-fetching adapters can be exercised without touching live publishers. */
export function startFixtureServer(rootDir: string): Promise<FixtureServerHandle> {
  let baseUrl = '';
  const server: Server = createServer((req, res) => {
    void (async () => {
      try {
        const requestPath = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/');
        const filePath = join(rootDir, requestPath);
        const ext = extname(filePath);
        const contentType =
          CONTENT_TYPES[ext] ?? (ext === '' ? 'application/json' : 'application/octet-stream');
        // Extensionless files are WordPress REST endpoints (…/wp-json/wp/v2/lf_event).
        if (['.xml', '.html', '.ics', '.json', ''].includes(ext)) {
          const text = renderFixtureText(await readFile(filePath, 'utf-8'), baseUrl);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(text);
        } else {
          const body = await readFile(filePath);
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(body);
        }
      } catch {
        res.writeHead(404);
        res.end('Not found');
      }
    })();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve({
        baseUrl,
        close: () => new Promise((res) => server.close(() => res())),
      });
    });
  });
}

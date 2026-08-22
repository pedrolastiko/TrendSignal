import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const CONTENT_TYPES: Record<string, string> = {
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.json': 'application/json',
};

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
        const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
        if (ext === '.xml' || ext === '.html') {
          const text = (await readFile(filePath, 'utf-8')).replaceAll('{{BASE_URL}}', baseUrl);
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

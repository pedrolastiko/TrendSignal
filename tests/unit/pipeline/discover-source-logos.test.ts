import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { validateImage } from '../../../scripts/discover-source-logos.ts';

/**
 * The logo ceiling has to hold while the body is read, not after it. Buffering first
 * and measuring afterwards would let a publisher serving a huge file be pulled entirely
 * into memory — five candidates run concurrently — which is what AGENTS.md #10's
 * response-size rule exists to prevent.
 */
const OVER_LIMIT_BYTES = 600 * 1024;

let server: Server;
let baseUrl: string;
/** Bytes the server actually pushed, which is how an early cancel becomes observable. */
let bytesServed = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';

    if (path === '/small.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.alloc(2048));
      return;
    }
    if (path === '/declared-huge.png') {
      // Honest Content-Length: rejectable before a single byte of body is read.
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': String(OVER_LIMIT_BYTES),
      });
      res.end(Buffer.alloc(OVER_LIMIT_BYTES));
      return;
    }
    if (path === '/chunked-huge.png') {
      // No Content-Length, so only a running count during the read can stop this.
      res.writeHead(200, { 'Content-Type': 'image/png' });
      const chunk = Buffer.alloc(64 * 1024);
      let sent = 0;
      const pump = () => {
        while (sent < 50 * 1024 * 1024) {
          sent += chunk.length;
          bytesServed = sent;
          if (!res.write(chunk)) {
            res.once('drain', pump);
            return;
          }
        }
        res.end();
      };
      res.on('close', () => {
        sent = Number.MAX_SAFE_INTEGER; // stop pumping once the client goes away
      });
      pump();
      return;
    }
    if (path === '/tiny.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(Buffer.alloc(50));
      return;
    }
    if (path === '/not-an-image') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>missing icon</html>');
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('validateImage', () => {
  it('accepts an image inside the size window', async () => {
    const result = await validateImage(`${baseUrl}/small.png`);
    expect(result.ok).toBe(true);
    expect(result.bytes).toBe(2048);
  });

  it('rejects an oversized Content-Length without reading the body', async () => {
    const result = await validateImage(`${baseUrl}/declared-huge.png`);
    expect(result.ok).toBe(false);
    expect(result.bytes).toBe(OVER_LIMIT_BYTES);
  });

  it('stops a chunked response once it passes the ceiling', async () => {
    bytesServed = 0;
    const result = await validateImage(`${baseUrl}/chunked-huge.png`);
    expect(result.ok).toBe(false);
    // The server was ready to push 50 MB; the read stopped it a hair past the ceiling.
    expect(result.bytes).toBeLessThan(2 * 1024 * 1024);
    expect(bytesServed).toBeLessThan(10 * 1024 * 1024);
  });

  it('rejects a response too small to be a usable logo', async () => {
    expect((await validateImage(`${baseUrl}/tiny.png`)).ok).toBe(false);
  });

  it('rejects a non-image, which is how a missing icon usually answers', async () => {
    const result = await validateImage(`${baseUrl}/not-an-image`);
    expect(result.ok).toBe(false);
    expect(result.contentType).toContain('text/html');
  });

  it('rejects a 404 rather than throwing', async () => {
    expect((await validateImage(`${baseUrl}/nope.png`)).ok).toBe(false);
  });
});

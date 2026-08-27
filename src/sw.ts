/// <reference lib="webworker" />
/// <reference types="vite-plugin-pwa/client" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

const META_CACHE = 'trendsignal-meta';
const LAST_SEEN_KEY = new Request('https://trendsignal.local/last-seen-generated-at');
const NOTIFICATION_TAG = 'trendsignal-new-articles';
const PERIODIC_SYNC_TAG = 'trendsignal-check-updates';

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// Published article/trend data: always try the network first so open tabs see fresh
// data, but fall back to the last cached copy when offline.
registerRoute(
  ({ url }) => url.pathname.includes('/data/') && url.pathname.endsWith('.json'),
  new NetworkFirst({
    cacheName: 'trendsignal-data',
    networkTimeoutSeconds: 8,
    plugins: [new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 7 })],
  }),
);

// Article thumbnails etc. change rarely once published.
registerRoute(
  ({ request }) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'trendsignal-images',
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 })],
  }),
);

self.addEventListener('install', () => {
  void self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

async function getLastSeenGeneratedAt(): Promise<string | null> {
  const cache = await caches.open(META_CACHE);
  const res = await cache.match(LAST_SEEN_KEY);
  return res ? await res.text() : null;
}

async function setLastSeenGeneratedAt(value: string): Promise<void> {
  const cache = await caches.open(META_CACHE);
  await cache.put(LAST_SEEN_KEY, new Response(value));
}

async function hasVisibleClient(): Promise<boolean> {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return clients.some(
    (client) => 'visibilityState' in client && client.visibilityState === 'visible',
  );
}

/**
 * Compares the published data manifest's `generatedAt` against the last value this
 * install has seen. A change means the collection pipeline published a new batch of
 * articles/trends since the last check, so it's the closest static-site proxy for
 * "an article update happened".
 */
async function checkForNewArticles(): Promise<void> {
  try {
    const response = await fetch('./data/manifest.json', { cache: 'no-store' });
    if (!response.ok) return;

    const manifest = (await response.json()) as { generatedAt?: string; articleCount?: number };
    if (!manifest.generatedAt) return;

    const lastSeen = await getLastSeenGeneratedAt();
    await setLastSeenGeneratedAt(manifest.generatedAt);

    if (lastSeen === null || lastSeen === manifest.generatedAt) return;
    if (await hasVisibleClient()) return;

    await self.registration.showNotification('TrendSignal', {
      body: 'New articles have been published.',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: NOTIFICATION_TAG,
      data: { url: self.registration.scope },
    });
  } catch {
    // Offline or the fetch failed for another reason — the next check will retry.
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'TRENDSIGNAL_CHECK_FOR_UPDATES') {
    event.waitUntil(checkForNewArticles());
  }
});

// Chromium-based browsers only (installed PWA + site engagement heuristics). No-op
// elsewhere, including iOS Safari — the page-triggered check on open/foreground is
// what covers those browsers.
self.addEventListener('periodicsync', (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(checkForNewArticles());
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data as { url?: string } | undefined)?.url;
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = clients[0];
      if (existing) {
        await existing.focus();
        return;
      }
      if (targetUrl) await self.clients.openWindow(targetUrl);
    })(),
  );
});

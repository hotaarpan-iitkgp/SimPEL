/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare const self: ServiceWorkerGlobalScope;

const CACHE_VERSION = 'v3';
const STATIC_CACHE = `simpel-static-${CACHE_VERSION}`;
const API_OFFLINE_CACHE = `simpel-api-${CACHE_VERSION}`;

// Take control immediately on install
self.skipWaiting();
clientsClaim();

// ─── Precache all Vite build assets (injected by vite-plugin-pwa) ─────────────
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

// ─── Cache large static libs (plotly, html2canvas, gifshot) ──────────────────
registerRoute(
  ({ url }) =>
    url.pathname.endsWith('plotly.min.js') ||
    url.pathname.endsWith('html2canvas.min.js') ||
    url.pathname.endsWith('gifshot.min.js'),
  new CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 }), // 30 days
    ],
  })
);

// ─── Cache icons and manifest ─────────────────────────────────────────────────
registerRoute(
  ({ url }) =>
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('manifest.json'),
  new CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

// ─── Navigation requests: Network-first with HTML fallback ───────────────────
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'simpel-pages',
      plugins: [new CacheableResponsePlugin({ statuses: [200] })],
      networkTimeoutSeconds: 3,
    })
  )
);

// ─── API: POST /api/simulate ──────────────────────────────────────────────────
// When ONLINE  → pass through to Express server on Render
// When OFFLINE → return a 503 so App.tsx triggers its built-in TS solver fallback
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Only intercept our simulation API endpoint
  if (url.pathname !== '/api/simulate' || event.request.method !== 'POST') return;

  event.respondWith(
    (async () => {
      // If online, try the real server first
      if (navigator.onLine) {
        try {
          const response = await fetch(event.request.clone(), { signal: AbortSignal.timeout(25000) });
          if (response.ok) return response;
        } catch {
          // Fall through to offline handling
        }
      }

      // Offline: return a structured 503 response
      // The App.tsx catch block at line ~530 will catch this and switch to the
      // in-browser TypeScript CircuitSimulator automatically.
      return new Response(
        JSON.stringify({
          error: 'offline',
          message: 'Running simulation locally in browser (offline mode)',
        }),
        {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    })()
  );
});

// ─── POST /api/pause and /api/cancel: no-op when offline ─────────────────────
self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);
  if (
    (url.pathname === '/api/pause' || url.pathname === '/api/cancel') &&
    event.request.method === 'POST' &&
    !navigator.onLine
  ) {
    event.respondWith(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  }
});

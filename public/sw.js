/* ChantierLink — service worker (hand-written, no build step).
 * - Worker pages (/w…) : network first, cached copy when offline (the day is pre-cached at opening).
 * - Static assets (/_next/static, icons) : cache first.
 * - API and uploads are never cached : the offline queue lives in IndexedDB (page side).
 * - Background Sync / push notifications.
 */
const VERSION = "v1";
const SHELL_CACHE = `cl-shell-${VERSION}`;
const PAGES_CACHE = `cl-pages-${VERSION}`;
const STATIC_CACHE = `cl-static-${VERSION}`;
const OFFLINE_URL = "/hors-ligne";
const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith("cl-") && !k.endsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isWorkerPage(url) {
  return url.pathname === "/w" || url.pathname.startsWith("/w/");
}

async function cachePage(request, response) {
  if (!response || !response.ok || response.redirected) return;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("text/html")) return;
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(new Request(new URL(request.url).pathname + new URL(request.url).search), response);
}

async function networkFirstPage(request) {
  try {
    const response = await fetch(request);
    await cachePage(request, response.clone());
    return response;
  } catch {
    const url = new URL(request.url);
    const cached =
      (await caches.match(url.pathname + url.search, { ignoreVary: true })) ||
      (await caches.match(url.pathname, { ignoreSearch: true, ignoreVary: true }));
    if (cached) return cached;
    if (isWorkerPage(url)) {
      const home = await caches.match("/w", { ignoreVary: true });
      if (home) return home;
    }
    return (await caches.match(OFFLINE_URL)) || new Response("Hors connexion", { status: 503 });
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate") {
    if (isWorkerPage(url)) {
      event.respondWith(networkFirstPage(request));
    } else {
      event.respondWith(
        fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || new Response("Hors connexion", { status: 503 })),
      );
    }
  }
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "cache-urls" && Array.isArray(data.urls)) {
    event.waitUntil(
      Promise.all(
        data.urls
          .filter((u) => typeof u === "string" && u.startsWith("/w"))
          .map((u) =>
            fetch(u, { credentials: "same-origin" })
              .then((res) => cachePage(new Request(u), res))
              .catch(() => {}),
          ),
      ),
    );
  }
});

// Background Sync: ask the open pages to flush the offline queue.
self.addEventListener("sync", (event) => {
  if (event.tag === "cl-sync") {
    event.waitUntil(
      self.clients.matchAll({ type: "window" }).then((clients) => clients.forEach((c) => c.postMessage({ type: "flush" }))),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = { title: "ChantierLink", body: "", url: "/" };
  try {
    payload = { ...payload, ...event.data.json() };
  } catch {
    // ignore malformed payloads
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: payload.url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (new URL(client.url).pathname === target && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

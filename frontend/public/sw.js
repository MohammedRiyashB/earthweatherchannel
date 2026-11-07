/* EARTH WEATHER service worker: notification support + safe static asset caching. */
const CACHE_PREFIX = "earth-weather-static-";
const CACHE_VERSION = "v3";
const STATIC_CACHE = CACHE_PREFIX + CACHE_VERSION;
const APP_SHELL = ["/", "/index.html", "/manifest.webmanifest", "/favicon.svg", "/earth-weather-logo-v2.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await Promise.all(APP_SHELL.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok && response.type === "basic") await cache.put(url, response);
      } catch {
        // Offline or transient network failure: install can still complete.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith(CACHE_PREFIX) && name !== STATIC_CACHE).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache live weather, authentication, location, or other API responses.
  if (url.pathname.startsWith("/api/") || url.pathname.includes("/__/")) return;

  // Hashed Vite bundles are immutable build assets: cache-first is safe.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    })());
    return;
  }

  // App navigation is network-first so deployments and weather UI updates appear promptly.
  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(STATIC_CACHE);
          await cache.put("/index.html", response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(STATIC_CACHE);
        return (await cache.match("/index.html")) || (await cache.match("/")) || Response.error();
      }
    })());
    return;
  }

  // Cache small same-origin public shell assets; revalidate unknown files normally.
  if (APP_SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok && response.type === "basic") await cache.put(request, response.clone());
      return response;
    })());
  }
});

/* Push notifications */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "A new weather update is available." };
  }
  const title = payload.title || "EARTH WEATHER";
  const options = {
    body: payload.body || "Your local weather has been updated.",
    icon: payload.icon || "/web-logo.png",
    badge: payload.badge || "/favicon.svg",
    tag: payload.tag || "earth-weather-current",
    renotify: false,
    data: { url: payload.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

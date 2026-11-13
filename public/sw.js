const CACHE = "routehours-shell-v11";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192-v3.png", "/icon-512-v3.png", "/icon-maskable-v3.png", "/apple-icon-v3.png"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("message", event => {
  if (event.data?.type !== "PRECACHE" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter(url => {
    try { const parsed = new URL(url, self.location.origin); return parsed.origin === self.location.origin && !parsed.pathname.startsWith("/api/"); }
    catch { return false; }
  });
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(urls)).catch(() => {}));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).then(response => {
      // Only the app itself is the offline shell. Other pages (like /lab) must never replace it.
      if (response.ok && url.pathname === "/") {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then(cache => cache.put("/", copy)));
      }
      return response;
    }).catch(async () => await caches.match("/") || Response.error()));
    return;
  }
  event.respondWith(caches.match(request).then(hit => hit || fetch(request).then(response => {
    if (response.ok && (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icon-") || url.pathname === "/manifest.webmanifest")) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, copy)));
    }
    return response;
  })));
});

// Shift reminders. The server sends { title, body, tag, action }; the buttons act without opening a menu.
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "RouteHours", body: event.data ? event.data.text() : "" }; }
  const actions = data.action === "finish"
    ? [{ action: "finish", title: "Finish shift" }, { action: "still", title: "Still driving" }]
    : data.action === "start" ? [{ action: "start", title: "Start shift" }, { action: "skip", title: "Not today" }] : [];
  event.waitUntil(self.registration.showNotification(data.title || "RouteHours", {
    body: data.body || "", tag: data.tag || "routehours", renotify: true, icon: "/icon-192-v3.png", badge: "/icon-192-v3.png",
    actions, data: { action: data.action || "open" },
  }));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const chosen = event.action || "open";
  if (chosen === "skip") return;
  const target = new URL(`/lab?do=${encodeURIComponent(chosen === "open" ? "open" : chosen)}`, self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    const open = list.find(client => new URL(client.url).pathname.startsWith("/lab"));
    if (open) { open.postMessage({ type: "REMINDER_ACTION", action: chosen }); return open.focus(); }
    return self.clients.openWindow(target);
  }));
});

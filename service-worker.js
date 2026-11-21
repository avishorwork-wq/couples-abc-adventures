const CACHE = "cba-static-v2";
const FILES = ["./", "./index.html", "./manifest.json", "./qr.js", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(FILES.map(url => new Request(url, { cache: "reload" })))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith("cba-") && key !== CACHE).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const u = new URL(event.request.url);
  // never cache API/media calls
  if (u.origin !== location.origin) return;
  // network-first for pages so app updates land immediately; cache fallback for offline
  if (event.request.mode === "navigate" || u.pathname.endsWith("/index.html") || u.pathname.endsWith("/")) {
    event.respondWith(
      fetch(event.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
        return res;
      }).catch(() => caches.match(event.request).then(c => c || caches.match("./index.html")))
    );
    return;
  }
  // cache-first for static assets
  event.respondWith(
    caches.open(CACHE).then(cache => cache.match(event.request)).then(cached => cached || fetch(event.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(event.request, copy));
      return res;
    }))
  );
});

self.addEventListener("push", event => {
  let d = {};
  try { d = event.data.json(); } catch (e) {}
  const title = d.title || "Couples ABC Adventures 💑";
  const body = d.body || "Something new!";
  const letter = d.l || "";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
      cs.forEach(c => c.postMessage({ t: "sync", body: body, l: letter }));
      return self.registration.showNotification(title, {
        body: body,
        icon: "./icon-192.png",
        badge: "./icon-192.png",
        tag: "cba-update",
        renotify: true,
        data: { url: letter ? "./#d=" + letter : "./" }
      });
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "./";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(cs => {
      for (const c of cs) { if ("focus" in c) { c.navigate(url).catch(() => {}); return c.focus(); } }
      return clients.openWindow(url);
    })
  );
});

/* Cache local de imagens públicas. Nenhuma requisição de API passa pelo worker. */
const prefix = "minhaestante-capas-v1-";
const currentCache = () => prefix + Math.floor(Date.now() / 86_400_000);
const maxEntries = 24;
let writes = Promise.resolve();
const pending = new Map();

function isPublicCover(url) {
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  if (url.hostname === "covers.openlibrary.org")
    return /^\/b\/(?:id|olid|isbn)\/[a-z0-9-]{1,36}-[SML]\.jpg$/i.test(url.pathname) &&
      ["", "?default=false"].includes(url.search);
  if (url.hostname === "coverartarchive.org")
    return /^\/release(?:-group)?\/[0-9a-f-]{36}\/front-(?:250|500)$/i.test(url.pathname) && !url.search;
  return /^is\d+-ssl\.mzstatic\.com$/.test(url.hostname) &&
    /^\/image\/thumb\/.+\/\d+x\d+bb\.jpg$/.test(url.pathname) && !url.search;
}

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

async function cover(request) {
  const cacheName = currentCache();
  const cache = await caches.open(cacheName).catch(() => null);
  const stored = await cache?.match(request.url).catch(() => null);
  if (stored) return stored;
  const response = await fetch(new Request(request, { credentials: "omit" }));
  if (cache && (response.type === "opaque" ||
      (response.ok && response.headers.get("Content-Type")?.startsWith("image/")))) {
    const copy = response.clone();
    writes = writes.catch(() => {}).then(async () => {
      const keys = await cache.keys();
      await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries + 1)).map(key => cache.delete(key)));
      await cache.put(request.url, copy);
      const names = await caches.keys();
      await Promise.all(names.filter(name => name.startsWith(prefix) && name !== cacheName)
        .map(name => caches.delete(name)));
    });
    await writes.catch(() => {});
  }
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || request.destination !== "image" ||
      request.mode !== "no-cors" || !isPublicCover(new URL(request.url))) return;
  if (!pending.has(request.url)) {
    if (pending.size >= 12) return;
    const task = cover(request).finally(() => pending.delete(request.url));
    pending.set(request.url, task);
  }
  event.respondWith(pending.get(request.url).then(response => response.clone()));
});

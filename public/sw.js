// v2: solo se guardan en caché los archivos con hash de producción (/assets/).
// La versión anterior también guardaba módulos de desarrollo (/src/…, /node_modules/.vite/…),
// lo que mezclaba versiones de React tras una recarga. Al activarse, se borran esas cachés.
const SHELL_CACHE = "aulanexo-shell-v3";
const ASSET_CACHE = "aulanexo-assets-v3";
const SHELL_URLS = ["/manifest.webmanifest", "/sirae-mark.webp", "/sirae-logo.webp", "/edutlan-logo.webp"];
const isDevHost = ["localhost", "127.0.0.1", "[::1]"].includes(self.location.hostname);

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("aulanexo-") && key !== SHELL_CACHE && key !== ASSET_CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    if (isDevHost) return;
    event.respondWith(fetch(request).then((response) => {
      // Se clona antes de devolver la respuesta: después su contenido ya fue leído.
      if (response.ok && response.type === "basic") { const copy = response.clone(); void caches.open(SHELL_CACHE).then((cache) => cache.put("/", copy)); }
      return response;
    }).catch(async () => (await caches.match("/")) || Response.error()));
    return;
  }
  // Solo archivos inmutables de producción (su nombre cambia con cada build).
  if (!url.pathname.startsWith("/assets/") || url.search) return;
  event.respondWith(caches.open(ASSET_CACHE).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (response.ok && response.type === "basic") await cache.put(request, response.clone());
    return response;
  }));
});

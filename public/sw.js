const STATIC_CACHE = "ferreteria-guemes-static-v2";
const OFFLINE_URL = "/offline";
const SAFE_STATIC_PATHS = [
  "/icons/",
  "/brand/",
  "/_next/static/",
];
const SAFE_STATIC_EXTENSIONS = [
  ".css",
  ".js",
  ".woff",
  ".woff2",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".webp",
  ".ico",
];

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Sin conexion</title>
  </head>
  <body>
    <main style="font-family: system-ui, sans-serif; margin: 2rem; line-height: 1.5;">
      <h1>Sin conexion</h1>
      <p>No hay internet. Podes volver a intentar cuando se restablezca la conexion.</p>
      <p><a href="/inicio">Reintentar</a></p>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .catch(() => null)
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== STATIC_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isSupabaseRequest(url) {
  return url.hostname.includes("supabase.co") || url.hostname.includes("supabase.in");
}

function isSafeStaticRequest(request, url) {
  if (request.method !== "GET" || url.origin !== self.location.origin) {
    return false;
  }

  return (
    SAFE_STATIC_PATHS.some((path) => url.pathname.startsWith(path)) ||
    SAFE_STATIC_EXTENSIONS.some((extension) => url.pathname.endsWith(extension))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (
    request.method !== "GET" ||
    isSupabaseRequest(url) ||
    url.pathname.startsWith("/api") ||
    url.pathname.startsWith("/auth")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cachedOfflinePage = await caches.match(OFFLINE_URL);

        return (
          cachedOfflinePage ??
          new Response(OFFLINE_FALLBACK_HTML, {
            headers: { "Content-Type": "text/html; charset=utf-8" },
            status: 503,
            statusText: "Service Unavailable",
          })
        );
      })
    );
    return;
  }

  if (!isSafeStaticRequest(request, url)) {
    return;
  }

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);

      if (cached) {
        return cached;
      }

      const response = await fetch(request);

      if (response.ok && response.type === "basic") {
        cache.put(request, response.clone());
      }

      return response;
    })
  );
});

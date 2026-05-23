const STATIC_CACHE = "ferreteria-guemes-static-v1";
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

self.addEventListener("install", () => {
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
    event.respondWith(fetch(request));
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

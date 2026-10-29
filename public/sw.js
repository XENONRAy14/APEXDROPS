// v5.3 — passe toujours par le réseau pour ne jamais servir une ancienne UI
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

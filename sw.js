// Guarda la app en el celular para que abra rápido y funcione como aplicación instalada.
// Archivos propios: primero internet (para tener siempre lo último) y si no hay, lo guardado.
const CACHE = "luka-v9";
const ARCHIVOS = ["./", "index.html", "estilos.css", "app.js", "manifest.json", "iconos/icono-192.png", "iconos/icono-512.png", "iconos/favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return; // Supabase y fuentes van directo
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })
      .then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("index.html")))
  );
});

// Avisos que manda Luka (función luka-avisos)
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch { d = { titulo: "Luka", cuerpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titulo || "Luka", {
    body: d.cuerpo || "",
    tag: d.etiqueta || "luka",
    icon: "iconos/icono-192.png",
    badge: "iconos/favicon-64.png",
    lang: "es-CO",
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const abierta = ws.find((w) => w.url.includes("/luka/"));
    return abierta ? abierta.focus() : clients.openWindow("./");
  }));
});

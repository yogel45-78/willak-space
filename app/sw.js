/* ==========================================================================
   sw.js — modo sin internet (especificación, sección 11).
   Guarda la app en el equipo para que la ficha, el plan y el formulario de la
   familia abran sin señal. Los datos de las parcelas viven en el almacenamiento
   del navegador; lo que necesita internet (analizar una parcela) queda en cola
   y se lanza al reconectar.
   · Archivos propios: primero la red; sin señal, la copia guardada en el equipo.
   · Servicios de datos (NASA, SoilGrids, mapas): siempre por la red, nunca se guardan.
   Al cambiar la app, sube el número de VERSION para renovar la copia.
   ========================================================================== */
const VERSION = 'willak-app-v11';
const BASE = [
  './', 'index.html', 'pruebas.html', 'config.js', 'tokens.css', 'tema.css', 'estilos.css', 'manifest.webmanifest',
  'js/estado.js', 'js/calculo.js', 'js/verdor.js', 'js/motor.js', 'js/demo.js', 'js/mapa.js', 'js/datos.js', 'js/servidor.js', 'js/ambiente.js',
  'js/grafico.js', 'js/informe.js', 'js/asesor.js', 'js/parcela.js', 'js/paneles.js', 'js/app.js', 'js/pruebas.js',
  'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css',
  'assets/simbolo.png', 'assets/logo.png', 'assets/mascota/astronauta-saluda.webp', 'assets/mascota/campesino-yuca.webp',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.allSettled(BASE.map((u) => c.add(new Request(u, { cache: 'reload' }))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Primero la red (para tener siempre la versión nueva); si no hay señal o tarda más de 3 s, la copia guardada.
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return; // datos y mapas: directo a la red
  if (url.pathname.startsWith('/api/')) return;                            // servidor de Willak: nunca se guarda
  e.respondWith(caches.open(VERSION).then(async (cache) => {
    const guardado = await cache.match(req, { ignoreSearch: true });
    const red = fetch(req, { cache: 'no-cache' }).then((r) => { if (r && r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    const espera = new Promise((ok) => setTimeout(() => ok(null), guardado ? 3000 : 30000));
    return (await Promise.race([red, espera])) || guardado || (await red)
      || new Response('Sin internet y sin copia guardada de este archivo.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }));
});

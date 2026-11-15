/* ==========================================================================
   servidor-local.mjs — corre Willak Space en tu equipo: el sitio (carpeta sitio/)
   y las funciones del servidor (netlify/functions), sin instalar nada más que Node.

     node servidor-local.mjs               usa tu cuenta Earthdata (variables de entorno
                                           EARTHDATA_USERNAME y EARTHDATA_PASSWORD)
     node servidor-local.mjs --simulada    usa una NASA simulada con datos ilustrativos
                                           (para probar sin cuenta y sin internet)
     node servidor-local.mjs --puerto 8080

   En Netlify no hace falta este archivo: allí las funciones se publican solas.
   ========================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const SITIO = path.join(RAIZ, 'sitio'), FUNCIONES = path.join(RAIZ, 'netlify', 'functions');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

export async function iniciar({ puerto = 5181, simulada = false, silencio = false } = {}) {
  let nasa = null;
  if (simulada) { // NASA simulada en el puerto siguiente; las funciones apuntan a ella
    const { iniciarNasaSimulada } = await import('./pruebas/nasa-simulada.mjs');
    nasa = await iniciarNasaSimulada(puerto + 1);
    Object.assign(process.env, { APPEEARS_URL: nasa.url + '/api', GIOVANNI_URL: nasa.url, EDL_URL: nasa.url, EARTHDATA_USERNAME: 'prueba', EARTHDATA_PASSWORD: 'prueba', WILLAK_SONDEO_S: process.env.WILLAK_SONDEO_S || '5' });
  }
  // En Netlify existe el objeto global Netlify; aquí se imita lo que usan las funciones
  globalThis.Netlify = { env: { get: (k) => process.env[k] } };

  // Carga cada función y su ruta (config.path)
  const rutas = [];
  for (const f of fs.readdirSync(FUNCIONES).filter((x) => x.endsWith('.mjs'))) {
    const m = await import(pathToFileURL(path.join(FUNCIONES, f)).href);
    rutas.push({ ruta: m.config.path, metodo: m.config.method, fn: m.default, nombre: f });
  }

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + req.headers.host);
    const r = rutas.find((x) => x.ruta === url.pathname);
    if (r) { // función del servidor
      if (r.metodo && r.metodo !== req.method) { res.writeHead(405).end(); return; }
      const trozos = []; for await (const t of req) trozos.push(t);
      const pedido = new Request(url.href, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(trozos) });
      try {
        const resp = await r.fn(pedido, {});
        res.writeHead(resp.status, Object.fromEntries(resp.headers)); res.end(Buffer.from(await resp.arrayBuffer()));
      } catch (e) { res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Error en la función ' + r.nombre })); }
      return;
    }
    // archivo del sitio
    let ruta = decodeURIComponent(url.pathname); if (ruta.endsWith('/')) ruta += 'index.html';
    const archivo = path.normalize(path.join(SITIO, ruta));
    if (!archivo.startsWith(SITIO) || !fs.existsSync(archivo) || !fs.statSync(archivo).isFile()) { res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No encontrado'); return; }
    res.writeHead(200, { 'content-type': TIPOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream', 'cache-control': 'no-cache' });
    fs.createReadStream(archivo).pipe(res);
  });
  await new Promise((ok) => servidor.listen(puerto, ok));
  if (!silencio) {
    console.log(`Willak Space en http://localhost:${puerto}  (app: http://localhost:${puerto}/app/)`);
    console.log(simulada ? 'Modo SIMULADO: la NASA es de mentira y los datos son ilustrativos.' : (process.env.EARTHDATA_USERNAME && process.env.EARTHDATA_PASSWORD ? 'Cuenta Earthdata: configurada.' : 'Cuenta Earthdata: SIN configurar (la app usará los respaldos). Define EARTHDATA_USERNAME y EARTHDATA_PASSWORD.'));
  }
  return { url: 'http://localhost:' + puerto, cerrar: () => new Promise((ok) => { servidor.close(ok); servidor.closeAllConnections(); if (nasa) nasa.cerrar(); }) };
}

// Si se ejecuta directamente (no importado por las pruebas)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--puerto');
  iniciar({ puerto: i >= 0 ? Number(a[i + 1]) : Number(process.env.PORT) || 5181, simulada: a.includes('--simulada') });
}

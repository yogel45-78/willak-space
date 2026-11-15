/* GET /api/lluvia?lat=<lat>&lng=<lng> — lluvia diaria IMERG de la celda que contiene el punto
   (especificación 4.2). Fuente: servicio de series de tiempo de GES DISC (Giovanni), con
   token de Earthdata Login.
     · histórico: GPM_3IMERGDF v07 (Final, diario, 0,1°) desde 2001
     · recientes: GPM_3IMERGDL (Late) para los días que el Final aún no publica
   Devuelve { inicio, lluvia: [décimas de mm por día | null], final_hasta, hasta }.
   Si falla, la app usa el respaldo de la especificación (PRECTOTCORR de NASA POWER). */
import { json, manejar, Fallo, tokenEdl, URLS, env, PRODUCTOS } from '../lib/comun.mjs';
import { leerSerie } from '../lib/csv.mjs';
import { regionDe } from '../lib/modis.mjs';

const MS = 864e5, iso = (d) => new Date(d * MS).toISOString().slice(0, 10);

async function serie(token, dato, lat, lng, desde, hasta) {
  const u = new URL(URLS().giovanni + '/timeseries');
  u.searchParams.set('data', dato);
  u.searchParams.set('location', `[${lat},${lng}]`);
  u.searchParams.set('time', `${desde}T00:00:00/${hasta}T23:59:59`);
  const r = await fetch(u, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(50000) });
  if (r.status === 401 || r.status === 403) throw new Fallo(502, 'GES DISC no aceptó el token de Earthdata del servidor.');
  if (!r.ok) throw new Fallo(502, 'GES DISC no entregó la lluvia (' + r.status + ').');
  return leerSerie(await r.text());
}

export default manejar(async (req) => {
  const q = new URL(req.url).searchParams, lat = Number(q.get('lat')), lng = Number(q.get('lng')), region = regionDe(env('WILLAK_REGION'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Fallo(400, 'Faltan la latitud y la longitud.');
  if (lat < region[0] || lat > region[2] || lng < region[1] || lng > region[3]) throw new Fallo(400, 'El punto queda fuera de la zona que atiende este servidor.');
  const token = await tokenEdl();
  const d0 = Math.round(Date.parse(PRODUCTOS.inicio + 'T00:00:00Z') / MS), hoy = Math.floor(Date.now() / MS);
  const la = lat.toFixed(4), lo = lng.toFixed(4);

  // El histórico se pide en tramos de 10 años, en paralelo, para que cada respuesta llegue rápido
  const tramos = [];
  for (let a = d0; a <= hoy; ) { const f = new Date(a * MS), b = Math.min(hoy, Math.round(Date.UTC(f.getUTCFullYear() + 10, 0, 0) / MS)); tramos.push([a, b]); a = b + 1; }
  const partes = await Promise.all(tramos.map(([a, b]) => serie(token, PRODUCTOS.imerg_final, la, lo, iso(a), iso(b))));
  const lluvia = new Array(hoy - d0 + 1).fill(null);
  let ultimoFinal = -1;
  partes.flat().forEach((p) => { const i = p.dia - d0; if (i >= 0 && i < lluvia.length && p.valor != null) { lluvia[i] = Math.round(p.valor * 10); if (i > ultimoFinal) ultimoFinal = i; } });
  if (ultimoFinal < 365) throw new Fallo(502, 'GES DISC devolvió una serie de lluvia vacía para este punto.');

  // Los últimos meses todavía no están en el Final: se completan con el Late (si falla, quedan sin dato)
  let late = false;
  if (ultimoFinal < hoy - d0) {
    try {
      const rec = await serie(token, PRODUCTOS.imerg_late, la, lo, iso(d0 + ultimoFinal + 1), iso(hoy));
      rec.forEach((p) => { const i = p.dia - d0; if (i > ultimoFinal && i < lluvia.length && p.valor != null) { lluvia[i] = Math.round(p.valor * 10); late = true; } });
    } catch (e) { /* sin datos recientes */ }
  }
  while (lluvia.length && lluvia[lluvia.length - 1] == null) lluvia.pop();
  return json({ inicio: PRODUCTOS.inicio, e: 10, lluvia, final_hasta: iso(d0 + ultimoFinal), hasta: iso(d0 + lluvia.length - 1),
    producto: 'GPM_3IMERGDF.07' + (late ? ' + GPM_3IMERGDL (recientes)' : ''), celda: '0,1°' });
});

export const config = { path: '/api/lluvia', method: 'GET' };

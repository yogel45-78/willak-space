/* ==========================================================================
   nasa-simulada.mjs — una NASA de mentira para probar el servidor sin cuenta
   Earthdata y sin internet. Imita lo justo de tres servicios:
     · AppEEARS ............ /api/login, /api/task, /api/status, /api/bundle (+ enlace tipo S3)
     · Earthdata Login ..... /api/users/find_or_create_token
     · GES DISC (Giovanni) . /timeseries
   Responde con los DATOS ILUSTRATIVOS de la parcela Guaba CEIPA (demo.js), en el
   mismo formato de los CSV reales, para comprobar el camino completo.
   Cuenta de prueba: usuario "prueba", clave "prueba".
   ========================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sitio', 'app');
function demo() { // carga los mismos archivos que usa la app en el navegador
  if (!globalThis.Chakra || !globalThis.Chakra.demo) {
    globalThis.window = globalThis;
    for (const f of ['config.js', 'js/calculo.js', 'js/verdor.js', 'js/motor.js', 'js/demo.js']) vm.runInThisContext(fs.readFileSync(path.join(APP, f), 'utf8'), { filename: f });
  }
  return globalThis.Chakra.demo;
}
const BASICA = 'Basic ' + Buffer.from('prueba:prueba').toString('base64');
const TOKEN_AP = 'token-appeears-simulado', TOKEN_EDL = 'token-edl-simulado';

function csvVerdor(tarea, sat) {
  const D = demo(), prod = sat === 'terra' ? 'MOD13Q1_061' : 'MYD13Q1_061', pre = prod + '__250m_16_days_';
  const cab = ['Category', 'ID', 'Latitude', 'Longitude', 'Date', 'MODIS_Tile', prod + '_Line_Y_250m', prod + '_Sample_X_250m', pre + 'EVI'].concat(sat === 'terra' ? [pre + 'NDVI'] : [], [pre + 'VI_Quality', pre + 'pixel_reliability', pre + 'VI_Quality_bitmask', pre + 'VI_Quality_MODLAND_Description']);
  const series = { parcela: D.compuestos('parcela'), bosque: D.compuestos('bosque') }, filas = [cab.join(',')];
  tarea.coords.forEach((c, k) => {
    const n = Number(String(c.id).replace(/\D/g, '')) || 1, cat = c.category;
    // candidatos: uno de cada cuatro es inestable y otro es un potrero estable (los dos deben descartarse)
    const tipo = cat === 'candidato' ? (n % 4 === 0 ? 'inestable' : n % 4 === 1 ? 'potrero' : 'bosque') : cat;
    const base = series[tipo === 'parcela' ? 'parcela' : 'bosque'];
    base.filter((x) => x.satelite === sat && (sat === 'terra' || x.fecha >= '2002-07-04')).forEach((x, i) => {
      const px = x.pixeles[(n - 1) % 2], anio = +x.fecha.slice(0, 4);
      let evi = px.evi_raw, rel = px.fiabilidad;
      if (tipo === 'inestable') evi = (anio % 2 ? 3000 : 5200) + (px.evi_raw - 5400);
      if (tipo === 'potrero') evi = 3000 + (px.evi_raw - 5400);
      if ((i + k) % 97 === 96) { evi = -3000; rel = -1; } // algún relleno, como en los datos reales
      const v = [cat, c.id, c.latitude, c.longitude, x.fecha, 'h10v09', 1000 + n, 2000 + n, (evi / 10000).toFixed(4)].concat(sat === 'terra' ? [((evi === -3000 ? -3000 : evi + 2600) / 10000).toFixed(4)] : [],
        [px.vi_quality, rel, '0b' + px.vi_quality.toString(2).padStart(16, '0'), '"VI produced, good quality"']);
      filas.push(v.join(','));
    });
  });
  return filas.join('\n') + '\n';
}
function csvDem(tarea) { // ladera pareja del 3 % hacia el este
  const D = demo(), filas = ['Category,ID,Latitude,Longitude,Date,SRTMGL1_NC_003_SRTMGL1_DEM'];
  tarea.coords.forEach((c) => { const este = (c.longitude - D.LNG) * 111320 * Math.cos((c.latitude * Math.PI) / 180); filas.push(['dem', c.id, c.latitude, c.longitude, '2000-02-11', (500 + 0.03 * este).toFixed(2)].join(',')); });
  return filas.join('\n') + '\n';
}
function csvLluvia(dato, desde, hasta) {
  const D = demo(), C = globalThis.Chakra.calc, d = D.diario(), d0 = C.dia(d.inicio);
  const finFinal = C.dia('2026-07-31'), late = /IMERGDL/.test(dato);
  const cab = ['user', 'title', 'param_name', 'unit', 'begin_time', 'end_time', 'lat', 'lon', 'grid_lat', 'grid_lon', 'elevation', 'time_interval', 'fill_value'].map((k) => k + ',' + (k === 'param_name' ? 'precipitation' : k === 'unit' ? 'mm/day' : k === 'fill_value' ? '-9999.9' : 'x'));
  const filas = cab.concat(['Timestamp (UTC),Data']);
  for (let x = Math.max(C.dia(desde), d0); x <= Math.min(C.dia(hasta), d0 + d.lluvia.length - 1); x++) {
    if (!late && x > finFinal) break;              // el Final llega solo hasta julio
    filas.push(C.iso(x) + ' 00:00:00,' + (x % 500 === 0 ? '-9999.9' : d.lluvia[x - d0])); // algún día sin dato
  }
  return filas.join('\n') + '\n';
}

export async function iniciarNasaSimulada(puerto) {
  const tareas = new Map(), registro = [];
  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost'), ruta = url.pathname, aut = req.headers.authorization || '';
    const json = (o, s = 200, h = {}) => { res.writeHead(s, Object.assign({ 'content-type': 'application/json' }, h)); res.end(JSON.stringify(o)); };
    const texto = (t, s = 200) => { res.writeHead(s, { 'content-type': 'text/csv' }); res.end(t); };
    const cuerpo = async () => { const t = []; for await (const x of req) t.push(x); return Buffer.concat(t).toString('utf8'); };
    registro.push(req.method + ' ' + ruta);

    // --- Earthdata Login ---
    if (ruta === '/api/users/find_or_create_token') return aut === BASICA ? json({ access_token: TOKEN_EDL, token_type: 'Bearer', expiration_date: '12/31/2026' }) : json({ error: 'invalid_credentials' }, 401);
    // --- GES DISC ---
    if (ruta === '/timeseries') {
      if (aut !== 'Bearer ' + TOKEN_EDL) return json({ code: '401', message: 'Bad or missing token' }, 403);
      const [desde, hasta] = url.searchParams.get('time').split('/').map((t) => t.slice(0, 10));
      return texto(csvLluvia(url.searchParams.get('data'), desde, hasta));
    }
    // --- enlace temporal tipo S3: no acepta la cabecera Authorization ---
    let m = ruta.match(/^\/s3\/([^/]+)\/([^/]+)$/);
    if (m) {
      if (aut) return texto('<Error><Code>InvalidArgument</Code><Message>Only one auth mechanism allowed</Message></Error>', 400);
      const t = tareas.get(m[1]); if (!t) return texto('', 404);
      return texto(m[2] === 'f-mod' ? csvVerdor(t, 'terra') : m[2] === 'f-myd' ? csvVerdor(t, 'aqua') : csvDem(t));
    }
    // --- AppEEARS ---
    if (ruta === '/api/login') return aut === BASICA ? json({ token_type: 'Bearer', token: TOKEN_AP, expiration: '2026-12-31T00:00:00Z' }) : json({ message: 'The server could not verify that you are authorized' }, 401);
    if (ruta.startsWith('/api/') && aut !== 'Bearer ' + TOKEN_AP) return json({ message: 'You don\'t have the permission to access the requested resource.' }, 403);
    if (ruta === '/api/task' && req.method === 'POST') {
      let b; try { b = JSON.parse(await cuerpo()); } catch (e) { return json({ message: 'JSON inválido' }, 400); }
      const p = b.params || {};
      if (b.task_type !== 'point' || !Array.isArray(p.coordinates) || !p.coordinates.length || !Array.isArray(p.layers) || !p.layers.length || !Array.isArray(p.dates)) return json({ message: 'pedido mal formado' }, 400);
      const id = crypto.randomUUID();
      tareas.set(id, { tipo: p.layers.some((l) => /SRTM/.test(l.product)) ? 'dem' : 'verdor', coords: p.coordinates, capas: p.layers, fechas: p.dates, nombre: b.task_name, sondeos: 0 });
      return json({ task_id: id, status: 'pending' }, 202);
    }
    m = ruta.match(/^\/api\/(task|status|bundle)\/([^/]+)(?:\/([^/]+))?$/);
    if (m) {
      const t = tareas.get(m[2]); if (!t) return json({ message: 'Task not found' }, 404);
      const listoTras = t.tipo === 'dem' ? 1 : 3, estado = t.sondeos >= listoTras ? 'done' : t.sondeos >= 1 ? 'processing' : 'pending';
      if (m[1] === 'task') { t.sondeos++; return json({ task_id: m[2], task_name: t.nombre, task_type: 'point', status: estado }); }
      if (m[1] === 'status') return estado === 'done' ? json({ task_id: m[2], status: 'done' }, 303, { location: '/api/task/' + m[2] }) : json({ task_id: m[2], progress: { summary: Math.min(95, t.sondeos * 35), details: [] }, status_type: 'task' });
      if (estado !== 'done') return json({ message: 'Bundle not found' }, 404);
      if (!m[3]) return json({ task_id: m[2], bundle_type: 'point', files: t.tipo === 'dem'
        ? [{ file_id: 'f-dem', file_name: t.nombre + '-SRTMGL1-NC-003-results.csv', file_size: 5000, file_type: 'csv' }]
        : [{ file_id: 'f-mod', file_name: t.nombre + '-MOD13Q1-061-results.csv', file_size: 4e6, file_type: 'csv' }, { file_id: 'f-myd', file_name: t.nombre + '-MYD13Q1-061-results.csv', file_size: 4e6, file_type: 'csv' }, { file_id: 'f-txt', file_name: 'README.md', file_size: 100, file_type: 'txt' }] });
      res.writeHead(302, { location: `/s3/${m[2]}/${m[3]}?X-Amz-Signature=simulada` }); return res.end();
    }
    json({ message: 'no existe en la NASA simulada' }, 404);
  });
  await new Promise((ok) => servidor.listen(puerto, ok));
  return { url: 'http://localhost:' + puerto, tareas, registro, cerrar: () => { servidor.close(); servidor.closeAllConnections(); } };
}

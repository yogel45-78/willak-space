/* GET /api/verdor/datos?tarea=<id>&producto=MOD13Q1|MYD13Q1|SRTMGL1
   Recoge UN archivo de resultados de AppEEARS (un CSV por producto), lo lee y devuelve
   solo lo que la app necesita, en columnas compactas. Se pide un producto por llamada
   para no pasar del límite de tiempo ni de tamaño de la función.
     · MOD13Q1 / MYD13Q1 → { satelite, puntos: { P1: { cat, d, evi, ndvi, rel, q }, … } }
       evi y ndvi en enteros × 10 000 (relleno −3000); rel = pixel_reliability; q = VI_Quality
     · SRTMGL1 → { z: { D0_0: metros, … } } */
import { json, manejar, Fallo, appeears, descargar, esTarea, PRODUCTOS } from '../lib/comun.mjs';
import { leerVerdor, leerDem } from '../lib/csv.mjs';

const ARCHIVO = { MOD13Q1: /MOD13Q1[-_.]061.*results\.csv$/i, MYD13Q1: /MYD13Q1[-_.]061.*results\.csv$/i, SRTMGL1: /SRTMGL1[-_.]NC[-_.]003.*results\.csv$/i };

export default manejar(async (req) => {
  const q = new URL(req.url).searchParams, tarea = q.get('tarea'), producto = q.get('producto');
  if (!esTarea(tarea)) throw new Fallo(400, 'Identificador de trabajo no válido.');
  if (!ARCHIVO[producto]) throw new Fallo(400, 'Producto no reconocido.');

  const r = await appeears('/bundle/' + tarea);
  if (r.status === 404) throw new Fallo(404, 'AppEEARS todavía no tiene resultados de este trabajo.');
  if (!r.ok) throw new Fallo(502, 'AppEEARS no entregó la lista de archivos (' + r.status + ').');
  const archivos = (await r.json()).files || [];
  const f = archivos.find((x) => ARCHIVO[producto].test(x.file_name));
  if (!f) return json({ producto, vacio: true, nota: 'El trabajo no produjo datos de ' + producto + ' para estos puntos.' });
  if (f.file_size > 45e6) throw new Fallo(502, 'El archivo de resultados es demasiado grande para leerlo aquí.');

  const texto = await descargar(tarea, f.file_id);
  if (producto === 'SRTMGL1') return json({ producto, archivo: f.file_name, z: leerDem(texto) });
  const v = leerVerdor(texto, PRODUCTOS.inicio);
  return json({ producto, archivo: f.file_name, satelite: producto === 'MOD13Q1' ? 'terra' : 'aqua', inicio: PRODUCTOS.inicio, filas: v.filas, puntos: v.puntos });
});

export const config = { path: '/api/verdor/datos', method: 'GET' };

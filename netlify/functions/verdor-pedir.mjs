/* POST /api/verdor/pedir — lanza en AppEEARS los dos trabajos de una parcela:
     1) verdor: MOD13Q1 y MYD13Q1 (EVI, NDVI, pixel_reliability, VI_Quality) desde 2001,
        para los píxeles de la parcela y del bosque de referencia;
     2) elevación SRTM (30 m) alrededor de la parcela, para la pendiente de Horn.
   Los trabajos tardan minutos: aquí solo se piden. La app pregunta el avance con
   /api/verdor/estado y recoge el resultado con /api/verdor/datos.
   Cuerpo: { anillo: [[lat, lng], …], bosque?: [[lat, lng], …] }  (bosque = polígono BP1, si existe) */
import { json, manejar, Fallo, appeears, env, PRODUCTOS } from '../lib/comun.mjs';
import { pixelesDe, candidatosBosque, rejillaDem, validarAnillo, regionDe, centroide } from '../lib/modis.mjs';

const mmddaaaa = (d) => String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0') + '-' + d.getUTCFullYear();

async function crearTarea(nombre, capas, coordenadas, fechas) {
  const r = await appeears('/task', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task_type: 'point', task_name: nombre, params: { dates: fechas, layers: capas, coordinates: coordenadas } }),
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Fallo(429, 'AppEEARS pide ir más despacio. Vuelve a intentarlo en unos minutos.');
  if (!r.ok || !j.task_id) throw new Fallo(502, 'AppEEARS no aceptó el pedido' + (j.message ? ': ' + String(j.message).slice(0, 200) : ' (' + r.status + ').'));
  return j.task_id;
}

export default manejar(async (req) => {
  const texto = await req.text();
  if (texto.length > 40000) throw new Fallo(413, 'El pedido es demasiado grande.');
  let cuerpo; try { cuerpo = JSON.parse(texto); } catch (e) { throw new Fallo(400, 'El pedido no es un JSON válido.'); }
  const region = regionDe(env('WILLAK_REGION'));
  const mal = validarAnillo(cuerpo.anillo, region) || (cuerpo.bosque ? validarAnillo(cuerpo.bosque, region, 'El bosque de referencia') : '');
  if (mal) throw new Fallo(400, mal);

  // Píxeles de la parcela (con su fracción) y del bosque de referencia
  const parcela = pixelesDe(cuerpo.anillo).map((p, i) => Object.assign(p, { id: 'P' + (i + 1), cat: 'parcela' }));
  const bosque = cuerpo.bosque
    ? pixelesDe(cuerpo.bosque).map((p, i) => Object.assign(p, { id: 'B' + (i + 1), cat: 'bosque' }))            // parcela BP1
    : candidatosBosque(cuerpo.anillo, parcela).map((p, i) => Object.assign(p, { id: 'C' + (i + 1), cat: 'candidato' })); // píxeles a ≤ 5 km
  const puntos = parcela.concat(bosque);
  const dem = rejillaDem(cuerpo.anillo);

  const hoy = new Date(), c = centroide(cuerpo.anillo);
  const marca = hoy.toISOString().slice(0, 10).replaceAll('-', '') + '_' + Math.abs(Math.round(c[0] * 1e4)) + '_' + Math.abs(Math.round(c[1] * 1e4));
  const coord = (lista, cat) => lista.map((p) => ({ id: p.id, category: cat || p.cat, latitude: +p.lat.toFixed(6), longitude: +p.lng.toFixed(6) }));
  const [verdor, elev] = await Promise.all([
    crearTarea('willak_verdor_' + marca, PRODUCTOS.verdor, coord(puntos), [{ startDate: '01-01-2001', endDate: mmddaaaa(hoy) }]),
    crearTarea('willak_dem_' + marca, PRODUCTOS.dem, coord(dem.puntos, 'dem'), [{ startDate: '02-01-2000', endDate: '02-28-2000' }]),
  ]);

  return json({
    tareas: { verdor, dem: elev }, pedido: hoy.toISOString(),
    puntos: puntos.map((p) => ({ id: p.id, cat: p.cat, fraccion: p.fraccion, lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })),
    dem: { filas: dem.filas, columnas: dem.columnas, latN: dem.latN, lngO: dem.lngO, paso: dem.paso },
    productos: { verdor: 'MOD13Q1.061 · MYD13Q1.061', dem: 'SRTMGL1_NC.003' },
  }, 202);
});

export const config = { path: '/api/verdor/pedir', method: 'POST' };

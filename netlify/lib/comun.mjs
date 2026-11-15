/* ==========================================================================
   comun.mjs — lo que comparten las funciones del servidor de Willak Space.
   Regla principal (especificación, sección 2): la cuenta Earthdata vive SOLO
   aquí, en variables de entorno del servidor. Nunca viaja al navegador, nunca
   se escribe en una respuesta ni en un registro.

   Variables de entorno (se ponen en Netlify, con alcance "Functions"):
     EARTHDATA_USERNAME, EARTHDATA_PASSWORD   cuenta Earthdata Login (obligatorias)
     EARTHDATA_TOKEN      opcional: token de Earthdata ya generado, para la lluvia
     WILLAK_CODIGO        opcional: código que la app debe enviar para usar el servidor
     WILLAK_REGION        opcional: "latSur,lngOeste,latNorte,lngEste" (por defecto, Ecuador)
     WILLAK_SONDEO_S      opcional: cada cuántos segundos pregunta la app por el avance (30)
     APPEEARS_URL, GIOVANNI_URL, EDL_URL      solo para pruebas con servicios simulados
   ========================================================================== */
export const env = (k) => (globalThis.Netlify && globalThis.Netlify.env && globalThis.Netlify.env.get(k)) || process.env[k] || '';

export const URLS = () => ({
  appeears: env('APPEEARS_URL') || 'https://appeears.earthdatacloud.nasa.gov/api',
  giovanni: env('GIOVANNI_URL') || 'https://api.giovanni.earthdata.nasa.gov',
  edl: env('EDL_URL') || 'https://urs.earthdata.nasa.gov',
});

// Productos y capas (sección 4), confirmados contra GET /api/product de AppEEARS el 2026-11-10.
// Los identificadores de IMERG para el servicio de series de tiempo de GES DISC siguen el patrón
// <producto>_<versión>_<variable>; quedan por verificar con una cuenta Earthdata.
export const PRODUCTOS = {
  verdor: [
    { product: 'MOD13Q1.061', layer: '_250m_16_days_EVI' },
    { product: 'MOD13Q1.061', layer: '_250m_16_days_NDVI' },
    { product: 'MOD13Q1.061', layer: '_250m_16_days_pixel_reliability' },
    { product: 'MOD13Q1.061', layer: '_250m_16_days_VI_Quality' },
    { product: 'MYD13Q1.061', layer: '_250m_16_days_EVI' },
    { product: 'MYD13Q1.061', layer: '_250m_16_days_pixel_reliability' },
    { product: 'MYD13Q1.061', layer: '_250m_16_days_VI_Quality' },
  ],
  dem: [{ product: 'SRTMGL1_NC.003', layer: 'SRTMGL1_DEM' }],
  imerg_final: 'GPM_3IMERGDF_07_precipitation',   // histórico (Final, diario, 0,1°)
  imerg_late: 'GPM_3IMERGDL_07_precipitation',    // recientes (Late)
  inicio: '2001-01-01',
};

export const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

// Error con el mensaje que sí puede ver la persona (sin datos internos)
export class Fallo extends Error { constructor(status, mensaje) { super(mensaje); this.status = status; } }

export function credenciales() {
  const usuario = env('EARTHDATA_USERNAME'), clave = env('EARTHDATA_PASSWORD');
  if (!usuario || !clave) throw new Fallo(503, 'El servidor no tiene configurada la cuenta Earthdata.');
  return { usuario, clave };
}
export const configurado = () => !!(env('EARTHDATA_USERNAME') && env('EARTHDATA_PASSWORD'));

// Si se definió WILLAK_CODIGO, la app debe enviarlo en la cabecera x-willak-codigo
export function exigirCodigo(req) {
  const c = env('WILLAK_CODIGO');
  if (c && req.headers.get('x-willak-codigo') !== c) throw new Fallo(401, 'Código de acceso incorrecto o ausente.');
}

// Envuelve una función: revisa el código de acceso y convierte los errores en respuestas limpias
export function manejar(fn, { publico = false } = {}) {
  return async (req, ctx) => {
    try {
      if (!publico) exigirCodigo(req);
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof Fallo) return json({ error: e.message }, e.status);
      console.error('Error interno:', e && e.message); // sin credenciales ni tokens
      return json({ error: 'El servidor tuvo un problema al hablar con la NASA. Inténtalo de nuevo en unos minutos.' }, 502);
    }
  };
}

const basica = () => { const { usuario, clave } = credenciales(); return 'Basic ' + Buffer.from(usuario + ':' + clave).toString('base64'); };
const conTiempo = (ms) => AbortSignal.timeout(ms);

/* ---------- AppEEARS: POST /login (Basic) → token Bearer que dura unas 48 h ---------- */
let tokAp = null; // { token, hasta } — se reutiliza mientras la función siga "caliente"
async function tokenAppeears(forzar) {
  if (!forzar && tokAp && tokAp.hasta > Date.now()) return tokAp.token;
  const r = await fetch(URLS().appeears + '/login', { method: 'POST', headers: { Authorization: basica(), 'Content-Length': '0' }, signal: conTiempo(20000) });
  if (r.status === 401 || r.status === 403) throw new Fallo(502, 'AppEEARS no aceptó la cuenta Earthdata del servidor. Revisa el usuario y la clave configurados.');
  if (!r.ok) throw new Fallo(502, 'AppEEARS no respondió al iniciar sesión (' + r.status + ').');
  const j = await r.json();
  tokAp = { token: j.token, hasta: Date.now() + 40 * 3600 * 1000 };
  return tokAp.token;
}
// Llama a AppEEARS con el token; si venció (403), pide otro y reintenta una vez
export async function appeears(ruta, opciones = {}) {
  for (let intento = 0; intento < 2; intento++) {
    const token = await tokenAppeears(intento > 0);
    const r = await fetch(URLS().appeears + ruta, Object.assign({ signal: conTiempo(45000) }, opciones, { headers: Object.assign({ Authorization: 'Bearer ' + token }, opciones.headers || {}) }));
    if ((r.status === 401 || r.status === 403) && intento === 0) continue;
    return r;
  }
}
// Descarga un archivo del paquete de resultados. AppEEARS responde 302 hacia un enlace temporal de S3:
// a ese enlace se va SIN la cabecera Authorization (S3 rechaza dos formas de autenticación a la vez).
export async function descargar(tarea, archivo) {
  const r = await appeears(`/bundle/${tarea}/${archivo}`, { redirect: 'manual' });
  if (r.status >= 300 && r.status < 400) {
    const s3 = await fetch(new URL(r.headers.get('location'), URLS().appeears + '/').href, { signal: conTiempo(50000) });
    if (!s3.ok) throw new Fallo(502, 'No se pudo descargar el archivo de resultados (' + s3.status + ').');
    return s3.text();
  }
  if (!r.ok) throw new Fallo(502, 'No se pudo descargar el archivo de resultados (' + r.status + ').');
  return r.text();
}

/* ---------- Token de Earthdata Login (para el servicio de series de tiempo de GES DISC) ---------- */
let tokEdl = null;
export async function tokenEdl() {
  const fijo = env('EARTHDATA_TOKEN'); if (fijo) return fijo;
  if (tokEdl && tokEdl.hasta > Date.now()) return tokEdl.token;
  const r = await fetch(URLS().edl + '/api/users/find_or_create_token', { method: 'POST', headers: { Authorization: basica() }, signal: conTiempo(20000) });
  if (r.status === 401 || r.status === 403) throw new Fallo(502, 'Earthdata Login no aceptó la cuenta del servidor. Revisa el usuario y la clave configurados.');
  if (!r.ok) throw new Fallo(502, 'Earthdata Login no respondió (' + r.status + ').');
  const j = await r.json();
  if (!j.access_token) throw new Fallo(502, 'Earthdata Login no entregó un token.');
  tokEdl = { token: j.access_token, hasta: Date.now() + 12 * 3600 * 1000 };
  return tokEdl.token;
}

export const esTarea = (id) => typeof id === 'string' && /^[0-9a-f-]{8,64}$/i.test(id);

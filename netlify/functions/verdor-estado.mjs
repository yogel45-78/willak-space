/* GET /api/verdor/estado?verdor=<id>&dem=<id> — avance de los trabajos de AppEEARS.
   La app llama a esto cada 30 s hasta que el estado sea "listo" (especificación 4.3).
   Estados: pendiente · procesando · listo · error */
import { json, manejar, Fallo, appeears, esTarea } from '../lib/comun.mjs';

const ESTADO = { pending: 'pendiente', queued: 'pendiente', processing: 'procesando', done: 'listo', error: 'error', expired: 'error', deleted: 'error' };

async function estadoDe(id) {
  const r = await appeears('/task/' + id);
  if (r.status === 404) return { estado: 'error', avance: 0, error: 'AppEEARS ya no tiene este trabajo. Vuelve a analizar la parcela.' };
  if (!r.ok) throw new Fallo(502, 'AppEEARS no respondió el estado (' + r.status + ').');
  const t = await r.json(), estado = ESTADO[t.status] || 'procesando';
  let avance = estado === 'listo' ? 100 : 0;
  if (estado === 'procesando') { // el detalle del avance es opcional: si falla, se sigue sin porcentaje
    try {
      const s = await appeears('/status/' + id, { redirect: 'manual' });
      if (s.ok) { const j = await s.json(), x = Array.isArray(j) ? j[0] : j; if (x && x.progress && x.progress.summary != null) avance = Math.round(Number(x.progress.summary)) || 0; }
    } catch (e) { /* sin porcentaje */ }
  }
  return { estado, avance, error: estado === 'error' ? String(t.error || 'AppEEARS marcó el trabajo con error.').slice(0, 200) : '' };
}

export default manejar(async (req) => {
  const q = new URL(req.url).searchParams, out = {};
  for (const k of ['verdor', 'dem']) {
    const id = q.get(k); if (!id) continue;
    if (!esTarea(id)) throw new Fallo(400, 'Identificador de trabajo no válido.');
    out[k] = await estadoDe(id);
  }
  if (!Object.keys(out).length) throw new Fallo(400, 'Falta el identificador del trabajo.');
  return json(out);
});

export const config = { path: '/api/verdor/estado', method: 'GET' };

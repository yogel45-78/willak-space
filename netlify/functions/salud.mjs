/* GET /api/salud — la app pregunta si hay servidor y si tiene la cuenta Earthdata.
   No revela ningún secreto: solo dice sí o no. */
import { json, configurado, env, manejar } from '../lib/comun.mjs';

export default manejar(async () => json({
  servidor: true,
  earthdata: configurado(),                 // ¿están puestas las variables de la cuenta?
  codigo: !!env('WILLAK_CODIGO'),           // ¿la app debe enviar un código de acceso?
  sondeo_s: Math.max(5, Number(env('WILLAK_SONDEO_S')) || 30), // cada cuánto preguntar por el avance (30 s)
}), { publico: true });

export const config = { path: '/api/salud', method: 'GET' };

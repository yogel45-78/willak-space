/* ==========================================================================
   servidor.prueba.mjs — prueba el servidor de punta a punta contra la NASA
   simulada (sin cuenta Earthdata, sin internet):   node pruebas/servidor.prueba.mjs
   Recorre lo mismo que hace la app: pedir → preguntar avance → leer resultados →
   armar el verdor → lluvia IMERG, y comprueba que los datos ilustrativos de
   Guaba CEIPA den los valores de la sección 12 de la especificación.
   Sale con código 1 si algo falla.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { iniciar } from '../servidor-local.mjs';
import { pixelDe, centroDe, pixelesDe, candidatosBosque, rejillaDem } from '../netlify/lib/modis.mjs';
import { partir } from '../netlify/lib/csv.mjs';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sitio', 'app');
process.env.WILLAK_SONDEO_S = '5';
const srv = await iniciar({ puerto: 5391, simulada: true, silencio: true });

// La app (los mismos archivos del navegador) cargada aquí
globalThis.window = globalThis; globalThis.document = { getElementById: () => null, documentElement: {} };
for (const f of ['config.js', 'js/estado.js', 'js/calculo.js', 'js/verdor.js', 'js/motor.js', 'js/demo.js', 'js/datos.js', 'js/servidor.js', 'js/ambiente.js']) vm.runInThisContext(fs.readFileSync(path.join(APP, f), 'utf8'), { filename: f });
const Chakra = globalThis.Chakra, S = Chakra.servidor, D = Chakra.demo, C = Chakra.calc, V = Chakra.verdor;
S.BASE = srv.url;

const res = []; let mal = 0;
const p = (nombre, esperado, obtenido) => { const ok = String(esperado) === String(obtenido); if (!ok) mal++; res.push((ok ? 'OK   ' : 'FALLA') + ' ' + nombre + (ok ? '' : `\n        esperado: ${esperado}\n        obtenido: ${obtenido}`)); };
const pedir = async (ruta, opciones) => { const r = await fetch(srv.url + ruta, opciones); let j = null; try { j = await r.json(); } catch (e) { /* */ } return { status: r.status, j }; };
const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const anillo = D.lote().anillo;

try {
  /* --- Geometría del pedido --- */
  const px = pixelDe(D.LAT, D.LNG), cen = centroDe(px.fila, px.col);
  p('Rejilla MODIS: el centro de un píxel cae en ese mismo píxel', px.fila + ',' + px.col, Object.values(pixelDe(cen.lat, cen.lng)).join(','));
  const pp = pixelesDe(anillo);
  p('Fracciones de la parcela por píxel: suman 1', '1.00', pp.reduce((s, x) => s + x.fraccion, 0).toFixed(2));
  const cand = candidatosBosque(anillo, pp);
  p('Candidatos a bosque: todos a 5 km o menos', 'true', cand.every((c) => Chakra.geo.dist([D.LAT, D.LNG], [c.lat, c.lng]) <= 5000));
  const g = rejillaDem(anillo);
  p('Rejilla de elevación: paso de 1 segundo de arco y al menos 3 × 3', 'true', Math.abs(g.paso - 1 / 3600) < 1e-12 && g.filas >= 3 && g.columnas >= 3 && g.puntos.length <= 150);
  p('CSV con comas dentro de comillas', 'a|VI produced, good quality|b', partir('a,"VI produced, good quality",b').join('|'));

  /* --- Salud y validaciones --- */
  const sal = await S.salud();
  p('Salud: hay servidor con cuenta configurada', 'true,true', [sal.servidor, sal.earthdata].join(','));
  p('La salud no revela secretos', 'false', /prueba|token|password/i.test(JSON.stringify(sal)));
  p('Parcela con 2 puntos: se rechaza (400)', 400, (await pedir('/api/verdor/pedir', { method: 'POST', body: JSON.stringify({ anillo: anillo.slice(0, 2) }) })).status);
  p('Parcela fuera de la zona: se rechaza (400)', 400, (await pedir('/api/verdor/pedir', { method: 'POST', body: JSON.stringify({ anillo: [[40.4, -3.7], [40.41, -3.7], [40.41, -3.69]] }) })).status);
  p('Identificador de trabajo inventado: se rechaza (400)', 400, (await pedir('/api/verdor/estado?verdor=../../etc')).status);
  p('Lluvia sin coordenadas: se rechaza (400)', 400, (await pedir('/api/lluvia')).status);

  /* --- Verdor: pedir, vigilar, leer --- */
  const info = await S.pedir(anillo, null);
  p('Pedido aceptado: dos trabajos (verdor y elevación)', 'true', !!(info.tareas.verdor && info.tareas.dem));
  p('El pedido no devuelve credenciales ni tokens', 'false', /prueba|token/i.test(JSON.stringify(info)));
  const antes = await pedir('/api/verdor/datos?tarea=' + info.tareas.verdor + '&producto=MOD13Q1');
  p('Resultados antes de tiempo: aún no hay (404)', 404, antes.status);
  const estados = []; let est;
  for (let i = 0; i < 8; i++) { est = await S.estado({ verdor: info.tareas.verdor, dem: info.tareas.dem }); estados.push(est.verdor.estado); if (est.verdor.estado === 'listo') break; await esperar(50); }
  p('Avance del trabajo: pendiente → procesando → listo', 'pendiente,procesando,procesando,listo', estados.join(','));
  const [mod, myd, dem] = await Promise.all([S.datos(info.tareas.verdor, 'MOD13Q1'), S.datos(info.tareas.verdor, 'MYD13Q1'), S.datos(info.tareas.dem, 'SRTMGL1')]);
  p('Resultados: Terra y Aqua con todos los puntos pedidos', 'true', [mod, myd].every((a) => info.puntos.every((q) => a.puntos[q.id])));
  p('Aqua empieza en julio de 2002', '2002', C.iso(C.dia(myd.inicio) + Math.min(...Object.values(myd.puntos)[0].d)).slice(0, 4));
  const todos = Object.values(mod.puntos).flatMap((q) => q.evi);
  p('EVI en enteros × 10 000 y relleno −3000 reconocido', 'true', todos.includes(-3000) && todos.some((x) => x > 4000 && x < 6000));

  const verdor = S.armarVerdor(info, mod, myd, D.FIN);
  const an = V.analizar(S.desempacar(verdor.fechas), { anual: verdor.bosque_anual }, D.FIN);
  p('Verdor por el servidor: EVI 2026 / bosque → recuperación → etapa', '0.475 / 0.54 → 88 % → purma_madura', `${an.evi} / ${an.evi_bosque} → ${an.recuperacion} % → ${an.etapa}`);
  p('Verdor por el servidor: apertura detectada', '2009 (0.52 → 0.29)', an.aperturas.map((a) => `${a.anio} (${a.antes} → ${a.despues})`).join(';'));
  p('Bosque de referencia: se descartan los píxeles inestables y los potreros', 'true', verdor.bosque.usados > 0 && verdor.bosque.usados < verdor.bosque.de);
  p('Guardado compacto: ida y vuelta sin perder datos', 'true', JSON.stringify(S.empacar(S.desempacar(verdor.fechas))) === JSON.stringify(verdor.fechas));
  p('Tamaño del verdor guardado por parcela (KB) menor a 60', 'true', JSON.stringify(verdor).length / 1024 < 60);

  const pend = S.pendienteSrtm(info, dem.z, anillo);
  p('Pendiente SRTM con Horn sobre la ladera simulada del 3 %', '3', pend.pct);
  p('La pendiente SRTM queda como fuente oficial', 'true', pend.oficial);

  /* --- Con bosque BP1 dibujado --- */
  const h = 0.0006, bp1 = [[D.LAT + 0.01 + h, D.LNG - h], [D.LAT + 0.01 + h, D.LNG + h], [D.LAT + 0.01 - h, D.LNG + h], [D.LAT + 0.01 - h, D.LNG - h]];
  const info2 = await S.pedir(anillo, bp1);
  p('Con BP1 dibujado: se piden sus píxeles y no candidatos', 'true', info2.puntos.some((q) => q.cat === 'bosque') && !info2.puntos.some((q) => q.cat === 'candidato'));
  for (let i = 0; i < 6; i++) { est = await S.estado({ verdor: info2.tareas.verdor }); if (est.verdor.estado === 'listo') break; }
  const v2 = S.armarVerdor(info2, await S.datos(info2.tareas.verdor, 'MOD13Q1'), await S.datos(info2.tareas.verdor, 'MYD13Q1'), D.FIN);
  p('Con BP1: la referencia es BP1 y da 0,54', 'BP1 0.54', v2.bosque.tipo + ' ' + v2.bosque_anual.find((a) => a.anio === 2026).evi);

  /* --- Lluvia IMERG --- */
  const ll = await S.lluvia(D.LAT, D.LNG);
  p('Lluvia IMERG: empieza en 2001 y el Final llega hasta julio de 2026', '2001-01-01 / 2026-07-31', ll.inicio + ' / ' + ll.final_hasta);
  p('Lluvia IMERG: los meses recientes se completan con el Late', 'true', ll.hasta > '2026-08-01' && /IMERGDL/.test(ll.producto));
  const cl = C.climaDesdeDiario({ inicio: ll.inicio, lluvia: ll.lluvia.map((x) => (x == null ? null : x / ll.e)), tmax: null });
  p('Lluvia IMERG → indicadores: ≈ mm al año / días fuertes / racha / meses', '4900 / 21 / 6 / abril a julio', `${Math.round(cl.lluvia / 100) * 100} / ${cl.fuertes} / ${cl.racha} / ${cl.mesesLluvia}`);
  p('Días sin dato de IMERG quedan vacíos, no en cero', 'true', ll.lluvia.includes(null));

  /* --- Seguridad --- */
  p('El enlace tipo S3 se pidió sin la cabecera de sesión (si no, habría fallado la descarga)', 'true', Object.keys(mod.puntos).length > 0);
  process.env.WILLAK_CODIGO = 'chakra-2026';
  p('Con código de acceso configurado: sin código se rechaza (401)', 401, (await pedir('/api/lluvia?lat=-1.2&lng=-77.9')).status);
  p('Con el código correcto: pasa', 200, (await pedir('/api/lluvia?lat=-1.2&lng=-77.9', { headers: { 'x-willak-codigo': 'chakra-2026' } })).status);
  p('La salud avisa que hace falta código, sin decir cuál', 'true,false', await pedir('/api/salud').then((r) => [r.j.codigo, JSON.stringify(r.j).includes('chakra-2026')].join(',')));
  delete process.env.WILLAK_CODIGO;
} catch (e) { mal++; res.push('FALLA (excepción) ' + (e && e.stack || e)); }

await srv.cerrar();
console.log(res.join('\n'));
console.log(`\n${res.length - mal} de ${res.length} pruebas del servidor pasan.`);
process.exit(mal ? 1 : 0);

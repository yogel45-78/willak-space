/* ==========================================================================
   modis.mjs — geometría para armar el pedido a AppEEARS.
   · Rejilla sinusoidal de MODIS a 250 m: en qué píxel cae cada punto y qué
     fracción de la parcela ocupa cada píxel (especificación 5.2: el valor de
     la parcela es el promedio de los píxeles válidos, ponderado por esa fracción).
   · Candidatos a bosque de referencia a no más de 5 km (sección 6.1).
   · Rejilla de elevación de 1 segundo de arco (30 m) para la pendiente de Horn (4.5).
   Se pide UN punto por píxel (su centro), en lugar del recorte por área en NetCDF
   de la especificación: da los mismos píxeles y vuelve en CSV, que una función
   sin servidor puede leer. Los valores por punto ya vienen con su factor de escala.
   ========================================================================== */
const R = 6371007.181;                    // radio de la esfera de MODIS (m)
const PX = 1111950.5197665554 / 4800;     // lado del píxel de 250 m (≈ 231,656 m)
const X0 = -20015109.354, Y1 = 10007554.677;
const rad = Math.PI / 180;

// Píxel (fila, columna) de la rejilla global de 250 m que contiene el punto
export function pixelDe(lat, lng) {
  const x = R * lng * rad * Math.cos(lat * rad), y = R * lat * rad;
  return { fila: Math.floor((Y1 - y) / PX), col: Math.floor((x - X0) / PX) };
}
export function centroDe(fila, col) {
  const y = Y1 - (fila + 0.5) * PX, x = X0 + (col + 0.5) * PX, lat = y / R / rad;
  return { lat, lng: x / (R * Math.cos(lat * rad)) / rad };
}

export function dentro(p, anillo) { // p y anillo en [lat, lng]
  let d = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const a = anillo[i], b = anillo[j];
    if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0]) + a[1]) d = !d;
  }
  return d;
}
export const centroide = (anillo) => [anillo.reduce((s, p) => s + p[0], 0) / anillo.length, anillo.reduce((s, p) => s + p[1], 0) / anillo.length];
const caja = (anillo) => ({ s: Math.min(...anillo.map((p) => p[0])), n: Math.max(...anillo.map((p) => p[0])), o: Math.min(...anillo.map((p) => p[1])), e: Math.max(...anillo.map((p) => p[1])) });

/* Píxeles que toca un polígono y la fracción del polígono que cae en cada uno.
   Se muestrea el polígono con una rejilla fina (41 × 41) y se cuentan los puntos por píxel. */
export function pixelesDe(anillo, maximo = 12) {
  const b = caja(anillo), N = 41, cuenta = new Map();
  let total = 0;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = [b.s + ((b.n - b.s) * (i + 0.5)) / N, b.o + ((b.e - b.o) * (j + 0.5)) / N];
    if (!dentro(p, anillo)) continue;
    const px = pixelDe(p[0], p[1]), k = px.fila + ',' + px.col;
    cuenta.set(k, (cuenta.get(k) || 0) + 1); total++;
  }
  if (!total) { const c = centroide(anillo), px = pixelDe(c[0], c[1]); cuenta.set(px.fila + ',' + px.col, 1); total = 1; }
  let lista = [...cuenta].map(([k, n]) => { const [fila, col] = k.split(',').map(Number); return { fila, col, fraccion: n / total }; })
    .filter((x) => x.fraccion >= 0.02).sort((a, b2) => b2.fraccion - a.fraccion).slice(0, maximo);
  const s = lista.reduce((a, x) => a + x.fraccion, 0);
  return lista.map((x) => Object.assign(x, { fraccion: Math.round((x.fraccion / s) * 1000) / 1000 }, centroDe(x.fila, x.col)));
}

/* Candidatos a bosque de referencia: 8 rumbos a 2 km y a 4 km del centro (todos a ≤ 5 km).
   La app se queda con los que tienen EVI anual estable (coeficiente de variación < 5 %). */
export function candidatosBosque(anillo, excluir) {
  const [lat, lng] = centroide(anillo), usados = new Set(excluir.map((p) => p.fila + ',' + p.col)), out = [];
  for (const dist of [2000, 4000]) for (let k = 0; k < 8; k++) {
    const az = (k * 45 + (dist === 4000 ? 22.5 : 0)) * rad;
    const la = lat + (dist * Math.cos(az)) / 111320, lo = lng + (dist * Math.sin(az)) / (111320 * Math.cos(lat * rad));
    const px = pixelDe(la, lo), key = px.fila + ',' + px.col;
    if (usados.has(key)) continue; usados.add(key);
    out.push(Object.assign({ fila: px.fila, col: px.col, fraccion: 1, km: dist / 1000 }, centroDe(px.fila, px.col)));
  }
  return out;
}

/* Rejilla de elevación: puntos cada 1 segundo de arco (≈ 30 m) que cubren la parcela con una celda de margen.
   Si la parcela es grande, el paso se duplica hasta que la rejilla quepa en 150 puntos. */
export function rejillaDem(anillo, maximo = 150) {
  const b = caja(anillo); let paso = 1 / 3600, nf, nc;
  for (;;) {
    nf = Math.ceil((b.n - b.s) / paso) + 3; nc = Math.ceil((b.e - b.o) / paso) + 3;
    if (nf * nc <= maximo) break; paso *= 2;
  }
  const ajustar = (v) => Math.round(v / paso) * paso;
  const latN = ajustar((b.n + b.s) / 2 + ((nf - 1) / 2) * paso), lngO = ajustar((b.e + b.o) / 2 - ((nc - 1) / 2) * paso);
  const puntos = [];
  for (let f = 0; f < nf; f++) for (let c = 0; c < nc; c++) puntos.push({ id: `D${f}_${c}`, lat: latN - f * paso, lng: lngO + c * paso });
  return { filas: nf, columnas: nc, latN, lngO, paso, puntos };
}

/* Revisa lo que manda la app antes de gastar un pedido a la NASA */
export function validarAnillo(anillo, region, nombre = 'La parcela') {
  if (!Array.isArray(anillo) || anillo.length < 3 || anillo.length > 200) return nombre + ' debe tener entre 3 y 200 puntos.';
  for (const p of anillo) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return nombre + ' tiene un punto que no es [latitud, longitud].';
    if (p[0] < region[0] || p[0] > region[2] || p[1] < region[1] || p[1] > region[3]) return nombre + ' queda fuera de la zona que atiende este servidor.';
  }
  const b = caja(anillo);
  if (b.n - b.s > 0.06 || b.e - b.o > 0.06) return nombre + ' es demasiado grande para este servicio (máximo unos 6 km de lado).';
  return '';
}
export function regionDe(texto) {
  const v = String(texto || '').split(',').map(Number);
  return v.length === 4 && v.every(Number.isFinite) ? v : [-5.2, -81.5, 1.8, -75.0]; // Ecuador continental
}

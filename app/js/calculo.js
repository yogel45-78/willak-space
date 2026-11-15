/* ==========================================================================
   calculo.js — cuentas puras (sin pantalla ni internet) de la especificación:
     · estadísticas del clima diario (sección 6)
     · conversión de SoilGrids (sección 4.6)
     · pendiente por el método de Horn (sección 4.5)
     · cambio brusco en radar (sección 4.7)
   Todos los umbrales salen de Chakra.CFG (config.js). Funciona igual en el
   navegador y en Node (para las pruebas automáticas).
   ========================================================================== */
(function () {
  const Chakra = (globalThis.Chakra = globalThis.Chakra || {});
  const C = (Chakra.calc = {});
  const MS = 864e5;

  /* ---------- Fechas (siempre en UTC, formato AAAA-MM-DD) ---------- */
  C.dia = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / MS);
  C.iso = (dia) => new Date(dia * MS).toISOString().slice(0, 10);
  C.diasEntre = (a, b) => C.dia(b) - C.dia(a);
  C.MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  C.diasDelMes = (anio, mes0) => new Date(Date.UTC(anio, mes0 + 1, 0)).getUTCDate();

  /* ---------- Estadística básica ---------- */
  C.media = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  C.mediana = (xs) => {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  // Percentil con interpolación lineal (p de 0 a 100)
  C.percentil = (xs, p) => {
    if (!xs.length) return null;
    const s = xs.slice().sort((a, b) => a - b), pos = (p / 100) * (s.length - 1), i = Math.floor(pos), f = pos - i;
    return i + 1 < s.length ? s[i] + (s[i + 1] - s[i]) * f : s[i];
  };
  // Pendiente de la recta que mejor pasa por ys (un valor por año): cambio por año
  C.tendencia = (ys) => {
    const n = ys.length; if (n < 2) return null;
    const mx = (n - 1) / 2, my = C.media(ys); let a = 0, b = 0;
    ys.forEach((y, i) => { a += (i - mx) * (y - my); b += (i - mx) ** 2; });
    return a / b;
  };
  C.cv = (xs) => { const m = C.media(xs); if (!m) return null; return Math.sqrt(C.media(xs.map((x) => (x - m) ** 2))) / m; };
  C.miles = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  /* ---------- Clima diario → indicadores (sección 6) ----------
     diario = { inicio:'AAAA-MM-DD', lluvia:[mm|null], tmax:[°C|null], humedad:[0-1|null] }
     Devuelve promedios sobre años completos; el calor, sobre los últimos 10 años completos. */
  C.climaDesdeDiario = function (diario, cfg) {
    cfg = cfg || Chakra.CFG;
    const R = cfg.riesgos, d0 = C.dia(diario.inicio), n = diario.lluvia.length;
    const anios = {}; // anio -> { dias, validos, total, fuertes, calorValidos, calor, mes:[12] }
    let racha = 0, cur = 0;
    for (let i = 0; i < n; i++) {
      const f = new Date((d0 + i) * MS), y = f.getUTCFullYear(), m = f.getUTCMonth();
      const a = (anios[y] = anios[y] || { dias: 0, validos: 0, total: 0, fuertes: 0, calorValidos: 0, calor: 0, mes: Array(12).fill(0) });
      a.dias++;
      const mm = diario.lluvia[i];
      if (mm != null) {
        a.validos++; a.total += mm; a.mes[m] += mm;
        if (mm > R.lavado.mm_dia_fuerte) a.fuertes++;
        if (mm < R.seco.mm_dia) { cur++; if (cur > racha) racha = cur; } else cur = 0;
      } else cur = 0; // un día sin dato corta la racha: no se inventa sequía
      const t = diario.tmax ? diario.tmax[i] : null;
      if (t != null) { a.calorValidos++; if (t > R.calor.tmax_c) a.calor++; }
    }
    const lista = Object.keys(anios).map(Number).sort((a, b) => a - b);
    const largo = (y) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
    const completos = lista.filter((y) => anios[y].validos >= 350);
    const out = { desde: diario.inicio, hasta: C.iso(d0 + n - 1), anios: completos.length, racha: n ? racha : null };
    if (completos.length) {
      const esc = (y) => largo(y) / anios[y].validos; // corrige los pocos días sin dato
      out.lluvia = Math.round(C.media(completos.map((y) => anios[y].total * esc(y))));
      out.fuertes = Math.round(C.media(completos.map((y) => anios[y].fuertes * esc(y))));
      out.mensual = Array.from({ length: 12 }, (_, m) => Math.round(C.media(completos.map((y) => anios[y].mes[m] * esc(y)))));
      out.meses = C.mesesLluviaFuerte(out.mensual, cfg.plan.meses_lluvia_fuerte);
      out.mesesLluvia = C.MESES[out.meses[0]] + ' a ' + C.MESES[out.meses[out.meses.length - 1]];
    }
    const conCalor = lista.filter((y) => anios[y].calorValidos >= 350).slice(-R.calor.anios);
    if (conCalor.length) { out.calor = Math.round(C.media(conCalor.map((y) => anios[y].calor * (largo(y) / anios[y].calorValidos)))); out.calorAnios = conCalor.length; }
    if (diario.humedad) { const h = diario.humedad.filter((x) => x != null); if (h.length) out.humedad = Math.round(C.media(h) * 100) / 100; }
    return out;
  };

  // Los N meses seguidos con más lluvia media (sección 8). Devuelve los índices de mes (0 = enero).
  C.mesesLluviaFuerte = function (mensual, nMeses) {
    let mejor = -1, ini = 0;
    for (let i = 0; i < 12; i++) {
      let t = 0; for (let j = 0; j < nMeses; j++) t += mensual[(i + j) % 12];
      if (t > mejor) { mejor = t; ini = i; }
    }
    return Array.from({ length: nMeses }, (_, j) => (ini + j) % 12);
  };

  /* ---------- SoilGrids 2.0 → unidades de la app (sección 4.6) ---------- */
  C.soilgrids = function (json, cfg) {
    cfg = cfg || Chakra.CFG;
    const esp = cfg.suelo.espesores_cm, v = {};
    (json.properties.layers || []).forEach((capa) => {
      let s = 0, w = 0;
      capa.depths.forEach((d) => { const x = d.values && d.values.mean, e = esp[d.label]; if (x != null && e) { s += x * e; w += e; } });
      if (w) v[capa.name] = s / w; // promedio 0–30 cm ponderado por espesor (5, 10 y 15 cm)
    });
    const r = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
    const carbono = v.soc != null ? v.soc / 100 : null;                 // dg/kg → %
    return {
      ph: v.phh2o != null ? r(v.phh2o / 10, 1) : null,                   // pH × 10 → pH
      carbono: carbono != null ? r(carbono, 2) : null,
      om: carbono != null ? r(carbono * cfg.suelo.factor_mo, 1) : null,  // materia orgánica ≈ carbono × 1,724
      n: v.nitrogen != null ? r(v.nitrogen / 1000, 2) : null,            // cg/kg → %
      arcilla: v.clay != null ? Math.round(v.clay / 10) : null,          // g/kg → %
      limo: v.silt != null ? Math.round(v.silt / 10) : null,
      arena: v.sand != null ? Math.round(v.sand / 10) : null,
    };
  };

  /* ---------- Pendiente: método de Horn, ventana 3×3 (sección 4.5) ----------
     z = matriz de alturas [fila][columna] en metros, fila 0 al norte; dx, dy = separación en metros.
     dentro(f, c) dice si esa celda cae en el polígono; se promedia la pendiente (%) de esas celdas. */
  C.pendienteHorn = function (z, dx, dy, dentro) {
    const out = []; let centroF = (z.length - 1) / 2, centroC = (z[0].length - 1) / 2, mejor = null, dMejor = 1e9;
    for (let f = 1; f < z.length - 1; f++) for (let c = 1; c < z[0].length - 1; c++) {
      const a = z[f - 1][c - 1], b = z[f - 1][c], cc = z[f - 1][c + 1], d = z[f][c - 1], e2 = z[f][c + 1], g = z[f + 1][c - 1], h = z[f + 1][c], i = z[f + 1][c + 1];
      if ([a, b, cc, d, e2, g, h, i, z[f][c]].some((x) => x == null || x <= -32768)) continue; // relleno de SRTM
      const dzdx = ((cc + 2 * e2 + i) - (a + 2 * d + g)) / (8 * dx), dzdy = ((g + 2 * h + i) - (a + 2 * b + cc)) / (8 * dy);
      const pct = Math.sqrt(dzdx * dzdx + dzdy * dzdy) * 100;
      if (!dentro || dentro(f, c)) out.push(pct);
      const dist = (f - centroF) ** 2 + (c - centroC) ** 2; if (dist < dMejor) { dMejor = dist; mejor = pct; }
    }
    if (out.length) return { pct: Math.round(C.media(out) * 10) / 10, celdas: out.length };
    return mejor == null ? null : { pct: Math.round(mejor * 10) / 10, celdas: 1 }; // parcela más chica que una celda
  };
  // ¿El punto [lat, lng] cae dentro del anillo [[lat, lng], …]?
  C.puntoEnPoligono = function (p, anillo) {
    let dentro = false;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const a = anillo[i], b = anillo[j];
      if ((a[0] > p[0]) !== (b[0] > p[0]) && p[1] < ((b[1] - a[1]) * (p[0] - a[0])) / (b[0] - a[0]) + a[1]) dentro = !dentro;
    }
    return dentro;
  };

  /* ---------- Radar (sección 4.7): caída de VH mayor a 3 dB frente a la mediana de 3 meses ----------
     serie = [{ fecha, vh_db }] ordenada. Devuelve las fechas con "posible apertura" (a confirmar con la familia). */
  C.radarApertura = function (serie, cfg) {
    cfg = cfg || Chakra.CFG;
    const out = [];
    serie.forEach((p, i) => {
      const d = C.dia(p.fecha), antes = serie.slice(0, i).filter((q) => d - C.dia(q.fecha) <= cfg.radar.meses_referencia * 30.5).map((q) => q.vh_db);
      if (antes.length < 2) return;
      const caida = C.mediana(antes) - p.vh_db;
      if (caida > cfg.radar.caida_db) out.push({ fecha: p.fecha, caida_db: Math.round(caida * 10) / 10, mensaje: 'Posible apertura: confirmar con la familia.' });
    });
    return out;
  };
})();

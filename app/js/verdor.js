/* ==========================================================================
   verdor.js — el verdor (EVI) visto por satélite y el manejo de nubes.
   Sigue la especificación: sección 5 (nubes), 6.1 (recuperación frente al
   bosque) y 6.2 (etapa de la chakra). Cuentas puras: no trae datos; recibe
   los compuestos ya descargados (AppEEARS) o los ilustrativos de la demo.
   ========================================================================== */
(function () {
  const Chakra = (globalThis.Chakra = globalThis.Chakra || {});
  const V = (Chakra.verdor = {});
  const C = Chakra.calc;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;

  /* ---------- 5.1 y 5.2: valor de la parcela en una fecha ----------
     pixeles = [{ evi_raw, ndvi_raw, fiabilidad, vi_quality, fraccion }]
     fraccion = parte del píxel que cae dentro del polígono (peso). */
  V.pixelValido = function (p, cfg) {
    const v = cfg.verdor;
    if (!v.fiabilidad_usar.includes(p.fiabilidad)) return false;            // 2 nieve, 3 nublado, −1 sin dato
    if (p.evi_raw == null || p.evi_raw === v.relleno) return false;
    if (p.vi_quality != null && v.bits_descartar.some((b) => (p.vi_quality >> b) & 1)) return false; // nube adyacente o sombra
    return true;
  };
  V.valorParcela = function (pixeles, cfg) {
    cfg = cfg || Chakra.CFG;
    let area = 0, valida = 0, sE = 0, sN = 0, wN = 0;
    pixeles.forEach((p) => {
      const f = p.fraccion == null ? 1 : p.fraccion; area += f;
      if (!V.pixelValido(p, cfg)) return;
      valida += f; sE += f * (p.evi_raw / cfg.verdor.escala);
      if (p.ndvi_raw != null && p.ndvi_raw !== cfg.verdor.relleno) { sN += f * (p.ndvi_raw / cfg.verdor.escala); wN += f; }
    });
    const pct = area ? valida / area : 0;
    if (pct < cfg.verdor.min_area_valida) return { evi: null, ndvi: null, pct_area_valida: Math.round(pct * 100), estado: 'faltante' };
    return { evi: r4(sE / valida), ndvi: wN ? r4(sN / wN) : null, pct_area_valida: Math.round(pct * 100), estado: 'medido' };
  };

  /* ---------- 5.3: suavizador de Whittaker (diferencias de 2.º orden) ----------
     Resuelve (W + λ·DᵀD) z = W·y con una matriz de 5 diagonales (rápido aunque haya 25 años). */
  V.whittaker = function (y, w, lambda) {
    const n = y.length; if (n < 3) return y.slice();
    const a0 = new Float64Array(n), a1 = new Float64Array(n), a2 = new Float64Array(n);
    for (let r = 0; r < n - 2; r++) { a0[r] += 1; a0[r + 1] += 4; a0[r + 2] += 1; a1[r] += -2; a1[r + 1] += -2; a2[r] += 1; }
    for (let i = 0; i < n; i++) { a0[i] = lambda * a0[i] + w[i]; a1[i] *= lambda; a2[i] *= lambda; }
    const d = new Float64Array(n), l1 = new Float64Array(n), l2 = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      d[i] = a0[i] - (i > 0 ? l1[i - 1] ** 2 * d[i - 1] : 0) - (i > 1 ? l2[i - 2] ** 2 * d[i - 2] : 0);
      if (i < n - 1) l1[i] = (a1[i] - (i > 0 ? l1[i - 1] * l2[i - 1] * d[i - 1] : 0)) / d[i];
      if (i < n - 2) l2[i] = a2[i] / d[i];
    }
    const z = new Float64Array(n);
    for (let i = 0; i < n; i++) z[i] = w[i] * y[i] - (i > 0 ? l1[i - 1] * z[i - 1] : 0) - (i > 1 ? l2[i - 2] * z[i - 2] : 0);
    for (let i = 0; i < n; i++) z[i] /= d[i];
    for (let i = n - 1; i >= 0; i--) z[i] = z[i] - (i < n - 1 ? l1[i] * z[i + 1] : 0) - (i < n - 2 ? l2[i] * z[i + 2] : 0);
    return Array.from(z);
  };

  /* ---------- Serie completa: une Terra y Aqua, suaviza y rellena huecos ----------
     fechas = [{ fecha, satelite, evi, ndvi, pct_area_valida, estado:'medido'|'faltante' }]
     Devuelve la misma lista ordenada, con evi_suavizado y estado medido | rellenado | faltante. */
  V.serie = function (fechas, cfg) {
    cfg = cfg || Chakra.CFG;
    const v = cfg.verdor;
    const s = fechas.map((f) => Object.assign({}, f)).sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
    const n = s.length, medidos = s.filter((p) => p.estado === 'medido').length;
    s.forEach((p) => { p.evi_suavizado = null; });
    if (medidos < 3) return s;
    const y = s.map((p) => (p.estado === 'medido' ? p.evi : 0)), w = s.map((p) => (p.estado === 'medido' ? 1 : 0));
    let z = V.whittaker(y, w, v.whittaker_lambda);
    // Envolvente superior: las nubes casi siempre bajan el EVI, así que pesa menos lo que queda bajo la curva
    for (let it = 0; it < v.whittaker_iteraciones; it++) {
      for (let i = 0; i < n; i++) if (w[i] > 0 && y[i] < z[i]) w[i] *= v.whittaker_factor_peso;
      z = V.whittaker(y, w, v.whittaker_lambda);
    }
    // Relleno: solo huecos de hasta 48 días entre dos datos medidos
    let ant = -1;
    for (let i = 0; i < n; i++) {
      if (s[i].estado !== 'medido') continue;
      s[i].evi_suavizado = r4(z[i]);
      if (ant >= 0 && i - ant > 1 && C.diasEntre(s[ant].fecha, s[i].fecha) <= v.hueco_max_dias) {
        for (let j = ant + 1; j < i; j++) { s[j].estado = 'rellenado'; s[j].evi_suavizado = r4(z[j]); }
      }
      ant = i;
    }
    return s;
  };

  /* ---------- 5.4: historia anual y su confianza ---------- */
  V.anual = function (serie, cfg) {
    cfg = cfg || Chakra.CFG;
    const v = cfg.verdor, por = {};
    serie.forEach((p) => { const y = +p.fecha.slice(0, 4); (por[y] = por[y] || []).push(p); });
    return Object.keys(por).map(Number).sort((a, b) => a - b).map((anio) => {
      const med = por[anio].filter((p) => p.estado === 'medido').map((p) => p.evi), pct = med.length / por[anio].length;
      return {
        anio, evi: med.length ? r4(C.mediana(med)) : null, n_medidos: med.length, n_compuestos: por[anio].length, pct_validos: Math.round(pct * 100),
        confianza: med.length < v.min_obs_anio ? 'baja' : pct >= v.confianza_alta ? 'alta' : pct >= v.confianza_media ? 'media' : 'baja',
      };
    });
  };

  // Estado del último compuesto: si es faltante no se alerta (5.4) y, si pasan más de 48 días sin dato, toca radar.
  V.ultimo = function (serie, hoy, cfg) {
    cfg = cfg || Chakra.CFG;
    if (!serie.length) return null;
    const ult = serie[serie.length - 1], med = serie.filter((p) => p.estado === 'medido').pop();
    const dias = med ? C.diasEntre(med.fecha, hoy) : null;
    return { fecha: ult.fecha, estado: ult.estado, nublado: ult.estado !== 'medido', ultimo_medido: med ? med.fecha : null, dias_sin_dato: dias,
      consultar_radar: dias == null || dias > cfg.verdor.hueco_max_dias };
  };

  /* ---------- 6.1: recuperación frente al bosque ---------- */
  // Bosque de referencia: BP1 si existe; si no, píxeles de bosque a ≤ 5 km con coeficiente de variación < 5 %.
  V.bosqueEstables = function (candidatos, cfg) {
    cfg = cfg || Chakra.CFG;
    const e = cfg.etapas, bp1 = candidatos.find((c) => c.id === 'BP1');
    if (bp1) return [bp1];
    return candidatos.filter((c) => { const xs = c.anual.map((a) => a.evi).filter((x) => x != null); return xs.length >= 3 && C.cv(xs) < e.bosque_cv_max && C.media(xs) >= (e.bosque_evi_min || 0); });
  };
  V.bosqueReferencia = function (candidatos, cfg) {
    const usar = V.bosqueEstables(candidatos, cfg);
    if (!usar.length) return null;
    const anios = [...new Set(usar.flatMap((c) => c.anual.map((a) => a.anio)))].sort((a, b) => a - b);
    return anios.map((anio) => { const xs = usar.map((c) => (c.anual.find((a) => a.anio === anio) || {}).evi).filter((x) => x != null); return { anio, evi: xs.length ? r4(C.media(xs)) : null }; });
  };
  V.recuperacion = function (anualParcela, anualBosque, anio) {
    const p = anualParcela.find((a) => a.anio === anio), b = anualBosque && anualBosque.find((a) => a.anio === anio);
    if (!p || !b || p.evi == null || !b.evi) return null;
    return (p.evi / b.evi) * 100;
  };

  /* ---------- 6.2: etapa de la chakra según el EVI anual ---------- */
  const EPS = 1e-9;
  V.aperturas = function (anual, cfg) {
    cfg = cfg || Chakra.CFG;
    const e = cfg.etapas, out = [];
    for (let i = e.apertura_anios_ref; i < anual.length; i++) {
      const prev = anual.slice(i - e.apertura_anios_ref, i).map((a) => a.evi);
      if (anual[i].evi == null || prev.some((x) => x == null)) continue;
      const ref = C.media(prev);
      if (ref - anual[i].evi >= e.apertura_caida - EPS) { out.push({ anio: anual[i].anio, antes: r4(ref), despues: anual[i].evi }); i += e.ciclo_corto_anios; }
    }
    return out;
  };
  V.etapaEn = function (anual, i, recupPct, aperturas, cfg) {
    cfg = cfg || Chakra.CFG;
    const e = cfg.etapas, a = anual[i];
    if (!a || a.evi == null) return '';
    if (aperturas.some((x) => x.anio === a.anio)) return 'apertura';
    const ult = aperturas.filter((x) => x.anio < a.anio).pop();
    if (ult && a.anio - ult.anio <= e.ciclo_corto_anios && a.evi < e.ciclo_corto_evi) return 'ciclo_corto';
    if (recupPct != null && recupPct >= e.purma_madura_pct - EPS) return 'purma_madura';
    const vent = anual.slice(Math.max(0, i - e.purma_anios), i + 1).map((x) => x.evi);
    const t = vent.length === e.purma_anios + 1 && vent.every((x) => x != null) ? C.tendencia(vent) : null;
    if (t != null && t >= e.purma_tendencia - EPS) return 'purma';
    if (a.evi >= e.sombra_min - EPS && a.evi <= e.sombra_max + EPS && (t == null || t > 0)) return 'sombra';
    return '';
  };

  /* ---------- Todo junto para una parcela ----------
     Devuelve la serie, la historia anual, la etapa por año, la recuperación y los años de descanso. */
  V.analizar = function (fechasParcela, fechasBosque, hoy, cfg) {
    cfg = cfg || Chakra.CFG;
    const serie = V.serie(fechasParcela, cfg), anual = V.anual(serie, cfg);
    // fechasBosque puede ser la serie de compuestos del bosque o { anual: [...] } si la referencia ya viene calculada
    const yaAnual = fechasBosque && !Array.isArray(fechasBosque) ? fechasBosque.anual : null;
    const serieB = Array.isArray(fechasBosque) && fechasBosque.length ? V.serie(fechasBosque, cfg) : null;
    const anualB = yaAnual && yaAnual.length ? yaAnual : serieB ? V.bosqueReferencia([{ id: 'BP1', anual: V.anual(serieB, cfg) }], cfg) : null;
    const aperturas = V.aperturas(anual, cfg);
    const historia = anual.map((a, i) => { const rec = anualB ? V.recuperacion(anual, anualB, a.anio) : null; return { anio: a.anio, evi: a.evi, confianza: a.confianza, recuperacion: rec == null ? null : Math.round(rec), etapa: V.etapaEn(anual, i, rec, aperturas, cfg) }; });
    const act = historia[historia.length - 1] || null;
    let descanso = 0;
    for (let i = historia.length - 1; i >= 0 && /^purma/.test(historia[i].etapa); i--) descanso++;
    const bosqueAct = act && anualB ? anualB.find((a) => a.anio === act.anio) : null;
    return {
      serie, anual, bosque: anualB, aperturas, historia,
      anio: act ? act.anio : null, evi: act ? act.evi : null, evi_bosque: bosqueAct ? bosqueAct.evi : null,
      recuperacion: act ? act.recuperacion : null, etapa: act ? act.etapa : '', confianza: act ? act.confianza : 'baja',
      anios_descanso: descanso, ultimo: V.ultimo(serie, hoy, cfg),
    };
  };
})();

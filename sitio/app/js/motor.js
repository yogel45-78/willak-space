/* ==========================================================================
   motor.js — las decisiones de Willak Space (cuentas puras, sin pantalla):
     · recomendación: ranking con nota 0–100 y explicación (sección 7)
     · plan de rotación de 36 a 60 meses (sección 8)
     · seguimiento y alertas con causa probable (sección 9)
     · señales locales comparadas con la lluvia (sección 10)
   Pesos, catálogos y umbrales salen de Chakra.CFG (config.js).
   ========================================================================== */
(function () {
  const Chakra = (globalThis.Chakra = globalThis.Chakra || {});
  const M = (Chakra.motor = {});
  const C = Chakra.calc;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const pct = (x) => (x > 0 ? '+' : '−') + Math.abs(Math.round(x * 100)) + ' %';

  /* ======================= 7. Recomendación ======================= */
  // Encharcamiento (0, 0,5 o 1): terreno plano con raíces muy húmedas; peor si es arcilloso.
  M.encharcamiento = function (an, cfg) {
    cfg = cfg || Chakra.CFG;
    const e = cfg.recomendacion.encharcamiento;
    if (an.pendiente == null || an.humedad == null) return 0;
    if (an.pendiente >= e.pendiente_menor || an.humedad < e.humedad_raiz_desde) return 0;
    return an.arcilla != null && an.arcilla >= e.arcilla_desde ? 1 : 0.5;
  };

  /* an (análisis de la parcela) = { etapa, ph, nivel_p, nivel_k, riesgos:{lavado, calor, …},
       pendiente, humedad, arcilla, prioridades:{alimento…}, meses:[índices de lluvia fuerte] } */
  M.subnotas = function (op, an, cfg) {
    cfg = cfg || Chakra.CFG;
    const R = cfg.recomendacion, fila = R.matriz_rotacion[an.etapa || ''] || R.matriz_rotacion[''];
    const rot = fila[op.grupo];
    const fn = (nivel) => R.suelo.factor_nivel[nivel || 'sin_dato'];
    const suelo = 100
      - R.suelo.castigo_ph_por_unidad * (an.ph == null ? 0 : clamp(op.ph_min - an.ph, 0, 1))
      - R.suelo.castigo_p * op.dem_p * fn(an.nivel_p)
      - R.suelo.castigo_k * op.dem_k * fn(an.nivel_k);
    const sev = (c) => R.clima.severidad[c || 'gris'];
    const clima = 100
      - R.clima.castigo_lluvia * (1 - op.tol_lluvia) * sev(an.riesgos.lavado)
      - R.clima.castigo_encharcamiento * (1 - op.tol_encharcamiento) * M.encharcamiento(an, cfg)
      - R.clima.castigo_calor * (1 - op.tol_calor) * sev(an.riesgos.calor);
    let sp = 0, spa = 0;
    cfg.prioridades.forEach((p) => { const v = +(an.prioridades || {})[p.id] || 0; sp += v; spa += v * (op.aporte[p.id] || 0); });
    const prior = sp ? (spa / sp) * 100 : 50;
    const r = (x) => Math.round(clamp(x, 0, 100) + 1e-9);
    return { rot: r(rot), suelo: r(suelo), clima: r(clima), prior: r(prior) };
  };
  // Promedio ponderado; los pesos (0–100) se normalizan solos al dividir por su suma.
  M.nota = function (sub, pesos) {
    const s = pesos.rot + pesos.suelo + pesos.clima + pesos.prior;
    if (!s) return 0;
    return Math.round((pesos.rot * sub.rot + pesos.suelo * sub.suelo + pesos.clima * sub.clima + pesos.prior * sub.prior) / s + 1e-9);
  };

  // Explicación con plantillas: solo usa datos que están en el análisis (sección 7.3).
  function explicar(op, sub, an, pesos, cfg) {
    const E = Object.fromEntries(Object.entries(cfg.etapas.nombres).map(([k, v]) => [k, v.replace(/\s*\(.*\)/, '')])), fmt = (x) => String(x).replace('.', ',');
    const frases = {
      rot: an.etapa ? `Rotación ${sub.rot} de 100: ${sub.rot >= 70 ? 'encaja bien' : sub.rot >= 50 ? 'encaja a medias' : 'encaja poco'} con la etapa de la chakra (${E[an.etapa].toLowerCase()}).`
        : `Rotación ${sub.rot} de 100: no se sabe la etapa de la chakra; anótala con la familia.`,
      suelo: `Suelo ${sub.suelo} de 100: ` + [
        an.ph == null ? 'falta el pH' : an.ph >= op.ph_min ? `tolera el pH de la parcela (${fmt(an.ph)})` : `el pH (${fmt(an.ph)}) está bajo lo que tolera (${fmt(op.ph_min)})`,
        an.nivel_p ? `fósforo ${an.nivel_p}` : 'fósforo sin dato', an.nivel_k ? `potasio ${an.nivel_k}` : 'potasio sin dato'].join(', ') + '.',
      clima: `Clima ${sub.clima} de 100: ` + (an.riesgos.lavado === 'rojo' ? (op.tol_lluvia >= 0.7 ? 'aguanta bien la lluvia fuerte' : 'la lluvia fuerte le afecta')
        : an.riesgos.lavado === 'amarillo' ? 'la lluvia es moderada' : an.riesgos.lavado === 'verde' ? 'la lluvia no es problema' : 'falta el dato de lluvia')
        + (M.encharcamiento(an, cfg) > 0 ? (op.tol_encharcamiento >= 0.6 ? ' y tolera el suelo encharcado' : ' y no le gusta el suelo encharcado') : '') + '.',
      prior: (() => {
        const top = cfg.prioridades.map((p) => ({ p, v: (+(an.prioridades || {})[p.id] || 0) * (op.aporte[p.id] || 0) })).sort((a, b) => b.v - a.v).filter((x) => x.v > 0).slice(0, 2);
        return `Prioridades ${sub.prior} de 100` + (top.length ? ': aporta sobre todo a «' + top.map((x) => x.p.nombre.toLowerCase()).join('» y «') + '».' : ': la familia aún no dijo qué le importa más.');
      })(),
    };
    // Primero los factores que más suman a la nota
    return Object.keys(frases).sort((a, b) => pesos[b] * sub[b] - pesos[a] * sub[a]).map((k) => ({ factor: k, texto: frases[k] }));
  }
  M.advertencias = function (an, cfg) {
    cfg = cfg || Chakra.CFG;
    const A = cfg.advertencias, out = [], mes = an.meses && an.meses.length ? C.MESES[an.meses[0]] : 'los meses de lluvia fuerte';
    if (an.etapa === 'purma') out.push(A.purma);
    if (an.nivel_p === 'bajo') out.push(A.fosforo_bajo);
    if (an.nivel_k === 'bajo') out.push(A.potasio_bajo);
    const r = an.riesgos || {}, alto = (c) => c === 'rojo' || c === 'amarillo';
    if (alto(r.lavado)) out.push(A.lavado.replace('{mes}', mes));
    if (alto(r.erosion)) out.push(A.erosion);
    if (alto(r.acidez)) out.push(A.acidez);
    if (alto(r.calor)) out.push(A.calor);
    if (alto(r.seco)) out.push(A.seco);
    return out;
  };
  M.ranking = function (an, pesos, cfg) {
    cfg = cfg || Chakra.CFG;
    pesos = pesos || cfg.recomendacion.pesos;
    const et = cfg.recomendacion.etiquetas;
    return cfg.opciones.map((op) => {
      const sub = M.subnotas(op, an, cfg), nota = M.nota(sub, pesos);
      return { opcion: op, sub, nota, explicacion: explicar(op, sub, an, pesos, cfg),
        etiqueta: nota >= et.muy_buena ? 'Muy buena opción' : nota >= et.buena ? 'Buena opción, con cuidado' : 'Mejor elegir otra',
        color: nota >= et.muy_buena ? 'verde' : nota >= et.buena ? 'amarillo' : 'rojo' };
    }).sort((a, b) => b.nota - a.nota);
  };

  /* ======================= 8. Plan de rotación ======================= */
  const ym = (anio0, idx) => (anio0 + Math.floor(idx / 12)) + '-' + String((idx % 12) + 1).padStart(2, '0');
  M.plan = function (opcionId, opts, cfg) {
    cfg = cfg || Chakra.CFG;
    const P = cfg.plan, anio0 = opts.inicio, lluvia = opts.meses || [];
    const cadena = P.cadena[opcionId];
    if (!cadena) return null;
    const items = [], etapas = [];
    let m0 = 0, corta = 0;
    cadena.forEach((idBloque) => {
      if (m0 >= P.max_meses) return;
      const b = P.bloques[idBloque], fin = Math.min(m0 + b.meses, P.max_meses) - 1;
      const etapa = b.etapa || P.etapas_cortas[Math.min(corta++, P.etapas_cortas.length - 1)];
      etapas.push({ etapa, nombre: P.nombres_etapa[etapa], desde: ym(anio0, m0), hasta: ym(anio0, fin), i0: m0, i1: fin });
      b.cultivos.forEach((id) => {
        const c = cfg.cultivos[id];
        // primer mes de siembra permitido dentro del bloque (los bloques empiezan en enero)
        let ini = -1;
        for (let m = m0; m <= fin; m++) if (c.siembra.includes((m % 12) + 1)) { ini = m; break; }
        if (ini < 0) return;
        const hasta = c.duracion == null ? fin : Math.min(ini + c.duracion - 1, P.max_meses - 1);
        items.push({ cultivo: id, nombre: c.nombre, etapa, i0: ini, i1: hasta, cobertura: !!c.cobertura, insertado: false });
      });
      // Restricción obligatoria: en cada mes de lluvia fuerte debe haber un cultivo con cobertura
      const cob = cfg.cultivos[P.cobertura_defecto];
      for (let m = m0; m <= fin; m++) {
        if (!lluvia.includes(m % 12)) continue;
        if (items.some((it) => it.cobertura && it.i0 <= m && m <= it.i1)) continue;
        items.push({ cultivo: P.cobertura_defecto, nombre: cob.nombre, etapa, i0: m, i1: Math.min(m + cob.duracion - 1, fin), cobertura: true, insertado: true });
      }
      m0 = fin + 1;
    });
    const total = m0;
    let cubiertos = 0, lluviaSinCubrir = 0;
    for (let m = 0; m < total; m++) {
      const ok = items.some((it) => it.cobertura && it.i0 <= m && m <= it.i1);
      if (ok) cubiertos++; else if (lluvia.includes(m % 12)) lluviaSinCubrir++;
    }
    items.sort((a, b) => a.i0 - b.i0 || a.i1 - b.i1);
    items.forEach((it) => {
      it.mes_inicio = ym(anio0, it.i0); it.mes_fin = ym(anio0, it.i1);
      it.siembra = C.MESES[it.i0 % 12] + ' de ' + (anio0 + Math.floor(it.i0 / 12));
    });
    return { opcion: opcionId, inicio: anio0, total_meses: total, cubiertos, lluvia_sin_cubrir: lluviaSinCubrir, meses_lluvia: lluvia.slice(), etapas, items,
      purma: { etapa: 'purma', nombre: P.nombres_etapa.purma, desde: ym(anio0, total), nota: P.nota_purma } };
  };

  /* ======================= 9. Seguimiento y alertas ======================= */
  // EVI esperado: plantilla del cultivo (días desde la siembra) escalada a la línea base de la parcela.
  M.esperado = function (cultivo, dias, base, cfg) {
    cfg = cfg || Chakra.CFG;
    const t = cfg.seguimiento.plantillas[cultivo];
    if (!t || dias < 0 || base == null) return null;
    let f = t[t.length - 1][1];
    for (let i = 1; i < t.length; i++) if (dias <= t[i][0]) { const [d0, f0] = t[i - 1], [d1, f1] = t[i]; f = f0 + ((f1 - f0) * (dias - d0)) / (d1 - d0); break; }
    return Math.round(base * f * 1e4) / 1e4;
  };
  // Línea base: mediana del EVI medido en los 12 meses antes de la siembra.
  M.lineaBase = function (serie, fechaSiembra) {
    const d = C.dia(fechaSiembra), xs = serie.filter((p) => p.estado === 'medido' && C.dia(p.fecha) < d && d - C.dia(p.fecha) <= 365).map((p) => p.evi);
    return xs.length ? Math.round(C.mediana(xs) * 1e4) / 1e4 : null;
  };
  // Lluvia y calor del periodo frente a lo normal (clima = resultado de calc.climaDesdeDiario)
  M.periodo = function (diario, clima, desde, hasta, cfg) {
    cfg = cfg || Chakra.CFG;
    if (!diario || !clima || !clima.mensual) return null;
    const d0 = C.dia(diario.inicio), a = Math.max(C.dia(desde), d0), b = Math.min(C.dia(hasta), d0 + diario.lluvia.length - 1);
    if (b < a) return null;
    let lluvia = 0, normal = 0, calor = 0, validos = 0;
    for (let d = a; d <= b; d++) {
      const f = new Date(d * 864e5), mm = diario.lluvia[d - d0], t = diario.tmax ? diario.tmax[d - d0] : null;
      if (mm == null) continue;
      validos++; lluvia += mm; normal += clima.mensual[f.getUTCMonth()] / C.diasDelMes(f.getUTCFullYear(), f.getUTCMonth());
      if (t != null && t > cfg.riesgos.calor.tmax_c) calor++;
    }
    if (!validos || !normal) return null;
    return { dias: validos, lluvia: Math.round(lluvia), lluvia_normal: Math.round(normal), razon: lluvia / normal - 1,
      calor, calor_normal: clima.calor == null ? null : Math.round((clima.calor * validos) / 365) };
  };
  /* Diagnóstico en el orden de la especificación:
     1) lluvia dentro de ±20 % → se descarta · 2) calor normal → se descarta
     3) fósforo o potasio bajos, o 3+ siembras seguidas sin purma → suelo cansado
     4) plagas → el satélite no las ve: pedir confirmación a la familia */
  M.diagnostico = function (d, cfg) {
    cfg = cfg || Chakra.CFG;
    const S = cfg.seguimiento, T = S.mensajes, per = d.periodo, pasos = [];
    if (per) {
      if (Math.abs(per.razon) > S.lluvia_normal) { const k = per.razon < 0 ? 'lluvia_poca' : 'lluvia_mucha'; pasos.push(`Lluvia del periodo: ${per.lluvia} mm frente a ${per.lluvia_normal} mm normales (${pct(per.razon)}).`); return Object.assign({ clave: k, pasos, nota: '' }, T[k]); }
      pasos.push(`Lluvia del periodo dentro de lo normal (${pct(per.razon)}): se descarta.`);
      if (per.calor_normal != null) {
        if (per.calor > per.calor_normal + S.calor_margen_dias) { pasos.push(`Días de calor: ${per.calor} frente a ${per.calor_normal} normales.`); return Object.assign({ clave: 'calor', pasos, nota: 'la lluvia fue normal' }, T.calor); }
        pasos.push('Días de calor dentro de lo normal: se descarta.');
      }
    } else pasos.push('No hay lluvia diaria del periodo: no se pudo comparar con lo normal.');
    const nota = per ? 'la lluvia fue normal' : 'sin dato de lluvia para comparar';
    const cansado = d.nivel_p === 'bajo' || d.nivel_k === 'bajo' || (d.siembras_sin_purma || 0) >= S.siembras_sin_purma;
    if (cansado) {
      pasos.push([d.nivel_p === 'bajo' ? 'fósforo bajo' : '', d.nivel_k === 'bajo' ? 'potasio bajo' : '', (d.siembras_sin_purma || 0) >= S.siembras_sin_purma ? d.siembras_sin_purma + ' siembras seguidas sin purma' : ''].filter(Boolean).join(', ') + '.');
      return Object.assign({ clave: 'suelo', pasos, nota }, T.suelo);
    }
    pasos.push('El suelo no explica la caída.');
    return Object.assign({ clave: 'plaga', pasos, nota }, T.plaga);
  };
  /* e = { cultivo, fecha_siembra, serie, base?, diario, clima, nivel_p, nivel_k, siembras_sin_purma, hoy }
     Devuelve los puntos (esperado, medido, desvío), el estado del último dato y la alerta si corresponde. */
  M.seguimiento = function (e, cfg) {
    cfg = cfg || Chakra.CFG;
    const S = cfg.seguimiento, base = e.base != null ? e.base : M.lineaBase(e.serie, e.fecha_siembra);
    const d0 = C.dia(e.fecha_siembra);
    const puntos = e.serie.filter((p) => C.dia(p.fecha) >= d0).map((p) => {
      const esp = M.esperado(e.cultivo, C.dia(p.fecha) - d0, base, cfg);
      const med = p.estado === 'medido' ? p.evi : null;
      const desvio = med != null && esp ? med / esp - 1 : null;
      return { fecha: p.fecha, estado: p.estado, evi: p.estado === 'medido' ? p.evi : p.evi_suavizado, esperado: esp, desvio, bajo: desvio != null && desvio <= S.alerta_desvio + 1e-9 };
    });
    const out = { base, banda: S.banda, puntos, alerta: null, mensaje: '' };
    if (base == null) { out.mensaje = 'Falta la línea base: no hay EVI medido en el año anterior a la siembra.'; return out; }
    if (!puntos.length) { out.mensaje = 'Todavía no hay imágenes después de la siembra.'; return out; }
    const ult = puntos[puntos.length - 1];
    // Alertas solo con datos medidos (5.4): si el último compuesto es faltante, se espera
    if (ult.estado !== 'medido') { out.nublado = true; out.mensaje = 'Dato nublado, esperando el próximo compuesto.'; return out; }
    if (!ult.bajo) { out.mensaje = `Crece como se esperaba (${pct(ult.desvio)} frente a lo esperado).`; return out; }
    const dx = M.diagnostico({ periodo: M.periodo(e.diario, e.clima, e.fecha_siembra, ult.fecha, cfg), nivel_p: e.nivel_p, nivel_k: e.nivel_k, siembras_sin_purma: e.siembras_sin_purma }, cfg);
    const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    out.alerta = {
      fecha: ult.fecha, nivel: ult.desvio <= 2 * S.alerta_desvio ? 'alto' : 'medio', desvio: ult.desvio, causa: dx.causa, sugerencia: cap(dx.sugerencia) + '.', pasos: dx.pasos,
      mensaje: `Creció menos de lo esperado (${pct(ult.desvio)}). Causa probable: ${dx.causa}${dx.nota ? ' (' + dx.nota + ')' : ''}. Sugerencia: ${dx.sugerencia}.`,
    };
    out.mensaje = out.alerta.mensaje;
    return out;
  };

  /* ======================= 10. Señales locales frente a la lluvia ======================= */
  // Media móvil de 7 días y percentil 70 de cada mes del año (climatología). Se calcula una vez por serie.
  M.climatologiaLluvia = function (diario, cfg) {
    cfg = cfg || Chakra.CFG;
    const k = cfg.senales.ventana_media_dias, n = diario.lluvia.length, mm = new Array(n).fill(null), d0 = C.dia(diario.inicio);
    const porMes = Array.from({ length: 12 }, () => []);
    let s = 0, c = 0;
    for (let i = 0; i < n; i++) {
      const x = diario.lluvia[i]; if (x != null) { s += x; c++; }
      if (i >= k) { const y = diario.lluvia[i - k]; if (y != null) { s -= y; c--; } }
      if (i >= k - 1 && c >= k - 1) { mm[i] = s / c; porMes[new Date((d0 + i) * 864e5).getUTCMonth()].push(mm[i]); }
    }
    return { d0, media: mm, p: porMes.map((xs) => C.percentil(xs, cfg.senales.percentil)) };
  };
  /* fechas = fechas en que se observó la misma señal (una por año). Para cada una:
     inicio de lluvia fuerte = primer día después de la señal en que la media móvil supera el percentil 70 del mes.
     Coincide si el desfase está entre 7 y 21 días. */
  M.compararSenal = function (fechas, diario, clim, cfg) {
    cfg = cfg || Chakra.CFG;
    const S = cfg.senales; clim = clim || M.climatologiaLluvia(diario, cfg);
    const anios = fechas.map((fecha) => {
      const i0 = C.dia(fecha) - clim.d0;
      if (i0 < 0 || i0 >= clim.media.length - 1) return { anio: +fecha.slice(0, 4), fecha, sin_dato: true };
      for (let i = i0 + 1; i < Math.min(clim.media.length, i0 + 1 + S.buscar_hasta_dias); i++) {
        const m = new Date((clim.d0 + i) * 864e5).getUTCMonth();
        if (clim.media[i] != null && clim.p[m] != null && clim.media[i] > clim.p[m] + 1e-6) {
          const desfase = i - i0;
          return { anio: +fecha.slice(0, 4), fecha, inicio_lluvia: C.iso(clim.d0 + i), desfase, coincide: desfase >= S.coincide_min_dias && desfase <= S.coincide_max_dias };
        }
      }
      return { anio: +fecha.slice(0, 4), fecha, inicio_lluvia: null, desfase: null, coincide: false };
    }).sort((a, b) => a.anio - b.anio);
    const con = anios.filter((a) => !a.sin_dato);
    return { anios, total: con.length, coinciden: con.filter((a) => a.coincide).length };
  };
})();

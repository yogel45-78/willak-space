/* ==========================================================================
   pruebas.js — pruebas automáticas con la parcela Guaba CEIPA (especificación,
   sección 12). Los datos son ilustrativos: comprueban que la lógica funciona.
   Se ven en pruebas.html y también corren en Node (node pruebas-node.js).
   ========================================================================== */
(function () {
  const Chakra = (globalThis.Chakra = globalThis.Chakra || {});

  Chakra.pruebas = function () {
    const C = Chakra.calc, V = Chakra.verdor, M = Chakra.motor, D = Chakra.demo, CFG = Chakra.CFG;
    const out = [];
    const p = (seccion, nombre, esperado, obtenido) => out.push({ seccion, nombre, esperado: String(esperado), obtenido: String(obtenido), ok: String(esperado) === String(obtenido) });
    const nivel = (c) => Chakra.nivelTexto(c);
    const lote = Chakra.normalizarLote ? Chakra.normalizarLote(D.lote()) : D.lote();
    const ctx = Chakra.contexto(lote), cen = Chakra.centroDe(lote.anillo), vd = ctx.verdor;

    /* --- Sección 12: tabla de valores esperados --- */
    p('12', 'Coordenadas', '-1.23889, -77.89613', cen[0].toFixed(5) + ', ' + cen[1].toFixed(5));
    p('12', 'Pendiente', '3 % → erosión Bajo', ctx.pendiente + ' % → erosión ' + nivel(ctx.riesgos.erosion));
    p('12', 'Lluvia anual / días > 50 mm', '≈ 4900 mm / 21 días → lavado Alto', '≈ ' + Math.round(ctx.lluvia / 100) * 100 + ' mm / ' + ctx.fuertes + ' días → lavado ' + nivel(ctx.riesgos.lavado));
    p('12', 'pH', '5.2 → acidez Medio', ctx.ph + ' → acidez ' + nivel(ctx.riesgos.acidez));
    p('12', 'Días > 32 °C', '9 → calor Bajo', ctx.calor + ' → calor ' + nivel(ctx.riesgos.calor));
    p('12', 'Racha seca máxima', '6 días → periodos secos Bajo', ctx.racha + ' días → periodos secos ' + nivel(ctx.riesgos.seco));
    p('12', 'EVI parcela 2026 / bosque', '0.475 / 0.54 → recuperación 88 % → purma_madura', ctx.evi + ' / ' + ctx.evi_bosque + ' → recuperación ' + ctx.recuperacion + ' % → ' + ctx.etapa_detectada);
    const ap = vd.aperturas.map((a) => `${a.anio} (EVI cae de ${a.antes} a ${a.despues})`).join('; ');
    p('12', 'Apertura detectada', '2009 (EVI cae de 0.52 a 0.29)', ap);
    p('12', 'Ranking con pesos 40/25/20/15', 'Yuca + maní 82, Papa china + canavalia 74, Maíz + fréjol 67, Plátano + cacao bajo guaba 63, Pasto para forraje 41',
      M.ranking(ctx.an, CFG.recomendacion.pesos).map((r) => r.opcion.nombre + ' ' + r.nota).join(', '));
    p('12', 'Meses de lluvia fuerte', 'abril a julio', ctx.mesesLluvia);
    const plan = M.plan('yuca_mani', { inicio: 2027, meses: ctx.meses });
    p('12', 'Plan: suelo cubierto', '60 de 60 meses', plan.cubiertos + ' de ' + plan.total_meses + ' meses');

    /* --- Sección 7.2: subnotas del catálogo --- */
    const esp72 = { yuca_mani: '90/72/80/78', papachina_canavalia: '72/82/78/60', maiz_frejol: '60/66/70/80', platano_cacao: '45/70/75/85', pasto: '30/40/55/50' };
    CFG.opciones.forEach((op) => { const s = M.subnotas(op, ctx.an); p('7.2', 'Subnotas de ' + op.nombre + ' (rotación/suelo/clima/prioridades)', esp72[op.id], [s.rot, s.suelo, s.clima, s.prior].join('/')); });
    // Los pesos se normalizan: 80/50/40/30 debe dar el mismo ranking que 40/25/20/15
    p('7', 'Pesos normalizados (80/50/40/30 = 40/25/20/15)', M.ranking(ctx.an).map((r) => r.nota).join(','), M.ranking(ctx.an, { rot: 80, suelo: 50, clima: 40, prior: 30 }).map((r) => r.nota).join(','));

    /* --- Sección 8: plan esperado --- */
    const it = (id, n) => plan.items.filter((x) => x.cultivo === id)[n || 0] || {};
    p('8', 'Yuca en enero de 2027, 12 meses', '2027-01 → 2027-12', it('yuca').mes_inicio + ' → ' + it('yuca').mes_fin);
    p('8', 'Maní en febrero de 2027, 4–5 meses', '2027-02 → 2027-06', it('mani').mes_inicio + ' → ' + it('mani').mes_fin);
    p('8', 'Maíz en enero y fréjol en febrero de 2028', '2028-01, 2028-02', it('maiz').mes_inicio + ', ' + it('frejol').mes_inicio);
    p('8', 'Canavalia insertada en mayo de 2028', '2028-05 (insertada: true)', it('canavalia').mes_inicio + ' (insertada: ' + it('canavalia').insertado + ')');
    p('8', 'Plátano en enero; cacao y guayusa en marzo de 2029', '2029-01, 2029-03, 2029-03', [it('platano').mes_inicio, it('cacao').mes_inicio, it('guayusa').mes_inicio].join(', '));
    p('8', 'Nueva purma', '2032-01', plan.purma.desde);
    p('8', 'Etapas encadenadas', 'Apertura 2027-01–2027-12 · Ciclo corto 2028-01–2028-12 · Bajo sombra 2029-01–2031-12', plan.etapas.map((e) => `${e.nombre} ${e.desde}–${e.hasta}`).join(' · '));
    p('8', 'Meses de lluvia fuerte sin cobertura', 0, plan.lluvia_sin_cubrir);

    /* --- Sección 5: nubes --- */
    const px = (o) => Object.assign({ evi_raw: 5000, ndvi_raw: 7000, fiabilidad: 0, vi_quality: 0, fraccion: 1 }, o);
    p('5.1', 'pixel_reliability 0 y 1 se usan; 2, 3 y −1 se descartan', 'true,true,false,false,false', [0, 1, 2, 3, -1].map((f) => V.pixelValido(px({ fiabilidad: f }), CFG)).join(','));
    p('5.1', 'VI_Quality con nube adyacente o sombra se descarta', 'false,false', [1 << 8, 1 << 15].map((q) => V.pixelValido(px({ vi_quality: q }), CFG)).join(','));
    p('4.3', 'EVI = entero × 0,0001; relleno −3000 = sin dato', '0.5 / faltante', V.valorParcela([px({})]).evi + ' / ' + V.valorParcela([px({ evi_raw: -3000 })]).estado);
    p('5.2', 'Promedio ponderado por fracción de píxel', 0.44, V.valorParcela([px({ evi_raw: 4000, fraccion: 0.6 }), px({ evi_raw: 5000, fraccion: 0.4 })]).evi);
    p('5.2', 'Menos del 50 % del área válida = faltante', 'faltante / medido', V.valorParcela([px({ fraccion: 0.6, fiabilidad: 3 }), px({ fraccion: 0.4 })]).estado + ' / ' + V.valorParcela([px({ fraccion: 0.5, fiabilidad: 3 }), px({ fraccion: 0.5 })]).estado);
    const f = (dia, evi) => ({ fecha: C.iso(C.dia('2024-01-01') + dia), satelite: 'terra', evi, ndvi: null, pct_area_valida: evi == null ? 0 : 100, estado: evi == null ? 'faltante' : 'medido' });
    const s1 = V.serie([f(0, 0.5), f(8, 0.5), f(16, null), f(24, null), f(32, 0.5), f(40, 0.5), f(48, null), f(56, null), f(64, null), f(72, null), f(80, null), f(88, null), f(96, null), f(104, 0.5), f(112, 0.5)]);
    p('5.3', 'Hueco de 32 días se rellena; hueco de 64 días queda faltante', 'rellenado,rellenado / faltante', [s1[2].estado, s1[3].estado].join(',') + ' / ' + s1[8].estado);
    p('5.3', 'Whittaker conserva una serie plana', '0.5', s1[3].evi_suavizado);
    const s2 = V.serie([0.5, 0.5, 0.5, 0.3, 0.5, 0.5, 0.5, 0.5].map((e, i) => f(8 * i, e)));
    p('5.3', 'Envolvente superior: una baja aislada (nube) casi no arrastra la curva', 'true', s2[3].evi_suavizado > 0.44);
    const an1 = V.anual(s1)[0];
    p('5.4', 'Historia anual = mediana de lo medido', 0.5, an1.evi);
    p('5.4', 'Confianza por año (60 % alta · 30–60 % media · < 30 % baja)', 'media,baja', V.anual(s1)[0].confianza + ',' + V.anual([f(0, 0.5), f(8, 0.5), f(16, 0.5), f(24, 0.5), f(32, 0.5), f(40, null)])[0].confianza);
    p('5.4', 'Demo: hueco largo de 2020 queda con fechas faltantes', 'true', vd.serie.some((x) => x.fecha.startsWith('2020') && x.estado === 'faltante'));
    p('5.4', 'Demo: hay fechas rellenadas y todas guardan crudo y suavizado', 'true', vd.serie.some((x) => x.estado === 'rellenado') && vd.serie.filter((x) => x.estado !== 'faltante').every((x) => x.evi_suavizado != null));

    /* --- Sección 6.2: etapas por año --- */
    const et = (y) => (vd.historia.find((h) => h.anio === y) || {}).etapa;
    p('6.2', 'Etapas 2009 · 2010 · 2011 · 2017 · 2023 · 2026', 'apertura · ciclo_corto · ciclo_corto · sombra · purma · purma_madura', [2009, 2010, 2011, 2017, 2023, 2026].map(et).join(' · '));
    p('6.1', 'Bosque de referencia: se descarta el que varía más de 5 %', '0.54',
      V.bosqueReferencia([{ id: 'a', anual: [2001, 2002, 2003].map((anio) => ({ anio, evi: 0.54 })) }, { id: 'b', anual: [{ anio: 2001, evi: 0.3 }, { anio: 2002, evi: 0.5 }, { anio: 2003, evi: 0.4 }] }])[0].evi);

    /* --- Sección 9: seguimiento --- */
    const sg = M.seguimiento(D.ejemploSeguimiento());
    p('9', 'Mensaje de alerta de ejemplo', 'Creció menos de lo esperado (−24 %). Causa probable: suelo cansado (la lluvia fue normal). Sugerencia: reforzar leguminosas.', sg.alerta ? sg.alerta.mensaje : sg.mensaje);
    const ej = D.ejemploSeguimiento(); ej.serie = ej.serie.concat([{ fecha: '2026-06-20', satelite: 'terra', evi: null, estado: 'faltante', evi_suavizado: null }]);
    p('9', 'Último compuesto faltante: no se alerta', 'Dato nublado, esperando el próximo compuesto.', M.seguimiento(ej).mensaje);
    p('9', 'Diagnóstico sin suelo cansado: se pregunta a la familia por plagas', 'plaga', M.diagnostico({ periodo: { razon: 0.05, calor: 0, calor_normal: 1, lluvia: 100, lluvia_normal: 95 }, nivel_p: 'medio', nivel_k: 'medio', siembras_sin_purma: 1 }).clave);
    p('9', 'Tres siembras seguidas sin purma = suelo cansado', 'suelo', M.diagnostico({ periodo: { razon: 0, calor: 0, calor_normal: 1, lluvia: 100, lluvia_normal: 100 }, nivel_p: 'medio', nivel_k: 'medio', siembras_sin_purma: 3 }).clave);
    p('9', 'Lluvia 30 % bajo lo normal: la causa es la lluvia', 'lluvia_poca', M.diagnostico({ periodo: { razon: -0.3, calor: 0, calor_normal: 1, lluvia: 70, lluvia_normal: 100 }, nivel_p: 'bajo' }).clave);

    /* --- Sección 10: señales --- */
    const cs = M.compararSenal(D.senales().map((s) => s.fecha_obs), D.diario());
    p('10', 'Señal de ejemplo frente a la lluvia', 'coincide 3 de 4 años', 'coincide ' + cs.coinciden + ' de ' + cs.total + ' años');
    p('10', 'Coincide solo si el desfase está entre 7 y 21 días', 'true', cs.anios.every((a) => a.coincide === (a.desfase >= 7 && a.desfase <= 21)));

    /* --- Secciones 4.5, 4.6 y 4.7 --- */
    const sgj = { properties: { layers: [{ name: 'phh2o', depths: [{ label: '0-5cm', values: { mean: 50 } }, { label: '5-15cm', values: { mean: 52 } }, { label: '15-30cm', values: { mean: 54 } }] },
      { name: 'soc', depths: [{ label: '0-5cm', values: { mean: 400 } }, { label: '5-15cm', values: { mean: 250 } }, { label: '15-30cm', values: { mean: 150 } }] },
      { name: 'nitrogen', depths: [{ label: '0-5cm', values: { mean: 300 } }, { label: '5-15cm', values: { mean: 240 } }, { label: '15-30cm', values: { mean: 180 } }] },
      { name: 'clay', depths: [{ label: '0-5cm', values: { mean: 300 } }, { label: '5-15cm', values: { mean: 330 } }, { label: '15-30cm', values: { mean: 360 } }] }] } };
    const so = C.soilgrids(sgj);
    p('4.6', 'SoilGrids: promedio 0–30 cm ponderado (5, 10, 15) y conversiones', 'pH 5.3 · carbono 2.25 % · MO 3.9 % · N 0.22 % · arcilla 34 %', `pH ${so.ph} · carbono ${so.carbono} % · MO ${so.om} % · N ${so.n} % · arcilla ${so.arcilla} %`);
    const plano = Array.from({ length: 5 }, (_, fi) => Array.from({ length: 5 }, (_, c) => 500 + c * 9)); // sube 9 m cada 90 m = 10 %
    p('4.5', 'Pendiente de Horn en una ladera pareja del 10 %', 10, C.pendienteHorn(plano, 90, 90).pct);
    const rad = [-14, -14.2, -13.9, -14.1, -18].map((vh_db, i) => ({ fecha: C.iso(C.dia('2026-01-01') + 12 * i), vh_db }));
    p('4.7', 'Radar: caída de VH mayor a 3 dB = posible apertura', '2026-02-18', C.radarApertura(rad).map((x) => x.fecha).join(','));
    p('4.1', 'Clima: los 4 meses seguidos más lluviosos', '3,4,5,6', C.mesesLluviaFuerte([330, 340, 400, 520, 560, 540, 480, 350, 340, 370, 360, 310], 4).join(','));

    /* --- Sección 6: umbrales del semáforo --- */
    const col = (id, c) => Chakra.RIESGOS.find((r) => r.id === id).evaluar(c).color;
    p('6', 'Erosión 4 · 5 · 15 · 16 %', 'verde,amarillo,amarillo,rojo', [4, 5, 15, 16].map((x) => col('erosion', { pendiente: x })).join(','));
    p('6', 'Lavado 2400/7 · 2400/9 · 3600/10 · 3600/15', 'verde,amarillo,amarillo,rojo', [[2400, 7], [2400, 9], [3600, 10], [3600, 15]].map(([l, d]) => col('lavado', { lluvia: l, fuertes: d })).join(','));
    p('6', 'Acidez pH 5,5 · 4,5 · 4,4', 'verde,amarillo,rojo', [5.5, 4.5, 4.4].map((x) => col('acidez', { ph: x })).join(','));
    p('6', 'Calor 14 · 15 · 45 · 46 días', 'verde,amarillo,amarillo,rojo', [14, 15, 45, 46].map((x) => col('calor', { calor: x })).join(','));
    p('6', 'Periodos secos 9 · 10 · 20 · 21 días', 'verde,amarillo,amarillo,rojo', [9, 10, 20, 21].map((x) => col('seco', { racha: x })).join(','));
    p('6', 'Frase del lavado', '≈ 4 900 mm de lluvia al año y 21 días con más de 50 mm: la lluvia se lleva lo que el suelo no retiene.', ctx.detalle.lavado.dato);
    p('6', 'Acidez con muestreo CEIPA: confianza alta', 'alta', ctx.conf.ph);
    return out;
  };
})();

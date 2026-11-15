/* ==========================================================================
   ambiente.js — "Analizar parcela": trae los datos del lugar y arma el análisis.
   Especificación, secciones 4 (fuentes), 6 (indicadores) y 11 (progreso por fuente).

   Qué se puede traer desde el navegador y qué no:
     · NASA POWER ...... sí, sin clave: clima diario desde 2001 (T2M, T2M_MAX, RH2M, GWETROOT, PRECTOTCORR)
     · SoilGrids ....... sí, sin clave: pH, carbono, nitrógeno y textura, promedio 0–30 cm
     · GES DISC (IMERG)  solo por el servidor (servidor.js → /api/lluvia): pide cuenta Earthdata y el token
                         nunca va al navegador (sección 2). Si no hay servidor o falla, se usa el respaldo
                         que da la propia especificación (4.1): PRECTOTCORR de NASA POWER.
     · AppEEARS ........ solo por el servidor (/api/verdor/...): verdor MODIS y elevación SRTM. El trabajo tarda
                         minutos y se vigila en segundo plano. Sin servidor: pendiente de respaldo (Copernicus
                         de 90 m, Horn) y verdor sin dato.
   Cada dato guarda su fuente, su fecha y su confianza; el dato de respaldo baja un nivel de confianza.
   ========================================================================== */
(function () {
  const Chakra = window.Chakra, C = Chakra.calc, CFG = Chakra.CFG;

  const centro = (anillo) => [anillo.reduce((s, p) => s + p[0], 0) / anillo.length, anillo.reduce((s, p) => s + p[1], 0) / anillo.length];
  Chakra.centroDe = centro;
  const isoHoy = () => new Date().toISOString().slice(0, 10);
  const conTiempo = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('tardó demasiado')), ms))]);
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const BAJAR = { alta: 'media', media: 'baja', baja: 'baja' };

  /* ---------- 4.1 NASA POWER: clima diario 2001–hoy ---------- */
  async function power(lat, lng) {
    const fin = new Date(Date.now() - 2 * 864e5).toISOString().slice(0, 10).replaceAll('-', '');
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,T2M_MAX,RH2M,GWETROOT,PRECTOTCORR&community=AG&latitude=${lat.toFixed(5)}&longitude=${lng.toFixed(5)}&start=20010101&end=${fin}&format=JSON`;
    const r = await conTiempo(fetch(url), 90000); if (!r.ok) throw new Error('NASA POWER respondió ' + r.status);
    const P = (await r.json()).properties.parameter, claves = Object.keys(P.PRECTOTCORR).sort();
    if (!claves.length) throw new Error('NASA POWER no devolvió días');
    const nulo = (x) => (x == null || x <= -999 ? null : x); // valor faltante −999 → sin dato
    const diario = { inicio: claves[0].slice(0, 4) + '-' + claves[0].slice(4, 6) + '-' + claves[0].slice(6, 8), lluvia: [], tmax: [], humedad: [] };
    claves.forEach((k) => { diario.lluvia.push(nulo(P.PRECTOTCORR[k])); diario.tmax.push(nulo(P.T2M_MAX[k])); diario.humedad.push(nulo(P.GWETROOT[k])); });
    // los últimos días suelen venir sin dato: se recortan para no guardar una cola vacía
    while (diario.lluvia.length && diario.lluvia[diario.lluvia.length - 1] == null) { diario.lluvia.pop(); diario.tmax.pop(); diario.humedad.pop(); }
    return diario;
  }
  // Para guardar en el equipo: décimas en enteros (ocupa menos). La humedad solo se guarda como promedio.
  const empacar = (d) => ({ inicio: d.inicio, e: 10, lluvia: d.lluvia.map((x) => (x == null ? null : Math.round(x * 10))), tmax: d.tmax.map((x) => (x == null ? null : Math.round(x * 10))) });
  const desempacar = (d) => ({ inicio: d.inicio, lluvia: d.lluvia.map((x) => (x == null ? null : x / d.e)), tmax: d.tmax.map((x) => (x == null ? null : x / d.e)) });

  /* ---------- 4.6 SoilGrids ---------- */
  async function soilgrids(lat, lng) {
    const props = ['phh2o', 'soc', 'nitrogen', 'clay', 'silt', 'sand'].map((p) => 'property=' + p).join('&');
    const url = `https://rest.isric.org/soilgrids/v2.0/properties/query?lon=${lng.toFixed(5)}&lat=${lat.toFixed(5)}&${props}&depth=0-5cm&depth=5-15cm&depth=15-30cm&value=mean`;
    const r = await conTiempo(fetch(url), 100000); if (!r.ok) throw new Error('SoilGrids respondió ' + r.status); // SoilGrids a veces tarda cerca de un minuto
    const s = C.soilgrids(await r.json());
    if (s.ph == null) throw new Error('sin dato aquí');
    return Object.assign(s, { fuente: 'SoilGrids 2.0 (ISRIC), 0–30 cm' });
  }

  /* ---------- 4.5 Pendiente con el método de Horn (respaldo sin clave del SRTM de AppEEARS) ---------- */
  async function pendiente(anillo) {
    const lats = anillo.map((p) => p[0]), lngs = anillo.map((p) => p[1]), lat0 = (Math.min(...lats) + Math.max(...lats)) / 2;
    const mLat = 111320, mLng = 111320 * Math.cos((lat0 * Math.PI) / 180);
    let paso = 90; // metros: tamaño de celda del modelo de elevación
    let nf, nc;
    for (;;) { // rejilla que cubre la parcela con una celda de margen; máximo 100 puntos por pedido
      nf = Math.ceil(((Math.max(...lats) - Math.min(...lats)) * mLat) / paso) + 3; nc = Math.ceil(((Math.max(...lngs) - Math.min(...lngs)) * mLng) / paso) + 3;
      if (nf * nc <= 100) break; paso *= 1.3;
    }
    const latN = lat0 + ((nf - 1) / 2) * (paso / mLat), lngO = (Math.min(...lngs) + Math.max(...lngs)) / 2 - ((nc - 1) / 2) * (paso / mLng);
    const pts = []; for (let f = 0; f < nf; f++) for (let c = 0; c < nc; c++) pts.push([latN - f * (paso / mLat), lngO + c * (paso / mLng)]);
    const url = `https://api.open-meteo.com/v1/elevation?latitude=${pts.map((p) => p[0].toFixed(5)).join(',')}&longitude=${pts.map((p) => p[1].toFixed(5)).join(',')}`;
    const r = await conTiempo(fetch(url), 20000); if (!r.ok) throw new Error('elevación respondió ' + r.status);
    const e = (await r.json()).elevation; if (!e || e.length < pts.length) throw new Error('sin elevación');
    const z = []; for (let f = 0; f < nf; f++) z.push(e.slice(f * nc, (f + 1) * nc));
    const h = C.pendienteHorn(z, paso, paso, (f, c) => C.puntoEnPoligono(pts[f * nc + c], anillo));
    if (!h) throw new Error('sin elevación');
    return { pct: h.pct, celdas: h.celdas, altura: Math.round(z[Math.floor(nf / 2)][Math.floor(nc / 2)]), fuente: CFG.respaldos.pendiente, oficial: false };
  }

  /* Avance por fuente de cada parcela (en memoria). Los trabajos que siguen en segundo plano lo actualizan con avanceFuente. */
  Chakra.progreso = {};
  Chakra.avanceFuente = function (lote, id, estado, nota) {
    const p = (Chakra.progreso[lote.id] = Chakra.progreso[lote.id] || Object.fromEntries(CFG.fuentes.map((f) => [f.id, { estado: 'listo', nota: '' }])));
    p[id] = { estado, nota };
    const ul = typeof document !== 'undefined' && document.getElementById('pa-prog');
    if (ul && Chakra.estado.seleccion === lote.id && Chakra.parcela) { ul.innerHTML = Chakra.parcela.listaProg(p); const caja = document.getElementById('pa-prog-caja'); if (caja) caja.hidden = false; }
  };

  /* ---------- Analizar parcela: trabajos por fuente con progreso visible (sección 11) ----------
     avisar(progreso) recibe { power, appeears, gesdisc, soilgrids } con { estado, nota }.
     estado: cola · bajando · listo · fallo · servidor (necesita servidor; se usa el respaldo) */
  Chakra.analizando = new Set(); // parcelas con un análisis en curso
  Chakra.analizar = async function (lote, avisar) {
    if (!lote || lote.anillo.length < 3) throw new Error('Primero marca la parcela en el mapa.');
    if (Chakra.analizando.has(lote.id)) throw new Error('Esta parcela ya se está analizando. Espera a que termine.');
    Chakra.analizando.add(lote.id);
    try { return await analizarInterno(lote, avisar); }
    finally { Chakra.analizando.delete(lote.id); if (Chakra.refrescarSi) Chakra.refrescarSi(lote, ['resumen']); }
  };
  async function analizarInterno(lote, avisar) {
    const prog = (Chakra.progreso[lote.id] = {}); CFG.fuentes.forEach((f) => (prog[f.id] = { estado: 'cola', nota: 'En cola' }));
    const pon = (id, estado, nota) => { prog[id] = { estado, nota }; if (avisar) avisar(prog); };
    if (avisar) avisar(prog);

    if (lote.demo) { // parcela de prueba: no se llama a internet; se muestran los datos ilustrativos
      const D = Chakra.demo;
      for (const [id, nota] of [['power', 'Clima diario 2001–2026'], ['appeears', 'EVI de MODIS (Terra y Aqua) y pendiente'], ['gesdisc', 'Lluvia diaria IMERG'], ['soilgrids', 'Suelo 0–30 cm']]) {
        pon(id, 'bajando', 'Preparando…'); await esperar(350); pon(id, 'listo', nota + ' · datos ilustrativos');
      }
      lote.ambiente = D.lote().ambiente; lote.pendiente_analisis = false;
      Chakra.invalidar(lote); guardarAnalisis(lote); Chakra.guardar();
      return lote.ambiente;
    }
    if (navigator.onLine === false) { // sin internet: queda en cola y se lanza al reconectar (sección 11)
      lote.pendiente_analisis = true; Chakra.guardar();
      throw new Error('Sin internet: el análisis queda en cola y se lanza solo al reconectar.');
    }
    const [lat, lng] = centro(lote.anillo), avisos = [], S = Chakra.servidor;
    const amb = { fecha: isoHoy(), centro: [lat, lng], clima: null, diario: null, suelo: null, pendiente: null, avisos, fuentes: {} };
    // ¿Hay servidor con la cuenta Earthdata? Si lo hay, IMERG y AppEEARS se piden por él; si no, van los respaldos.
    const sal = await S.salud(), conServidor = !!(sal && sal.earthdata);
    if (sal && !sal.earthdata) avisos.push('El servidor responde, pero no tiene configurada la cuenta Earthdata: se usan los respaldos.');
    pon('power', 'bajando', 'Descargando el clima diario desde 2001…');
    pon('soilgrids', 'bajando', 'Consultando el suelo… (puede tardar un minuto)');

    // 4.1 NASA POWER: calor y humedad de raíces; su lluvia (PRECTOTCORR) queda como respaldo
    let dPower = null;
    const tPower = power(lat, lng).then((diario) => {
      dPower = diario;
      amb.fuentes.power = { version: CFG.fuentes[0].version, fecha_consulta: amb.fecha, periodo: diario.inicio + ' a ' + C.iso(C.dia(diario.inicio) + diario.lluvia.length - 1) };
      pon('power', 'listo', `${C.miles(diario.lluvia.length)} días desde ${diario.inicio.slice(0, 4)}`);
    }).catch((e) => { avisos.push('No se pudo traer el clima de NASA POWER (' + e.message + '). Vuelve a intentarlo más tarde.'); pon('power', 'fallo', 'Falló: ' + e.message); });

    // 4.2 IMERG por el servidor (GES DISC): es la lluvia oficial de la app
    let imerg = null, tImerg = Promise.resolve();
    if (conServidor) {
      pon('gesdisc', 'bajando', 'Descargando la lluvia IMERG desde 2001…');
      tImerg = S.lluvia(lat, lng).then((j) => { imerg = j; pon('gesdisc', 'listo', `Lluvia IMERG diaria hasta ${j.hasta} (versión final hasta ${j.final_hasta})`); })
        .catch((e) => { avisos.push('No se pudo traer la lluvia IMERG (' + e.message + '). Se usa el respaldo: lluvia de NASA POWER.'); pon('gesdisc', 'fallo', 'Falló: ' + e.message + ' Respaldo: lluvia de NASA POWER.'); });
    } else pon('gesdisc', 'servidor', 'Necesita servidor (cuenta Earthdata). Se usa el respaldo: lluvia de NASA POWER.');

    // 4.3 y 4.5 AppEEARS por el servidor: se PIDE el trabajo (verdor + elevación); el resultado llega en minutos
    let tVerdor = Promise.resolve();
    if (conServidor) {
      const bp1 = Chakra.estado.lotes.find((x) => x !== lote && /^\s*BP1\s*$/i.test(x.nombre) && x.anillo.length >= 3); // bosque de referencia dibujado
      pon('appeears', 'bajando', 'Enviando el pedido a AppEEARS…');
      tVerdor = S.pedir(lote.anillo, bp1 ? bp1.anillo : null).then((info) => {
        lote.verdor_tarea = Object.assign(info, { avance: 0, estado: 'pendiente', dem_listo: false }); Chakra.guardar(); // se guarda ya, por si se cierra la app antes de terminar
        pon('appeears', 'bajando', 'Pedido enviado a AppEEARS (verdor y elevación). Tarda varios minutos: puedes seguir trabajando.');
      }).catch((e) => { avisos.push('No se pudo pedir el verdor a AppEEARS (' + e.message + ').'); pon('appeears', 'fallo', 'Falló el pedido: ' + e.message); });
    } else pon('appeears', 'bajando', 'Necesita servidor para el verdor. Calculando la pendiente con el respaldo…');

    let sueloNuevo = null;
    const tSuelo = soilgrids(lat, lng).then((s) => {
      sueloNuevo = s; amb.suelo = s; amb.fuentes.soilgrids = { version: 'SoilGrids 2.0', fecha_consulta: amb.fecha };
      pon('soilgrids', 'listo', 'pH, materia orgánica, nitrógeno y textura (0–30 cm)');
    }).catch((e) => {
      avisos.push(/sin dato/.test(e.message) ? 'SoilGrids no tiene dato de suelo en este punto (zona urbana, agua o sin mapear). Escribe el pH y la materia orgánica en Medidas.' : 'No se pudo traer el suelo de SoilGrids (a veces se satura). Escribe el pH y la materia orgánica en Medidas.');
      pon('soilgrids', 'fallo', 'Falló: ' + e.message);
    });
    // Pendiente de respaldo (sirve de inmediato; la reemplaza la de SRTM cuando AppEEARS termina)
    const tPend = pendiente(lote.anillo).then((p) => {
      amb.pendiente = p; amb.fuentes.pendiente = { version: 'Copernicus DEM GLO-90 (respaldo de SRTMGL1_NC.003)', fecha_consulta: amb.fecha };
      if (!conServidor) pon('appeears', 'servidor', `Verdor (MODIS): necesita servidor. Pendiente con respaldo: ${String(p.pct).replace('.', ',')} %.`);
    }).catch(() => { avisos.push('No se pudo calcular la pendiente de respaldo. Escríbela en Medidas.'); if (!conServidor) pon('appeears', 'servidor', 'Verdor y pendiente SRTM: necesitan servidor. El respaldo de pendiente falló.'); });
    // SoilGrids puede tardar más de un minuto: no se espera por él para mostrar el clima y la pendiente
    await Promise.all([tPower, tImerg, tPend, tVerdor]);

    // Clima: la lluvia oficial es IMERG; PRECTOTCORR solo si IMERG no está (sección 4.1)
    if (imerg || dPower) {
      const inicio = imerg ? imerg.inicio : dPower.inicio, corr = dPower ? C.diasEntre(inicio, dPower.inicio) : 0; // por si las dos series no empiezan el mismo día
      const n = Math.max(imerg ? imerg.lluvia.length : 0, dPower ? dPower.lluvia.length + corr : 0), diario = { inicio, lluvia: [], tmax: [], humedad: [] };
      const de = (arr, i) => (arr && i >= 0 && i < arr.length && arr[i] != null ? arr[i] : null);
      for (let i = 0; i < n; i++) {
        diario.lluvia.push(imerg ? (de(imerg.lluvia, i) == null ? null : imerg.lluvia[i] / imerg.e) : de(dPower.lluvia, i - corr));
        diario.tmax.push(dPower ? de(dPower.tmax, i - corr) : null); diario.humedad.push(dPower ? de(dPower.humedad, i - corr) : null);
      }
      amb.clima = Object.assign(C.climaDesdeDiario(diario), imerg
        ? { fuente: 'Lluvia IMERG (GPM_3IMERGDF v07, GES DISC)' + (dPower ? ' · calor y humedad: NASA POWER' : ''), oficial: true }
        : { fuente: 'NASA POWER (T2M_MAX, GWETROOT; lluvia PRECTOTCORR como respaldo de IMERG)', oficial: false });
      amb.diario = empacar(diario);
    }
    amb.fuentes.gesdisc = imerg ? { version: imerg.producto, fecha_consulta: amb.fecha, periodo: imerg.inicio + ' a ' + imerg.hasta }
      : { version: 'GPM_3IMERGDF.07', fecha_consulta: null, nota: 'No consultado' + (conServidor ? ': falló' : ': necesita servidor') + '. Respaldo: PRECTOTCORR de NASA POWER.' };
    amb.fuentes.appeears = lote.verdor_tarea && conServidor ? { version: 'MOD13Q1.061 · MYD13Q1.061 · SRTMGL1_NC.003', fecha_consulta: amb.fecha, nota: 'Pedido enviado; el resultado llega en unos minutos.' }
      : { version: 'MOD13Q1.061 · MYD13Q1.061', fecha_consulta: null, nota: 'No consultado: ' + (conServidor ? 'falló el pedido.' : 'necesita servidor.') };
    // Si esta vez falló una fuente, se conserva lo que ya se tenía de ella
    const prev = lote.ambiente || {};
    if (!amb.clima && prev.clima) { amb.clima = prev.clima; amb.diario = prev.diario; }
    if (!amb.pendiente && prev.pendiente) amb.pendiente = prev.pendiente;
    if (!amb.suelo && prev.suelo) amb.suelo = prev.suelo; // el suelo anterior sirve mientras llega el nuevo
    // Primera entrega: el clima y la pendiente ya se ven. El suelo se suma cuando SoilGrids responda.
    lote.ambiente = amb; lote.pendiente_analisis = false;
    Chakra.invalidar(lote); Chakra.guardar();
    if (Chakra.refrescarSi) Chakra.refrescarSi(lote, ['resumen']);
    if (lote.verdor_tarea && conServidor) S.vigilar(lote); // AppEEARS sigue en segundo plano
    await tSuelo;
    if (sueloNuevo) amb.suelo = sueloNuevo;
    Chakra.invalidar(lote); guardarAnalisis(lote); Chakra.guardar();
    return amb;
  }
  Chakra.traerAmbiente = (lote) => Chakra.analizar(lote);

  // Trazabilidad (sección 11): cada análisis guarda la versión y la fecha de cada fuente usada
  Chakra.guardarAnalisis = guardarAnalisis;
  function guardarAnalisis(lote) {
    const ctx = Chakra.contexto(lote), a = lote.ambiente, mejor = ctx.ranking[0];
    const versiones = lote.demo ? Object.fromEntries(CFG.fuentes.map((f) => [f.id, { version: f.version, fecha_consulta: a.fecha, nota: 'Datos ilustrativos' }])) : a.fuentes;
    lote.analisis = (lote.analisis || []).concat([{
      id: 'an' + Date.now().toString(36), parcela_id: lote.id, fecha: new Date().toISOString(),
      resultados: { riesgos: ctx.riesgos, etapa_detectada: ctx.etapa_detectada, etapa_familia: ctx.etapa_familia, recuperacion_pct: ctx.recuperacion, evi: ctx.evi,
        mejor_opcion: mejor.opcion.id, nota: mejor.nota, pesos: ctx.pesos },
      versiones_fuentes: versiones,
    }]).slice(-6);
  }

  /* ---------- Series por parcela (en memoria; las de la demo se fabrican, no se guardan) ---------- */
  const memo = new Map();
  Chakra.invalidar = (lote) => memo.delete(lote.id);
  function memoDe(lote) { let m = memo.get(lote.id); if (!m) memo.set(lote.id, (m = {})); return m; }
  Chakra.hoyDe = (lote) => (lote.demo ? Chakra.demo.FIN : isoHoy());
  Chakra.diarioDe = function (lote) {
    if (lote.demo) return Chakra.demo.diario();
    const m = memoDe(lote);
    if (m.diario === undefined) m.diario = lote.ambiente && lote.ambiente.diario ? desempacar(lote.ambiente.diario) : null;
    return m.diario;
  };
  // Verdor: serie EVI ya filtrada, suavizada y con historia anual. null si la parcela no tiene imágenes.
  Chakra.verdorDe = function (lote) {
    const m = memoDe(lote);
    if (m.verdor !== undefined) return m.verdor;
    const V = Chakra.verdor, v = lote.verdor;
    if (lote.demo) m.verdor = V.analizar(Chakra.demo.fechas('parcela'), Chakra.demo.fechas('bosque'), Chakra.demo.FIN);
    else if (v && v.fechas && v.fechas.d && v.fechas.d.length) m.verdor = V.analizar(Chakra.servidor.desempacar(v.fechas), { anual: v.bosque_anual || [] }, isoHoy()); // traído por el servidor desde AppEEARS
    else m.verdor = null;
    return m.verdor;
  };

  /* ---------- Contexto: junta todo lo que se sabe de la parcela ----------
     Lo medido (CEIPA o a mano) reemplaza a lo automático. Lo que dice la familia gana a lo que detecta el satélite. */
  Chakra.contexto = function (lote) {
    const a = lote.ambiente || {}, cm = lote.campo, num = (x) => (x === '' || x == null || isNaN(+x) ? null : +x);
    const man = { ph: num(cm.ph), om: num(cm.om), n: num(cm.n), p: num(cm.p), k: num(cm.k), pendiente: num(cm.pendiente) };
    const S = a.suelo || {}, Cl = a.clima || {}, ceipa = cm.fuente === 'ceipa';
    const fCampo = ceipa ? 'Muestreo CEIPA' : 'Medida en el campo', fecha = a.fecha || null, ilus = lote.datos_ilustrativos ? ' (ilustrativo)' : '';
    const de = (k) => (man[k] != null ? man[k] : S[k] != null ? S[k] : null);
    const ctx = {
      ph: de('ph'), om: de('om'), n: de('n'), p: man.p, k: man.k,
      pendiente: man.pendiente != null ? man.pendiente : a.pendiente ? a.pendiente.pct : null,
      lluvia: Cl.lluvia != null ? Cl.lluvia : null, fuertes: Cl.fuertes != null ? Cl.fuertes : null, racha: Cl.racha != null ? Cl.racha : null, calor: Cl.calor != null ? Cl.calor : null,
      humedad: Cl.humedad != null ? Cl.humedad : null, mesesLluvia: Cl.mesesLluvia || null, meses: Cl.meses || null, mensual: Cl.mensual || null,
      arcilla: S.arcilla != null ? S.arcilla : null,
      textura: S.arcilla != null ? Chakra.texturaDe(S.arcilla, S.arena, S.limo) : null,
      ilustrativo: !!lote.datos_ilustrativos || CFG.datos_ilustrativos,
    };
    /* Confianza: parte de la confianza base de cada riesgo (config.js) y baja un nivel si el dato viene del respaldo. */
    const R = CFG.riesgos, resp = (base, oficial) => (oficial || !CFG.respaldo_baja_confianza ? base : BAJAR[base]);
    ctx.conf = {
      pendiente: man.pendiente != null ? 'alta' : a.pendiente ? resp(R.erosion.confianza, a.pendiente.oficial) : 'baja',
      lluvia: Cl.lluvia != null ? resp(R.lavado.confianza, Cl.oficial) : 'baja',
      ph: man.ph != null ? (ceipa ? R.acidez.confianza_ceipa : R.acidez.confianza) : S.ph != null ? R.acidez.confianza : 'baja',
      calor: Cl.calor != null ? R.calor.confianza : 'baja',
      racha: Cl.racha != null ? resp(R.seco.confianza, Cl.oficial) : 'baja',
    };
    ctx.conf.fuertes = ctx.conf.lluvia;
    // Fuente y fecha de cada dato (sección 0: todo número lleva fuente, fecha y confianza)
    const fClima = Cl.fuente ? Cl.fuente : null, fSuelo = (S.fuente || 'SoilGrids') + '';
    ctx.origen = {
      pendiente: man.pendiente != null ? { fuente: 'Medida en el campo' + ilus, fecha: null } : a.pendiente ? { fuente: a.pendiente.fuente, fecha } : null,
      lluvia: fClima ? { fuente: fClima, fecha, periodo: Cl.desde ? Cl.desde.slice(0, 4) + '–' + Cl.hasta.slice(0, 4) : '' } : null,
      ph: man.ph != null ? { fuente: fCampo + ilus, fecha: null } : S.ph != null ? { fuente: fSuelo, fecha } : null,
    };
    ctx.origen.calor = ctx.origen.racha = ctx.origen.lluvia;
    ctx.riesgos = {}; ctx.detalle = {};
    Chakra.RIESGOS.forEach((r) => { const x = r.evaluar(ctx); ctx.riesgos[r.id] = x.color; ctx.detalle[r.id] = x; });
    ctx.suelo = { om: Chakra.nivelSuelo('om', ctx.om), n: Chakra.nivelSuelo('n', ctx.n), p: Chakra.nivelSuelo('p', ctx.p), k: Chakra.nivelSuelo('k', ctx.k) };
    ctx.conf.pk = man.p != null || man.k != null ? (ceipa ? 'alta' : 'media') : 'baja';

    /* Verdor, recuperación y etapa */
    const vd = Chakra.verdorDe(lote), F = lote.familia || {};
    ctx.verdor = vd;
    ctx.evi = vd ? vd.evi : null; ctx.evi_bosque = vd ? vd.evi_bosque : null; ctx.anio = vd ? vd.anio : null;
    ctx.recuperacion = vd && vd.recuperacion != null ? vd.recuperacion : num(lote.parcela.recuperacion);
    ctx.recuperacion_fuente = vd && vd.recuperacion != null ? 'satelite' : ctx.recuperacion != null ? 'manual' : null;
    ctx.recup = Chakra.recuperacion(ctx.recuperacion);
    ctx.etapa_detectada = vd ? vd.etapa : (ctx.recuperacion != null && ctx.recuperacion >= CFG.etapas.purma_madura_pct ? 'purma_madura' : '');
    ctx.etapa_familia = lote.parcela.etapa || '';
    ctx.etapa = ctx.etapa_familia || ctx.etapa_detectada;        // si la familia indica otra etapa, gana la familia
    ctx.etapas_distintas = !!(ctx.etapa_familia && ctx.etapa_detectada && ctx.etapa_familia !== ctx.etapa_detectada);
    ctx.descanso_satelite = vd ? vd.anios_descanso : null;
    ctx.descanso_familia = num(F.anios_descanso);
    ctx.descanso = ctx.descanso_familia != null ? { anios: ctx.descanso_familia, fuente: 'familia' } : ctx.descanso_satelite != null ? { anios: ctx.descanso_satelite, fuente: 'satelite' } : null;
    ctx.ultimo = lote.parcela.ultimo;
    // Siembras seguidas sin purma, contadas desde la historia que cuenta la familia (la más reciente primero)
    const hist = (F.historia || []).slice().sort((x, y) => (y.anio_inicio || 0) - (x.anio_inicio || 0));
    let sinPurma = 0; for (const h of hist) { if (/^purma/.test(h.etapa)) break; sinPurma++; }
    ctx.siembras_sin_purma = sinPurma;

    /* Recomendación: se recalcula aquí mismo, en el equipo, cada vez que cambian los pesos (sección 7) */
    ctx.prioridades = F.prioridades || {};
    ctx.pesos = Object.assign({}, CFG.recomendacion.pesos, (lote.recomendacion || {}).pesos || {});
    ctx.an = { etapa: ctx.etapa, ph: ctx.ph, nivel_p: ctx.suelo.p ? ctx.suelo.p.nivel : null, nivel_k: ctx.suelo.k ? ctx.suelo.k.nivel : null,
      riesgos: ctx.riesgos, pendiente: ctx.pendiente, humedad: ctx.humedad, arcilla: ctx.arcilla, prioridades: ctx.prioridades, meses: ctx.meses };
    ctx.ranking = Chakra.motor.ranking(ctx.an, ctx.pesos);
    ctx.advertencias = Chakra.motor.advertencias(ctx.an);
    return ctx;
  };

  // Plan de rotación de la parcela con la opción elegida (o la mejor del ranking)
  Chakra.planDe = function (lote, ctx) {
    ctx = ctx || Chakra.contexto(lote);
    const pl = lote.plan || {}, opcion = pl.opcion || ctx.ranking[0].opcion.id;
    const inicio = +pl.inicio || +Chakra.hoyDe(lote).slice(0, 4) + 1;
    return Chakra.motor.plan(opcion, { inicio, meses: ctx.meses || [] });
  };

  // Seguimiento del cultivo anotado en la parcela. null si no hay cultivo, fecha o imágenes.
  Chakra.seguimientoDe = function (lote, ctx) {
    ctx = ctx || Chakra.contexto(lote);
    const sg = lote.seguimiento || {};
    if (!sg.cultivo || !sg.fecha || !ctx.verdor) return null;
    return Chakra.motor.seguimiento({ cultivo: sg.cultivo, fecha_siembra: sg.fecha, serie: ctx.verdor.serie, diario: Chakra.diarioDe(lote), clima: (lote.ambiente || {}).clima,
      nivel_p: ctx.an.nivel_p, nivel_k: ctx.an.nivel_k, siembras_sin_purma: ctx.siembras_sin_purma, hoy: Chakra.hoyDe(lote) });
  };
})();

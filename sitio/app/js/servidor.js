/* ==========================================================================
   servidor.js — la app habla con el servidor de Willak Space (rutas /api/...).
   El servidor guarda la cuenta Earthdata y trae lo que el navegador no puede:
     · verdor MODIS (MOD13Q1 + MYD13Q1) y elevación SRTM, por AppEEARS
     · lluvia IMERG, por GES DISC
   Si no hay servidor (por ejemplo, el sitio subido solo como archivos), la app
   sigue funcionando con los respaldos de la especificación.
   Los trabajos de AppEEARS tardan minutos: se piden, se guarda su identificador
   en la parcela y la app pregunta el avance cada 30 s, aunque se cierre y se
   vuelva a abrir.
   ========================================================================== */
(function () {
  const Chakra = (globalThis.Chakra = globalThis.Chakra || {});
  const C = Chakra.calc, V = Chakra.verdor, CFG = Chakra.CFG;
  const S = (Chakra.servidor = { BASE: '' }); // BASE vacío = mismo sitio
  const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
  const guardado = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } } };

  /* ---------- Llamadas ---------- */
  let salud; // undefined = aún no se preguntó; null = no hay servidor
  S.olvidar = () => { salud = undefined; };
  S.salud = async function () {
    if (salud !== undefined) return salud;
    try {
      const r = await fetch(S.BASE + '/api/salud', { signal: AbortSignal.timeout(CFG.servidor.salud_ms), cache: 'no-store' });
      const j = r.ok && /json/.test(r.headers.get('content-type') || '') ? await r.json() : null;
      salud = j && j.servidor ? j : null;
    } catch (e) { salud = null; }
    return salud;
  };
  async function cabeceras(extra) {
    const h = Object.assign({}, extra);
    if (salud && salud.codigo) {
      let c = guardado.get('willak-codigo');
      if (!c && Chakra.pedirTexto) { c = (await Chakra.pedirTexto('Código de acceso', { ayuda: 'Este servidor pide un código. Te lo da quien administra Willak Space.', aceptar: 'Entrar' })) || ''; if (c) guardado.set('willak-codigo', c); }
      if (c) h['x-willak-codigo'] = c;
    }
    return h;
  }
  async function llamar(ruta, opciones, ms) {
    const r = await fetch(S.BASE + ruta, Object.assign({ signal: AbortSignal.timeout(ms || 65000), cache: 'no-store' }, opciones, { headers: await cabeceras(opciones && opciones.headers) }));
    let j = null; try { j = await r.json(); } catch (e) { /* respuesta sin JSON */ }
    if (r.status === 401) guardado.set('willak-codigo', null); // código equivocado: se vuelve a pedir la próxima vez
    if (!r.ok) throw new Error((j && j.error) || 'El servidor respondió ' + r.status);
    return j;
  }
  S.pedir = (anillo, bosque) => llamar('/api/verdor/pedir', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ anillo, bosque: bosque || undefined }) });
  S.estado = (t) => llamar('/api/verdor/estado?' + new URLSearchParams(Object.entries(t).filter(([, v]) => v)).toString(), {}, 40000);
  S.datos = (tarea, producto) => llamar(`/api/verdor/datos?tarea=${encodeURIComponent(tarea)}&producto=${producto}`);
  S.lluvia = (lat, lng) => llamar(`/api/lluvia?lat=${lat.toFixed(5)}&lng=${lng.toFixed(5)}`);

  /* ---------- De los píxeles de AppEEARS a la serie de la parcela (sección 5) ----------
     info = respuesta de /pedir (puntos con su fracción); mod y myd = respuestas de /datos. */
  // Compuestos de un grupo de puntos: en cada fecha, promedio ponderado de sus píxeles válidos
  function compuestos(puntos, archivos) {
    const out = [];
    archivos.forEach((a) => {
      if (!a || !a.puntos) return;
      const d0 = C.dia(a.inicio), porDia = new Map();
      // Si AppEEARS dice que dos puntos cayeron en el mismo píxel, se suman sus fracciones
      const unicos = new Map();
      puntos.forEach((p) => { const r = a.puntos[p.id]; if (!r) return; const k = r.tile && r.linea != null ? r.tile + '/' + r.linea + '/' + r.muestra : p.id; if (unicos.has(k)) unicos.get(k).fraccion += p.fraccion; else unicos.set(k, { fraccion: p.fraccion, r }); });
      const total = [...unicos.values()];
      total.forEach((u, k) => u.r.d.forEach((d, i) => { let m = porDia.get(d); if (!m) porDia.set(d, (m = new Array(total.length).fill(null))); m[k] = i; }));
      [...porDia.keys()].sort((x, y) => x - y).forEach((d) => {
        const idx = porDia.get(d);
        const pixeles = total.map((u, k) => (idx[k] == null ? { fraccion: u.fraccion, evi_raw: null, fiabilidad: -1 }
          : { fraccion: u.fraccion, evi_raw: u.r.evi[idx[k]], ndvi_raw: u.r.ndvi[idx[k]], fiabilidad: u.r.rel[idx[k]], vi_quality: u.r.q[idx[k]] }));
        out.push(Object.assign({ fecha: C.iso(d0 + d), satelite: a.satelite }, V.valorParcela(pixeles)));
      });
    });
    return out;
  }
  // Para guardar en el equipo: columnas compactas (unos 30 KB por parcela con 25 años)
  S.empacar = (fechas) => { const s = fechas.slice().sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)); const d0 = '2001-01-01', k = C.dia(d0);
    return { d0, d: s.map((f) => C.dia(f.fecha) - k), s: s.map((f) => (f.satelite === 'aqua' ? 1 : 0)), e: s.map((f) => (f.evi == null ? null : Math.round(f.evi * 1e4))), n: s.map((f) => (f.ndvi == null ? null : Math.round(f.ndvi * 1e4))), a: s.map((f) => f.pct_area_valida) }; };
  S.desempacar = (p) => { const k = C.dia(p.d0); return p.d.map((d, i) => ({ fecha: C.iso(k + d), satelite: p.s[i] ? 'aqua' : 'terra', evi: p.e[i] == null ? null : p.e[i] / 1e4, ndvi: p.n[i] == null ? null : p.n[i] / 1e4, pct_area_valida: p.a[i], estado: p.e[i] == null ? 'faltante' : 'medido' })); };

  S.armarVerdor = function (info, mod, myd, hoy) {
    const de = (cat) => info.puntos.filter((p) => p.cat === cat), archivos = [mod, myd];
    const parcela = compuestos(de('parcela'), archivos);
    if (parcela.filter((f) => f.estado === 'medido').length < 3) throw new Error('AppEEARS no devolvió datos válidos de verdor para esta parcela.');
    // Bosque de referencia: la parcela BP1 si se dibujó; si no, píxeles a ≤ 5 km con EVI anual estable
    let candidatos, tipo;
    if (de('bosque').length) { tipo = 'BP1'; candidatos = [{ id: 'BP1', anual: V.anual(V.serie(compuestos(de('bosque'), archivos))) }]; }
    else { tipo = 'cercano'; candidatos = de('candidato').map((p) => ({ id: p.id, anual: V.anual(V.serie(compuestos([p], archivos))) })); }
    const usados = V.bosqueEstables(candidatos), anual = V.bosqueReferencia(candidatos);
    return { fechas: S.empacar(parcela), bosque_anual: anual, bosque: { tipo, usados: usados.length, de: candidatos.length, ids: usados.map((c) => c.id) },
      pixeles: de('parcela').length, fuente: 'MODIS MOD13Q1 y MYD13Q1 v061 (AppEEARS)', fecha: hoy };
  };
  // Pendiente con el método de Horn sobre la rejilla SRTM (30 m), promediada dentro del polígono
  S.pendienteSrtm = function (info, z, anillo) {
    const g = info.dem, lat0 = g.latN - ((g.filas - 1) / 2) * g.paso, dy = g.paso * 111320, dx = dy * Math.cos((lat0 * Math.PI) / 180);
    const m = []; for (let f = 0; f < g.filas; f++) { const fila = []; for (let c = 0; c < g.columnas; c++) { const v = z[`D${f}_${c}`]; fila.push(v == null ? null : v); } m.push(fila); }
    const h = C.pendienteHorn(m, dx, dy, (f, c) => C.puntoEnPoligono([g.latN - f * g.paso, g.lngO + c * g.paso], anillo));
    if (!h) return null;
    const centro = m[Math.floor(g.filas / 2)][Math.floor(g.columnas / 2)];
    return { pct: h.pct, celdas: h.celdas, altura: centro == null ? null : Math.round(centro), fuente: 'SRTMGL1_NC.003 vía AppEEARS, método de Horn', oficial: true };
  };

  /* ---------- Vigilar un trabajo hasta que termine ---------- */
  const vigilando = new Set();
  const avisar = (lote, estado, nota) => { if (Chakra.avanceFuente) Chakra.avanceFuente(lote, 'appeears', estado, nota); };
  S.vigilar = async function (lote) {
    const t = lote.verdor_tarea, clave = t && t.tareas.verdor; let fallos = 0;
    if (!t || vigilando.has(clave)) return; // un vigilante por trabajo (si se vuelve a analizar, el pedido nuevo tiene el suyo)
    vigilando.add(clave);
    try {
      const sal = await S.salud(); if (!sal) return; // sin servidor ahora: se reintenta al abrir la app
      for (;;) {
        if (lote.verdor_tarea !== t) return;         // se lanzó otro análisis o se borró la parcela
        let est;
        try { est = await S.estado({ verdor: t.tareas.verdor, dem: t.dem_listo ? '' : t.tareas.dem }); fallos = 0; }
        catch (e) { if (++fallos >= 6) { avisar(lote, 'servidor', 'Se perdió el contacto con el servidor. Se volverá a preguntar al abrir la app.'); return; } await esperar(sal.sondeo_s * 1000); continue; }
        // Elevación: suele terminar antes que el verdor
        if (est.dem && est.dem.estado === 'listo' && !t.dem_listo) {
          try {
            const d = await S.datos(t.tareas.dem, 'SRTMGL1'), p = d.z ? S.pendienteSrtm(t, d.z, lote.anillo) : null;
            if (p && lote.ambiente) { lote.ambiente.pendiente = p; (lote.ambiente.fuentes = lote.ambiente.fuentes || {}).pendiente = { version: 'SRTMGL1_NC.003 (AppEEARS)', fecha_consulta: Chakra.hoyDe(lote), tarea: t.tareas.dem }; }
          } catch (e) { /* se queda la pendiente de respaldo */ }
          t.dem_listo = true; Chakra.guardar();
        }
        const v = est.verdor;
        if (v.estado === 'error') { t.error = v.error || 'AppEEARS marcó el trabajo con error.'; Chakra.guardar(); avisar(lote, 'fallo', 'AppEEARS: ' + t.error); return; }
        if (v.estado === 'listo') {
          avisar(lote, 'bajando', 'AppEEARS terminó. Leyendo los resultados…');
          const [mod, myd] = await Promise.all([S.datos(t.tareas.verdor, 'MOD13Q1'), S.datos(t.tareas.verdor, 'MYD13Q1')]);
          lote.verdor = Object.assign(S.armarVerdor(t, mod, myd, Chakra.hoyDe(lote)), { tarea: t.tareas.verdor });
          if (lote.ambiente) (lote.ambiente.fuentes = lote.ambiente.fuentes || {}).appeears = { version: 'MOD13Q1.061 · MYD13Q1.061 · SRTMGL1_NC.003', fecha_consulta: Chakra.hoyDe(lote), tarea: t.tareas.verdor };
          lote.verdor_tarea = null;
          Chakra.invalidar(lote); if (Chakra.guardarAnalisis && lote.ambiente) Chakra.guardarAnalisis(lote); Chakra.guardar();
          avisar(lote, 'listo', `Verdor listo: ${lote.verdor.fechas.d.length} fechas de Terra y Aqua · bosque de referencia: ${lote.verdor.bosque.usados} de ${lote.verdor.bosque.de} píxeles`);
          if (Chakra.aviso) Chakra.aviso('Llegó el verdor de «' + lote.nombre + '» desde AppEEARS.');
          if (Chakra.refrescarSi) Chakra.refrescarSi(lote, ['resumen', 'seguimiento', 'siembra', 'plan']);
          return;
        }
        t.avance = v.avance || 0; t.estado = v.estado;
        avisar(lote, 'bajando', `AppEEARS está ${v.estado === 'pendiente' ? 'en cola' : 'procesando'}${v.avance ? ' (' + v.avance + ' %)' : ''}. Tarda varios minutos: puedes seguir trabajando.`);
        await esperar(sal.sondeo_s * 1000);
      }
    } catch (e) {
      t.error = e.message; Chakra.guardar(); avisar(lote, 'fallo', 'No se pudo leer el verdor: ' + e.message);
    } finally { vigilando.delete(clave); }
  };
  // Al abrir la app: retoma los trabajos que quedaron pendientes
  S.retomar = () => (Chakra.estado ? Chakra.estado.lotes : []).filter((l) => l.verdor_tarea && !l.verdor_tarea.error).forEach((l) => S.vigilar(l));
})();

/* ==========================================================================
   estado.js — los DATOS de la app y utilidades que no dependen del mapa.
   Todo cuelga de un solo objeto global: window.Chakra.
   Aquí vive:
     · Chakra.estado   → lotes (chacras/territorios) y ajustes de capas
     · guardar/cargar  → localStorage (siempre con try/catch)
     · geo             → cálculo de área y distancia (sin librerías)
     · INDICADORES     → lista de datos satelitales previstos (aún sin datos)
     · eventos         → on()/emit() para que las partes se avisen entre sí
   ========================================================================== */
(function () {
  const Chakra = (window.Chakra = window.Chakra || {});
  const CLAVE = 'willak-space-v2'; // (se mantiene para no perder lo ya guardado) // si algún día cambia el formato, se sube el número

  /* ---------- Estado ---------- */
  Chakra.estado = {
    lotes: [],        // cada lote: { id, nombre, tipo, anillo:[[lat,lng],...], insitu:{}, relatos:[] }
    seleccion: null,  // id del lote elegido
    senales: [],      // señales locales (saber de la comunidad): son de la comunidad, no de una parcela
    capas: {          // lo que el usuario prende/apaga en el panel de capas
      osm:        { visible: false, opacidad: 0.6 },  // calles encima de la foto satelital (apagadas al inicio)
      chacra:     { visible: true, opacidad: 0.35 },
      territorio: { visible: true, opacidad: 0.12 },
      etiquetas:  { visible: true },
    },
  };

  /* ---------- Eventos sencillos ---------- */
  const oyentes = {};
  Chakra.on = (nombre, fn) => (oyentes[nombre] = oyentes[nombre] || []).push(fn);
  Chakra.emit = (nombre, dato) => (oyentes[nombre] || []).forEach((fn) => fn(dato));

  /* ---------- Avisos en pantalla ---------- */
  let temporizadorAviso;
  Chakra.aviso = function (texto, esError) {
    const el = document.getElementById('aviso');
    if (!el) return;
    el.textContent = texto;
    el.className = 'aviso' + (esError ? ' error' : '');
    el.hidden = false;
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(() => (el.hidden = true), esError ? 6000 : 2600);
  };

  /* ---------- Ventanas de confirmar y de escribir (dentro de la página) ----------
     No se usan prompt() ni confirm() del navegador: en navegadores integrados no aparecen y el botón "no hace nada". */
  function abrirDialogo(html) {
    const d = document.createElement('dialog'); d.className = 'dialogo'; d.innerHTML = html;
    document.body.appendChild(d);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    return d;
  }
  // Devuelve una promesa: true si la persona acepta
  Chakra.confirmar = (texto, o = {}) => new Promise((ok) => {
    if (typeof document === 'undefined' || !document.body) return ok(true);
    const d = abrirDialogo(`<p>${Chakra.esc(texto)}</p><div class="dialogo-botones"><button class="btn suave" data-r="no" type="button">${Chakra.esc(o.cancelar || 'Cancelar')}</button><button class="btn ${o.peligro === false ? '' : 'peligro-lleno'}" data-r="si" type="button">${Chakra.esc(o.aceptar || 'Sí, borrar')}</button></div>`);
    const cerrar = (v) => { if (d.close) d.close(); d.remove(); ok(v); };
    d.addEventListener('click', (ev) => { const b = ev.target.closest('[data-r]'); if (b) cerrar(b.dataset.r === 'si'); });
    d.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(false); });
  });
  // Devuelve una promesa con el texto escrito, o null si se cancela
  Chakra.pedirTexto = (titulo, o = {}) => new Promise((ok) => {
    if (typeof document === 'undefined' || !document.body) return ok(null);
    const campo = o.multilinea ? `<textarea id="dlg-txt" rows="4" placeholder="${Chakra.esc(o.placeholder || '')}"></textarea>` : `<input id="dlg-txt" type="text" placeholder="${Chakra.esc(o.placeholder || '')}" autocomplete="off">`;
    const d = abrirDialogo(`<form method="dialog"><label class="campo"><strong>${Chakra.esc(titulo)}</strong>${campo}${o.ayuda ? '<small>' + Chakra.esc(o.ayuda) + '</small>' : ''}</label><div class="dialogo-botones"><button class="btn suave" data-r="no" type="button">Cancelar</button><button class="btn" data-r="si" type="submit">${Chakra.esc(o.aceptar || 'Aceptar')}</button></div></form>`);
    const txt = d.querySelector('#dlg-txt'); txt.focus();
    const cerrar = (v) => { if (d.close) d.close(); d.remove(); ok(v); };
    d.querySelector('form').addEventListener('submit', (ev) => { ev.preventDefault(); cerrar(txt.value.trim() || null); });
    d.querySelector('[data-r="no"]').addEventListener('click', () => cerrar(null));
    d.addEventListener('cancel', (ev) => { ev.preventDefault(); cerrar(null); });
  });

  /* ---------- Guardar y cargar (localStorage) ---------- */
  let esperaGuardar;
  Chakra.guardar = function () {
    // Se espera 400 ms para no escribir en cada tecla.
    clearTimeout(esperaGuardar);
    esperaGuardar = setTimeout(guardarYa, 400);
  };
  function guardarYa() {
    const marca = document.getElementById('estado-guardado');
    try {
      const E = Chakra.estado;
      localStorage.setItem(CLAVE, JSON.stringify({ lotes: E.lotes, capas: E.capas, senales: E.senales }));
      if (marca) { marca.textContent = 'Guardado en este equipo'; marca.className = 'estado-guardado'; }
    } catch (e) {
      // Pasa si el almacenamiento está lleno (muchas fotos) o bloqueado (ventana privada).
      if (marca) { marca.textContent = 'No se pudo guardar'; marca.className = 'estado-guardado error'; }
      Chakra.aviso('No se pudo guardar en este equipo. Exporta tu GeoJSON para no perder el trabajo.', true);
    }
  }
  Chakra.cargar = function () {
    try {
      const texto = localStorage.getItem(CLAVE);
      if (!texto) return;
      const datos = JSON.parse(texto);
      if (Array.isArray(datos.lotes)) Chakra.estado.lotes = datos.lotes.map(normalizarLote);
      if (Array.isArray(datos.senales)) Chakra.estado.senales = datos.senales;
      if (datos.capas) Object.keys(Chakra.estado.capas).forEach((k) => {
        if (datos.capas[k]) Object.assign(Chakra.estado.capas[k], datos.capas[k]);
      });
    } catch (e) {
      Chakra.aviso('No se pudo leer lo guardado (se empieza en blanco).', true);
    }
  };

  /* ---------- Lotes ---------- */
  Chakra.nuevoId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  // Garantiza que un lote tenga todos los campos (útil con datos importados o viejos).
  function normalizarLote(l) {
    const F = l.familia || {}, PR = {};
    ((window.Chakra.CFG || {}).prioridades || []).forEach((p) => { const v = +(F.prioridades || {})[p.id]; PR[p.id] = isNaN(v) ? 3 : Math.max(0, Math.min(5, Math.round(v))); });
    return {
      id: l.id || Chakra.nuevoId(),
      nombre: l.nombre || "Sin nombre",
      tipo: l.tipo === "territorio" ? "territorio" : "chacra",
      anillo: l.anillo || [],
      // Si la parcela se creó con un toque: { auto:true, lat, lng, ha }. Pasa a null al mover sus esquinas a mano
      forma: l.forma && l.forma.auto ? l.forma : null,
      // Parcela de prueba (especificación, sección 12): sus datos son ilustrativos y se fabrican en demo.js
      demo: l.demo || "", datos_ilustrativos: !!l.datos_ilustrativos,
      insitu: Object.assign({ cultivos: "", siembra: "", obs: "", fotos: [] }, l.insitu),
      relatos: Array.isArray(l.relatos) ? l.relatos : [],
      // Medidas de campo (reemplazan al dato automático si se llenan): pH, MO %, N %, P mg/kg, K cmol/kg, pendiente %
      // fuente: "ceipa" (muestreo del CEIPA: confianza alta) o "manual"
      campo: Object.assign({ ph: "", om: "", n: "", p: "", k: "", pendiente: "", fuente: "manual" }, l.campo),
      // Datos de la parcela. etapa = la etapa que dice la familia (gana a la que detecta el satélite)
      parcela: Object.assign({ responsable: "", comunidad: "", manejo: "", etapa: "", recuperacion: "", ultimo: "", clpi: { autoriza: "", cargo: "", fecha: "", alcance: "", ok: false } }, l.parcela),
      // Lo que sabe la familia (sección 3): prioridades 0..5, historia de siembra y años de descanso
      familia: { nombre: F.nombre || "", prioridades: PR, prioridades_definidas: !!F.prioridades_definidas, anios_descanso: F.anios_descanso == null ? "" : F.anios_descanso,
        historia: Array.isArray(F.historia) ? F.historia : [] },
      // Bitácora: { fecha, labor, cultivo, nota, comunidad }
      bitacora: Array.isArray(l.bitacora) ? l.bitacora : [],
      // Lo que se trajo de internet: { fecha, clima, diario, suelo, pendiente, avisos, fuentes }
      ambiente: l.ambiente || null,
      // Verdor: { demo:true } o { fechas:[…], bosque:[…] } (compuestos de EVI ya filtrados por calidad)
      verdor: l.verdor || null,
      // Trabajo de AppEEARS en curso: { tareas:{verdor, dem}, puntos, dem, pedido, avance }. Se vigila hasta que termina
      verdor_tarea: l.verdor_tarea || null,
      recomendacion: Object.assign({ pesos: null }, l.recomendacion),          // pesos que movió el usuario (0–100)
      plan: Object.assign({ opcion: "", inicio: "" }, l.plan),                 // opción elegida y año de inicio
      seguimiento: Object.assign({ cultivo: "", fecha: "" }, l.seguimiento),   // cultivo que se vigila y su fecha de siembra
      alertas: Array.isArray(l.alertas) ? l.alertas : [],                      // { id, fecha, nivel, mensaje, causa, sugerencia, estado }
      analisis: Array.isArray(l.analisis) ? l.analisis : [],                   // trazabilidad: versiones y fechas de las fuentes
      pendiente_analisis: !!l.pendiente_analisis,                              // se pidió analizar sin internet: se lanza al reconectar
    };
  }
  Chakra.normalizarLote = normalizarLote;
  // CLPI: ¿hay un acuerdo de la comunidad registrado para usar su saber en esta parcela?
  Chakra.clpiOk = (l) => !!(l && l.parcela.clpi && l.parcela.clpi.ok && l.parcela.clpi.autoriza && l.parcela.clpi.fecha);
  Chakra.lotePorId = (id) => Chakra.estado.lotes.find((l) => l.id === id);

  /* ---------- Cantones de Napo (centros APROXIMADOS, solo para moverse) ---------- */
  Chakra.CANTONES = [
    { nombre: 'Toda la provincia de Napo', lat: -0.95, lng: -77.85, zoom: 9 },
    { nombre: 'Tena', lat: -0.9938, lng: -77.8129, zoom: 13 },
    { nombre: 'Archidona', lat: -0.9108, lng: -77.8086, zoom: 13 },
    { nombre: 'Quijos (Baeza)', lat: -0.4617, lng: -77.8928, zoom: 13 },
    { nombre: 'El Chaco', lat: -0.3417, lng: -77.8153, zoom: 13 },
    { nombre: 'Carlos Julio Arosemena Tola', lat: -1.0389, lng: -77.8689, zoom: 13 },
  ];

  /* ---------- Datos satelitales previstos ----------
     OJO: no hay datos reales todavía. Esta lista solo define la ESTRUCTURA.
     Cuando se conecten, cada indicador recibirá { valor, unidad, fecha } por lote.
     "fuente" es la fuente PREVISTA (por confirmar), no un dato cargado. */
  Chakra.INDICADORES = [
    { id: 'ndvi',        nombre: 'NDVI (verdor de las plantas)', unidad: '',    fuente: 'Por definir (p. ej. Sentinel-2 / MODIS)' },
    { id: 'lluvia',      nombre: 'Lluvia',                       unidad: 'mm',  fuente: 'Por definir (p. ej. NASA GPM IMERG)' },
    { id: 'humedad',     nombre: 'Humedad del suelo',            unidad: '%',   fuente: 'Por definir (p. ej. NASA SMAP)' },
    { id: 'temperatura', nombre: 'Temperatura',                  unidad: '°C',  fuente: 'Por definir (p. ej. NASA POWER)' },
  ];

  /* ---------- Geometría (esfera simple, suficiente para chacras) ---------- */
  const R = 6371008.8; // radio medio de la Tierra en metros
  const rad = (g) => (g * Math.PI) / 180;
  Chakra.geo = {
    // Distancia entre dos puntos [lat,lng] (fórmula de haversine), en metros
    dist(a, b) {
      const dLat = rad(b[0] - a[0]), dLng = rad(b[1] - a[1]);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    },
    largo(pts) { let t = 0; for (let i = 1; i < pts.length; i++) t += this.dist(pts[i - 1], pts[i]); return t; },
    perimetro(pts) { return pts.length < 2 ? 0 : this.largo(pts) + this.dist(pts[pts.length - 1], pts[0]); },
    // Área de un polígono sobre la esfera, en m²
    area(pts) {
      if (pts.length < 3) return 0;
      let s = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        s += rad(b[1] - a[1]) * (2 + Math.sin(rad(a[0])) + Math.sin(rad(b[0])));
      }
      return Math.abs((s * R * R) / 2);
    },
    fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(2) + ' km'; },
    fmtArea(m2) { return m2 < 10000 ? Math.round(m2) + ' m²' : (m2 / 10000).toFixed(2) + ' ha'; },
  };

  /* ---------- GeoJSON (importar / exportar) ---------- */
  Chakra.aGeoJSON = function () {
    return {
      type: 'FeatureCollection',
      features: Chakra.estado.lotes.map((l) => ({
        type: 'Feature',
        properties: { id: l.id, nombre: l.nombre, tipo: l.tipo, demo: l.demo, datos_ilustrativos: l.datos_ilustrativos, insitu: l.insitu, relatos: l.relatos, campo: l.campo, parcela: l.parcela, familia: l.familia, bitacora: l.bitacora, ambiente: l.ambiente, verdor: l.verdor, recomendacion: l.recomendacion, plan: l.plan, seguimiento: l.seguimiento, alertas: l.alertas, analisis: l.analisis },
        // GeoJSON usa [lng, lat] y el primer punto se repite al final
        geometry: { type: 'Polygon', coordinates: [cerrar(l.anillo.map((p) => [p[1], p[0]]))] },
      })),
    };
  };
  function cerrar(c) {
    if (c.length && (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1])) c.push(c[0]);
    return c;
  }
  // Devuelve cuántos polígonos se agregaron. Lanza Error con mensaje claro si el archivo no sirve.
  Chakra.desdeGeoJSON = function (texto) {
    let g;
    try { g = JSON.parse(texto); } catch (e) { throw new Error('El archivo no es un JSON válido.'); }
    const feats = g.type === 'FeatureCollection' ? g.features : g.type === 'Feature' ? [g] : [{ type: 'Feature', properties: {}, geometry: g }];
    let n = 0;
    (feats || []).forEach((f, i) => {
      const geom = f && f.geometry;
      if (!geom) return;
      // Polygon → un anillo; MultiPolygon → un lote por polígono
      const poligonos = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
      poligonos.forEach((poli) => {
        const ext = poli[0];
        if (!ext || ext.length < 4) return;
        const anillo = ext.slice(0, -1).map((c) => [c[1], c[0]]);
        const p = f.properties || {};
        Chakra.estado.lotes.push(normalizarLote({
          nombre: p.nombre || p.name || 'Importado ' + (i + 1),
          tipo: p.tipo, anillo, demo: p.demo, datos_ilustrativos: p.datos_ilustrativos, insitu: p.insitu, relatos: p.relatos, campo: p.campo, parcela: p.parcela, familia: p.familia, bitacora: p.bitacora, ambiente: p.ambiente, verdor: p.verdor, recomendacion: p.recomendacion, plan: p.plan, seguimiento: p.seguimiento, alertas: p.alertas, analisis: p.analisis,
        }));
        n++;
      });
    });
    if (!n) throw new Error('No se encontró ningún polígono en el archivo.');
    return n;
  };

  /* ---------- Texto seguro para meter en HTML ---------- */
  Chakra.esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
})();

/* Las variables CSS no funcionan dentro de los atributos SVG que usa Leaflet,
   así que se lee el valor real desde tema.css con esta función. */
window.Chakra.color = function (variable) {
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || '#B5532F';
};

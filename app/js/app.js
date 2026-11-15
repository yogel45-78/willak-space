/* ==========================================================================
   app.js — arranque. Es lo último que se carga: junta las demás partes.
   También: parcela de prueba (modo demo), aviso de conexión, cola de análisis
   pendientes y registro del modo sin internet (PWA).
   ========================================================================== */
(function () {
  const Chakra = window.Chakra, E = Chakra.estado;
  const $ = (id) => document.getElementById(id);

  /* ---------- Modo demo: etiqueta "Datos ilustrativos" en toda la app (sección 11) ---------- */
  Chakra.marcarDemo = function () {
    const l = Chakra.lotePorId(E.seleccion), on = Chakra.CFG.datos_ilustrativos || !!(l && l.datos_ilustrativos);
    const m = $('marca-demo'); if (m) m.hidden = !on;
    document.body.classList.toggle('modo-demo', on);
  };
  // Carga (o vuelve a abrir) la parcela de prueba Guaba CEIPA con sus datos ilustrativos
  Chakra.cargarDemo = function () {
    const D = Chakra.demo;
    let l = Chakra.lotePorId(D.ID);
    if (!l) {
      l = Chakra.normalizarLote(D.lote()); E.lotes.push(l);
      if (!E.senales.some((s) => s.demo)) E.senales.push(...D.senales());
      E.capas.chacra.visible = true;
      Chakra.guardar(); Chakra.mapa.dibujarLotes(); Chakra.emit('lote-cambio', l.id); Chakra.emit('capas-cambiaron');
      Chakra.aviso('Parcela de prueba cargada. Sus datos son ilustrativos.');
    }
    Chakra.seleccionar(l.id, true);
    Chakra.mapa.zoomALote(l.id);
  };

  /* ---------- Conexión: lo anotado se guarda en el equipo y lo pendiente se lanza al reconectar ---------- */
  function pintarRed() {
    const el = $('estado-red'); if (!el) return;
    const sin = navigator.onLine === false, cola = E.lotes.filter((l) => l.pendiente_analisis).length;
    el.hidden = !sin && !cola;
    el.textContent = sin ? 'Sin internet: todo se guarda en este equipo' + (cola ? ' · ' + cola + ' análisis en cola' : '') : cola + ' análisis en cola';
    el.className = 'estado-red' + (sin ? ' sin' : '');
  }
  Chakra.pintarRed = pintarRed;
  async function sincronizar() {
    pintarRed();
    if (navigator.onLine === false) return;
    const cola = E.lotes.filter((l) => l.pendiente_analisis);
    if (!cola.length) return;
    Chakra.aviso('Volvió la conexión: analizando ' + cola.length + ' parcela(s) que quedaron en cola…');
    for (const l of cola) { try { await Chakra.analizar(l); } catch (e) { /* queda en cola para el próximo intento */ } }
    pintarRed();
    if (Chakra.repintarLote) Chakra.repintarLote();
    Chakra.aviso('Análisis pendientes al día.');
  }
  // Trabajos de AppEEARS que quedaron en proceso: se siguen vigilando al abrir la app o al volver la conexión
  const retomar = () => { if (navigator.onLine !== false && Chakra.servidor) Chakra.servidor.retomar(); };

  document.addEventListener('DOMContentLoaded', () => {
    Chakra.cargar();                 // 1) lee lo guardado en este equipo
    Chakra.mapa.iniciar();           // 2) crea el mapa
    Chakra.mapa.cablear();           // 3) conecta herramientas
    Chakra.iniciarPaneles();         // 4) conecta paneles

    // Buscador: un lugar por nombre, un cantón de la lista o coordenadas pegadas
    $('lugares').innerHTML = Chakra.CANTONES.map((c) => '<option value="' + c.nombre + '">').join('');
    $('buscar').addEventListener('submit', (e) => { e.preventDefault(); Chakra.mapa.buscar($('buscar-txt').value); $('buscar-txt').blur(); });
    $('btn-ubic').addEventListener('click', Chakra.mapa.ubicacion);
    // Botones del panel vacío (se crean y se borran al repintar, por eso se escuchan desde el documento)
    document.addEventListener('click', (e) => {
      const b = e.target.closest ? e.target.closest('[data-accion]') : null; if (!b) return;
      if (b.dataset.accion === 'nueva') { Chakra.mapa.setModo('punto'); Chakra.cerrarHojas(); }
      if (b.dataset.accion === 'ubicacion') { Chakra.cerrarHojas(); Chakra.mapa.ubicacion(); }
    });
    const bd = $('btn-demo'); if (bd) bd.addEventListener('click', Chakra.cargarDemo);
    document.addEventListener('click', (e) => { if (e.target && e.target.id === 'btn-demo-2') Chakra.cargarDemo(); });

    // El mapa necesita recalcular su tamaño si cambia la ventana o se gira el teléfono
    window.addEventListener('resize', () => Chakra.mapa.map.invalidateSize());
    // Si ya había chacras guardadas, se encuadran
    const pts = E.lotes.flatMap((l) => l.anillo);
    if (pts.length) Chakra.mapa.map.fitBounds(pts, { padding: [40, 40] });

    Chakra.marcarDemo();
    window.addEventListener('online', () => { sincronizar(); retomar(); });
    retomar();
    window.addEventListener('offline', pintarRed);
    sincronizar();

    // Modo sin internet: guarda la app en el equipo para abrirla sin señal (solo en http/https)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sin modo offline; la app sigue funcionando */ });
    }
  });
})();

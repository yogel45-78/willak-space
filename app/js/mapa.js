/* ==========================================================================
   mapa.js — todo lo que toca Leaflet: mapa, polígonos, herramientas.
   Herramientas (modos): mover · punto (nueva parcela con un toque) · dibujar · editar · distancia · area
   Idea central: hay UN modo activo a la vez (Chakra.mapa.modo). El clic en el
   mapa hace una cosa u otra según ese modo.
   ========================================================================== */
(function () {
  const Chakra = window.Chakra;
  const E = Chakra.estado;
  const M = (Chakra.mapa = { modo: 'mover', map: null });

  let capaBase;                    // teselas de OpenStreetMap
  const poligonos = {};            // id de lote → polígono de Leaflet
  let grupoLotes;                  // contenedor de todos los polígonos
  let temp = { pts: [], linea: null, marcas: [] };   // lo que se está dibujando/midiendo
  let edicion = { id: null, marcas: [], sel: -1 };   // vértices del lote en edición

  /* ---------- Crear el mapa ---------- */
  M.iniciar = function () {
    M.map = L.map('mapa', {
      center: [-0.95, -77.85], zoom: 9,       // provincia de Napo
      minZoom: 6, maxZoom: 19,
      doubleClickZoom: true, zoomControl: true,
    });
    // Fondo principal: foto satelital real (Esri World Imagery). Las calles de OpenStreetMap van encima, opcionales.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, maxNativeZoom: 17,
      attribution: 'Imagen: Esri, Maxar, Earthstar Geographics',
    }).addTo(M.map);
    capaBase = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    });
    grupoLotes = L.layerGroup().addTo(M.map);
    L.control.scale({ imperial: false }).addTo(M.map);
    M.map.on('click', alClicMapa);
    M.aplicarCapas();
    M.dibujarLotes();
  };

  M.irA = (lat, lng, zoom) => M.map.flyTo([lat, lng], zoom, { duration: 0.8 });

  /* ---------- Capas: visibilidad y transparencia ---------- */
  M.aplicarCapas = function () {
    const c = E.capas;
    capaBase.setOpacity(c.osm.opacidad);
    if (c.osm.visible) { if (!M.map.hasLayer(capaBase)) capaBase.addTo(M.map); }
    else M.map.removeLayer(capaBase);
    M.dibujarLotes();
  };

  /* ---------- Dibujar los lotes guardados ---------- */
  function estilo(l) {
    const t = l.tipo;
    const sel = l.id === E.seleccion;
    return {
      color: t === 'territorio' ? Chakra.color('--color-territorio') : Chakra.color('--color-chacra'),
      weight: sel ? 5 : 3,
      dashArray: t === 'territorio' ? '6 6' : null,
      fillColor: t === 'territorio' ? Chakra.color('--color-territorio') : Chakra.color('--color-chacra'),
      fillOpacity: E.capas[t].opacidad,
    };
  }
  M.dibujarLotes = function () {
    if (!grupoLotes) return;
    grupoLotes.clearLayers();
    Object.keys(poligonos).forEach((k) => delete poligonos[k]);
    E.lotes.forEach((l) => {
      if (!E.capas[l.tipo].visible || l.anillo.length < 3) return;
      const p = L.polygon(l.anillo, estilo(l));
      p.on('click', (ev) => {
        // En modo "mover" el clic elige la chacra. En otros modos se deja pasar al mapa.
        if (M.modo !== 'mover') return;
        L.DomEvent.stopPropagation(ev);
        Chakra.seleccionar(l.id, true);
      });
      if (E.capas.etiquetas.visible) {
        p.bindTooltip(Chakra.esc(l.nombre), { permanent: true, direction: 'center', className: 'etiqueta-lote' });
      }
      p.addTo(grupoLotes);
      poligonos[l.id] = p;
    });
    if (edicion.id) pintarVertices();
  };
  M.refrescarEstilos = function () { E.lotes.forEach((l) => poligonos[l.id] && poligonos[l.id].setStyle(estilo(l))); };

  M.zoomALote = function (id) {
    const p = poligonos[id];
    if (p) M.map.fitBounds(p.getBounds(), { maxZoom: 17, padding: [40, 40] });
  };

  /* ---------- Cambiar de herramienta ---------- */
  M.setModo = function (modo) {
    if (modo === 'editar' && !E.seleccion) {
      Chakra.aviso('Primero toca una chacra para editarla.');
      return;
    }
    cancelarTemp();
    quitarVertices();
    M.modo = modo;
    document.querySelectorAll('.herr[data-modo]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.modo === modo)));
    document.getElementById('mapa').style.cursor = modo === 'mover' ? '' : 'crosshair';
    barra();
    if (modo === 'editar') { edicion.id = E.seleccion; pintarVertices(); }
    Chakra.emit('modo', modo);
  };

  /* ---------- Barra de acción (Terminar / Cancelar...) ---------- */
  function barra() {
    const b = document.getElementById('accion-barra');
    const t = document.getElementById('accion-texto');
    const modo = M.modo;
    b.hidden = modo === 'mover';
    document.getElementById('acc-quitar').hidden = modo !== 'editar';
    document.getElementById('acc-deshacer').hidden = modo === 'editar' || modo === 'punto';
    document.getElementById('acc-terminar').hidden = modo === 'punto';
    document.getElementById('acc-gps').hidden = modo !== 'dibujar';
    document.getElementById('acc-punto').hidden = modo !== 'punto';
    document.body.classList.toggle('modo-mover', modo === 'mover');
    if (modo !== 'mover') M.map.closePopup();
    const textos = {
      punto: 'Toca el mapa donde está la parcela. Se crea al instante.',
      dibujar: 'Toca el mapa en cada esquina de la parcela (3 o más) y pulsa Guardar.',
      distancia: 'Toca el mapa para marcar puntos y ver la distancia.',
      area: 'Toca el mapa para marcar esquinas y ver el área.',
      editar: 'Arrastra los puntos. Toca un punto pequeño del borde para agregar uno nuevo.',
    };
    t.textContent = textos[modo] || '';
    document.getElementById('acc-terminar').textContent = modo === 'editar' ? 'Listo' : modo === 'dibujar' ? 'Guardar parcela' : 'Terminar';
    if (modo === 'dibujar') document.getElementById('acc-terminar').textContent = document.getElementById('tipo-dibujo').value === 'territorio' ? 'Guardar territorio' : 'Guardar parcela';
    mostrarLectura();
  }

  /* ---------- Clic en el mapa según el modo ---------- */
  function agregarPunto(p) {
    temp.pts.push(p);
    const marca = L.marker(p, { icon: L.divIcon({ className: 'punto-medida', iconSize: [16, 16] }), interactive: false }).addTo(M.map);
    temp.marcas.push(marca);
    repintarTemp();
  }
  function alClicMapa(ev) {
    if (M.modo === 'dibujar' || M.modo === 'distancia' || M.modo === 'area') agregarPunto([ev.latlng.lat, ev.latlng.lng]);
    else if (M.modo === 'punto') M.crearEn(ev.latlng.lat, ev.latlng.lng);          // «Nueva parcela»: un toque y queda creada
    else if (M.modo === 'mover') ofrecerCrear(ev.latlng.lat, ev.latlng.lng);        // tocar un lugar vacío ofrece crear ahí
  }

  /* ---------- GPS: punto aquí, caminar el borde, coordenadas escritas ---------- */
  let gps = { id: null, ultimo: null, precision: null };
  const estadoGps = (t) => { const el = document.getElementById('gps-estado'); if (el) { el.textContent = t; el.hidden = !t; } };
  async function gpsListo() {
    if (!navigator.geolocation) { sinGps(); return false; }
    try {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state === 'denied') { Chakra.aviso('Este navegador tiene bloqueada la ubicación. Para usar el GPS abre la app en Chrome o en el celular y permite la ubicación. Aquí puedes tocar el mapa o escribir las coordenadas.', true); return false; }
    } catch (e) { /* navegador sin consulta de permisos: se intenta igual */ }
    return true;
  }
  function sinGps() { Chakra.aviso('Este equipo no permite usar el GPS desde el navegador. Marca los puntos tocando el mapa o escribe las coordenadas.', true); }
  M.gpsPunto = async function () {
    if (!(await gpsListo())) return;
    estadoGps('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const p = [pos.coords.latitude, pos.coords.longitude];
      agregarPunto(p); M.map.panTo(p);
      estadoGps('Punto agregado · precisión ±' + Math.round(pos.coords.accuracy) + ' m');
      if (pos.coords.accuracy > 30) Chakra.aviso('La precisión es baja (±' + Math.round(pos.coords.accuracy) + ' m). Espera unos segundos al aire libre y vuelve a intentar.', true);
    }, () => { estadoGps(''); Chakra.aviso('No se pudo obtener la ubicación. Revisa el permiso de ubicación del navegador.', true); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  };
  M.gpsCaminar = async function (activar) {
    const btn = document.getElementById('acc-caminar');
    if (gps.id != null || activar === false) {
      if (gps.id != null) navigator.geolocation.clearWatch(gps.id);
      gps.id = null; gps.ultimo = null;
      if (btn) { btn.textContent = 'Caminar con GPS'; btn.setAttribute('aria-pressed', 'false'); }
      estadoGps('');
      return;
    }
    if (!(await gpsListo())) return;
    if (btn) { btn.textContent = 'Parar GPS'; btn.setAttribute('aria-pressed', 'true'); }
    estadoGps('Camina por el borde de la parcela. Se marca un punto cada pocos metros.');
    gps.id = navigator.geolocation.watchPosition((pos) => {
      const p = [pos.coords.latitude, pos.coords.longitude], prec = pos.coords.accuracy;
      gps.precision = prec;
      if (prec > 30) { estadoGps('Señal débil (±' + Math.round(prec) + ' m). Espera un momento…'); return; }
      if (!gps.ultimo || Chakra.geo.dist(gps.ultimo, p) >= Math.max(5, prec)) {
        gps.ultimo = p; agregarPunto(p); M.map.panTo(p);
        estadoGps(temp.pts.length + ' puntos · precisión ±' + Math.round(prec) + ' m');
      }
    }, () => { M.gpsCaminar(false); Chakra.aviso('Se perdió la ubicación. Revisa el permiso del navegador.', true); }, { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 });
  };
  M.coordenadas = async function () {
    const t = await Chakra.pedirTexto('Escribir coordenadas', { multilinea: true, placeholder: '-0.9938, -77.8129', aceptar: 'Agregar puntos',
      ayuda: 'Un punto por línea: latitud, longitud. Sur y oeste van con signo menos. Cada línea es una esquina de la parcela.' });
    if (!t) return;
    let n = 0;
    t.split(/\n+/).forEach((linea) => { const c = M.leerCoordenadas(linea); if (c) { agregarPunto(c); n++; } });
    if (n) { M.map.fitBounds(temp.pts, { padding: [40, 40], maxZoom: 18 }); Chakra.aviso(n + ' punto(s) agregado(s).'); } else Chakra.aviso('No se entendió ninguna coordenada. Escríbelas como: -0.9938, -77.8129', true);
  };

  function repintarTemp() {
    if (temp.linea) M.map.removeLayer(temp.linea);
    const poligonal = M.modo === 'dibujar' || M.modo === 'area';
    const opciones = { color: '#FFFFFF', weight: 3, dashArray: '8 6', fillColor: '#FFD23F', fillOpacity: 0.28, interactive: false }; // blanco: se ve sobre la selva
    if (temp.pts.length >= 2) {
      temp.linea = (poligonal && temp.pts.length >= 3 ? L.polygon(temp.pts, opciones) : L.polyline(temp.pts, opciones)).addTo(M.map);
    } else temp.linea = null;
    mostrarLectura();
  }

  function mostrarLectura() {
    const el = document.getElementById('lectura');
    const g = Chakra.geo, pts = temp.pts;
    let txt = '';
    if (M.modo === 'distancia' && pts.length >= 2) {
      txt = 'Distancia: ' + g.fmtDist(g.largo(pts)) + (pts.length > 2 ? ' · último tramo ' + g.fmtDist(g.dist(pts[pts.length - 2], pts[pts.length - 1])) : '');
    } else if ((M.modo === 'area' || M.modo === 'dibujar') && pts.length >= 3) {
      txt = 'Área: ' + g.fmtArea(g.area(pts)) + ' · perímetro ' + g.fmtDist(g.perimetro(pts));
    }
    el.textContent = txt;
    el.hidden = !txt;
  }

  function cancelarTemp() {
    if (M.gpsCaminar && gps.id != null) M.gpsCaminar(false);
    estadoGps('');
    temp.marcas.forEach((m) => M.map.removeLayer(m));
    if (temp.linea) M.map.removeLayer(temp.linea);
    temp = { pts: [], linea: null, marcas: [] };
    const el = document.getElementById('lectura');
    el.hidden = true;
  }

  /* ---------- Botones de la barra de acción ---------- */
  function deshacer() {
    if (!temp.pts.length) return;
    temp.pts.pop();
    const m = temp.marcas.pop();
    if (m) M.map.removeLayer(m);
    repintarTemp();
  }
  function terminar() {
    if (M.modo === 'editar') { M.setModo('mover'); return; }
    if (M.modo === 'dibujar') {
      if (temp.pts.length < 3) { Chakra.aviso('Marca al menos 3 puntos.', true); return; }
      const tipo = document.getElementById('tipo-dibujo').value;
      const n = E.lotes.filter((l) => l.tipo === tipo).length + 1;
      const lote = Chakra.normalizarLote({ nombre: (tipo === 'territorio' ? 'Territorio ' : 'Parcela ') + n, tipo, anillo: temp.pts.slice() });
      E.lotes.push(lote);
      // Si la capa de ese tipo estaba apagada, se prende para que se vea lo dibujado
      E.capas[tipo].visible = true;
      Chakra.emit('capas-cambiaron');
      M.setModo('mover');
      Chakra.seleccionar(lote.id, true);
      Chakra.guardar();
      M.zoomALote(lote.id);
      if (tipo === 'chacra') Chakra.emit('parcela-nueva', lote); // abre el Resumen y empieza a analizar
      else Chakra.aviso('Territorio guardado. Ponle nombre en el panel.');
      return;
    }
    // Medir: se deja la medida a la vista y se sale de la herramienta
    const txt = document.getElementById('lectura').textContent;
    M.setModo('mover');
    if (txt) Chakra.aviso(txt);
  }

  /* ---------- Edición de vértices ---------- */
  function quitarVertices() {
    edicion.marcas.forEach((m) => M.map.removeLayer(m));
    edicion = { id: null, marcas: [], sel: -1 };
  }
  function pintarVertices() {
    edicion.marcas.forEach((m) => M.map.removeLayer(m));
    edicion.marcas = [];
    const l = Chakra.lotePorId(edicion.id);
    if (!l) return;
    const a = l.anillo;
    a.forEach((pt, i) => {
      const m = L.marker(pt, {
        draggable: true,
        icon: L.divIcon({ className: 'vertice' + (i === edicion.sel ? ' sel' : ''), iconSize: [16, 16] }),
      }).addTo(M.map);
      m.on('drag', (e) => { a[i] = [e.latlng.lat, e.latlng.lng]; l.forma = null; if (poligonos[l.id]) poligonos[l.id].setLatLngs(a); });
      m.on('dragend', () => { Chakra.guardar(); Chakra.emit('lote-cambio', l.id); });
      m.on('click', () => { edicion.sel = i; pintarVertices(); });
      edicion.marcas.push(m);
      // Punto pequeño en la mitad de cada lado: al tocarlo se agrega un vértice
      const sig = a[(i + 1) % a.length];
      const medio = [(pt[0] + sig[0]) / 2, (pt[1] + sig[1]) / 2];
      const mm = L.marker(medio, { icon: L.divIcon({ className: 'vertice-medio', iconSize: [10, 10] }) }).addTo(M.map);
      mm.on('click', () => { a.splice(i + 1, 0, medio); edicion.sel = i + 1; refrescarEdicion(l); });
      edicion.marcas.push(mm);
    });
  }
  function refrescarEdicion(l) {
    l.forma = null; // el borde ya es el que marcó la persona
    if (poligonos[l.id]) poligonos[l.id].setLatLngs(l.anillo);
    pintarVertices();
    Chakra.guardar();
    Chakra.emit('lote-cambio', l.id);
  }
  function quitarVertice() {
    const l = Chakra.lotePorId(edicion.id);
    if (!l) return;
    if (edicion.sel < 0) { Chakra.aviso('Toca primero el punto que quieres quitar.'); return; }
    if (l.anillo.length <= 3) { Chakra.aviso('Un polígono necesita al menos 3 puntos.', true); return; }
    l.anillo.splice(edicion.sel, 1);
    edicion.sel = -1;
    refrescarEdicion(l);
  }


  /* ==========================================================================
     Registrar una parcela sin fricción: buscar el lugar o usar la ubicación,
     tocar el mapa y listo. Se crea un cuadro del tamaño por defecto (config.js)
     alrededor del punto; después se ajusta el tamaño o se mueven las esquinas.
     La especificación admite que la geometría de una parcela parta de un punto.
     ========================================================================== */
  // Cuadro de `ha` hectáreas centrado en el punto
  M.cuadrado = function (lat, lng, ha) {
    const medio = Math.sqrt(ha * 10000) / 2, dLat = medio / 111320, dLng = medio / (111320 * Math.cos((lat * Math.PI) / 180));
    return [[lat + dLat, lng - dLng], [lat + dLat, lng + dLng], [lat - dLat, lng + dLng], [lat - dLat, lng - dLng]];
  };
  // Crea la parcela en ese punto, la elige y lanza el análisis
  M.crearEn = function (lat, lng) {
    const ha = Chakra.CFG.parcela.area_defecto_ha, n = E.lotes.filter((l) => l.tipo === 'chacra').length + 1;
    const lote = Chakra.normalizarLote({ nombre: 'Parcela ' + n, tipo: 'chacra', anillo: M.cuadrado(lat, lng, ha), forma: { auto: true, lat, lng, ha } });
    E.lotes.push(lote);
    E.capas.chacra.visible = true; Chakra.emit('capas-cambiaron');
    M.map.closePopup();
    if (M.modo !== 'mover') M.setModo('mover');
    M.dibujarLotes();
    Chakra.guardar();
    Chakra.seleccionar(lote.id, true);
    M.zoomALote(lote.id);
    Chakra.emit('parcela-nueva', lote); // el panel abre el Resumen y empieza a analizar
    return lote;
  };
  // Globo con el botón "Crear parcela aquí"
  function ofrecerCrear(lat, lng, titulo) {
    const d = document.createElement('div'); d.className = 'pop-crear';
    d.innerHTML = `<b>${Chakra.esc(titulo || lat.toFixed(5) + ', ' + lng.toFixed(5))}</b><button class="btn" type="button">Crear parcela aquí</button><small>Se crea un cuadro de ${String(Chakra.CFG.parcela.area_defecto_ha).replace('.', ',')} ha. Después ajustas el tamaño y el borde.</small>`;
    d.querySelector('button').addEventListener('click', () => M.crearEn(lat, lng));
    L.popup({ closeButton: true, autoPanPadding: [30, 80] }).setLatLng([lat, lng]).setContent(d).openOn(M.map);
  }
  function irYOfrecer(lat, lng, zoom, titulo) {
    M.map.setView([lat, lng], Math.max(zoom, Math.min(M.map.getZoom(), 18)));
    if (M.modo === 'punto') M.crearEn(lat, lng); else ofrecerCrear(lat, lng, titulo);
  }
  // Mi ubicación: centra el mapa y ofrece crear la parcela ahí (o la crea, si ya se pidió "Nueva parcela")
  M.ubicacion = async function () {
    if (!(await gpsListo())) return;
    Chakra.aviso('Buscando tu ubicación…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const prec = Math.round(pos.coords.accuracy);
      irYOfrecer(pos.coords.latitude, pos.coords.longitude, 17, 'Estás aquí (±' + prec + ' m)');
      if (prec > 100) Chakra.aviso('La ubicación es aproximada (±' + prec + ' m). Si no coincide, mueve el mapa y toca el lugar exacto.', true);
    }, () => Chakra.aviso('No se pudo obtener tu ubicación. Revisa el permiso del navegador, o busca el lugar y toca el mapa.', true), { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 });
  };
  // Entiende "‑1.23889, ‑77.89613", "‑1,23889 ‑77,89613", "1.23889 S 77.89613 O" y también longitud antes que latitud
  M.leerCoordenadas = function (texto) {
    let t = texto.trim().toUpperCase().replace(/[°º]/g, ' ');
    let m = t.match(/^(-?\d+(?:\.\d+)?)\s*([NS])?\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*([EWO])?$/) || t.match(/^(-?\d+,\d+)\s*([NS])?\s*[;\s]\s*(-?\d+,\d+)\s*([EWO])?$/);
    if (!m) return null;
    let a = parseFloat(m[1].replace(',', '.')), b = parseFloat(m[3].replace(',', '.'));
    if (m[2] === 'S') a = -Math.abs(a); if (m[4] === 'W' || m[4] === 'O') b = -Math.abs(b);
    // Si venía como longitud, latitud: se nota porque solo en ese orden cae dentro del país
    const k = Chakra.CFG.busqueda.caja, en = (la, lo) => la >= k[0] && la <= k[2] && lo >= k[1] && lo <= k[3];
    if ((Math.abs(a) > 90 && Math.abs(b) <= 90) || (!en(a, b) && en(b, a))) [a, b] = [b, a];
    return Math.abs(a) <= 90 && Math.abs(b) <= 180 ? [a, b] : null;
  };
  // Buscar: coordenadas, un cantón de la lista o un lugar por nombre (OpenStreetMap)
  M.buscar = async function (texto) {
    const t = (texto || '').trim(); if (!t) return;
    const c = M.leerCoordenadas(t);
    if (c) return irYOfrecer(c[0], c[1], 17);
    const canton = Chakra.CANTONES.find((x) => x.nombre.toLowerCase() === t.toLowerCase());
    if (canton) return M.irA(canton.lat, canton.lng, canton.zoom);
    if (navigator.onLine === false) return Chakra.aviso('Sin internet no se puede buscar por nombre. Pega las coordenadas o toca el mapa.', true);
    Chakra.aviso('Buscando «' + t + '»…');
    try {
      const B = Chakra.CFG.busqueda, r = await fetch(`${B.url}?format=jsonv2&limit=1&countrycodes=${B.pais}&accept-language=es&q=${encodeURIComponent(t)}`, { signal: AbortSignal.timeout(12000) });
      const j = r.ok ? await r.json() : [];
      if (!j.length) return Chakra.aviso('No encontré «' + t + '». Prueba con la parroquia o el cantón, o pega las coordenadas.', true);
      irYOfrecer(+j[0].lat, +j[0].lon, 15, j[0].display_name.split(',').slice(0, 2).join(','));
    } catch (e) { Chakra.aviso('No se pudo buscar el lugar. Mueve el mapa y toca donde está la parcela.', true); }
  };

  /* ---------- Cableado de los botones y el teclado ---------- */
  M.cablear = function () {
    document.querySelectorAll('.herr[data-modo]').forEach((b) => b.addEventListener('click', () => {
      // Tocar otra vez la herramienta activa vuelve a "mover"
      M.setModo(M.modo === b.dataset.modo && b.dataset.modo !== 'mover' ? 'mover' : b.dataset.modo);
      Chakra.cerrarHojas();   // en celular: la hoja se esconde para poder tocar el mapa
    }));
    document.getElementById('acc-deshacer').addEventListener('click', deshacer);
    document.getElementById('acc-quitar').addEventListener('click', quitarVertice);
    document.getElementById('acc-cancelar').addEventListener('click', () => M.setModo('mover'));
    document.getElementById('acc-terminar').addEventListener('click', terminar);
    document.getElementById('acc-aqui').addEventListener('click', M.gpsPunto);
    document.getElementById('acc-caminar').addEventListener('click', () => M.gpsCaminar());
    document.getElementById('acc-coord').addEventListener('click', M.coordenadas);
    document.getElementById('acc-ubic').addEventListener('click', M.ubicacion);
    const fab = document.getElementById('fab-nueva'); if (fab) fab.addEventListener('click', () => { M.setModo('punto'); Chakra.cerrarHojas(); });
    document.body.classList.add('modo-mover');
    document.getElementById('tipo-dibujo').addEventListener('change', barra);
    document.addEventListener('keydown', (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
      if (e.key === 'Escape' && M.modo !== 'mover') M.setModo('mover');
      if (e.key === 'Enter' && M.modo !== 'mover') terminar();
    });
  };

  // Cuando cambia la selección o un lote, se redibujan los estilos
  Chakra.on('seleccion', () => {
    M.refrescarEstilos();
    if (M.modo === 'editar' && E.seleccion !== edicion.id) M.setModo('mover');
  });
  Chakra.on('lote-cambio', () => M.dibujarLotes());
})();

/* ==========================================================================
   parcela.js — las pestañas del panel de la parcela:
     Resumen (analizar + semáforo + verdor) · Familia · Medidas · Qué sembrar
     · Plan · Seguimiento · Luna y bitácora · Informe
   Lee la configuración (config.js), los cálculos (calculo, verdor, motor) y lo
   traído por ambiente.js. paneles.js las llama con
   Chakra.parcela.pestana(nombre, cuerpo, lote, repintar).
   ========================================================================== */
(function () {
  const Chakra = window.Chakra, esc = Chakra.esc, CFG = Chakra.CFG, C = Chakra.calc;
  const $ = (id) => document.getElementById(id);
  const COL = { verde: 'Bajo', amarillo: 'Medio', rojo: 'Alto', gris: 'Sin dato' };
  const sel = (opts, val) => opts.map(([v, t]) => `<option value="${esc(v)}" ${v === val ? 'selected' : ''}>${esc(t)}</option>`).join('');
  const fmt = (x, d = 1) => (x == null ? '—' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));
  const conf = (c) => `<span class="conf ${Chakra.CONFIANZA[c].clase}" title="${esc(Chakra.CONFIANZA[c].texto)}">Confianza ${c}</span>`;
  const hoy = () => new Date().toISOString().slice(0, 10);
  const etapaN = (e) => CFG.etapas.nombres[e || ''];
  const ilus = (ctx) => (ctx.ilustrativo ? '<span class="rotulo-ilus">Datos ilustrativos</span>' : '');
  const ayuda = (k) => `<p class="ayuda">${esc(CFG.ayudas[k])}</p>`;
  const fuenteLin = (o, c) => (o ? `<p class="origen">Fuente: ${esc(o.fuente)}${o.periodo ? ' · ' + esc(o.periodo) : ''}${o.fecha ? ' · consultado el ' + esc(o.fecha) : ''} · ${conf(c)}</p>` : '');
  // Mascotas: chorongo astronauta (lee el satélite) y chorongo campesino kichwa (mira el terreno). Si hay cuadros de video, se animan.
  const MASC = { astronauta: 'astronauta-saluda', campesino: 'campesino-yuca' };
  // Las mascotas y las plantas son imágenes generadas con IA (Google Flow): llevan su marca a la vista
  const mascota = (id, w) => `<span class="con-ia"><img class="masc" data-masc="${id}" src="assets/mascota/${MASC[id]}.webp" alt="${id === 'astronauta' ? 'Chorongo astronauta: lee el satélite' : 'Chorongo campesino: mira el terreno'} (imagen generada con IA)" width="${w || 84}"><i class="marca-ia" title="Imagen generada con IA (Google Flow)">IA</i></span>`;
  let mascTimer = null;
  function animarMascotas(cuerpo) {
    clearInterval(mascTimer); const N = 48, sets = [];
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cuerpo.querySelectorAll('img.masc').forEach((img) => {
      const base = `assets/mascota/${img.dataset.masc}/`, first = new Image();
      first.onload = () => { const fr = [first]; for (let i = 1; i < N; i++) { const im = new Image(); im.src = base + String(i).padStart(2, '0') + '.webp'; fr.push(im); } sets.push({ img, fr }); };
      first.src = base + '00.webp';
    });
    let i = 0; mascTimer = setInterval(() => { i = (i + 1) % N; sets.forEach((s) => { if (document.contains(s.img) && s.fr[i].complete && s.fr[i].naturalWidth) s.img.src = s.fr[i].src; }); }, 85);
  }

  /* ---------- Semáforo: una tarjeta por riesgo (el nivel siempre va en texto, no solo en color) ---------- */
  const CONF_DE = { erosion: 'pendiente', lavado: 'lluvia', acidez: 'ph', calor: 'calor', seco: 'racha' };
  function tarjetaRiesgo(r, ctx) {
    const x = ctx.detalle[r.id], c = x.color, k = CONF_DE[r.id];
    return `<article class="riesgo ${c}"><div class="semaforo" aria-hidden="true"><i></i></div>
      <div><h4>${esc(r.pregunta)}</h4>
      <p class="nivel"><strong>${esc(r.nombre)}: ${COL[c]}</strong></p>
      <p>${esc(x.dato)}</p>
      ${c !== 'gris' ? fuenteLin(ctx.origen[k], ctx.conf[k]) : ''}
      ${(c === 'rojo' || c === 'amarillo') ? '<p class="hacer"><b>Qué hacer:</b> ' + esc(r.hacer) + '</p>' : ''}
      <details><summary>¿Por qué importa?</summary><p>${esc(r.explica)}</p></details></div></article>`;
  }

  /* ---------- Avance de "Analizar parcela" por fuente (sección 11) ---------- */
  const EST = { cola: 'En cola', bajando: 'Descargando…', listo: 'Listo', fallo: 'Falló', servidor: 'Necesita servidor' };
  function listaProg(p) {
    return CFG.fuentes.map((f) => { const x = (p && p[f.id]) || { estado: 'cola', nota: '' }; return `<li class="${x.estado}"><span class="pr-est">${EST[x.estado]}</span><div><b>${esc(f.nombre)}</b><small>${esc(f.detalle)}</small>${x.nota ? '<small class="pr-nota">' + esc(x.nota) + '</small>' : ''}</div></li>`; }).join('');
  }

  /* ======================= RESUMEN ======================= */
  function resumen(cuerpo, l, repintar) {
    const ctx = Chakra.contexto(l), g = Chakra.geo, a = l.ambiente, P = l.parcela, vd = ctx.verdor;
    const viejo = a && !l.demo && C.diasEntre(a.fecha, hoy()) > 31;
    const ult = l.analisis[l.analisis.length - 1], corriendo = !!(Chakra.analizando && Chakra.analizando.has(l.id));
    // Lo importante primero: etapa, mejor siembra y los cinco riesgos de un vistazo
    const mejor = ctx.ranking[0], hayDatos = !!(a && (a.clima || a.pendiente || a.suelo));
    const tarjeta = hayDatos ? `
      <section class="resumen-top" aria-label="Resumen de la parcela">
        <div class="rt-fila">
          <div class="rt-caja"><span>Etapa de la chakra</span><b>${esc(etapaN(ctx.etapa))}</b>
            ${ctx.recuperacion != null ? `<div class="rt-barra" role="img" aria-label="Recuperación: ${ctx.recuperacion} % del bosque"><i style="width:${Math.min(100, ctx.recuperacion)}%"></i></div><small>Recuperación: ${ctx.recuperacion} % del bosque</small>` : '<small>Aún sin dato de verdor</small>'}</div>
          <div class="rt-caja"><span>Mejor opción de siembra</span><b>${esc(mejor.opcion.nombre)}</b><small>Nota ${mejor.nota} de 100</small>
            <button class="btn-texto" id="pa-ir-siembra" type="button">Ver qué sembrar →</button></div>
        </div>
        <ul class="rt-riesgos">${Chakra.RIESGOS.map((r) => `<li class="${ctx.riesgos[r.id]}"><i aria-hidden="true"></i><span>${esc(r.nombre)}</span><b>${COL[ctx.riesgos[r.id]]}</b></li>`).join('')}</ul>
      </section>` : `
      <section class="resumen-top vacia"><b>Esta parcela aún no se ha analizado.</b><span>Toca «Analizar parcela» para traer el clima, el suelo y la pendiente de este lugar.</span></section>`;
    cuerpo.innerHTML = `
      ${ilus(ctx)}
      ${tarjeta}
      <details class="formulario datos-parcela" ${l.forma && l.forma.auto && !a ? 'open' : ''}><summary>Datos de la parcela <span class="chip">${g.fmtArea(g.area(l.anillo))}</span></summary>
      <div class="ficha-parcela">
        <label class="campo">Responsable de la parcela<input type="text" id="pa-resp" value="${esc(P.responsable)}" placeholder="Nombre de quien la cuida"></label>
        <label class="campo">Comunidad o lugar<input type="text" id="pa-com" value="${esc(P.comunidad)}" placeholder="Comunidad, parroquia"></label>
        <label class="campo">¿Cómo se maneja hoy? (lo declara quien la cuida)<select id="pa-man">${sel(Chakra.OPCIONES.manejo, P.manejo)}</select></label>
        ${l.forma && l.forma.auto ? `<label class="campo">Tamaño aproximado de la parcela (hectáreas)<input type="number" inputmode="decimal" id="pa-ha" min="0.05" max="200" step="0.1" value="${l.forma.ha}"><small>Se creó como un cuadro alrededor del punto que tocaste. Cambia aquí el tamaño, o usa «Editar» para llevar las esquinas al borde real.</small></label>` : ''}
        <p class="medidas"><span class="chip">${g.fmtArea(g.area(l.anillo))}</span> <span class="chip">Perímetro ${g.fmtDist(g.perimetro(l.anillo))}</span> <span class="chip">${l.anillo.length} puntos</span></p>
      </div></details>
      <div class="tres" aria-label="Las tres fuentes de Willak.space">
        <div class="${a ? 'on' : ''}"><b>Desde el espacio</b><span>${a ? 'Clima, suelo y pendiente traídos' : 'Falta analizar la parcela'}</span></div>
        <div class="${Object.entries(l.campo).some(([k, v]) => k !== 'fuente' && v !== '') || l.bitacora.length ? 'on' : ''}"><b>En el terreno</b><span>${Object.entries(l.campo).filter(([k, v]) => k !== 'fuente' && v !== '').length} medidas · ${l.bitacora.length} anotaciones</span></div>
        <div class="${l.familia.prioridades_definidas || l.familia.historia.length || Chakra.clpiOk(l) ? 'on' : ''}"><b>Saber de la familia</b><span>${l.familia.historia.length} etapas contadas · ${l.familia.prioridades_definidas ? 'prioridades anotadas' : 'faltan prioridades'}</span></div>
      </div>
      <div class="traer con-masc">${mascota('astronauta', 76)}<div>
        <button class="btn" id="pa-traer" type="button" ${corriendo ? 'disabled' : ''}>${corriendo ? 'Analizando… falta el suelo' : a ? 'Volver a analizar la parcela' : 'Analizar parcela (NASA y suelo)'}</button>
        <small>${corriendo ? 'El clima y la pendiente ya están abajo. El suelo (SoilGrids) puede tardar cerca de un minuto más y se suma solo.' : l.pendiente_analisis ? '<b>En cola:</b> se pidió sin internet y se lanzará solo al reconectar.' : a ? 'Analizada el ' + esc(a.fecha) + ' para el centro de la parcela.' + (viejo ? ' Pasó más de un mes: conviene volver a analizar.' : '') : 'Descarga clima, suelo y pendiente de este lugar. Gratis y sin clave.'}</small>
      </div></div>
      <details class="prog-caja" id="pa-prog-caja" ${Chakra.progreso[l.id] ? '' : 'hidden'} ${corriendo ? 'open' : ''}><summary>Avance por fuente</summary><ul class="prog" id="pa-prog">${listaProg(Chakra.progreso[l.id])}</ul></details>
      ${a && a.avisos && a.avisos.length ? '<div class="banner-sim">' + a.avisos.map((t) => '<p>' + esc(t) + '</p>').join('') + '</div>' : ''}

      <h3 class="sec-h">Riesgos de la parcela</h3>
      <div class="riesgos">${Chakra.RIESGOS.map((r) => tarjetaRiesgo(r, ctx)).join('')}</div>
      ${a && a.clima && !a.clima.oficial ? '<p class="fine">La lluvia viene del respaldo que indica la especificación (PRECTOTCORR de NASA POWER) porque no se pudo traer IMERG (necesita el servidor con la cuenta Earthdata). Ese respaldo suele quedarse corto en Napo: por eso su confianza baja un nivel.</p>' : ''}

      <h3 class="sec-h">Verdor y etapa de la chakra</h3>
      ${vd ? `
        <div class="kpis">
          <div><b>${fmt(ctx.evi, 3)}</b><span>EVI de la parcela en ${ctx.anio}</span></div>
          <div><b>${fmt(ctx.evi_bosque, 3)}</b><span>EVI del bosque de referencia</span></div>
          <div><b>${ctx.recuperacion == null ? '—' : ctx.recuperacion + ' %'}</b><span>Recuperación frente al bosque</span></div>
        </div>
        ${fuenteLin({ fuente: l.demo ? 'MODIS MOD13Q1 y MYD13Q1 (ilustrativo)' : (l.verdor && l.verdor.fuente) || 'MODIS MOD13Q1 y MYD13Q1 v061', fecha: l.verdor && l.verdor.fecha ? l.verdor.fecha : null }, vd.confianza)}
        ${ctx.recup ? '<p class="recup ' + ctx.recup.color + '"><strong>' + esc(ctx.recup.texto) + '</strong></p>' : ''}
        ${l.verdor && l.verdor.bosque ? '<p class="fine">Bosque de referencia: ' + (l.verdor.bosque.tipo === 'BP1' ? 'la parcela BP1 que dibujaste.' : l.verdor.bosque.usados ? l.verdor.bosque.usados + ' de ' + l.verdor.bosque.de + ' píxeles a menos de 5 km con verdor estable.' : 'no se halló un bosque estable a menos de 5 km. Dibuja el bosque de referencia, llámalo BP1 y vuelve a analizar.') + ' La parcela ocupa ' + l.verdor.pixeles + ' píxel(es) de MODIS (250 m).</p>' : ''}
        ${l.verdor_tarea && !l.verdor_tarea.error ? '<p class="fine">Hay un pedido nuevo en proceso en AppEEARS; al llegar reemplaza estos datos.</p>' : ''}
        <div id="pa-graf"></div>
        ${ayuda('EVI')}${ayuda('recuperacion')}`
      : `${l.verdor_tarea ? (l.verdor_tarea.error
            ? '<div class="banner-sim"><span class="rotulo-sim">Falló el verdor</span><br>' + esc(l.verdor_tarea.error) + ' Vuelve a tocar «Analizar parcela» para pedirlo otra vez.</div>'
            : '<div class="banner-sim"><span class="rotulo-sim">En proceso</span><br>AppEEARS está preparando el verdor de esta parcela (25 años de imágenes de Terra y Aqua)' + (l.verdor_tarea.avance ? ': ' + l.verdor_tarea.avance + ' %' : '') + '. Tarda varios minutos. La app pregunta sola cada medio minuto y lo mostrará aquí al llegar; puedes seguir trabajando o cerrar y volver más tarde.</div>')
          : `<div class="banner-sim"><span class="rotulo-sim">Necesita servidor</span><br>
          El verdor (EVI de MODIS) se descarga con AppEEARS, que pide una cuenta Earthdata. Esa clave no puede ir en el navegador: la guarda el servidor de Willak Space. Este sitio está abierto sin servidor o sin la cuenta configurada. Mientras tanto, el equipo técnico puede escribir aquí el porcentaje de recuperación.</div>`}
        <label class="campo">Verdor frente al bosque cercano (%)<input type="number" id="pa-recup" min="0" max="150" step="1" value="${esc(P.recuperacion)}" placeholder="Ej.: 88"></label>
        ${ctx.recup ? '<p class="recup ' + ctx.recup.color + '"><strong>' + esc(ctx.recup.texto) + '</strong></p>' : ''}${ayuda('recuperacion')}`}
      <div class="etapas-dos">
        <div><span>El satélite detecta</span><b>${esc(etapaN(ctx.etapa_detectada))}</b></div>
        <div><span>La familia dice</span><b>${ctx.etapa_familia ? esc(etapaN(ctx.etapa_familia)) : 'Aún no lo dijo'}</b></div>
      </div>
      <p class="fine">${ctx.etapas_distintas ? '<b>No coinciden: se usa lo que dice la familia.</b> ' : ''}Se trabaja con: <b>${esc(etapaN(ctx.etapa))}</b>. La etapa de la familia se anota en la pestaña Familia.
        ${ctx.descanso ? ' Años de descanso: <b>' + ctx.descanso.anios + '</b> (según ' + (ctx.descanso.fuente === 'familia' ? 'la familia' : 'el satélite') + ')' + (ctx.descanso_familia != null && ctx.descanso_satelite != null && ctx.descanso_familia !== ctx.descanso_satelite ? '; el satélite cuenta ' + ctx.descanso_satelite : '') + '.' : ''}
        ${vd && vd.aperturas.length ? ' Aperturas detectadas: ' + vd.aperturas.map((x) => `${x.anio} (EVI cae de ${fmt(x.antes, 2)} a ${fmt(x.despues, 2)})`).join('; ') + '.' : ''}</p>

      <h3 class="sec-h">El suelo</h3>
      <ul class="suelo-lista">
        <li>${ctx.ph != null ? 'pH ' + fmt(ctx.ph) + ' ' + conf(ctx.conf.ph) : 'pH: sin dato. Mídelo con cintas o un medidor en <b>Medidas</b>.'}</li>
        ${['om', 'n'].map((k) => (ctx.suelo[k] ? `<li>${esc(ctx.suelo[k].texto)} (${fmt(ctx[k], k === 'n' ? 2 : 1)} ${CFG.suelo[k].unidad})</li>` : '')).join('')}
        ${['p', 'k'].map((k) => (ctx.suelo[k] ? `<li>${esc(ctx.suelo[k].texto)} (${fmt(ctx[k], k === 'k' ? 2 : 1)} ${CFG.suelo[k].unidad}) ${conf(ctx.conf.pk)}</li>` : `<li>${CFG.suelo[k].nombre}: sin dato ${conf('baja')}<br><small>SoilGrids no lo trae: sale de un muestreo del CEIPA o se escribe en Medidas.</small></li>`)).join('')}
        ${ctx.textura ? '<li>' + esc(ctx.textura) + '</li>' : ''}
        ${ctx.humedad != null ? '<li>' + esc(Chakra.humedadSuelo(ctx.humedad)) + ' en la zona de raíces (promedio)</li>' : ''}
        ${ctx.mesesLluvia ? '<li>Meses de lluvia fuerte: ' + esc(ctx.mesesLluvia) + '</li>' : ''}
      </ul>
      ${a && a.suelo ? fuenteLin({ fuente: l.campo.fuente === 'ceipa' ? 'Muestreo CEIPA' + (l.datos_ilustrativos ? ' (ilustrativo)' : '') : a.suelo.fuente, fecha: a.fecha }, ctx.conf.ph) : ''}

      ${ult ? `<details class="formulario"><summary>Trazabilidad del último análisis</summary>
        <p class="fine">Análisis ${esc(ult.id)} · ${esc(ult.fecha.slice(0, 16).replace('T', ' '))}. Cada análisis guarda la versión y la fecha de las fuentes que usó.</p>
        <div class="tabla-luna"><table><thead><tr><th>Fuente</th><th>Versión o producto</th><th>Consultada</th></tr></thead><tbody>
        ${Object.entries(ult.versiones_fuentes || {}).map(([k, v]) => `<tr><td>${esc((CFG.fuentes.find((f) => f.id === k) || { nombre: k === 'pendiente' ? 'Pendiente' : k }).nombre)}</td><td>${esc(v.version || '')}${v.nota ? '<br><small>' + esc(v.nota) + '</small>' : ''}</td><td>${esc(v.fecha_consulta || '—')}${v.periodo ? '<br><small>' + esc(v.periodo) + '</small>' : ''}</td></tr>`).join('')}
        </tbody></table></div><p class="fine">Se guardan los últimos ${l.analisis.length} análisis de esta parcela.</p></details>` : ''}
      <p class="fine">Los umbrales son valores iniciales por validar con el CEIPA. Están en el archivo de configuración, no en el código.</p>`;
    const gd = (id, fn) => $(id).addEventListener('input', (e) => { fn(e.target.value); Chakra.guardar(); });
    gd('pa-resp', (v) => (P.responsable = v)); gd('pa-com', (v) => (P.comunidad = v));
    $('pa-man').addEventListener('change', (e) => { P.manejo = e.target.value; Chakra.guardar(); });
    if ($('pa-ir-siembra')) $('pa-ir-siembra').addEventListener('click', () => Chakra.irAPestana('siembra'));
    if ($('pa-ha')) $('pa-ha').addEventListener('change', (e) => {
      const ha = Math.max(0.05, Math.min(200, +String(e.target.value).replace(',', '.') || l.forma.ha));
      l.forma.ha = ha; l.anillo = Chakra.mapa.cuadrado(l.forma.lat, l.forma.lng, ha);
      Chakra.guardar(); Chakra.mapa.dibujarLotes(); Chakra.emit('lote-cambio', l.id); Chakra.mapa.zoomALote(l.id); repintar();
    });
    if ($('pa-recup')) $('pa-recup').addEventListener('change', (e) => { P.recuperacion = e.target.value; Chakra.guardar(); repintar(); });
    $('pa-traer').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'Analizando…';
      const caja = $('pa-prog-caja'); caja.hidden = false; caja.open = true;
      try {
        await Chakra.analizar(l, (p) => { const ul = $('pa-prog'); if (ul) ul.innerHTML = listaProg(p); });
        Chakra.aviso('Análisis listo.');
      } catch (err) { Chakra.aviso(err.message, true); }
      // al terminar, la propia función de análisis repinta el Resumen si se sigue mirando
    });
    if (vd) graficoAnual($('pa-graf'), vd);
  }
  // Historia anual: EVI de la parcela frente al bosque de referencia
  function graficoAnual(el, vd) {
    const x = (anio) => Math.round(Date.UTC(anio, 6, 1) / 864e5), K = Chakra.COLOR_SERIE;
    Chakra.grafico(el, {
      titulo: 'EVI anual de la parcela y del bosque de referencia', alto: 220, formato: (d) => 'Año ' + new Date(d * 864e5).getUTCFullYear(),
      series: [
        { nombre: 'Bosque de referencia', color: K.bosque, linea: true, pts: (vd.bosque || []).map((b) => ({ x: x(b.anio), y: b.evi })) },
        { nombre: 'Parcela (mediana del año)', color: K.parcela, linea: true, puntos: true, pts: vd.historia.map((h) => ({ x: x(h.anio), y: h.evi, nota: (CFG.etapas.nombres[h.etapa] || '').toLowerCase() + ', confianza ' + h.confianza })) },
      ],
      marcas: vd.aperturas.map((a) => ({ x: x(a.anio), texto: 'Apertura ' + a.anio })),
    });
  }

  /* ======================= FAMILIA (lo que sabe la familia; funciona sin internet) ======================= */
  function familia(cuerpo, l, repintar) {
    const F = l.familia, P = l.parcela, ctx = Chakra.contexto(l);
    const cult = Object.entries(CFG.cultivos);
    cuerpo.innerHTML = `
      ${ilus(ctx)}
      <div class="banner-sim">Lo que dice la familia <strong>siempre puede corregir</strong> lo que detecta el satélite. Este formulario funciona sin internet y se guarda en este equipo.</div>
      <label class="campo">Familia<input type="text" id="fa-nombre" value="${esc(F.nombre)}" placeholder="Nombre de la familia"></label>
      <label class="campo">¿En qué etapa está la chakra, según la familia?<select id="fa-etapa">${sel(Chakra.ETAPAS, P.etapa)}</select>
        <small>El satélite detecta: ${esc(etapaN(ctx.etapa_detectada))}. Si no coinciden, gana la familia.</small></label>
      <label class="campo">¿Cuántos años lleva descansando (purma)?<input type="number" id="fa-desc" min="0" max="60" step="1" value="${esc(F.anios_descanso)}" placeholder="${ctx.descanso_satelite != null ? 'El satélite cuenta ' + ctx.descanso_satelite : 'Ej.: 6'}"></label>

      <h3 class="sec-h">¿Qué le importa más a la familia?</h3>
      <p class="fine">De 0 (nada) a 5 (muchísimo). Con esto se calcula la parte de «prioridades» de la recomendación.</p>
      <div class="prioridades">${CFG.prioridades.map((p) => `
        <label class="deslizador"><span>${esc(p.nombre)}</span><input type="range" min="0" max="5" step="1" data-pr="${p.id}" value="${F.prioridades[p.id]}"><output>${F.prioridades[p.id]}</output></label>`).join('')}</div>
      ${F.prioridades_definidas ? '' : '<p class="fine">Aún nadie movió estas prioridades: todas valen 3.</p>'}

      <h3 class="sec-h">Historia de siembra</h3>
      <div id="fa-hist">${F.historia.length ? F.historia.slice().sort((x, y) => (y.anio_inicio || 0) - (x.anio_inicio || 0)).map((h) => `
        <article class="relato"><header><strong>${esc(etapaN(h.etapa))}</strong><span>${esc(h.anio_inicio)}${h.anio_fin && h.anio_fin !== h.anio_inicio ? '–' + esc(h.anio_fin) : ''}</span></header>
          ${h.cultivos && h.cultivos.length ? '<p>' + h.cultivos.map((id) => esc((CFG.cultivos[id] || { nombre: id }).nombre)).join(', ') + '</p>' : ''}${h.nota ? '<p>' + esc(h.nota) + '</p>' : ''}
          <button class="btn peligro" data-i="${F.historia.indexOf(h)}" type="button">Borrar</button></article>`).join('') : '<p class="vacio">Aún no se ha contado la historia de esta parcela.</p>'}</div>
      <details class="formulario" ${F.historia.length ? '' : 'open'}><summary>Agregar una etapa de la historia</summary>
        <div class="dos-col"><label class="campo">Desde el año<input type="number" id="hi-ini" min="1950" max="2100" step="1" placeholder="2019"></label>
        <label class="campo">Hasta el año<input type="number" id="hi-fin" min="1950" max="2100" step="1" placeholder="2026"></label></div>
        <label class="campo">Etapa<select id="hi-etapa">${sel(Chakra.ETAPAS.slice(1), 'apertura')}</select></label>
        <fieldset class="casillas"><legend>Cultivos (si hubo)</legend>${cult.map(([id, c]) => `<label><input type="checkbox" value="${id}"> ${esc(c.nombre)}</label>`).join('')}</fieldset>
        <label class="campo">Nota<input type="text" id="hi-nota" placeholder="Lo que la familia quiera contar"></label>
        <button class="btn" id="hi-guardar" type="button">Guardar en la historia</button></details>
      <p class="fine">Siembras seguidas sin purma: <b>${ctx.siembras_sin_purma}</b>. Con ${CFG.seguimiento.siembras_sin_purma} o más, una caída del verdor se explica por suelo cansado.</p>`;
    $('fa-nombre').addEventListener('input', (e) => { F.nombre = e.target.value; Chakra.guardar(); });
    $('fa-etapa').addEventListener('change', (e) => { P.etapa = e.target.value; Chakra.guardar(); repintar(); });
    $('fa-desc').addEventListener('change', (e) => { F.anios_descanso = e.target.value; Chakra.guardar(); });
    cuerpo.querySelectorAll('[data-pr]').forEach((r) => r.addEventListener('input', () => { F.prioridades[r.dataset.pr] = +r.value; F.prioridades_definidas = true; r.nextElementSibling.textContent = r.value; Chakra.guardar(); }));
    $('hi-guardar').addEventListener('click', () => {
      const ini = +$('hi-ini').value, fin = +$('hi-fin').value || ini;
      if (!ini) return Chakra.aviso('Pon el año en que empezó.', true);
      if (fin < ini) return Chakra.aviso('El año final no puede ser menor que el inicial.', true);
      F.historia.push({ anio_inicio: ini, anio_fin: fin, etapa: $('hi-etapa').value, cultivos: [...cuerpo.querySelectorAll('.casillas input:checked')].map((c) => c.value), nota: $('hi-nota').value.trim() });
      Chakra.guardar(); Chakra.aviso('Guardado en la historia.'); repintar();
    });
    cuerpo.querySelectorAll('#fa-hist button').forEach((b) => b.addEventListener('click', async () => { if (!(await Chakra.confirmar('¿Borrar esta parte de la historia?'))) return; F.historia.splice(+b.dataset.i, 1); Chakra.guardar(); repintar(); }));
  }

  /* ======================= MEDIDAS (suelo en el campo) ======================= */
  function medidas(cuerpo, l, repintar) {
    const c = l.campo, a = l.ambiente || {}, S = a.suelo || {};
    const campo = (id, rot, hint, auto, paso) => `<label class="campo">${rot}<input type="number" inputmode="decimal" id="m-${id}" step="${paso || 'any'}" value="${esc(c[id])}" placeholder="${auto != null ? 'Automático: ' + String(auto).replace('.', ',') : ''}"><small>${hint}</small></label>`;
    cuerpo.innerHTML = `
      ${l.datos_ilustrativos ? '<span class="rotulo-ilus">Datos ilustrativos</span>' : ''}
      <div class="banner-sim">Lo que se mide en el campo <strong>reemplaza</strong> al dato automático de SoilGrids. Con un muestreo del CEIPA la confianza sube a alta. Deja vacío lo que no se midió.</div>
      <label class="campo">¿De dónde salen estas medidas?<select id="m-fuente"><option value="manual" ${c.fuente !== 'ceipa' ? 'selected' : ''}>Medida propia en el campo (confianza media)</option><option value="ceipa" ${c.fuente === 'ceipa' ? 'selected' : ''}>Muestreo del CEIPA (confianza alta)</option></select></label>
      ${campo('ph', 'pH del suelo', '4 muy ácido · 7 neutro. Con cintas de pH o un medidor.', S.ph, 0.1)}
      ${campo('om', 'Materia orgánica (%)', 'Menos de 2 es poca; más de 5 es mucha. De laboratorio.', S.om, 0.1)}
      ${campo('n', 'Nitrógeno (%)', 'Menos de 0,2 es bajo; más de 0,4 es alto. De laboratorio.', S.n, 0.01)}
      ${campo('p', 'Fósforo (mg/kg)', 'Menos de 10 es bajo; más de 20 es alto. SoilGrids no lo trae: solo de muestra.', null, 0.1)}
      ${campo('k', 'Potasio (cmol/kg)', 'Menos de 0,2 es bajo; más de 0,4 es alto. SoilGrids no lo trae: solo de muestra.', null, 0.01)}
      ${campo('pendiente', 'Pendiente (%)', 'Cuánto sube el terreno por cada 100 m. Plano es menos de 5.', a.pendiente ? a.pendiente.pct : null, 1)}
      ${ayuda('pH')}
      <h3 class="sec-h">Cultivos, fecha y fotos</h3><div id="insitu-aqui"></div>`;
    ['ph', 'om', 'n', 'p', 'k', 'pendiente'].forEach((k) => $('m-' + k).addEventListener('input', (e) => { c[k] = e.target.value; Chakra.guardar(); }));
    $('m-fuente').addEventListener('change', (e) => { c.fuente = e.target.value; Chakra.guardar(); });
    Chakra.pestanaInsitu($('insitu-aqui'), l);
  }

  /* ======================= QUÉ SEMBRAR (ranking con pesos que mueve el usuario) ======================= */
  const ANIM = { timer: null, tarjeta: null, i: 0 };
  const PESO_N = { rot: 'Rotación', suelo: 'Suelo', clima: 'Clima', prior: 'Prioridades de la familia' };
  function siembra(cuerpo, l, repintar) {
    const R = (l.recomendacion = l.recomendacion || { pesos: null });
    const ctx0 = Chakra.contexto(l), pesos = Object.assign({}, ctx0.pesos);
    const faltan = ctx0.ph == null && ctx0.lluvia == null;
    cuerpo.innerHTML = `
      ${ilus(ctx0)}
      ${faltan ? '<div class="banner-sim"><span class="rotulo-sim">Faltan datos</span><br>Ve a <b>Resumen</b> y toca «Analizar parcela» para que la nota use clima y suelo. Sin eso el suelo y el clima se calculan a ciegas.</div>' : ''}
      <p class="fine">Etapa de la chakra con la que se calcula: <b>${esc(etapaN(ctx0.etapa))}</b>${ctx0.etapas_distintas ? ' (lo dice la familia; el satélite detecta ' + esc(etapaN(ctx0.etapa_detectada).toLowerCase()) + ')' : ''}.</p>
      <details class="formulario" open><summary>¿Qué pesa más en la nota?</summary>
        <p class="fine">Mueve los pesos de 0 a 100. El ranking se recalcula al instante en este equipo, sin internet.</p>
        ${Object.keys(PESO_N).map((k) => `<label class="deslizador"><span>${PESO_N[k]}</span><input type="range" min="0" max="100" step="5" data-peso="${k}" value="${pesos[k]}"><output>${pesos[k]}</output></label>`).join('')}
        <button class="btn suave" id="si-reset" type="button">Volver a 40 / 25 / 20 / 15</button></details>
      <div id="si-ranking"></div>
      <p class="fine">Nota = promedio ponderado de rotación, suelo, clima y prioridades (cada una de 0 a 100). Es una ayuda para decidir, no una orden: confírmalo con la familia y con una persona técnica. Los valores del catálogo son iniciales y están por validar.</p>`;
    const pintar = () => {
      const ctx = Chakra.contexto(l), lista = ctx.ranking, mejor = lista[0], cont = $('si-ranking');
      const s = pesos.rot + pesos.suelo + pesos.clima + pesos.prior;
      cont.innerHTML = `
        <div class="mascota-reco">${mascota('campesino', 96)}
          <div class="globo"><span class="rotulo-sim">Orientativo</span>
            <p>${!s ? 'Sube al menos un peso para poder calcular la nota.' : ctx.etapa === 'purma' ? `La parcela todavía descansa. Si se abriera hoy, la mejor opción sería ${esc(mejor.opcion.nombre)} (${mejor.nota} de 100).` : `Con lo que sabemos, <b>${esc(mejor.opcion.nombre)}</b> sale primero (${mejor.nota} de 100). ${esc(mejor.etiqueta)}.`}</p></div></div>
        <ol class="ranking" aria-label="Ranking de opciones de siembra">${lista.map((r, i) => `<li><span class="rk-n">${i + 1}</span><span class="rk-nom">${esc(r.opcion.nombre)}</span><span class="rk-barra"><i style="width:${r.nota}%"></i></span><b>${r.nota}</b></li>`).join('')}</ol>
        <div class="carrusel-3d" id="carrusel" aria-label="Opciones de siembra, de mayor a menor nota" tabindex="0">
          ${lista.map((r) => `
            <article class="carta ${r.color}" data-id="${r.opcion.id}" ${r.opcion.imagen ? 'data-frames="1"' : ''}>
              <div class="carta-nota ${r.color}"><b>${r.nota}</b><small>de 100</small></div>
              <div class="carta-img">${r.opcion.imagen ? `<img alt="" data-src="../img/plantas/${r.opcion.imagen}/" src="../img/plantas/${r.opcion.imagen}/00.webp?v=4"><i class="marca-ia" title="Imagen generada con IA (Google Flow)">IA</i>` : `<div class="sin-img">${esc(r.opcion.nombre[0])}</div>`}</div>
              <h4>${esc(r.opcion.nombre)}</h4>
              <p class="et">${esc(r.etiqueta)}</p>
              <dl class="subnotas">${['rot', 'suelo', 'clima', 'prior'].map((k) => `<div><dt>${k === 'prior' ? 'Prioridades' : PESO_N[k]}</dt><dd><span class="rk-barra"><i style="width:${r.sub[k]}%"></i></span>${r.sub[k]}</dd></div>`).join('')}</dl>
              <ul>${r.explicacion.slice(0, 3).map((x) => `<li>${esc(x.texto)}</li>`).join('')}</ul>
              <button class="btn suave" data-plan="${r.opcion.id}" type="button">Armar el plan con esta opción</button>
            </article>`).join('')}
        </div>
        <h3 class="sec-h">Advertencias</h3>
        <ul class="mejoras">${ctx.advertencias.map((t) => `<li class="amarillo">${esc(t)}</li>`).join('') || '<li class="gris">Sin advertencias con los datos actuales.</li>'}</ul>`;
      cont.querySelectorAll('[data-plan]').forEach((b) => b.addEventListener('click', () => { l.plan.opcion = b.dataset.plan; Chakra.guardar(); Chakra.irAPestana('plan'); }));
      montarCarrusel($('carrusel'));
      setTimeout(() => animarMascotas(cuerpo), 0);
    };
    cuerpo.querySelectorAll('[data-peso]').forEach((r) => r.addEventListener('input', () => {
      pesos[r.dataset.peso] = +r.value; r.nextElementSibling.textContent = r.value; R.pesos = Object.assign({}, pesos); Chakra.guardar(); pintar();
    }));
    $('si-reset').addEventListener('click', () => { R.pesos = null; Chakra.guardar(); repintar(); });
    pintar();
  }

  // Carrusel con perspectiva: la tarjeta del centro se levanta y su planta gira (cuadros del video de Flow)
  function montarCarrusel(el) {
    const cartas = [...el.querySelectorAll('.carta')];
    const centro = () => {
      if (!document.contains(el)) return;
      const r = el.getBoundingClientRect(), mid = r.left + r.width / 2; let mejor = null, d0 = 1e9;
      cartas.forEach((c) => {
        const cr = c.getBoundingClientRect(), d = (cr.left + cr.width / 2 - mid), k = Math.max(-1, Math.min(1, d / (r.width * 0.55)));
        c.style.transform = `perspective(900px) rotateY(${-k * 38}deg) scale(${1 - Math.abs(k) * 0.14}) translateZ(${-Math.abs(k) * 60}px)`;
        c.style.opacity = String(1 - Math.abs(k) * 0.35);
        if (Math.abs(d) < d0) { d0 = Math.abs(d); mejor = c; }
      });
      if (mejor && mejor !== ANIM.tarjeta) animar(mejor);
    };
    el.addEventListener('scroll', () => requestAnimationFrame(centro), { passive: true });
    window.addEventListener('resize', centro);
    ANIM.tarjeta = null; setTimeout(centro, 60);
  }
  function animar(carta) {
    clearInterval(ANIM.timer); ANIM.tarjeta = carta; ANIM.i = 0;
    carta.parentElement.querySelectorAll('.carta').forEach((c) => c.classList.toggle('activa', c === carta));
    if (!carta.dataset.frames || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const img = carta.querySelector('img'); if (!img) return;
    const base = img.dataset.src, N = 72, pre = [];
    for (let i = 0; i < N; i++) { const p = new Image(); p.src = `${base}${String(i).padStart(2, '0')}.webp?v=4`; pre.push(p); }
    ANIM.timer = setInterval(() => { if (!document.contains(img)) return clearInterval(ANIM.timer); ANIM.i = (ANIM.i + 1) % N; if (pre[ANIM.i].complete) img.src = pre[ANIM.i].src; }, 70);
  }

  /* ======================= PLAN DE ROTACIÓN (36 a 60 meses) ======================= */
  function plan(cuerpo, l, repintar) {
    const ctx = Chakra.contexto(l), PL = l.plan;
    const elegido = PL.opcion || ctx.ranking[0].opcion.id, anio = +PL.inicio || +Chakra.hoyDe(l).slice(0, 4) + 1;
    const p = Chakra.planDe(l, ctx), N = p.total_meses;
    PL.items = p.items.map((it) => ({ cultivo: it.cultivo, etapa: it.etapa, mes_inicio: it.mes_inicio, mes_fin: it.mes_fin, siembra: it.siembra, cobertura: it.cobertura })); // se guarda como pide el modelo de datos
    const anios = Array.from({ length: Math.ceil(N / 12) }, (_, i) => anio + i);
    cuerpo.innerHTML = `
      ${ilus(ctx)}
      <label class="campo">Opción de siembra<select id="pl-op">${ctx.ranking.map((r) => `<option value="${r.opcion.id}" ${r.opcion.id === elegido ? 'selected' : ''}>${esc(r.opcion.nombre)} · nota ${r.nota}</option>`).join('')}</select></label>
      <label class="campo">Año en que empieza<input type="number" id="pl-anio" min="2000" max="2100" step="1" value="${anio}"></label>
      ${ctx.meses ? '' : '<div class="banner-sim"><span class="rotulo-sim">Falta la lluvia</span><br>Sin analizar la parcela no se sabe cuáles son los meses de lluvia fuerte, así que no se puede comprobar la cobertura del suelo.</div>'}
      <p class="medidas"><span class="chip ${p.cubiertos === N ? 'ok' : 'falta'}">Suelo cubierto en ${p.cubiertos} de ${N} meses</span>
        <span class="chip">${ctx.mesesLluvia ? 'Lluvia fuerte: ' + esc(ctx.mesesLluvia) : 'Lluvia fuerte: sin dato'}</span>
        <span class="chip ${p.lluvia_sin_cubrir ? 'falta' : 'ok'}">${p.lluvia_sin_cubrir ? p.lluvia_sin_cubrir + ' meses de lluvia fuerte sin cubrir' : 'Ningún mes de lluvia fuerte sin cubrir'}</span></p>
      <div class="crono-caja" tabindex="0" aria-label="Cronograma del plan"><div class="crono" style="grid-template-columns: 132px repeat(${N}, 15px);">
        <div class="cr-esq"></div>${anios.map((a, i) => `<div class="cr-anio" style="grid-column:${2 + i * 12} / span ${Math.min(12, N - i * 12)}">${a}</div>`).join('')}
        <div class="cr-esq">Etapa</div>${p.etapas.map((e) => `<div class="cr-etapa ${e.etapa}" style="grid-column:${2 + e.i0} / ${3 + e.i1}">${esc(e.nombre)}</div>`).join('')}
        ${Array.from({ length: N }, (_, mIdx) => `<div class="cr-col ${p.meses_lluvia.includes(mIdx % 12) ? 'lluvia' : ''}" style="grid-column:${2 + mIdx}; grid-row: 3 / span ${p.items.length + 1}"></div>`).join('')}
        <div class="cr-esq cr-mes-t" style="grid-row:3">Mes</div>${Array.from({ length: N }, (_, mIdx) => `<div class="cr-mes" style="grid-column:${2 + mIdx}; grid-row:3">${'EFMAMJJASOND'[mIdx % 12]}</div>`).join('')}
        ${p.items.map((it, i) => `<div class="cr-nom" style="grid-row:${4 + i}">${esc(it.nombre)}${it.insertado ? ' <small>(insertada)</small>' : ''}</div><div class="cr-barra ${it.etapa} ${it.insertado ? 'insertado' : ''}" style="grid-row:${4 + i}; grid-column:${2 + it.i0} / ${3 + it.i1}" title="${esc(it.nombre)}: ${it.mes_inicio} a ${it.mes_fin}"></div>`).join('')}
      </div></div>
      <p class="fine">Las columnas sombreadas son los meses de lluvia fuerte. En cada uno debe haber un cultivo que cubra el suelo; si falta, el plan inserta ${esc(CFG.cultivos[CFG.plan.cobertura_defecto].nombre.toLowerCase())} (leguminosa de cobertura).</p>
      <div class="tabla-luna"><table><thead><tr><th>Cultivo</th><th>Etapa</th><th>Siembra</th><th>Hasta</th><th>Cubre el suelo</th></tr></thead><tbody>
        ${p.items.map((it) => `<tr><td>${esc(it.nombre)}${it.insertado ? ' (insertada por el plan)' : ''}</td><td>${esc(CFG.plan.nombres_etapa[it.etapa])}</td><td>${esc(it.siembra)}</td><td>${esc(it.mes_fin)}</td><td>${it.cobertura ? 'Sí' : 'No'}</td></tr>`).join('')}
        <tr><td>${esc(p.purma.nombre)}</td><td>Purma</td><td>desde ${esc(p.purma.desde)}</td><td>—</td><td>Sí</td></tr>
      </tbody></table></div>
      <p class="fine">${esc(p.purma.nota)} El orden de la chakra es: apertura (ciclo corto) → bajo sombra → purma.</p>
      <p class="fine">Este plan funciona sin internet y sale en la ficha de campo (pestaña Informe).</p>`;
    $('pl-op').addEventListener('change', (e) => { PL.opcion = e.target.value; Chakra.guardar(); repintar(); });
    $('pl-anio').addEventListener('change', (e) => { PL.inicio = e.target.value; Chakra.guardar(); repintar(); });
    Chakra.guardar();
  }

  /* ======================= SEGUIMIENTO Y ALERTAS ======================= */
  let rango = 2; // años que muestra el gráfico
  function graficoSeguimiento(el, serie, sg, bosque, desdeDia) {
    const K = Chakra.COLOR_SERIE, pts = serie.filter((p) => C.dia(p.fecha) >= desdeDia), hastaDia = C.dia(serie[serie.length - 1].fecha);
    const series = [
      { nombre: 'Curva suavizada', color: K.parcela, linea: true, pts: pts.map((p) => ({ x: C.dia(p.fecha), y: p.evi_suavizado })) },
      { nombre: 'Medido', color: K.parcela, puntos: true, pts: pts.filter((p) => p.estado === 'medido').map((p) => ({ x: C.dia(p.fecha), y: p.evi, nota: 'medido' })) },
      { nombre: 'Rellenado (había nubes)', color: K.parcela, puntos: true, hueco: true, pts: pts.filter((p) => p.estado === 'rellenado').map((p) => ({ x: C.dia(p.fecha), y: p.evi_suavizado, nota: 'rellenado' })) },
    ];
    if (bosque) series.unshift({ nombre: 'Bosque de referencia', color: K.bosque, linea: true, pts: bosque.filter((b) => b.evi != null && Date.UTC(b.anio, 11, 31) / 864e5 >= desdeDia && Date.UTC(b.anio, 0, 1) / 864e5 <= hastaDia).flatMap((b) => [{ x: Math.max(desdeDia, Math.round(Date.UTC(b.anio, 0, 1) / 864e5)), y: b.evi }, { x: Math.min(hastaDia, Math.round(Date.UTC(b.anio, 11, 31) / 864e5)), y: b.evi }]) });
    let banda = null, marcas = [];
    if (sg && sg.puntos.length && sg.base != null) {
      const e = sg.puntos.filter((p) => p.esperado != null && C.dia(p.fecha) >= desdeDia);
      series.push({ nombre: 'Esperado para el cultivo', color: K.esperado, linea: true, guion: true, pts: e.map((p) => ({ x: C.dia(p.fecha), y: p.esperado })) });
      banda = { nombre: 'Banda normal (± ' + String(sg.banda).replace('.', ',') + ')', color: K.esperado, pts: e.map((p) => ({ x: C.dia(p.fecha), lo: p.esperado - sg.banda, hi: p.esperado + sg.banda })) };
    }
    if (sg && sg.siembra) marcas.push({ x: C.dia(sg.siembra), texto: 'Siembra' });
    Chakra.grafico(el, { titulo: 'EVI de la parcela en el tiempo', series, banda, marcas });
  }
  function seguimiento(cuerpo, l, repintar) {
    const ctx = Chakra.contexto(l), vd = ctx.verdor, SG = l.seguimiento, hoyL = Chakra.hoyDe(l);
    const sg = Chakra.seguimientoDe(l, ctx); if (sg) sg.siembra = SG.fecha;
    // Una alerta nueva se guarda una sola vez por fecha de dato
    if (sg && sg.alerta && !l.alertas.some((x) => x.fecha === sg.alerta.fecha && x.cultivo === SG.cultivo)) {
      l.alertas.unshift({ id: 'al' + Date.now().toString(36), parcela_id: l.id, fecha: sg.alerta.fecha, cultivo: SG.cultivo, nivel: sg.alerta.nivel, mensaje: sg.alerta.mensaje, causa: sg.alerta.causa, sugerencia: sg.alerta.sugerencia, estado: 'nueva' });
      Chakra.guardar();
    }
    const cultivos = Object.keys(CFG.seguimiento.plantillas).map((id) => [id, CFG.cultivos[id].nombre]);
    const u = vd ? vd.ultimo : null;
    cuerpo.innerHTML = `
      ${ilus(ctx)}
      ${vd ? `
        <div class="rango" role="group" aria-label="Periodo del gráfico">${[[2, '2 años'], [5, '5 años'], [99, 'Todo']].map(([n, t]) => `<button class="btn suave" data-rango="${n}" aria-pressed="${rango === n}" type="button">${t}</button>`).join('')}</div>
        <div id="sg-graf"></div>
        ${ayuda('EVI')}
        <p class="estado-sat ${u.nublado ? 'nublado' : ''}">${u.nublado ? '<b>Dato nublado, esperando el próximo compuesto.</b> No se alerta con datos rellenados.' : 'Último dato medido: <b>' + esc(u.ultimo_medido) + '</b> (hace ' + u.dias_sin_dato + ' días).'}
          ${u.consultar_radar ? '<br><b>Más de ' + CFG.verdor.hueco_max_dias + ' días sin un dato válido:</b> toca consultar el radar (NISAR o Sentinel-1). Esa consulta necesita servidor.' : ''}</p>`
      : `<div class="banner-sim"><span class="rotulo-sim">${l.verdor_tarea && !l.verdor_tarea.error ? 'En proceso' : 'Falta el verdor'}</span><br>${l.verdor_tarea && !l.verdor_tarea.error ? 'AppEEARS está preparando la serie de EVI de esta parcela. Aparecerá aquí al llegar.' : 'Para vigilar el cultivo hace falta la serie de EVI de MODIS, que trae el servidor desde AppEEARS al tocar «Analizar parcela» en Resumen.'} Abajo hay un ejemplo ilustrativo de cómo se ve una alerta.</div>`}

      <h3 class="sec-h">Cultivo que se vigila</h3>
      <label class="campo">Cultivo<select id="sg-cult"><option value="">Ninguno</option>${sel(cultivos, SG.cultivo)}</select></label>
      <label class="campo">Fecha de siembra<input type="date" id="sg-fecha" value="${esc(SG.fecha)}" max="${hoyL}"></label>
      ${sg ? `<div class="alerta-caja ${sg.alerta ? sg.alerta.nivel : sg.nublado ? 'nublado' : 'bien'}"><strong>${sg.alerta ? 'Alerta (' + (sg.alerta.nivel === 'alto' ? 'nivel alto' : 'nivel medio') + ')' : sg.nublado ? 'En espera' : 'Sin alerta'}</strong>
          <p>${esc(sg.mensaje)}</p>
          ${sg.alerta ? '<details><summary>Cómo se llegó a esa causa</summary><ol>' + sg.alerta.pasos.map((t) => '<li>' + esc(t) + '</li>').join('') + '</ol><p class="fine">Las plagas no se ven desde el satélite: confírmalo siempre con la familia.</p></details>' : ''}
          ${sg.base != null ? '<p class="fine">Línea base de la parcela: EVI ' + fmt(sg.base, 3) + ' (mediana del año anterior a la siembra). Se alerta si un dato medido queda ' + Math.abs(CFG.seguimiento.alerta_desvio * 100) + ' % o más bajo lo esperado.</p>' : ''}</div>`
      : (SG.cultivo && SG.fecha && !vd ? '' : '<p class="fine">Elige el cultivo y su fecha de siembra para comparar lo que mide el satélite con lo esperado.</p>')}

      <h3 class="sec-h">Alertas de esta parcela</h3>
      <div id="sg-alertas">${l.alertas.length ? l.alertas.map((x, i) => `
        <article class="relato"><header><strong>${esc((CFG.cultivos[x.cultivo] || { nombre: '' }).nombre)} · nivel ${esc(x.nivel)}</strong><span>${esc(x.fecha)}</span></header>
          <p>${esc(x.mensaje)}</p>
          <p><span class="chip ${x.estado === 'nueva' ? 'falta' : 'ok'}">${x.estado === 'nueva' ? 'Nueva' : x.estado === 'vista' ? 'Vista' : 'Atendida'}</span></p>
          ${x.estado !== 'atendida' ? `<button class="btn suave" data-i="${i}" data-e="${x.estado === 'nueva' ? 'vista' : 'atendida'}" type="button">${x.estado === 'nueva' ? 'Marcar como vista' : 'Marcar como atendida'}</button>` : ''}</article>`).join('') : '<p class="vacio">No hay alertas guardadas.</p>'}</div>

      ${vd ? `<details class="formulario"><summary>Historia por año (tabla)</summary><div class="tabla-luna"><table><thead><tr><th>Año</th><th>EVI</th><th>Confianza</th><th>Frente al bosque</th><th>Etapa detectada</th></tr></thead><tbody>
        ${vd.historia.slice().reverse().map((h) => `<tr><td>${h.anio}</td><td>${fmt(h.evi, 3)}</td><td>${esc(h.confianza)}</td><td>${h.recuperacion == null ? '—' : h.recuperacion + ' %'}</td><td>${esc(etapaN(h.etapa))}</td></tr>`).join('')}
        </tbody></table></div><p class="fine">EVI del año = mediana de los datos medidos. Con menos de ${CFG.verdor.min_obs_anio} datos, o menos del 30 % de fechas válidas, la confianza es baja.</p></details>` : ''}

      <details class="formulario" id="sg-ej"><summary>Ver un ejemplo ilustrativo de alerta</summary>
        <span class="rotulo-ilus">Datos ilustrativos</span>
        <p class="fine">Yuca sembrada el 15 de enero de 2026 en una parcela con fósforo bajo. Sirve para ver cómo razona la alerta; no son mediciones.</p>
        <div id="sg-ej-graf"></div><div id="sg-ej-msg"></div></details>`;
    if (vd) {
      const d1 = C.dia(vd.serie[vd.serie.length - 1].fecha), desde = rango >= 99 ? C.dia(vd.serie[0].fecha) : Math.max(C.dia(vd.serie[0].fecha), d1 - rango * 365);
      const desdeSg = sg && SG.fecha ? Math.min(desde, C.dia(SG.fecha) - 60) : desde;
      graficoSeguimiento($('sg-graf'), vd.serie, sg, vd.bosque, desdeSg);
      cuerpo.querySelectorAll('[data-rango]').forEach((b) => b.addEventListener('click', () => { rango = +b.dataset.rango; repintar(); }));
    }
    $('sg-cult').addEventListener('change', (e) => { SG.cultivo = e.target.value; Chakra.guardar(); repintar(); });
    $('sg-fecha').addEventListener('change', (e) => { SG.fecha = e.target.value; Chakra.guardar(); repintar(); });
    cuerpo.querySelectorAll('#sg-alertas button').forEach((b) => b.addEventListener('click', () => { l.alertas[+b.dataset.i].estado = b.dataset.e; Chakra.guardar(); repintar(); }));
    $('sg-ej').addEventListener('toggle', (e) => {
      if (!e.target.open || $('sg-ej-graf').childElementCount) return;
      const ej = Chakra.demo.ejemploSeguimiento(), r = Chakra.motor.seguimiento(ej); r.siembra = ej.fecha_siembra;
      graficoSeguimiento($('sg-ej-graf'), ej.serie, r, null, C.dia(ej.fecha_siembra) - 10);
      $('sg-ej-msg').innerHTML = `<div class="alerta-caja ${r.alerta.nivel}"><strong>Alerta (nivel ${r.alerta.nivel})</strong><p>${esc(r.alerta.mensaje)}</p><ol>${r.alerta.pasos.map((t) => '<li>' + esc(t) + '</li>').join('')}</ol></div>`;
    });
  }

  /* ======================= LUNA Y BITÁCORA ======================= */
  function luna(cuerpo, l, repintar) {
    const B = l.bitacora, hoyF = Chakra.luna.fase(hoy());
    // Conteo de labores por fase en TODAS las parcelas de este equipo (aprendizaje participativo)
    const todas = Chakra.estado.lotes.flatMap((x) => x.bitacora.map((b) => ({ ...b })));
    const GR = ['Luna nueva', 'Creciente', 'Luna llena', 'Menguante'];
    const tabla = Chakra.LABORES.map((lab) => ({ lab, n: GR.map((g) => todas.filter((b) => b.labor === lab && Chakra.luna.grupo(Chakra.luna.fase(b.fecha)) === g).length) })).filter((r) => r.n.some(Boolean));
    cuerpo.innerHTML = `
      <div class="banner-sim"><span class="rotulo-sim">Calendario lunar comunitario</span><br>
        Hoy es <strong>${esc(Chakra.luna.nombre(hoyF))}</strong>. Aquí cada productor anota qué hizo y en qué luna; la app pone la fase sola según la fecha. No hay reglas puestas por nosotros: el calendario lo van armando las propias familias. La fase se calcula con el ciclo medio de la luna (margen de unas horas).</div>
      <details class="formulario" open><summary>Anotar una labor</summary>
        <label class="campo">Fecha<input type="date" id="bi-fecha" value="${hoy()}" max="${hoy()}"></label>
        <label class="campo">Labor<select id="bi-labor">${Chakra.LABORES.map((x) => `<option>${esc(x)}</option>`).join('')}</select></label>
        <label class="campo">Cultivo (opcional)<select id="bi-cult"><option value="">—</option>${Chakra.CULTIVOS.concat(Chakra.OTRAS).map((c) => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select></label>
        <label class="campo">Cómo le fue / qué viste<textarea id="bi-nota" placeholder="Ej.: germinó parejo, llovió dos días después…"></textarea></label>
        <label class="campo">Lo que dice la comunidad de esta labor en esta luna (opcional)<textarea id="bi-com" placeholder="Si la familia o el sabio lo dice así, anótalo con sus palabras, también en kichwa"></textarea></label>
        <label class="check"><input type="checkbox" id="bi-ok"><span>Si escribí lo que dice la comunidad: la persona que lo cuenta <strong>está de acuerdo</strong> en que se registre y se use.</span></label>
        <button class="btn" id="bi-guardar" type="button">Guardar en la bitácora</button></details>
      ${tabla.length ? `<h3 class="sec-h">Lo que se ha anotado en este equipo</h3><div class="tabla-luna"><table><thead><tr><th>Labor</th>${GR.map((g) => `<th>${esc(g)}</th>`).join('')}</tr></thead><tbody>${tabla.map((r) => `<tr><td>${esc(r.lab)}</td>${r.n.map((n) => `<td>${n || ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="fine">Son conteos de lo registrado, no una recomendación. Con pocos datos no se puede concluir nada.</p>` : ''}
      <h3 class="sec-h">Bitácora de esta parcela</h3>
      <div id="bi-lista">${B.length ? B.slice().sort((a, b) => b.fecha.localeCompare(a.fecha)).map((b) => { const i = B.indexOf(b), f = Chakra.luna.fase(b.fecha), cu = Chakra.cultivoPorId(b.cultivo); return `
        <article class="relato"><header><strong>${esc(b.labor)}${cu ? ' · ' + esc(cu.nombre) : ''}</strong><span>${esc(b.fecha)} · ${esc(Chakra.luna.nombre(f))}</span></header>
        ${b.nota ? '<p>' + esc(b.nota) + '</p>' : ''}${b.comunidad ? '<p><span class="chip">Dice la comunidad</span> ' + esc(b.comunidad) + '</p>' : ''}
        <button class="btn peligro" data-i="${i}" type="button">Borrar</button></article>`; }).join('') : '<p class="vacio">Aún no hay anotaciones.</p>'}</div>`;
    $('bi-guardar').addEventListener('click', () => {
      const fecha = $('bi-fecha').value, com = $('bi-com').value.trim();
      if (!fecha) return Chakra.aviso('Pon la fecha.', true);
      if (com && !Chakra.clpiOk(l)) return Chakra.aviso('Para guardar lo que dice la comunidad, registra primero el acuerdo (CLPI) en la pestaña Saberes.', true);
      if (com && !$('bi-ok').checked) return Chakra.aviso('Para guardar lo que dice la comunidad hace falta que la persona esté de acuerdo.', true);
      B.push({ fecha, labor: $('bi-labor').value, cultivo: $('bi-cult').value, nota: $('bi-nota').value.trim(), comunidad: com, consentimiento: !!com });
      Chakra.guardar(); Chakra.aviso('Anotado.'); repintar();
    });
    cuerpo.querySelectorAll('#bi-lista button').forEach((b) => b.addEventListener('click', async () => { if (!(await Chakra.confirmar('¿Borrar esta anotación?'))) return; B.splice(+b.dataset.i, 1); Chakra.guardar(); repintar(); }));
  }

  /* ======================= INFORME ======================= */
  function informe(cuerpo, l) {
    const ctx = Chakra.contexto(l), P = l.parcela;
    cuerpo.innerHTML = `
      ${ilus(ctx)}
      <h3 class="sec-h">Ficha de campo (una página)</h3>
      <p class="fine">Una sola hoja A4 para llevar al terreno: parcela, semáforo de riesgos, etapa, las tres mejores opciones de siembra, el plan y las alertas. Funciona sin internet.</p>
      <button class="btn" id="inf-ficha" type="button">Abrir la ficha de campo (guardar como PDF)</button>
      <h3 class="sec-h">Registro de trazabilidad</h3>
      <div class="banner-sim">Reúne el mapa de la parcela, su área, sus medidas, el semáforo y la bitácora, con espacio para firmas. Sirve como base para un proceso agroecológico. <strong>No es una certificación</strong>: es un registro hecho por quien cuida la parcela.</div>
      <p><span class="chip">${esc(l.nombre)}</span> <span class="chip">${esc(Chakra.geo.fmtArea(Chakra.geo.area(l.anillo)))}</span> <span class="chip">${l.bitacora.length} anotaciones</span> <span class="chip">${l.ambiente ? 'Con datos del lugar' : 'Sin datos del lugar'}</span></p>
      ${(!P.responsable) ? '<p class="fine">Anota el responsable y la comunidad en <b>Resumen</b> para que salgan en el informe.</p>' : ''}
      <button class="btn suave" id="inf-gen" type="button">Generar registro de trazabilidad (PDF)</button>
      <h3 class="sec-h">Indicadores para otros usos</h3>
      <p class="fine">Una tabla con una fila por parcela (área, riesgos, suelo, etapa, mejor opción, registros). No incluye relatos ni saberes de la comunidad.</p>
      <button class="btn suave" id="inf-csv" type="button">Descargar indicadores de todas las parcelas (CSV)</button>
      <p class="fine">Se abre una hoja lista para imprimir. Elige «Guardar como PDF» en el cuadro de impresión.</p>`;
    $('inf-ficha').addEventListener('click', () => Chakra.abrirFicha(l, ctx));
    $('inf-gen').addEventListener('click', () => Chakra.abrirInforme(l, ctx));
    $('inf-csv').addEventListener('click', () => Chakra.exportarIndicadores());
  }

  Chakra.parcela = {
    listaProg,
    pestanas: ['resumen', 'familia', 'medidas', 'siembra', 'plan', 'seguimiento', 'luna', 'informe'],
    pestana(nombre, cuerpo, l, repintar) {
      setTimeout(() => animarMascotas(cuerpo), 0);
      if (nombre === 'resumen') return resumen(cuerpo, l, repintar);
      if (nombre === 'familia') return familia(cuerpo, l, repintar);
      if (nombre === 'medidas') return medidas(cuerpo, l, repintar);
      if (nombre === 'siembra') return siembra(cuerpo, l, repintar);
      if (nombre === 'plan') return plan(cuerpo, l, repintar);
      if (nombre === 'seguimiento') return seguimiento(cuerpo, l, repintar);
      if (nombre === 'luna') return luna(cuerpo, l, repintar);
      if (nombre === 'informe') return informe(cuerpo, l);
    },
  };
})();

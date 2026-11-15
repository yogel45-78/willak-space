/* ==========================================================================
   paneles.js — los paneles que ve la persona (no el mapa):
     · Capas (izquierda): interruptores, transparencia, lista de lotes
     · Parcela (derecha): Resumen · Familia · Medidas · Qué sembrar · Plan · Seguimiento · Luna · Saberes · Informe
     · Hojas deslizables del celular y botones de importar/exportar/vaciar
   ========================================================================== */
(function () {
  const Chakra = window.Chakra;
  const E = Chakra.estado;
  const esc = Chakra.esc;
  const $ = (id) => document.getElementById(id);
  const esCelular = () => window.matchMedia('(max-width: 899px)').matches;

  let pestana = 'resumen'; // pestaña abierta del panel de chacra

  /* ======================= Hojas del celular ======================= */
  Chakra.cerrarHojas = function () {
    document.querySelectorAll('.hoja.abierta').forEach((h) => h.classList.remove('abierta'));
    document.querySelectorAll('.nav-movil button').forEach((b) => b.classList.remove('activo'));
  };
  function abrirHoja(id, tab) {
    if (!esCelular()) return;
    const hoja = $(id), yaAbierta = hoja.classList.contains('abierta');
    Chakra.cerrarHojas();
    if (yaAbierta && !tab) return; // tocar de nuevo la misma pestaña la cierra
    hoja.classList.add('abierta');
    document.querySelectorAll('.nav-movil button').forEach((b) => b.classList.toggle('activo', b.dataset.abrir === id && (b.dataset.pestana || null) === (tab || null)));
  }

  /* ======================= Selección ======================= */
  Chakra.seleccionar = function (id, abrir) {
    E.seleccion = id;
    Chakra.marcarDemo();
    pintarLote();
    pintarLista();
    Chakra.emit('seleccion', id);
    if (abrir) abrirHoja('hoja-lote');
  };

  /* ======================= Panel de capas ======================= */
  function cablearCapas() {
    const mapa = Chakra.mapa;
    const enlazar = (cb, rango, clave, tieneOp) => {
      $(cb).checked = E.capas[clave].visible;
      $(cb).addEventListener('change', (e) => { E.capas[clave].visible = e.target.checked; mapa.aplicarCapas(); Chakra.guardar(); });
      if (rango) {
        $(rango).value = Math.round((tieneOp || E.capas[clave].opacidad) * 100);
        $(rango).addEventListener('input', (e) => { E.capas[clave].opacidad = e.target.value / 100; mapa.aplicarCapas(); Chakra.guardar(); });
      }
    };
    enlazar('cap-osm', 'op-osm', 'osm');
    enlazar('cap-chacra', 'op-chacra', 'chacra');
    enlazar('cap-territorio', 'op-territorio', 'territorio');
    enlazar('cap-etiquetas', null, 'etiquetas');
    // Si el mapa prende una capa por su cuenta (p. ej. al dibujar), se actualizan los interruptores
    Chakra.on('capas-cambiaron', () => {
      ['chacra', 'territorio'].forEach((k) => ($('cap-' + k).checked = E.capas[k].visible));
    });
  }

  function pintarLista() {
    $('n-lotes').textContent = E.lotes.length;
    const ul = $('lista-lotes');
    ul.innerHTML = E.lotes.length ? E.lotes.map((l) => `
      <li><button type="button" data-id="${l.id}" ${l.id === E.seleccion ? 'aria-current="true"' : ''}>
        <span class="punto ${l.tipo}"></span><span>${esc(l.nombre)}</span></button></li>`).join('')
      : '<li class="vacio">Aún no hay dibujos. Usa "Dibujar" y marca las esquinas de una chacra.</li>';
    ul.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      Chakra.seleccionar(b.dataset.id, true);
      Chakra.mapa.zoomALote(b.dataset.id);
    }));
  }
  Chakra.on('lote-cambio', pintarLista);

  /* ======================= Panel de chacra ======================= */
  function pintarLote() {
    const cont = $('contenido-lote');
    const l = Chakra.lotePorId(E.seleccion);
    if (!l) {
      cont.innerHTML = `<div class="vacio-lote">
        <p><strong>Registra tu parcela en tres pasos</strong></p>
        <ol class="pasos">
          <li><b>Ubícate.</b> Escribe el lugar arriba, pega las coordenadas o usa tu ubicación.</li>
          <li><b>Toca el mapa</b> donde está la parcela y pulsa «Crear parcela aquí».</li>
          <li><b>Listo.</b> La app la analiza sola; después ajustas el tamaño o el borde.</li>
        </ol>
        <p><button class="btn" data-accion="nueva" type="button">Nueva parcela</button> <button class="btn suave" data-accion="ubicacion" type="button">Usar mi ubicación</button></p>
        ${E.lotes.length ? '<p class="fine">O toca una parcela ya registrada en el mapa para abrirla.</p>' : ''}
        <p><button class="btn suave" id="btn-demo-2" type="button">Ver la parcela de prueba (Guaba CEIPA)</button></p>
        <p class="fine">La parcela de prueba trae datos ilustrativos para ver cómo funciona todo. <a href="pruebas.html">Ver las pruebas automáticas</a>.</p>
        <p class="fine">Datos abiertos de la NASA: POWER, MODIS, GPM IMERG y SRTM. <a href="../index.html#datos">Fuentes, enlaces y uso de IA</a> · <a href="../en.html" lang="en">English</a></p></div>`;
      return;
    }
    const area = Chakra.geo.area(l.anillo);
    cont.innerHTML = `
      <div class="lote-cab">
        <label class="lote-titulo"><input type="text" id="lote-nombre" value="${esc(l.nombre)}" aria-label="Nombre de la parcela (toca para cambiarlo)" maxlength="60"><svg width="18" height="18" aria-hidden="true"><use href="#i-editar"/></svg></label>
        <div class="lote-datos">
          <span class="chip" id="lote-area">${Chakra.geo.fmtArea(area)}</span>
          <button class="btn-texto" id="lote-zoom" type="button">Ver en el mapa</button>
          <details class="menu-lote"><summary aria-label="Más opciones de esta parcela">Opciones</summary>
            <div>
              <label>Tipo <select id="lote-tipo" aria-label="Tipo de dibujo">
                <option value="chacra" ${l.tipo === 'chacra' ? 'selected' : ''}>Parcela</option>
                <option value="territorio" ${l.tipo === 'territorio' ? 'selected' : ''}>Territorio</option>
              </select></label>
              <button class="btn-texto peligro" id="lote-borrar" type="button">Borrar esta parcela</button>
            </div></details>
        </div>
      </div>
      <div class="pestanas" role="tablist" aria-label="Secciones de la parcela">
        ${[['resumen', 'Resumen', 1], ['siembra', 'Qué sembrar', 1], ['plan', 'Plan', 1], ['seguimiento', 'Seguimiento', 1], ['familia', 'Familia', 0], ['medidas', 'Medidas', 0], ['relatos', 'Saberes', 0], ['luna', 'Luna', 0], ['informe', 'Informe', 0]].map(([k, t, principal]) =>
          `<button role="tab" data-p="${k}" class="${principal ? 'principal' : ''}" aria-selected="${pestana === k}">${t}</button>`).join('')}
      </div>
      <div id="pestana-cuerpo"></div>`;

    $('lote-nombre').addEventListener('input', (e) => { l.nombre = e.target.value; Chakra.guardar(); Chakra.mapa.dibujarLotes(); pintarLista(); });
    $('lote-tipo').addEventListener('change', (e) => { l.tipo = e.target.value; Chakra.guardar(); Chakra.mapa.dibujarLotes(); pintarLista(); });
    $('lote-zoom').addEventListener('click', () => { Chakra.mapa.zoomALote(l.id); if (esCelular()) Chakra.cerrarHojas(); });
    $('lote-borrar').addEventListener('click', async () => {
      if (!(await Chakra.confirmar('¿Borrar "' + l.nombre + '" con todos sus datos y relatos? No se puede deshacer.'))) return;
      E.lotes = E.lotes.filter((x) => x.id !== l.id);
      E.seleccion = null;
      Chakra.guardar();
      Chakra.mapa.dibujarLotes();
      pintarLista();
      pintarLote();
      Chakra.emit('seleccion', null); Chakra.marcarDemo();
    });
    cont.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { pestana = b.dataset.p; pintarLote(); }));
    const barra = cont.querySelector('.pestanas'), act = cont.querySelector('[data-p][aria-selected="true"]');
    if (barra && act) barra.scrollLeft += act.getBoundingClientRect().left - barra.getBoundingClientRect().left - barra.clientWidth / 2 + act.clientWidth / 2;
    pintarPestana(l);
  }
  // Otras partes de la app pueden pedir que se abra una pestaña (por ejemplo, «Armar el plan con esta opción»)
  Chakra.irAPestana = (nombre) => { pestana = nombre; pintarLote(); const c = $('contenido-lote'); if (c && c.parentElement) c.parentElement.scrollTop = 0; };
  Chakra.repintarLote = () => pintarLote();
  // Parcela recién creada con un toque: se abre el Resumen y arranca el análisis sin pedirlo
  Chakra.on('parcela-nueva', (l) => {
    pestana = 'resumen'; pintarLote();
    Chakra.aviso('Parcela creada. Empieza el análisis…');
    setTimeout(() => { const b = $('pa-traer'); if (b && !b.disabled && E.seleccion === l.id) b.click(); }, 300);
  });
  // Repinta solo si esa parcela está elegida y se está mirando una de esas pestañas (para no borrar un formulario a medio llenar)
  Chakra.refrescarSi = (lote, pestanas) => { if (E.seleccion === lote.id && pestanas.includes(pestana)) pintarLote(); };
  // Si la forma cambia (editar vértices) se actualiza el área mostrada
  Chakra.on('lote-cambio', (id) => {
    const l = Chakra.lotePorId(id), el = $('lote-area');
    if (l && el) el.textContent = Chakra.geo.fmtArea(Chakra.geo.area(l.anillo));
  });

  function pintarPestana(l) {
    const cuerpo = $('pestana-cuerpo');
    if (Chakra.parcela.pestanas.includes(pestana)) return Chakra.parcela.pestana(pestana, cuerpo, l, () => pintarLote());
    if (pestana === 'relatos') return pestanaRelatos(cuerpo, l);
    Chakra.asesor.render(cuerpo, l);
  }

  /* ---- (a) Datos satelitales: SOLO estructura, sin cifras ---- */
  function pestanaSatelite(cuerpo) {
    cuerpo.innerHTML = `
      <div class="banner-sim"><span class="rotulo-sim">Ejemplo · sin datos reales</span><br>
      Estas tarjetas muestran dónde irán los datos satelitales de la chacra. Todavía no hay ninguna fuente conectada, por eso no aparece ninguna cifra.</div>
      <div class="tarjetas-sat">${Chakra.INDICADORES.map((i) => `
        <div class="tarjeta-sat" data-indicador="${i.id}">
          <h4>${esc(i.nombre)}</h4>
          <div class="valor">—<small> ${esc(i.unidad)}</small></div>
          <div class="serie" aria-hidden="true"></div>
          <div class="fuente">Fuente prevista: ${esc(i.fuente)}</div>
        </div>`).join('')}</div>`;
  }

  /* ---- (b) Datos en sitio ---- */
  function pestanaInsitu(cuerpo, l) {
    const d = l.insitu;
    cuerpo.innerHTML = `
      <label class="campo">Cultivos
        <input type="text" id="is-cultivos" value="${esc(d.cultivos)}" placeholder="Ej.: yuca, plátano, cacao…">
        <small>Separa con comas.</small></label>
      <label class="campo">Fecha de siembra
        <input type="date" id="is-siembra" value="${esc(d.siembra)}"></label>
      <label class="campo">Observaciones
        <textarea id="is-obs" placeholder="Lo que ves en la chacra: suelo, plantas, lluvias, plagas…">${esc(d.obs)}</textarea></label>
      <div class="campo">Fotos (opcional)</div>
      <div class="fotos" id="is-fotos">${d.fotos.map((f, i) => `<figure><img src="${f}" alt="Foto ${i + 1} de ${esc(l.nombre)}"><button type="button" data-i="${i}" aria-label="Quitar foto ${i + 1}">×</button></figure>`).join('')}</div>
      <label class="campo"><input type="file" id="is-foto" accept="image/*" multiple>
        <small>Las fotos se reducen y se guardan solo en este equipo.</small></label>`;
    const enlazar = (id, clave) => $(id).addEventListener('input', (e) => { d[clave] = e.target.value; Chakra.guardar(); });
    enlazar('is-cultivos', 'cultivos'); enlazar('is-siembra', 'siembra'); enlazar('is-obs', 'obs');
    $('is-foto').addEventListener('change', async (e) => {
      for (const f of e.target.files) {
        try { d.fotos.push(await reducirFoto(f)); } catch (err) { Chakra.aviso('No se pudo leer una foto.', true); }
      }
      Chakra.guardar(); pintarLote();
    });
    cuerpo.querySelectorAll('#is-fotos button').forEach((b) => b.addEventListener('click', () => { d.fotos.splice(+b.dataset.i, 1); Chakra.guardar(); pintarLote(); }));
  }
  Chakra.pestanaInsitu = (cuerpo, l) => pestanaInsitu(cuerpo, l);
  // Reduce la foto a máx. 640 px (JPEG) para que quepa en localStorage
  function reducirFoto(archivo) {
    return new Promise((ok, mal) => {
      const url = URL.createObjectURL(archivo);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 640 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); mal(); };
      img.src = url;
    });
  }

  /* ---- (c) Relatos de la comunidad ---- */
  function pestanaRelatos(cuerpo, l) {
    const K = l.parcela.clpi;
    cuerpo.innerHTML = `
      <details class="formulario clpi" ${Chakra.clpiOk(l) ? '' : 'open'}>
        <summary>Acuerdo con la comunidad (CLPI) ${Chakra.clpiOk(l) ? '<span class="chip ok">Registrado</span>' : '<span class="chip falta">Falta</span>'}</summary>
        <p class="fine">Consentimiento libre, previo e informado: antes de guardar saberes de la comunidad, la comunidad debe saber para qué se usan y estar de acuerdo. Aquí se deja constancia de ese acuerdo; el acuerdo real se hace en asamblea o con sus autoridades, según sus propias normas. Sin esto, la app no guarda relatos ni lo que "dice la comunidad".</p>
        <label class="campo">Quién autoriza (persona o asamblea)<input type="text" id="cl-aut" value="${esc(K.autoriza)}"></label>
        <label class="campo">Cargo o rol<input type="text" id="cl-cargo" value="${esc(K.cargo)}" placeholder="Ej.: presidente de la comunidad, asamblea"></label>
        <label class="campo">Fecha del acuerdo<input type="date" id="cl-fecha" value="${esc(K.fecha)}"></label>
        <label class="campo">Para qué se autoriza<select id="cl-alc"><option value="">Elegir…</option><option value="interno" ${K.alcance === 'interno' ? 'selected' : ''}>Solo para la familia y la comunidad</option><option value="proyecto" ${K.alcance === 'proyecto' ? 'selected' : ''}>También para el proyecto, citando a la comunidad</option></select></label>
        <label class="check"><input type="checkbox" id="cl-ok" ${K.ok ? 'checked' : ''}><span>La comunidad fue informada antes, decidió libremente y <strong>puede retirar su permiso</strong> cuando quiera.</span></label>
      </details>
      <div id="senales-aqui"></div>
      <h3 class="sec-h">Relatos de la familia</h3>
      <details class="formulario" ${l.relatos.length ? '' : 'open'}>
        <summary>Agregar un relato</summary>
        <label class="campo">¿Quién lo cuenta?
          <input type="text" id="re-quien" placeholder="Nombre o cómo prefiere que se le nombre"></label>
        <label class="campo">Comunidad / pueblo (opcional)
          <input type="text" id="re-comunidad" placeholder="Ej.: comunidad, parroquia, nacionalidad o pueblo"></label>
        <label class="campo">Relato (texto)
          <textarea id="re-texto" placeholder="Lo que cuenta sobre la chacra, las siembras, las lluvias…"></textarea></label>
        <label class="campo">Audio (opcional)
          <input type="file" id="re-audio" accept="audio/*"><small>Máximo 600 KB; es para notas cortas.</small></label>
        <label class="check"><input type="checkbox" id="re-ok">
          <span>Quien cuenta el relato <strong>sabe y está de acuerdo</strong> en que se registre aquí.</span></label>
        <label class="campo">¿Para qué se puede usar?
          <select id="re-uso">
            <option value="interno">Solo uso interno del equipo</option>
            <option value="proyecto">Puede usarse en el proyecto, citando a quien lo cuenta</option>
          </select></label>
        <button class="btn" id="re-guardar" type="button">Guardar relato</button>
      </details>
      <div id="re-lista">${l.relatos.length ? l.relatos.map((r, i) => `
        <article class="relato"><header><strong>${esc(r.quien)}${r.comunidad ? ' · ' + esc(r.comunidad) : ''}</strong><span>${esc(r.fecha)}</span></header>
          ${r.texto ? '<p>' + esc(r.texto) + '</p>' : ''}
          ${r.audio ? '<audio controls src="' + r.audio + '"></audio>' : ''}
          <p><span class="chip">${r.uso === 'proyecto' ? 'Uso en el proyecto' : 'Solo interno'}</span> <span class="chip">Con consentimiento</span></p>
          <button class="btn peligro" data-i="${i}" type="button">Borrar</button></article>`).join('')
        : '<p class="vacio">Aún no hay relatos para esta chacra.</p>'}</div>`;

    pintarSenales($('senales-aqui'), l);
    [['cl-aut', 'autoriza'], ['cl-cargo', 'cargo'], ['cl-fecha', 'fecha'], ['cl-alc', 'alcance']].forEach(([id, k]) => $(id).addEventListener('change', (e) => { K[k] = e.target.value; Chakra.guardar(); }));
    $('cl-ok').addEventListener('change', (e) => { K.ok = e.target.checked; Chakra.guardar(); pintarLote(); });
    $('re-guardar').addEventListener('click', async () => {
      if (!Chakra.clpiOk(l)) return Chakra.aviso('Primero registra el acuerdo con la comunidad (CLPI), arriba.', true);
      const quien = $('re-quien').value.trim(), texto = $('re-texto').value.trim(), f = $('re-audio').files[0];
      if (!quien) return Chakra.aviso('Anota quién cuenta el relato.', true);
      if (!texto && !f) return Chakra.aviso('Escribe el relato o sube un audio.', true);
      if (!$('re-ok').checked) return Chakra.aviso('Sin el consentimiento de quien cuenta no se puede guardar.', true);
      let audio = '';
      if (f) {
        if (f.size > 600 * 1024) return Chakra.aviso('El audio pesa más de 600 KB. Usa uno más corto.', true);
        audio = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
      }
      l.relatos.unshift({ quien, comunidad: $('re-comunidad').value.trim(), texto, audio, uso: $('re-uso').value, consentimiento: true, fecha: new Date().toISOString().slice(0, 10) });
      Chakra.guardar(); pintarPestana(l);
      Chakra.aviso('Relato guardado.');
    });
    cuerpo.querySelectorAll('#re-lista button').forEach((b) => b.addEventListener('click', async () => {
      if (!(await Chakra.confirmar('¿Borrar este relato?'))) return;
      l.relatos.splice(+b.dataset.i, 1); Chakra.guardar(); pintarPestana(l);
    }));
  }

  /* ---- (d) Señales locales (especificación, sección 10) ----
     No se guarda una señal sin consentimiento y el alcance es obligatorio. La comunidad puede retirarla:
     queda marcada como retirada y deja de mostrarse y de usarse. Se compara con la lluvia diaria de la parcela. */
  function pintarSenales(cont, l) {
    const S = Chakra.CFG.senales, vivas = E.senales.filter((s) => !s.retirada), retiradas = E.senales.length - vivas.length;
    const diario = Chakra.diarioDe(l), clim = diario ? Chakra.motor.climatologiaLluvia(diario) : null;
    const grupos = {}; vivas.forEach((s) => { const k = s.titulo.trim().toLowerCase() + '|' + (s.comunidad || '').trim().toLowerCase(); (grupos[k] = grupos[k] || []).push(s); });
    const alc = Object.fromEntries(S.alcances);
    cont.innerHTML = `
      <h3 class="sec-h">Señales locales</h3>
      <p class="fine">Señales que la comunidad observa antes de la lluvia fuerte (un canto, una floración, un cambio en el río). Son de la comunidad: se guardan solo con su consentimiento y la comunidad puede retirarlas cuando quiera.</p>
      <div id="se-lista">${Object.values(grupos).length ? Object.values(grupos).map((g) => {
        const cmp = diario ? Chakra.motor.compararSenal(g.map((s) => s.fecha_obs), diario, clim) : null;
        return `<article class="relato senal">${g.some((s) => s.demo) ? '<span class="rotulo-ilus">Datos ilustrativos</span>' : ''}
          <header><strong>${esc(g[0].titulo)}</strong><span>${esc(g[0].comunidad || '')}</span></header>
          <p>Anuncia: ${esc(g[0].anuncia)}. <span class="chip">${esc(alc[g[0].alcance] || g[0].alcance)}</span> <span class="chip ok">Con consentimiento</span></p>
          ${g[0].texto ? '<p>' + esc(g[0].texto) + '</p>' : ''}
          ${cmp && cmp.total ? '<p class="coincide"><b>Coincide ' + cmp.coinciden + ' de ' + cmp.total + ' años</b> con el inicio de la lluvia fuerte.</p>' : '<p class="fine">' + (diario ? 'Las fechas quedan fuera de la lluvia descargada.' : 'Analiza la parcela para comparar esta señal con la lluvia.') + '</p>'}
          <div class="tabla-luna"><table><thead><tr><th>Se observó</th><th>Lluvia fuerte</th><th>Desfase</th><th></th></tr></thead><tbody>${g.slice().sort((a, b) => a.fecha_obs.localeCompare(b.fecha_obs)).map((s) => { const a = cmp ? cmp.anios.find((x) => x.fecha === s.fecha_obs) : null; return `<tr><td>${esc(s.fecha_obs)}<br><small>${esc(s.autor)}</small></td><td>${a && a.inicio_lluvia ? esc(a.inicio_lluvia) : '—'}</td><td>${a && a.desfase != null ? a.desfase + ' días · ' + (a.coincide ? 'coincide' : 'no coincide') : '—'}</td><td><button class="btn peligro" data-retirar="${esc(s.id)}" type="button">Retirar</button></td></tr>`; }).join('')}</tbody></table></div>
        </article>`; }).join('') : '<p class="vacio">Aún no hay señales registradas.</p>'}</div>
      ${retiradas ? '<p class="fine">' + retiradas + ' señal(es) retiradas por la comunidad: ya no se muestran ni se usan.</p>' : ''}
      <p class="fine">Coincide cuando la lluvia fuerte empieza entre ${S.coincide_min_dias} y ${S.coincide_max_dias} días después de la señal. Inicio de lluvia fuerte: primer día en que el promedio de ${S.ventana_media_dias} días supera lo habitual de ese mes (percentil ${S.percentil}).${diario && !l.demo ? ' La lluvia viene del respaldo de NASA POWER.' : ''}</p>
      <details class="formulario"><summary>Registrar una señal</summary>
        <label class="campo">Señal (qué se observa)<input type="text" id="se-titulo" placeholder="Con las palabras de la comunidad"></label>
        <label class="campo">¿Qué anuncia?<input type="text" id="se-anuncia" value="Lluvia fuerte"></label>
        <label class="campo">Fecha en que se observó<input type="date" id="se-fecha" max="${new Date().toISOString().slice(0, 10)}"><small>Si la misma señal se vio otros años, regístrala una vez por año con el mismo nombre.</small></label>
        <label class="campo">Quién la cuenta<input type="text" id="se-autor"></label>
        <label class="campo">Comunidad<input type="text" id="se-com" value="${esc(l.parcela.comunidad)}"></label>
        <label class="campo">Lo que cuenta (opcional)<textarea id="se-texto"></textarea></label>
        <label class="campo">¿Quién puede verla? (obligatorio)<select id="se-alc"><option value="">Elegir…</option>${S.alcances.map(([v, t]) => '<option value="' + v + '">' + esc(t) + '</option>').join('')}</select></label>
        <label class="check"><input type="checkbox" id="se-ok"><span>Quien la cuenta <strong>sabe y está de acuerdo</strong> en que se registre. Sin esto no se guarda.</span></label>
        <button class="btn" id="se-guardar" type="button">Guardar señal</button></details>`;
    $('se-guardar').addEventListener('click', () => {
      const titulo = $('se-titulo').value.trim(), fecha = $('se-fecha').value, autor = $('se-autor').value.trim(), alcance = $('se-alc').value;
      if (!titulo) return Chakra.aviso('Escribe qué señal se observa.', true);
      if (!fecha) return Chakra.aviso('Pon la fecha en que se observó.', true);
      if (!autor) return Chakra.aviso('Anota quién la cuenta.', true);
      if (!alcance) return Chakra.aviso('Elige quién puede ver la señal: es obligatorio.', true);
      if (!$('se-ok').checked) return Chakra.aviso('Sin consentimiento no se puede guardar la señal.', true);
      E.senales.push({ id: Chakra.nuevoId(), titulo, anuncia: $('se-anuncia').value.trim() || 'Lluvia fuerte', fecha_obs: fecha, autor, comunidad: $('se-com').value.trim(), texto: $('se-texto').value.trim(), consentimiento: true, alcance, retirada: false });
      Chakra.guardar(); Chakra.aviso('Señal guardada.'); pintarSenales(cont, l);
    });
    cont.querySelectorAll('[data-retirar]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await Chakra.confirmar('¿Retirar esta señal? Dejará de mostrarse y de usarse.', { aceptar: 'Sí, retirar' }))) return;
      const s = E.senales.find((x) => x.id === b.dataset.retirar); if (s) { s.retirada = true; s.texto = ''; }
      Chakra.guardar(); pintarSenales(cont, l);
    }));
  }

  /* ======================= Importar, exportar, vaciar ======================= */
  function cablearArchivos() {
    $('btn-exportar').addEventListener('click', () => {
      if (!E.lotes.length) return Chakra.aviso('No hay nada que exportar todavía.');
      const blob = new Blob([JSON.stringify(Chakra.aGeoJSON(), null, 2)], { type: 'application/geo+json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chakra-space-' + new Date().toISOString().slice(0, 10) + '.geojson';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      Chakra.aviso('GeoJSON exportado (revisa tu carpeta de descargas).');
    });
    $('btn-importar').addEventListener('click', () => $('archivo-geojson').click());
    $('archivo-geojson').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const n = Chakra.desdeGeoJSON(r.result);
          Chakra.guardar(); Chakra.mapa.dibujarLotes(); pintarLista();
          const todos = E.lotes.flatMap((x) => x.anillo);
          if (todos.length) Chakra.mapa.map.fitBounds(todos, { padding: [40, 40] });
          Chakra.aviso('Se importaron ' + n + ' polígono(s).');
          Chakra.cerrarHojas();
        } catch (err) { Chakra.aviso(err.message, true); }
      };
      r.onerror = () => Chakra.aviso('No se pudo leer el archivo.', true);
      r.readAsText(f);
      e.target.value = ''; // permite volver a elegir el mismo archivo
    });
    $('btn-vaciar').addEventListener('click', async () => {
      if (!E.lotes.length) return Chakra.aviso('El mapa ya está vacío.');
      if (!(await Chakra.confirmar('¿Vaciar el mapa? Se borran TODAS las parcelas, sus datos y relatos de este equipo. Exporta antes si quieres conservarlos.', { aceptar: 'Sí, vaciar todo' }))) return;
      E.lotes = []; E.seleccion = null; E.senales = [];
      Chakra.guardar(); Chakra.mapa.dibujarLotes(); pintarLista(); pintarLote(); Chakra.marcarDemo();
      Chakra.cerrarHojas();
    });
  }

  /* ======================= Arranque de los paneles ======================= */
  Chakra.iniciarPaneles = function () {
    cablearCapas();
    cablearArchivos();
    const bc = $('btn-capas'); if (bc) bc.addEventListener('click', () => { const on = document.body.classList.toggle('ver-capas'); bc.setAttribute('aria-pressed', String(on)); setTimeout(() => Chakra.mapa.map.invalidateSize(), 60); });
    pintarLista();
    pintarLote();
    document.querySelectorAll('[data-cerrar]').forEach((b) => b.addEventListener('click', Chakra.cerrarHojas));
    document.querySelectorAll('.nav-movil button').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.pestana) { pestana = b.dataset.pestana; pintarLote(); }
      abrirHoja(b.dataset.abrir, b.dataset.pestana);
    }));
  };
})();

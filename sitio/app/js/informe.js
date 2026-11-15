/* ==========================================================================
   informe.js — hoja de trazabilidad de una parcela, lista para "Guardar como PDF".
   Se arma como una página HTML con estilos de impresión A4 (sin librerías) y se abre en otra
   pestaña con el cuadro de impresión. El croquis de la parcela es un SVG con sus puntos.
   No es una certificación: es un registro hecho por quien cuida la parcela.
   ========================================================================== */
(function () {
  const Chakra = window.Chakra, esc = Chakra.esc;
  const COL = { verde: 'Bajo', amarillo: 'Medio', rojo: 'Alto', gris: 'Sin dato' };

  function croquis(anillo) {
    const lat0 = anillo.reduce((s, p) => s + p[0], 0) / anillo.length, k = Math.cos((lat0 * Math.PI) / 180);
    const xs = anillo.map((p) => p[1] * k), ys = anillo.map((p) => -p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const W = 420, H = 300, pad = 28, s = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-9), (H - 2 * pad) / Math.max(y1 - y0, 1e-9));
    const ox = (W - (x1 - x0) * s) / 2 - x0 * s, oy = (H - (y1 - y0) * s) / 2 - y0 * s;
    const pts = anillo.map((p, i) => [p[1] * k * s + ox, -p[0] * s + oy, i + 1]);
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Croquis de la parcela">
      <rect x="1" y="1" width="${W - 2}" height="${H - 2}" fill="#fff" stroke="#DCE5D6"/>
      <polygon points="${pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ')}" fill="#E3EDDC" stroke="#1E5734" stroke-width="2.5" stroke-linejoin="round"/>
      ${pts.map((p) => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="5" fill="#1E5734"/><text x="${(p[0] + 8).toFixed(1)}" y="${(p[1] - 8).toFixed(1)}" font-size="12" fill="#12301F" font-family="sans-serif">${p[2]}</text>`).join('')}
      <g transform="translate(${W - 34},34)"><path d="M0 14 L0 -14 M-7 -6 L0 -14 L7 -6" stroke="#12301F" stroke-width="2" fill="none"/><text x="-4" y="28" font-size="11" font-family="sans-serif" fill="#12301F">N</text></g></svg>`;
  }

  // Indicadores por parcela en CSV (separador ; para Excel en español). Sin relatos ni saberes.
  Chakra.exportarIndicadores = function () {
    const g = Chakra.geo, N = { verde: 'Bajo', amarillo: 'Medio', rojo: 'Alto', gris: 'Sin dato' }, v = (x) => (x == null ? '' : String(x).replace('.', ','));
    const cab = ['parcela', 'comunidad', 'responsable', 'manejo_declarado', 'area_ha', 'lat', 'lng', 'etapa', 'etapa_satelite', 'etapa_familia', 'recuperacion_vs_bosque_pct', 'evi', 'riesgo_erosion', 'riesgo_lavado', 'riesgo_acidez', 'riesgo_calor', 'riesgo_seco', 'riesgos_altos', 'pendiente_pct', 'lluvia_anual_mm', 'aguaceros_fuertes', 'racha_seca_dias', 'dias_calor', 'ph', 'ph_origen', 'materia_organica_pct', 'nitrogeno_pct', 'fosforo_mgkg', 'potasio_cmolkg', 'mejor_opcion', 'nota_mejor_opcion', 'datos_ilustrativos', 'anotaciones_bitacora', 'meses_con_registro', 'fuentes_completas_de_3', 'clpi_registrado', 'fecha_datos_lugar'];
    const filas = Chakra.estado.lotes.filter((l) => l.anillo.length >= 3).map((l) => {
      const c = Chakra.contexto(l), P = l.parcela, a = l.ambiente;
      const cen = [l.anillo.reduce((s, p) => s + p[0], 0) / l.anillo.length, l.anillo.reduce((s, p) => s + p[1], 0) / l.anillo.length];
      const top = c.ranking[0];
      const meses = new Set(l.bitacora.map((b) => b.fecha.slice(0, 7))).size;
      const fuentes = (a ? 1 : 0) + ((Object.entries(l.campo).some(([k, z]) => k !== 'fuente' && z !== '') || l.bitacora.length) ? 1 : 0) + (Chakra.clpiOk(l) ? 1 : 0);
      return [l.nombre, P.comunidad, P.responsable, P.manejo, v(Math.round(g.area(l.anillo) / 100) / 100), cen[0].toFixed(5), cen[1].toFixed(5), c.etapa, c.etapa_detectada, c.etapa_familia, v(c.recuperacion), v(c.evi),
        ...['erosion', 'lavado', 'acidez', 'calor', 'seco'].map((k) => N[c.riesgos[k]]), Object.values(c.riesgos).filter((z) => z === 'rojo').length,
        v(c.pendiente), v(c.lluvia), v(c.fuertes), v(c.racha), v(c.calor), v(c.ph), c.ph == null ? '' : l.campo.ph !== '' ? (l.campo.fuente === 'ceipa' ? 'CEIPA' : 'manual') : 'SoilGrids', v(c.om), v(c.n), v(c.p), v(c.k),
        top.opcion.nombre, top.nota, l.datos_ilustrativos ? 'si' : 'no', l.bitacora.length, meses, fuentes, Chakra.clpiOk(l) ? 'si' : 'no', a ? a.fecha : ''];
    });
    if (!filas.length) return Chakra.aviso('Todavía no hay parcelas.');
    const csv = '\ufeff' + [cab, ...filas].map((f) => f.map((x) => '"' + String(x == null ? '' : x).replace(/"/g, '""') + '"').join(';')).join('\r\n');
    const a2 = document.createElement('a'); a2.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a2.download = 'willak-indicadores-' + new Date().toISOString().slice(0, 10) + '.csv';
    document.body.appendChild(a2); a2.click(); a2.remove(); Chakra.aviso('Indicadores descargados.');
  };

  Chakra.abrirInforme = function (l, ctx) {
    const g = Chakra.geo, P = l.parcela, a = l.ambiente, hoy = new Date();
    const centro = [l.anillo.reduce((s, p) => s + p[0], 0) / l.anillo.length, l.anillo.reduce((s, p) => s + p[1], 0) / l.anillo.length];
    const fmtN = (x, d = 1) => (x == null ? '—' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));
    const manejo = (Chakra.OPCIONES.manejo.find((o) => o[0] === P.manejo) || ['', 'Sin definir'])[1];
    const etapa = Chakra.CFG.etapas.nombres[ctx.etapa] + (ctx.etapas_distintas ? ' (según la familia; el satélite detecta ' + Chakra.CFG.etapas.nombres[ctx.etapa_detectada].toLowerCase() + ')' : '');
    const idInf = 'WS-' + l.id.slice(-6).toUpperCase() + '-' + hoy.toISOString().slice(0, 10).replaceAll('-', '');
    const top = ctx.ranking.slice(0, 3);
    const logo = new URL('assets/logo.png', location.href).href;

    const riesgos = Chakra.RIESGOS.map((r) => { const x = ctx.detalle[r.id]; return `<tr><td>${esc(r.pregunta)}</td><td class="n ${x.color}">${COL[x.color]}</td><td>${esc(x.dato)}</td><td>${x.color === 'rojo' || x.color === 'amarillo' ? esc(r.hacer) : ''}</td></tr>`; }).join('');
    const suelo = [
      ['pH', ctx.ph != null ? fmtN(ctx.ph) : '—', ctx.ph == null ? 'Sin dato' : (ctx.origen.ph ? ctx.origen.ph.fuente : '') + ' · confianza ' + ctx.conf.ph],
      ['Materia orgánica (%)', fmtN(ctx.om), ctx.suelo.om ? ctx.suelo.om.texto : ''],
      ['Nitrógeno (%)', fmtN(ctx.n, 2), ctx.suelo.n ? ctx.suelo.n.texto : ''],
      ['Fósforo (mg/kg)', fmtN(ctx.p), ctx.suelo.p ? ctx.suelo.p.texto : 'Falta muestra'],
      ['Potasio (cmol/kg)', fmtN(ctx.k, 2), ctx.suelo.k ? ctx.suelo.k.texto : 'Falta muestra'],
      ['Textura', ctx.textura || '—', ''],
    ].map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join('');
    const bit = l.bitacora.slice().sort((x, y) => x.fecha.localeCompare(y.fecha)).map((b) => { const cu = Chakra.cultivoPorId(b.cultivo); return `<tr><td>${esc(b.fecha)}</td><td>${esc(Chakra.luna.nombre(Chakra.luna.fase(b.fecha)))}</td><td>${esc(b.labor)}</td><td>${cu ? esc(cu.nombre) : ''}</td><td>${esc(b.nota || '')}${b.comunidad ? '<br><i>Dice la comunidad:</i> ' + esc(b.comunidad) : ''}</td></tr>`; }).join('');
    const mej = Chakra.mejoras(ctx).map((m) => `<li><b>${esc(m.titulo)}</b> (${esc(m.nivel)}): ${esc(m.texto)}</li>`).join('');

    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(idInf)} · ${esc(l.nombre)}</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@page { size: A4; margin: 14mm 14mm 16mm; }
* { box-sizing: border-box; } body { font: 12px/1.45 'Segoe UI', Arial, sans-serif; color: #12301F; margin: 0; padding: 16px; max-width: 800px; margin-inline: auto; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 3px solid #1E5734; padding-bottom: 8px; margin-bottom: 12px; }
header img { height: 52px; } header div { text-align: right; } h1 { font-size: 18px; margin: 0; } h2 { font-size: 13px; margin: 14px 0 6px; color: #114D2B; border-bottom: 1px solid #DCE5D6; padding-bottom: 3px; }
table { width: 100%; border-collapse: collapse; margin: 4px 0; } th, td { border: 1px solid #DCE5D6; padding: 4px 6px; text-align: left; vertical-align: top; } th { background: #F4F7F1; }
.n { font-weight: 700; text-align: center; white-space: nowrap; } .n.verde { background: #DDE8D6; color: #1E5734; } .n.amarillo { background: #FBEBC8; color: #7A4B00; } .n.rojo { background: #F6D5D0; color: #8E2A20; } .n.gris { background: #eee; color: #555; }
.datos { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 16px; } .datos div b { display: inline-block; min-width: 120px; }
.dos { display: grid; grid-template-columns: 1.2fr 1fr; gap: 14px; align-items: start; } .fine { font-size: 10.5px; color: #56685B; }
.aviso { border: 1px dashed #9A5B00; padding: 6px 8px; border-radius: 6px; font-size: 11px; margin: 8px 0; } .firmas { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 24px; margin-top: 36px; } .firmas div { border-top: 1px solid #12301F; padding-top: 4px; font-size: 11px; text-align: center; }
.barra { position: sticky; top: 0; background: #fff; padding: 8px 0; text-align: right; } .barra button { padding: 8px 16px; font: 600 14px sans-serif; background: #1E5734; color: #fff; border: 0; border-radius: 8px; cursor: pointer; } @media print { .barra { display: none; } body { padding: 0; } }
</style></head><body>
<div class="barra"><button onclick="window.print()">Imprimir o guardar como PDF</button></div>
<header><img src="${logo}" alt="Willak.space"><div><h1>Registro de trazabilidad de parcela</h1><span>Informe ${esc(idInf)} · emitido el ${hoy.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}</span></div></header>
${ctx.ilustrativo ? '<div class="aviso"><b>DATOS ILUSTRATIVOS.</b> Parcela de prueba: los valores no son mediciones reales.</div>' : ''}<div class="aviso"><b>Qué es y qué no es:</b> registro hecho por quien cuida la parcela, con datos de campo y datos aproximados de satélite y modelos. Sirve como base de trazabilidad para un proceso agroecológico o agrosostenible. <b>No es una certificación.</b></div>
<h2>1. Parcela</h2>
<div class="dos"><div class="datos"><div><b>Nombre:</b> ${esc(l.nombre)}</div><div><b>Responsable:</b> ${esc(P.responsable || '—')}</div><div><b>Comunidad o lugar:</b> ${esc(P.comunidad || '—')}</div><div><b>Manejo declarado:</b> ${esc(manejo)}</div><div><b>Área:</b> ${esc(g.fmtArea(g.area(l.anillo)))}</div><div><b>Perímetro:</b> ${esc(g.fmtDist(g.perimetro(l.anillo)))}</div><div><b>Centro (lat, lng):</b> ${centro[0].toFixed(5)}, ${centro[1].toFixed(5)}</div><div><b>Etapa de la chakra:</b> ${esc(etapa)}</div><div><b>Años de descanso:</b> ${ctx.descanso ? ctx.descanso.anios + ' (según ' + (ctx.descanso.fuente === 'familia' ? 'la familia' : 'el satélite') + ')' : '—'}</div><div><b>Acuerdo con la comunidad (CLPI):</b> ${Chakra.clpiOk(l) ? 'Registrado el ' + esc(P.clpi.fecha) + ' · autoriza ' + esc(P.clpi.autoriza) : 'No registrado'}</div><div><b>Recuperación frente al bosque:</b> ${ctx.recuperacion != null ? ctx.recuperacion + ' %' : '—'}</div></div>${croquis(l.anillo)}</div>
<h2>2. Puntos del borde (latitud, longitud)</h2>
<table><thead><tr><th>#</th><th>Latitud</th><th>Longitud</th></tr></thead><tbody>${l.anillo.map((p, i) => `<tr><td>${i + 1}</td><td>${p[0].toFixed(6)}</td><td>${p[1].toFixed(6)}</td></tr>`).join('')}</tbody></table>
<h2>3. Riesgos (semáforo)</h2><table><thead><tr><th>Pregunta</th><th>Nivel</th><th>Dato</th><th>Qué hacer</th></tr></thead><tbody>${riesgos}</tbody></table>
<h2>4. Suelo</h2><table><thead><tr><th>Variable</th><th>Valor</th><th>Lectura</th></tr></thead><tbody>${suelo}</tbody></table>
${ctx.recup ? `<p><b>¿Qué tan lista está la parcela?</b> ${esc(ctx.recup.texto)}.</p>` : ''}
<h2>5. Opciones de siembra (orientativo; pesos ${ctx.pesos.rot}/${ctx.pesos.suelo}/${ctx.pesos.clima}/${ctx.pesos.prior})</h2><table><thead><tr><th>Opción</th><th>Nota</th><th>Lectura</th></tr></thead><tbody>${top.map((t) => `<tr><td>${esc(t.opcion.nombre)}</td><td class="n ${t.color}">${t.nota}/100</td><td>${esc(t.etiqueta)} · rotación ${t.sub.rot}, suelo ${t.sub.suelo}, clima ${t.sub.clima}, prioridades ${t.sub.prior}</td></tr>`).join('')}</tbody></table>
${mej ? `<h2>6. Prácticas de mejora sugeridas</h2><ul>${mej}</ul>` : ''}
<h2>7. Bitácora</h2>${bit ? `<table><thead><tr><th>Fecha</th><th>Luna</th><th>Labor</th><th>Cultivo</th><th>Nota</th></tr></thead><tbody>${bit}</tbody></table>` : '<p class="fine">Sin anotaciones todavía.</p>'}
<h2>8. Fuentes y límites</h2>
<p class="fine">${a ? `Datos del lugar traídos el ${esc(a.fecha)}: ${[a.clima && a.clima.fuente + ' (clima, ' + a.clima.desde + ' a ' + a.clima.hasta + ')', a.suelo && a.suelo.fuente, a.pendiente && a.pendiente.fuente].filter(Boolean).map(esc).join('; ')}.` : 'No se trajeron datos del lugar (clima, suelo, pendiente).'} Lo medido en el campo reemplaza al dato automático. Los umbrales de los riesgos son valores iniciales por validar con el CEIPA y un agrónomo. ${ctx.ilustrativo ? 'DATOS ILUSTRATIVOS: sirven para comprobar la lógica, no son mediciones reales. ' : ''}La lluvia oficial del modelo es IMERG; si viene del respaldo (PRECTOTCORR de NASA POWER) suele quedarse corta en Napo y su confianza baja un nivel. El suelo es de SoilGrids (250 m) salvo que haya muestreo; la pendiente de respaldo sale de un modelo de elevación de 90 m con el método de Horn. La fase lunar se calcula con el ciclo medio (margen de horas). Las sugerencias de siembra son una ayuda para decidir, no una orden. Prototipo desarrollado para el NASA Space Apps Challenge 2026, sede Sangolquí (reto «Field Shift: Adapting Farms with NASA Data»).</p>
<div class="firmas"><div>Responsable de la parcela<br>${esc(P.responsable || '')}</div><div>Aval de la comunidad o la organización</div><div>Revisión técnica (si la hubo)</div></div>
</body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) { const a2 = document.createElement('a'); a2.href = url; a2.download = idInf + '.html'; document.body.appendChild(a2); a2.click(); a2.remove(); Chakra.aviso('El navegador bloqueó la ventana. Se descargó el informe: ábrelo e imprímelo como PDF.', true); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  /* ==========================================================================
     Ficha de campo: UNA página A4 para llevar al terreno (especificación, sección 11).
     Parcela, semáforo, etapa, mejores opciones, plan y alertas. Funciona sin internet.
     ========================================================================== */
  Chakra.abrirFicha = function (l, ctx) {
    const g = Chakra.geo, CFG = Chakra.CFG, P = l.parcela, F = l.familia, a = l.ambiente, hoy = new Date();
    const cen = Chakra.centroDe(l.anillo), n = (x, d = 1) => (x == null ? '—' : String(Math.round(x * 10 ** d) / 10 ** d).replace('.', ','));
    const EN = CFG.etapas.nombres, K = { erosion: 'pendiente', lavado: 'lluvia', acidez: 'ph', calor: 'calor', seco: 'racha' };
    const logo = new URL('assets/logo.png', location.href).href, plan = Chakra.planDe(l, ctx);
    const riesgos = Chakra.RIESGOS.map((r) => { const x = ctx.detalle[r.id]; return `<tr><td>${esc(r.nombre)}</td><td class="n ${x.color}">${COL[x.color]}</td><td>${esc(x.dato)}</td><td>${x.color === 'gris' ? '—' : esc(ctx.conf[K[r.id]])}</td></tr>`; }).join('');
    const top = ctx.ranking.slice(0, 3).map((t, i) => `<tr><td>${i + 1}. ${esc(t.opcion.nombre)}</td><td class="n ${t.color}">${t.nota}</td><td>${t.sub.rot} · ${t.sub.suelo} · ${t.sub.clima} · ${t.sub.prior}</td></tr>`).join('');
    const filasPlan = plan.etapas.map((e) => { const it = plan.items.filter((x) => x.i0 >= e.i0 && x.i0 <= e.i1); return `<tr><td>${e.desde.slice(0, 4)}${e.hasta.slice(0, 4) !== e.desde.slice(0, 4) ? '–' + e.hasta.slice(0, 4) : ''}</td><td>${esc(e.nombre)}</td><td>${it.map((x) => esc(x.nombre) + ' (' + esc(x.siembra.replace(' de ', ' ')) + ')' + (x.insertado ? '*' : '')).join(', ')}</td></tr>`; }).join('')
      + `<tr><td>${plan.purma.desde.slice(0, 4)}+</td><td>${esc(plan.purma.nombre)}</td><td>${esc(plan.purma.nota)}</td></tr>`;
    const alertas = l.alertas.filter((x) => x.estado !== 'atendida').slice(0, 2).map((x) => `<li><b>${esc(x.fecha)}:</b> ${esc(x.mensaje)}</li>`).join('');
    const pesos = ctx.pesos, ilus = ctx.ilustrativo;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Ficha de campo · ${esc(l.nombre)}</title><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
@page { size: A4; margin: 9mm 10mm; }
* { box-sizing: border-box; } body { font: 10px/1.32 'Segoe UI', Arial, sans-serif; color: #12301F; margin: 0; padding: 12px; }
.hoja { max-width: 190mm; margin: 0 auto; } header { display: flex; align-items: center; justify-content: space-between; gap: 10px; border-bottom: 2.5px solid #1E5734; padding-bottom: 5px; margin-bottom: 6px; }
header img { height: 38px; } header div { text-align: right; } h1 { font-size: 15px; margin: 0; } h2 { font-size: 11px; margin: 7px 0 3px; color: #114D2B; border-bottom: 1px solid #DCE5D6; padding-bottom: 2px; }
table { width: 100%; border-collapse: collapse; } th, td { border: 1px solid #DCE5D6; padding: 2px 5px; text-align: left; vertical-align: top; } th { background: #F4F7F1; }
.n { font-weight: 700; text-align: center; white-space: nowrap; } .n.verde { background: #DDE8D6; color: #1E5734; } .n.amarillo { background: #FBEBC8; color: #7A4B00; } .n.rojo { background: #F6D5D0; color: #8E2A20; } .n.gris { background: #eee; color: #555; }
.dos { display: grid; grid-template-columns: 1fr 150px; gap: 10px; align-items: start; } .datos { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 12px; } .datos b { display: inline-block; min-width: 92px; }
.fine { font-size: 8.5px; color: #56685B; margin: 3px 0; } ul { margin: 2px 0; padding-left: 14px; } .ilus { display: inline-block; border: 1px dashed #9A5B00; color: #7A4B00; font-weight: 700; padding: 0 6px; border-radius: 4px; text-transform: uppercase; font-size: 9px; }
.firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 22px; } .firmas div { border-top: 1px solid #12301F; padding-top: 2px; text-align: center; }
.barra { background: #fff; padding: 6px 0; text-align: right; } .barra button { padding: 10px 16px; min-height: 44px; font: 600 14px sans-serif; background: #1E5734; color: #fff; border: 0; border-radius: 8px; cursor: pointer; }
@media print { .barra { display: none; } body { padding: 0; } .hoja { max-height: 277mm; overflow: hidden; } }
</style></head><body><div class="hoja">
<div class="barra"><button onclick="window.print()">Imprimir o guardar como PDF</button></div>
<header><img src="${logo}" alt="Willak.space"><div><h1>Ficha de campo · ${esc(l.nombre)}</h1><span>${hoy.toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}${a ? ' · datos del lugar del ' + esc(a.fecha) : ''} ${ilus ? '<span class="ilus">Datos ilustrativos</span>' : ''}</span></div></header>
<div class="dos"><div class="datos">
  <div><b>Familia:</b> ${esc(F.nombre || P.responsable || '—')}</div><div><b>Comunidad:</b> ${esc(P.comunidad || '—')}</div>
  <div><b>Área:</b> ${esc(g.fmtArea(g.area(l.anillo)))}</div><div><b>Centro:</b> ${cen[0].toFixed(5)}, ${cen[1].toFixed(5)}</div>
  <div><b>Pendiente:</b> ${ctx.pendiente == null ? '—' : n(ctx.pendiente) + ' %'}</div><div><b>Lluvia fuerte:</b> ${esc(ctx.mesesLluvia || '—')}</div>
  <div><b>Etapa (familia):</b> ${ctx.etapa_familia ? esc(EN[ctx.etapa_familia]) : 'sin anotar'}</div><div><b>Etapa (satélite):</b> ${esc(EN[ctx.etapa_detectada])}</div>
  <div><b>Recuperación:</b> ${ctx.recuperacion == null ? '—' : ctx.recuperacion + ' % del bosque'}</div><div><b>Años de descanso:</b> ${ctx.descanso ? ctx.descanso.anios + ' (' + (ctx.descanso.fuente === 'familia' ? 'familia' : 'satélite') + ')' : '—'}</div>
  <div><b>EVI ${ctx.anio || ''}:</b> ${ctx.evi == null ? '—' : n(ctx.evi, 3) + ' (bosque ' + n(ctx.evi_bosque, 3) + ')'}</div><div><b>Suelo:</b> pH ${n(ctx.ph)} · MO ${n(ctx.om)} % · P ${ctx.suelo.p ? ctx.suelo.p.nivel : 'sin dato'} · K ${ctx.suelo.k ? ctx.suelo.k.nivel : 'sin dato'}</div>
</div>${croquis(l.anillo)}</div>
<h2>Riesgos</h2><table><thead><tr><th>Riesgo</th><th>Nivel</th><th>Dato que lo explica</th><th>Confianza</th></tr></thead><tbody>${riesgos}</tbody></table>
<h2>Qué sembrar (pesos ${pesos.rot}/${pesos.suelo}/${pesos.clima}/${pesos.prior}; etapa: ${esc(EN[ctx.etapa].toLowerCase())})</h2>
<table><thead><tr><th>Opción</th><th>Nota (0–100)</th><th>Rotación · Suelo · Clima · Prioridades</th></tr></thead><tbody>${top}</tbody></table>
${ctx.advertencias.length ? '<ul>' + ctx.advertencias.slice(0, 4).map((t) => '<li>' + esc(t) + '</li>').join('') + '</ul>' : ''}
<h2>Plan de rotación con ${esc(CFG.opciones.find((o) => o.id === plan.opcion).nombre)} · suelo cubierto en ${plan.cubiertos} de ${plan.total_meses} meses</h2>
<table><thead><tr><th>Periodo</th><th>Etapa</th><th>Cultivos y mes de siembra</th></tr></thead><tbody>${filasPlan}</tbody></table>
${plan.items.some((x) => x.insertado) ? '<p class="fine">* Cobertura insertada por el plan para que ningún mes de lluvia fuerte quede con el suelo descubierto.</p>' : ''}
${alertas ? '<h2>Alertas abiertas</h2><ul>' + alertas + '</ul>' : ''}
<p class="fine">Fuentes: ${a ? [a.clima && a.clima.fuente, a.suelo && (l.campo.fuente === 'ceipa' ? 'Muestreo CEIPA' : a.suelo.fuente), a.pendiente && a.pendiente.fuente].filter(Boolean).map(esc).join(' · ') : 'sin datos del lugar'}. Lo que dice la familia corrige lo que detecta el satélite. Umbrales y pesos: valores iniciales por validar con el CEIPA. ${ilus ? 'Datos ilustrativos: sirven para probar la lógica, no son mediciones reales.' : 'Apoyo a la decisión; no reemplaza la visita técnica.'}</p>
<div class="firmas"><div>Familia</div><div>Técnico o técnica de campo</div></div>
</div></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) { const a2 = document.createElement('a'); a2.href = url; a2.download = 'ficha-' + l.nombre.replace(/[^\w-]+/g, '_') + '.html'; document.body.appendChild(a2); a2.click(); a2.remove(); Chakra.aviso('El navegador bloqueó la ventana. Se descargó la ficha: ábrela e imprímela como PDF.', true); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return html;
  };
})();

/* ==========================================================================
   grafico.js — gráfico de líneas y puntos en SVG, sin librerías.
   Se usa para el verdor (EVI). Reglas de la especificación (5.4): los puntos
   medidos van rellenos y los rellenados van huecos. Un solo eje, leyenda con
   texto (la identidad nunca va solo en el color) y lectura al pasar el dedo
   o el ratón.
     Chakra.grafico(el, { series, banda, marcas, alto, formato })
     serie = { nombre, color, linea, puntos, hueco, guion, pts:[{ x (día), y, nota }] }
     banda = { nombre, color, pts:[{ x, lo, hi }] }
   ========================================================================== */
(function () {
  const Chakra = window.Chakra, esc = Chakra.esc, C = Chakra.calc;
  Chakra.COLOR_SERIE = { parcela: '#2E7D32', bosque: '#2C6FB7', esperado: '#B4532F' }; // paleta comprobada para daltonismo

  Chakra.grafico = function (el, o) {
    // El dibujo usa el ancho real del panel para que los textos no se achiquen
    const W = Math.max(300, Math.min(900, Math.round(el.clientWidth || 640))), H = o.alto || Math.round(Math.max(200, Math.min(300, W * 0.6))), m = { l: 40, r: 12, t: 14, b: 30 };
    const todos = o.series.flatMap((s) => s.pts).concat((o.banda ? o.banda.pts : []).flatMap((p) => [{ x: p.x, y: p.lo }, { x: p.x, y: p.hi }])).filter((p) => p.y != null);
    if (!todos.length) { el.innerHTML = '<p class="vacio">Sin datos para dibujar.</p>'; return; }
    const x0 = Math.min(...todos.map((p) => p.x)), x1 = Math.max(...todos.map((p) => p.x), x0 + 1);
    let y0 = Math.min(...todos.map((p) => p.y)), y1 = Math.max(...todos.map((p) => p.y));
    y0 = Math.floor((y0 - 0.02) * 20) / 20; y1 = Math.ceil((y1 + 0.02) * 20) / 20;
    const X = (x) => m.l + ((x - x0) / (x1 - x0)) * (W - m.l - m.r), Y = (y) => H - m.b - ((y - y0) / (y1 - y0)) * (H - m.t - m.b);
    const n2 = (v) => v.toFixed(2).replace('.', ','), n3 = (v) => String(Math.round(v * 1000) / 1000).replace('.', ',');
    // Rejilla y eje Y
    let g = '';
    const pasoY = (y1 - y0) > 0.3 ? 0.1 : 0.05;
    for (let v = y0; v <= y1 + 1e-9; v += pasoY) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="gr-rej"/><text x="${m.l - 6}" y="${(Y(v) + 4).toFixed(1)}" class="gr-eje" text-anchor="end">${n2(v)}</text>`;
    // Eje X: años si el periodo es largo, meses si es corto
    const dias = x1 - x0, a0 = new Date(x0 * 864e5).getUTCFullYear(), a1 = new Date(x1 * 864e5).getUTCFullYear();
    if (dias > 800) {
      const cada = Math.ceil((a1 - a0 + 1) / 9);
      for (let a = a0; a <= a1; a++) { const x = Math.round(Date.UTC(a, 0, 1) / 864e5); if (x < x0 || (a - a0) % cada) continue; g += `<line x1="${X(x).toFixed(1)}" x2="${X(x).toFixed(1)}" y1="${H - m.b}" y2="${H - m.b + 4}" class="gr-marca"/><text x="${X(x).toFixed(1)}" y="${H - 8}" class="gr-eje" text-anchor="middle">${a}</text>`; }
    } else {
      const cada = Math.max(1, Math.ceil(dias / 30.5 / 8));
      for (let a = a0; a <= a1; a++) for (let mes = 0; mes < 12; mes++) { const x = Math.round(Date.UTC(a, mes, 1) / 864e5); if (x < x0 || x > x1 || mes % cada) continue; g += `<line x1="${X(x).toFixed(1)}" x2="${X(x).toFixed(1)}" y1="${H - m.b}" y2="${H - m.b + 4}" class="gr-marca"/><text x="${X(x).toFixed(1)}" y="${H - 8}" class="gr-eje" text-anchor="middle">${C.MESES[mes].slice(0, 3)}${mes === 0 || x - x0 < 31 * cada ? ' ' + String(a).slice(2) : ''}</text>`; }
    }
    // Banda normal (±)
    if (o.banda && o.banda.pts.length > 1) { const p = o.banda.pts; g += `<polygon class="gr-banda" fill="${o.banda.color}" points="${p.map((q) => X(q.x).toFixed(1) + ',' + Y(q.hi).toFixed(1)).concat(p.slice().reverse().map((q) => X(q.x).toFixed(1) + ',' + Y(q.lo).toFixed(1))).join(' ')}"/>`; }
    // Marcas verticales (por ejemplo, la siembra o una apertura)
    (o.marcas || []).forEach((k) => { if (k.x < x0 || k.x > x1) return; g += `<line x1="${X(k.x).toFixed(1)}" x2="${X(k.x).toFixed(1)}" y1="${m.t}" y2="${H - m.b}" class="gr-hito"/><text x="${(X(k.x) + 4).toFixed(1)}" y="${m.t + 10}" class="gr-eje">${esc(k.texto)}</text>`; });
    // Series
    o.series.forEach((s) => {
      const pts = s.pts.filter((p) => p.y != null);
      if (s.linea && pts.length > 1) {
        let d = '', ant = null; // la línea se corta donde hay un hueco largo
        s.pts.forEach((p) => { if (p.y == null) { ant = null; return; } d += (ant == null ? 'M' : 'L') + X(p.x).toFixed(1) + ' ' + Y(p.y).toFixed(1); ant = p; });
        g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" ${s.guion ? 'stroke-dasharray="6 4"' : ''}/>`;
      }
      if (s.puntos) pts.forEach((p) => { g += `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="${pts.length > 70 ? 3 : 4}" fill="${s.hueco ? '#fff' : s.color}" stroke="${s.hueco ? s.color : '#fff'}" stroke-width="${s.hueco ? 2 : 1.5}"/>`; });
    });
    const leyenda = o.series.map((s) => `<span><svg width="26" height="12" aria-hidden="true">${s.linea ? `<line x1="1" x2="25" y1="6" y2="6" stroke="${s.color}" stroke-width="2" ${s.guion ? 'stroke-dasharray="6 4"' : ''}/>` : ''}${s.puntos ? `<circle cx="13" cy="6" r="4" fill="${s.hueco ? '#fff' : s.color}" stroke="${s.color}" stroke-width="${s.hueco ? 2 : 0}"/>` : ''}</svg>${esc(s.nombre)}</span>`)
      .concat(o.banda ? [`<span><svg width="26" height="12" aria-hidden="true"><rect x="1" y="1" width="24" height="10" class="gr-banda" fill="${o.banda.color}"/></svg>${esc(o.banda.nombre)}</span>`] : []).join('');
    el.innerHTML = `<div class="grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.titulo || 'Gráfico')}">${g}<line class="gr-cruz" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" visibility="hidden"/><rect class="gr-toque" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/></svg>
      <div class="gr-leyenda">${leyenda}</div><p class="gr-lectura" role="status" aria-live="polite">Pasa el dedo o el ratón por el gráfico para leer cada dato.</p></div>`;
    // Lectura: busca la fecha más cercana y dice el valor de cada serie
    const svg = el.querySelector('svg'), cruz = el.querySelector('.gr-cruz'), lec = el.querySelector('.gr-lectura');
    const xs = [...new Set(todos.map((p) => p.x))].sort((a, b) => a - b);
    const leer = (ev) => {
      const r = svg.getBoundingClientRect(), cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left, xv = x0 + ((cx / r.width) * W - m.l) / (W - m.l - m.r) * (x1 - x0);
      const x = xs.reduce((b, v) => (Math.abs(v - xv) < Math.abs(b - xv) ? v : b), xs[0]);
      cruz.setAttribute('x1', X(x)); cruz.setAttribute('x2', X(x)); cruz.setAttribute('visibility', 'visible');
      const partes = o.series.map((s) => { const p = s.pts.find((q) => q.x === x && q.y != null); return p ? `${s.nombre}: ${n3(p.y)}${p.nota ? ' (' + p.nota + ')' : ''}` : ''; }).filter(Boolean);
      lec.textContent = (o.formato ? o.formato(x) : C.iso(x)) + ' · ' + (partes.join(' · ') || 'sin dato');
    };
    svg.addEventListener('mousemove', leer); svg.addEventListener('touchstart', leer, { passive: true }); svg.addEventListener('touchmove', leer, { passive: true });
  };
})();

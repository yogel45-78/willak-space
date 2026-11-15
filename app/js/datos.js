/* ==========================================================================
   datos.js — el MODELO de Willak.space, textos y catálogos de apoyo.
   Los umbrales y pesos están en config.js (especificación v0.1, 14-nov-2026).
   Todos los rangos y umbrales son VALORES INICIALES: el propio documento pide validarlos
   con el CEIPA y un agrónomo para suelos amazónicos. Si cambian, se cambian aquí y el
   resto de la app los lee. Lo que NO viene del documento está marcado "propuesta".
   ========================================================================== */
(function () {
  const Chakra = window.Chakra;
  const V = 'verde', A = 'amarillo', R = 'rojo', G = 'gris';
  Chakra.SEM = { VERDE: V, AMARILLO: A, ROJO: R, GRIS: G };
  const ORDEN = { gris: 0, verde: 1, amarillo: 2, rojo: 3 };
  Chakra.peor = (a, b) => (ORDEN[a] >= ORDEN[b] ? a : b);
  const NIVEL = { verde: 'Bajo', amarillo: 'Medio', rojo: 'Alto', gris: 'Sin dato' };
  Chakra.nivelTexto = (c) => NIVEL[c] || 'Sin dato';

  /* ---------------- Confianza (doc §3) ---------------- */
  Chakra.CONFIANZA = {
    alta:  { texto: 'Dato muy seguro', clase: 'alta' },
    media: { texto: 'Dato aproximado', clase: 'media' },
    baja:  { texto: 'Dato poco seguro: confirmar en campo', clase: 'baja' },
  };

  /* ---------------- Riesgos con semáforo (especificación, sección 6) ----------------
     Los umbrales viven en config.js (Chakra.CFG.riesgos). Cada riesgo recibe el contexto
     { lluvia, fuertes, racha, calor, ph, pendiente } y devuelve { color, dato }, donde dato es
     la frase sencilla que explica el semáforo. El nivel siempre va también en texto. */
  const U = () => Chakra.CFG.riesgos, coma = (x) => String(x).replace(".", ","), miles = (n) => Chakra.calc.miles(n);
  Chakra.RIESGOS = [
    { id: "erosion", nombre: "Erosión", pregunta: "¿Se va tu suelo con la lluvia?", explica: "La lluvia arrastra la capa buena del suelo. Depende de la pendiente del terreno.",
      hacer: "Siembra en curvas de nivel, cobertura permanente y barreras vivas.",
      evaluar: (c) => { const u = U().erosion; if (c.pendiente == null) return { color: G, dato: "Falta la pendiente." };
        const col = c.pendiente < u.verde_menor ? V : c.pendiente <= u.rojo_mayor ? A : R;
        return { color: col, dato: `Pendiente de ${coma(Math.round(c.pendiente * 10) / 10)} %: ` + (col === V ? "terreno casi plano, la lluvia arrastra poco suelo." : col === A ? "terreno inclinado, la lluvia puede arrastrar el suelo." : "mucha pendiente, la lluvia arrastra el suelo con facilidad.") }; } },
    { id: "lavado", nombre: "Lavado de nutrientes", pregunta: "¿Se lava tu suelo?", explica: "La lluvia se lleva los nutrientes hacia abajo. Depende de la lluvia al año y de los aguaceros fuertes.",
      hacer: "Suelo siempre cubierto, leguminosas y abonos en pequeñas dosis.",
      evaluar: (c) => { const u = U().lavado; if (c.lluvia == null) return { color: G, dato: "Falta la lluvia." };
        const f = c.fuertes || 0, col = (c.lluvia < u.lluvia_verde && f < u.dias_verde) ? V : (c.lluvia > u.lluvia_rojo && f >= u.dias_rojo) ? R : A;
        return { color: col, dato: `≈ ${miles(Math.round(c.lluvia / 100) * 100)} mm de lluvia al año` + (c.fuertes != null ? ` y ${c.fuertes} días con más de ${u.mm_dia_fuerte} mm` : "") + ": " + (col === R ? "la lluvia se lleva lo que el suelo no retiene." : col === A ? "la lluvia lava parte de los nutrientes." : "la lluvia lava poco el suelo.") }; } },
    { id: "acidez", nombre: "Acidez", pregunta: "¿Tu suelo es muy ácido?", explica: "Un suelo muy ácido bloquea nutrientes. Algunos cultivos lo toleran (yuca, cacao).",
      hacer: "Elige cultivos tolerantes; ceniza o cal en pequeñas dosis, revisadas con un técnico.",
      evaluar: (c) => { const u = U().acidez; if (c.ph == null) return { color: G, dato: "Falta el pH." };
        const col = c.ph >= u.verde_desde ? V : c.ph >= u.rojo_menor ? A : R;
        return { color: col, dato: `pH ${coma(c.ph)}: ` + (col === V ? "suelo poco ácido, no limita los cultivos." : col === A ? "suelo ácido, algunos cultivos lo sienten." : "suelo muy ácido, bloquea nutrientes.") }; } },
    { id: "calor", nombre: "Calor extremo", pregunta: "¿Hace demasiado calor?", explica: "Días tan calientes que dañan los cultivos (más de 32 °C).",
      hacer: "Sombra (guabas), cobertura y siembra en los meses frescos.",
      evaluar: (c) => { const u = U().calor; if (c.calor == null) return { color: G, dato: "Falta el dato de calor." };
        const col = c.calor < u.verde_menor ? V : c.calor <= u.rojo_mayor ? A : R;
        return { color: col, dato: (c.calor === 0 ? `Ningún día al año con más de ${u.tmax_c} °C` : `${c.calor} días al año con más de ${u.tmax_c} °C`) + ": " + (col === V ? "el calor casi no afecta." : col === A ? "el calor ya afecta a los cultivos." : "el calor daña los cultivos.") }; } },
    { id: "seco", nombre: "Periodos secos", pregunta: "¿Le falta agua a tu parcela?", explica: "Varios días seguidos casi sin lluvia (menos de 1 mm).",
      hacer: "Sembrar al inicio de lluvias y usar cobertura para guardar humedad.",
      evaluar: (c) => { const u = U().seco; if (c.racha == null) return { color: G, dato: "Falta el dato de días secos." };
        const col = c.racha < u.verde_menor ? V : c.racha <= u.rojo_mayor ? A : R;
        return { color: col, dato: `Hasta ${c.racha} días seguidos casi sin lluvia: ` + (col === V ? "no falta agua." : col === A ? "a veces falta agua." : "falta agua por temporadas.") }; } },
  ];

  /* ---------------- Suelo: rangos bajo · medio · alto (en config.js) ---------------- */
  Chakra.SUELO = Chakra.CFG.suelo;
  Chakra.nivelSuelo = (clave, v) => {
    const s = Chakra.SUELO[clave];
    if (v == null || v === "" || isNaN(v)) return null;
    const i = v < s.cortes[0] ? 0 : v <= s.cortes[1] ? 1 : 2;
    return { i, texto: s.txt[i], nivel: ["bajo", "medio", "alto"][i] };
  };
  Chakra.texturaDe = (arcilla, arena, limo) => {
    if (arcilla == null) return null;
    if (arcilla >= 40) return 'Tierra arcillosa';
    if (arcilla >= 27 && arena <= 45) return 'Tierra franco-arcillosa';
    if (arena >= 60) return 'Tierra arenosa';
    if (limo >= 50) return 'Tierra limosa';
    return 'Tierra franca';
  };
  Chakra.humedadSuelo = (gw) => gw == null ? null : gw >= 0.8 ? 'Tierra muy húmeda' : gw >= 0.5 ? 'Tierra húmeda' : 'Tierra seca';

  /* ---------------- ¿Qué tan lista está tu parcela? (doc §4) ---------------- */
  Chakra.recuperacion = (pct) => {
    if (pct == null || pct === '' || isNaN(pct)) return null;
    return pct >= Chakra.CFG.etapas.purma_madura_pct ? { color: V, texto: 'Lista para sembrar: el suelo descansó lo suficiente' }
      : pct >= 70 ? { color: A, texto: 'Casi lista: conviene esperar un poco más' }
      : { color: R, texto: 'Todavía descansando: el suelo necesita más tiempo' };
  };
  Chakra.ETAPAS = [["", "No sé"], ["apertura", "Apertura (recién abierta)"], ["ciclo_corto", "Ciclo corto"], ["sombra", "Bajo sombra (plátano, cacao, guayusa)"], ["purma", "Purma (descanso)"], ["purma_madura", "Purma madura (lista para abrir)"]];

  /* ---------------- Cultivos y etiquetas (doc §5.3) ---------------- */
  // tolera: tolera suelo ácido (el documento nombra yuca y cacao). frames: hay video 3D en la landing.
  Chakra.CULTIVOS = [
    { id: 'yuca',    nombre: 'Yuca',       familia: 'Euforbiáceas', exigencia: 'Media', raiz: 'Profunda',   fijaN: false, cubre: 'Media', funcion: 'Ciclo corto',           tolera: true,  frames: true,  potasio: true },
    { id: 'mani',    nombre: 'Maní',       familia: 'Leguminosas',  exigencia: 'Baja',  raiz: 'Media',      fijaN: true,  cubre: 'Sí',    funcion: 'Ciclo corto · cobertura' },
    { id: 'maiz',    nombre: 'Maíz',       familia: 'Gramíneas',    exigencia: 'Alta',  raiz: 'Superficial',fijaN: false, cubre: 'No',    funcion: 'Ciclo corto' },
    { id: 'frejol',  nombre: 'Fréjol',     familia: 'Leguminosas',  exigencia: 'Baja',  raiz: 'Superficial',fijaN: true,  cubre: 'Media', funcion: 'Ciclo corto' },
    { id: 'papachina', nombre: 'Papa china', familia: 'Aráceas',    exigencia: 'Media', raiz: 'Media',      fijaN: false, cubre: 'Sí',    funcion: 'Ciclo corto' },
    { id: 'canavalia', nombre: 'Canavalia', familia: 'Leguminosas', exigencia: 'Baja',  raiz: 'Profunda',   fijaN: true,  cubre: 'Sí',    funcion: 'Cobertura · abono verde' },
    { id: 'platano', nombre: 'Plátano',    familia: 'Musáceas',     exigencia: 'Alta',  raiz: 'Media',      fijaN: false, cubre: 'Media', funcion: 'Bajo sombra', potasio: true },
    { id: 'cacao',   nombre: 'Cacao',      familia: 'Malváceas',    exigencia: 'Media', raiz: 'Profunda',   fijaN: false, cubre: 'Media', funcion: 'Bajo sombra',           tolera: true,  frames: true },
    { id: 'guayusa', nombre: 'Guayusa',    familia: 'Aquifoliáceas',exigencia: 'Baja',  raiz: 'Profunda',   fijaN: false, cubre: 'Media', funcion: 'Bajo sombra · medicinal', frames: true },
    { id: 'guaba',   nombre: 'Guaba (pakay)', familia: 'Leguminosas', exigencia: 'Baja', raiz: 'Profunda',   fijaN: true,  cubre: 'Sí',    funcion: 'Sombra · purma' },
  ];
  // Plantas de la chakra que están en la landing pero NO en el documento del modelo: se muestran, sin nota.
  Chakra.OTRAS = [
    { id: 'chonta', nombre: 'Chonta', cientifico: 'Bactris gasipaes', frames: true },
    { id: 'una-de-gato', nombre: 'Uña de gato', cientifico: 'Uncaria tomentosa', frames: true },
    { id: 'achiote', nombre: 'Achiote', cientifico: 'Bixa orellana', frames: true },
  ];
  Chakra.cultivoPorId = (id) => Chakra.CULTIVOS.find((c) => c.id === id) || Chakra.OTRAS.find((c) => c.id === id);

  /* La nota de la recomendación ahora la calcula motor.js (especificación, sección 7). */

  /* ---------------- Cómo mejorar (qué hacer según lo que sale alto o medio) ---------------- */
  Chakra.mejoras = function (ctx) {
    const out = [];
    Chakra.RIESGOS.forEach((r) => { const c = ctx.riesgos[r.id]; if (c === R || c === A) out.push({ titulo: r.pregunta, nivel: Chakra.nivelTexto(c), color: c, texto: r.hacer }); });
    if (ctx.suelo.om && ctx.suelo.om.i === 0) out.push({ titulo: 'Poca materia orgánica', nivel: 'Bajo', color: A, texto: 'Deja que la purma devuelva hojas y raíces; compost y restos de cosecha ayudan.' });
    if (ctx.suelo.n && ctx.suelo.n.i === 0) out.push({ titulo: 'Nitrógeno bajo', nivel: 'Bajo', color: A, texto: 'Pon leguminosas (maní, fréjol, canavalia, guaba): dejan nitrógeno.' });
    if (ctx.suelo.p && ctx.suelo.p.i === 0) out.push({ titulo: 'Fósforo bajo', nivel: 'Bajo', color: A, texto: 'Es común en la Amazonía. Una persona técnica puede decir si conviene un aporte y cuánto.' });
    return out;
  };

  /* ---------------- Luna (ciclo medio; margen de unas horas) ---------------- */
  const SYN = 29.530588853, REF = Date.UTC(2000, 0, 6, 18, 14) / 864e5;
  Chakra.luna = {
    fase(fecha) {
      const d = typeof fecha === 'string' ? Date.UTC(+fecha.slice(0, 4), +fecha.slice(5, 7) - 1, +fecha.slice(8, 10), 12) : fecha.getTime();
      return ((((d / 864e5 - REF) % SYN) + SYN) % SYN) / SYN;
    },
    nombre(f) {
      const N = [['Luna nueva', 0], ['Creciente', 0.125], ['Cuarto creciente', 0.25], ['Gibosa creciente', 0.375], ['Luna llena', 0.5], ['Gibosa menguante', 0.625], ['Cuarto menguante', 0.75], ['Menguante', 0.875]];
      const dist = (a, b) => { const x = Math.abs(a - b) % 1; return Math.min(x, 1 - x); };
      return N.reduce((best, n) => (dist(f, n[1]) < dist(f, best[1]) ? n : best))[0];
    },
    grupo(f) { return f < 0.125 || f >= 0.875 ? 'Luna nueva' : f < 0.375 ? 'Creciente' : f < 0.625 ? 'Luna llena' : 'Menguante'; },
  };
  Chakra.LABORES = ['Siembra', 'Cosecha', 'Poda', 'Deshierba', 'Abonado o compost', 'Riego o drenaje', 'Observación'];

  Chakra.OPCIONES = {
    manejo: [['', 'Sin definir'], ['convencional', 'Convencional (usa químicos)'], ['transicion', 'En transición a agroecológico'], ['agroecologico', 'Agroecológico (autodeclarado)']],
  };
})();

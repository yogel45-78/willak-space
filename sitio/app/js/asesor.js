/* ==========================================================================
   asesor.js — pestaña "Asesor" con mascota.
   ES UNA SIMULACIÓN: no llama a ninguna API ni a ninguna IA. Las respuestas
   salen de una lista fija (abajo) y cada una lleva el rótulo "Simulación".
   Cuando exista una IA real, solo hay que cambiar la función responder().
   ========================================================================== */
(function () {
  const Chakra = window.Chakra;
  const esc = Chakra.esc;

  /* Mascota: búho "Ñawi" de 01-IDENTIDAD (4 poses en assets/mascota). Falta validar con comunidades kichwa si el búho es buena elección. */
  const POSES = { saluda: "nawi-saluda", escucha: "nawi-escucha", analiza: "nawi-analiza", alerta: "nawi-alerta" };
  const mascota = (pose) => `<img src="assets/mascota/${POSES[pose] || POSES.saluda}.svg" alt="Ñawi, mascota del asesor" width="72" height="75">`;

  const SUGERENCIAS = [
    { id: 'lluvia', texto: '¿Qué hago si llueve mucho?' },
    { id: 'siembra', texto: '¿Cuándo sembrar?' },
    { id: 'plaga', texto: 'Veo hojas manchadas' },
    { id: 'saberes', texto: '¿Cómo se usan los relatos?' },
  ];

  // Respuestas de EJEMPLO. No son consejos agronómicos: explican qué haría el asesor real.
  function responder(id, lote) {
    const nombre = lote ? lote.nombre : 'tu chacra';
    const cult = lote && lote.insitu.cultivos ? lote.insitu.cultivos : null;
    const sinDatos = lote && !cult ? 'Aún no hay cultivos anotados en "Datos en sitio"; con eso podría afinar la respuesta.' : '';
    const R = {
      lluvia: [
        'Con datos reales, miraría la lluvia acumulada de los últimos días sobre ' + nombre + ' y la humedad del suelo.',
        'Luego lo cruzaría con lo que cuentan las familias de la zona sobre cómo se comporta el terreno cuando llueve fuerte.',
        sinDatos,
      ],
      siembra: [
        'Aquí compararía la fecha de siembra anotada' + (cult ? ' para ' + cult : '') + ' con la lluvia y la temperatura del lugar.',
        'Y pondría al lado los calendarios que cuenten los sabios y sabias de la comunidad, sin reemplazarlos.',
        sinDatos,
      ],
      plaga: [
        'Te pediría una foto (en "Datos en sitio") y unas preguntas: desde cuándo, qué parte de la planta, si llovió mucho.',
        'No daría un diagnóstico sin revisión de una persona técnica de confianza. Esto es solo una maqueta.',
        sinDatos,
      ],
      saberes: [
        'Los relatos se guardan solo con consentimiento de quien los cuenta, y quedan ligados a la chacra.',
        'El asesor real los usaría como contexto, citando quién lo contó, nunca como si fueran datos propios.',
      ],
      otro: [
        'Esta es una simulación: todavía no estoy conectado a ninguna inteligencia artificial.',
        'Cuando lo esté, usaré los datos satelitales, lo anotado en sitio y los relatos de ' + nombre + ' para responder.',
      ],
    };
    return (R[id] || R.otro).filter(Boolean);
  }

  // Elige una respuesta por palabras clave si la persona escribe libremente
  function adivinar(texto) {
    const t = texto.toLowerCase();
    if (/llov|lluvia|inund|agua/.test(t)) return 'lluvia';
    if (/siembr|cuándo|cuando|plant/.test(t)) return 'siembra';
    if (/plaga|mancha|hoja|enferm|hongo|bicho/.test(t)) return 'plaga';
    if (/relato|saber|comunidad|abuel/.test(t)) return 'saberes';
    return 'otro';
  }

  // Los mensajes se guardan en memoria (no en localStorage): son de ejemplo.
  let historial = [];

  Chakra.asesor = {
    render(cont, lote) {
      cont.innerHTML = `
        <div class="asesor-cab">${mascota("saluda")}
          <div><span class="rotulo-sim">Simulación</span>
          <p>Asesor de ejemplo${lote ? ' para <strong>' + esc(lote.nombre) + '</strong>' : ''}. No usa IA real ni datos reales.</p></div>
        </div>
        <div class="chat" id="chat" aria-live="polite"></div>
        <div class="sugerencias">${SUGERENCIAS.map((s) => `<button type="button" data-s="${s.id}">${esc(s.texto)}</button>`).join('')}</div>
        <form class="chat-form" id="chat-form">
          <input type="text" id="chat-in" placeholder="Escribe tu pregunta…" aria-label="Tu pregunta al asesor" autocomplete="off">
          <button class="btn" type="submit">Enviar</button>
        </form>`;
      const chat = cont.querySelector('#chat');
      const pintar = () => {
        chat.innerHTML = historial.length ? historial.map((m) => m.yo
          ? `<div class="burbuja yo">${esc(m.texto)}</div>`
          : `<div class="burbuja"><span class="rotulo-sim">Simulación</span>${m.partes.map((p) => '<p>' + esc(p) + '</p>').join('')}</div>`).join('')
          : '<div class="burbuja"><span class="rotulo-sim">Simulación</span><p>Hola, soy Ñawi. Elige una pregunta o escribe la tuya.</p></div>';
        chat.scrollTop = chat.scrollHeight;
      };
      const preguntar = (texto, id) => {
        historial.push({ yo: true, texto });
        pintar();
        // Pequeña pausa para que parezca conversación; no hay ninguna llamada a internet
        setTimeout(() => { historial.push({ yo: false, partes: responder(id, lote) }); pintar(); }, 500);
      };
      cont.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => preguntar(b.textContent, b.dataset.s)));
      cont.querySelector('#chat-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const inp = cont.querySelector('#chat-in');
        const t = inp.value.trim();
        if (!t) return;
        inp.value = '';
        preguntar(t, adivinar(t));
      });
      pintar();
    },
  };
})();

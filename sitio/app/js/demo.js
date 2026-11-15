/* ==========================================================================
   demo.js — parcela de prueba "Guaba CEIPA" (especificación, secciones 0 y 12).
   TODO lo que sale de aquí es ILUSTRATIVO: no son mediciones reales. Son series
   fabricadas a propósito (clima diario 2001–2026 y compuestos de EVI con nubes)
   para que, al pasar por los mismos cálculos que usan los datos reales, den los
   valores esperados de la sección 12. Así sirven como pruebas automáticas.
   ========================================================================== */
(function () {
  const Chakra = (globalThis.Chakra = globalThis.Chakra || {});
  const C = Chakra.calc, V = Chakra.verdor;
  const D = (Chakra.demo = { ID: 'demo-guaba-ceipa', INICIO: '2001-01-01', FIN: '2026-11-14', LAT: -1.23889, LNG: -77.89613 });

  // Azar con semilla: siempre sale la misma serie en cualquier equipo
  function azar(semilla) {
    let a = semilla >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /* ---------- Clima diario ilustrativo ----------
     Año tipo: 4 900 mm, 21 días con más de 50 mm, racha seca de 6 días (agosto),
     9 días con más de 32 °C y los 4 meses más lluviosos de abril a julio. */
  const LLUVIA_MES = [330, 340, 400, 520, 560, 540, 480, 350, 340, 370, 360, 310];
  const FUERTES_MES = [0, 0, 1, 4, 5, 4, 3, 1, 0, 1, 1, 1];
  const DIAS_MES = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const SECOS = { mes: 7, desde: 10, hasta: 15 };
  const CALOR = ['09-05', '09-06', '09-07', '09-20', '09-21', '10-03', '10-04', '10-15', '10-16'];
  let _diario = null;
  D.diario = function () {
    if (_diario) return _diario;
    const d0 = C.dia(D.INICIO), n = C.dia(D.FIN) - d0 + 1, lluvia = new Array(n), tmax = new Array(n), humedad = new Array(n);
    for (let i = 0; i < n; i++) {
      const f = new Date((d0 + i) * 864e5), m = f.getUTCMonth(), dia = f.getUTCDate(), dm = DIAS_MES[m], h = FUERTES_MES[m];
      const fuertes = Array.from({ length: h }, (_, j) => Math.floor(((j + 0.5) * dm) / h) + 1);
      const secos = m === SECOS.mes ? SECOS.hasta - SECOS.desde + 1 : 0;
      const base = (LLUVIA_MES[m] - 60 * h) / (dm - h - secos);
      lluvia[i] = fuertes.includes(dia) ? 60 : (m === SECOS.mes && dia >= SECOS.desde && dia <= SECOS.hasta) ? 0 : Math.round(base * 100) / 100;
      const md = f.toISOString().slice(5, 10);
      tmax[i] = CALOR.includes(md) ? 32.8 : Math.round((29 + 1.2 * Math.sin((2 * Math.PI * i) / 365.25)) * 10) / 10;
      humedad[i] = 0.8;
    }
    return (_diario = { inicio: D.INICIO, lluvia, tmax, humedad });
  };

  /* ---------- Compuestos de EVI ilustrativos (Terra + Aqua, cada 16 días, desfasados 8) ----------
     EVI anual de la parcela: bosque viejo → apertura en 2009 → ciclo corto → bajo sombra → purma.
     El bosque de referencia (BP1) se mantiene en 0,54. Alrededor de una de cada cuatro fechas sale nublada. */
  const EVI = { 2009: 0.29, 2010: 0.33, 2011: 0.37, 2012: 0.400, 2013: 0.403, 2014: 0.406, 2015: 0.409, 2016: 0.412, 2017: 0.415, 2018: 0.416,
    2019: 0.422, 2020: 0.428, 2021: 0.434, 2022: 0.440, 2023: 0.446, 2024: 0.452, 2025: 0.458, 2026: 0.475 };
  const eviDe = (anio) => (anio <= 2008 ? 0.52 : EVI[anio]);
  D.EVI_BOSQUE = 0.54;
  const PATRON = [0, 0, 60, 0, 0, -60]; // pequeña variación dentro del año (en enteros de EVI × 10 000)
  const _fechas = {};
  D.compuestos = function (tipo) {
    const rnd = azar(tipo === 'bosque' ? 2026 : 1123), fin = C.dia(D.FIN), out = [];
    for (let anio = 2001; anio <= 2026; anio++) for (let k = 0; k < 23; k++) for (const sat of ['terra', 'aqua']) {
      const doy = (sat === 'terra' ? 1 : 9) + 16 * k, dia = Math.round(Date.UTC(anio, 0, doy) / 864e5);
      if (dia > fin) continue;
      const objetivo = Math.round((tipo === 'bosque' ? D.EVI_BOSQUE : eviDe(anio)) * 10000) + PATRON[(k + (sat === 'aqua' ? 3 : 0)) % 6];
      const huecoLargo = tipo !== 'bosque' && anio === 2020 && doy >= 33 && doy <= 97; // hueco de más de 48 días: debe quedar "faltante"
      const ultimo = fin - dia < 16;                                                 // los dos últimos compuestos salen despejados
      const pixeles = [0.7, 0.3].map((fraccion) => {
        const r = rnd(), nube = !ultimo && (huecoLargo || r < 0.22), adyacente = !ultimo && !nube && r < 0.26;
        const evi_raw = nube ? objetivo - 1500 - Math.round(rnd() * 800) : objetivo;
        return { fraccion, evi_raw, ndvi_raw: evi_raw + 2600, fiabilidad: nube ? 3 : r > 0.8 ? 1 : 0, vi_quality: adyacente ? 1 << 8 : 0 };
      });
      out.push({ fecha: C.iso(dia), satelite: sat, pixeles });
    }
    return out;
  };
  // Los mismos compuestos ya pasados por el filtro de calidad (sección 5.1 y 5.2)
  D.fechas = function (tipo) {
    return (_fechas[tipo] = _fechas[tipo] || D.compuestos(tipo).map((c) => Object.assign({ fecha: c.fecha, satelite: c.satelite }, V.valorParcela(c.pixeles))));
  };

  /* ---------- La parcela ---------- */
  D.lote = function () {
    const h = 0.000532; // medio lado ≈ 59 m → 1,4 ha
    const clima = Object.assign(C.climaDesdeDiario(D.diario()), { fuente: 'IMERG y NASA POWER (ilustrativo)', oficial: true });
    return {
      id: D.ID, demo: 'guaba-ceipa', datos_ilustrativos: true, nombre: 'Guaba CEIPA', tipo: 'chacra',
      anillo: [[D.LAT + h, D.LNG - h], [D.LAT + h, D.LNG + h], [D.LAT - h, D.LNG + h], [D.LAT - h, D.LNG - h]],
      insitu: { cultivos: '', siembra: '', obs: '', fotos: [] }, relatos: [], bitacora: [],
      campo: { ph: '5.2', om: '4.1', n: '0.22', p: '6', k: '0.25', pendiente: '', fuente: 'ceipa' },
      parcela: { responsable: '', comunidad: 'Arosemena Tola, Napo', manejo: '', etapa: '', recuperacion: '', ultimo: '', clpi: { autoriza: '', cargo: '', fecha: '', alcance: '', ok: false } },
      familia: {
        nombre: 'Familia de ejemplo', prioridades: { alimento: 5, venta: 4, suelo: 4, menos_trabajo: 3, medicinales: 2, forraje: 2 }, prioridades_definidas: true, anios_descanso: '8',
        historia: [
          { anio_inicio: 2009, anio_fin: 2009, etapa: 'apertura', cultivos: ['yuca', 'maiz'], nota: 'Se abrió la chakra.' },
          { anio_inicio: 2010, anio_fin: 2011, etapa: 'ciclo_corto', cultivos: ['maiz', 'frejol'], nota: '' },
          { anio_inicio: 2012, anio_fin: 2018, etapa: 'sombra', cultivos: ['platano', 'cacao'], nota: '' },
          { anio_inicio: 2019, anio_fin: 2026, etapa: 'purma', cultivos: [], nota: 'En descanso.' },
        ],
      },
      ambiente: {
        fecha: D.FIN, centro: [D.LAT, D.LNG], demo: true, avisos: [], clima,
        suelo: { ph: null, om: null, n: null, arcilla: 32, limo: 38, arena: 30, fuente: 'Muestreo CEIPA (ilustrativo)' },
        pendiente: { pct: 3, fuente: 'SRTM (ilustrativo)', oficial: true },
      },
      verdor: { demo: true }, recomendacion: { pesos: null }, plan: { opcion: '', inicio: 2027 }, seguimiento: { cultivo: '', fecha: '' }, alertas: [], analisis: [],
    };
  };

  // Señales locales de ejemplo. NO son saberes reales de ninguna comunidad: solo muestran cómo se compara una señal con la lluvia.
  D.senales = function () {
    return [2022, 2023, 2024, 2025].map((anio, i) => ({
      id: 'demo-senal-' + anio, demo: true, titulo: 'Señal de ejemplo', anuncia: 'Lluvia fuerte', fecha_obs: anio + ['-03-05', '-03-07', '-03-12', '-03-08'][i],
      autor: 'Equipo Willak (ejemplo)', comunidad: 'Arosemena Tola, Napo', texto: 'Ejemplo ilustrativo: no es un saber real de ninguna comunidad.',
      consentimiento: true, alcance: 'tecnicos', retirada: false,
    }));
  };

  /* ---------- Ejemplo de alerta (sección 9) ----------
     Yuca sembrada el 15 de enero de 2026 en una parcela con fósforo bajo: los primeros datos van normales y
     el último medido cae 24 % bajo lo esperado, con lluvia normal → causa probable: suelo cansado. */
  D.ejemploSeguimiento = function () {
    const siembra = '2026-01-15', base = 0.475, d0 = C.dia(siembra);
    const factores = [1.01, 0.99, 1.0, 0.98, null, 0.97, 0.96, 0.95, null, 0.92, 0.9, 0.88, 0.86, 0.84, 0.82, 0.8, 0.78, 0.76];
    const fechas = factores.map((f, i) => {
      const fecha = C.iso(d0 + 2 + 8 * (i + 1)), esp = Chakra.motor.esperado('yuca', C.dia(fecha) - d0, base);
      return f == null ? { fecha, satelite: i % 2 ? 'aqua' : 'terra', evi: null, ndvi: null, pct_area_valida: 20, estado: 'faltante' }
        : { fecha, satelite: i % 2 ? 'aqua' : 'terra', evi: Math.round(esp * f * 1e4) / 1e4, ndvi: null, pct_area_valida: 100, estado: 'medido' };
    });
    const diario = D.diario();
    return { cultivo: 'yuca', fecha_siembra: siembra, base, serie: V.serie(fechas), diario, clima: C.climaDesdeDiario(diario), nivel_p: 'bajo', nivel_k: 'medio', siembras_sin_purma: 1, hoy: fechas[fechas.length - 1].fecha };
  };
})();

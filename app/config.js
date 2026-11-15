/* ==========================================================================
   config.js — CONFIGURACIÓN de Willak Space (especificación v0.1, sección 0).
   Aquí viven TODOS los umbrales, pesos y catálogos. El código solo los lee.
   Son valores iniciales: se cambian aquí y el resto de la app se ajusta solo.
   · "espec." = el valor viene escrito en la especificación.
   · "propuesta" = la especificación no lo da; es un valor inicial por validar
     con el CEIPA y una persona agrónoma. Se calibró para que la parcela de
     prueba Guaba CEIPA dé los resultados de la sección 12.
   ========================================================================== */
(function () {
  const Chakra = (globalThis.Chakra = globalThis.Chakra || {});

  Chakra.CFG = {
    version: '0.1',
    // Modo demo (sección 11): en true, TODA la app muestra la etiqueta "Datos ilustrativos".
    // Las parcelas de prueba llevan además su propia marca datos_ilustrativos.
    datos_ilustrativos: false,

    /* ---------- Semáforo de riesgos (sección 6, espec.) ---------- */
    riesgos: {
      erosion: { verde_menor: 5, rojo_mayor: 15, confianza: 'alta' },                 // pendiente %
      lavado:  { lluvia_verde: 2500, lluvia_rojo: 3500, dias_verde: 8, dias_rojo: 15, mm_dia_fuerte: 50, confianza: 'media' },
      acidez:  { verde_desde: 5.5, rojo_menor: 4.5, confianza: 'media', confianza_ceipa: 'alta' },
      calor:   { tmax_c: 32, verde_menor: 15, rojo_mayor: 45, anios: 10, confianza: 'media' },
      seco:    { mm_dia: 1, verde_menor: 10, rojo_mayor: 20, confianza: 'alta' },
    },
    // Si el dato viene de una fuente de respaldo (no la oficial), la confianza baja un nivel.
    respaldo_baja_confianza: true,

    /* ---------- Suelo: rangos bajo · medio · alto ---------- */
    suelo: {
      om: { nombre: 'Materia orgánica', unidad: '%',       cortes: [2, 5],     txt: ['Poca materia orgánica', 'Materia orgánica media', 'Mucha materia orgánica'] },
      n:  { nombre: 'Nitrógeno',        unidad: '%',       cortes: [0.2, 0.4], txt: ['Nitrógeno bajo', 'Nitrógeno medio', 'Nitrógeno alto'] },
      p:  { nombre: 'Fósforo',          unidad: 'mg/kg',   cortes: [10, 20],   txt: ['Fósforo bajo', 'Fósforo medio', 'Fósforo alto'] },
      k:  { nombre: 'Potasio',          unidad: 'cmol/kg', cortes: [0.2, 0.4], txt: ['Potasio bajo', 'Potasio medio', 'Potasio alto'] },
      // SoilGrids (sección 4.6, espec.): promedio 0–30 cm ponderado por espesor
      espesores_cm: { '0-5cm': 5, '5-15cm': 10, '15-30cm': 15 },
      factor_mo: 1.724,
    },

    /* ---------- Verdor y nubes (sección 5, espec.) ---------- */
    verdor: {
      escala: 10000,                 // EVI = entero / 10000 (× 0,0001)
      relleno: -3000,                // valor de relleno -> sin dato
      fiabilidad_usar: [0, 1],       // pixel_reliability: 0 bueno, 1 aceptable; 2 nieve, 3 nublado y -1 se descartan
      // VI_Quality de MOD13Q1 (verificar con la Quality API de AppEEARS): bit 8 = nube adyacente, bit 15 = posible sombra
      bits_descartar: [8, 15],
      min_area_valida: 0.5,          // menos del 50 % del área con píxeles válidos = fecha faltante
      whittaker_lambda: 50,
      whittaker_iteraciones: 3,
      whittaker_factor_peso: 0.5,    // propuesta: cuánto baja el peso de un punto que queda bajo la curva
      hueco_max_dias: 48,
      min_obs_anio: 6,               // con menos de 6 observaciones medidas, confianza baja
      confianza_alta: 0.6, confianza_media: 0.3,
    },

    /* ---------- Etapa de la chakra y recuperación (secciones 6.1 y 6.2, espec.) ---------- */
    etapas: {
      apertura_caida: 0.15, apertura_anios_ref: 3,
      ciclo_corto_evi: 0.42, ciclo_corto_anios: 2,
      sombra_min: 0.40, sombra_max: 0.47,
      purma_tendencia: 0.005, purma_anios: 3,
      purma_madura_pct: 85,
      bosque_radio_km: 5, bosque_cv_max: 0.05,
      bosque_evi_min: 0.45,        // propuesta: un píxel estable pero poco verde (potrero, pueblo) no cuenta como bosque
      nombres: { apertura: 'Apertura', ciclo_corto: 'Ciclo corto', sombra: 'Bajo sombra', purma: 'Purma (descanso)', purma_madura: 'Purma madura (lista para abrir)', '': 'Sin detectar' },
    },

    /* ---------- Motor de recomendación (sección 7) ---------- */
    recomendacion: {
      pesos: { rot: 40, suelo: 25, clima: 20, prior: 15 },   // espec.
      // Matriz etapa actual × grupo de cultivo. La fila purma_madura es de la espec.; las demás son propuesta.
      matriz_rotacion: {
        purma_madura: { raiz_leguminosa: 90, tuberculo_cobertura: 72, cereal_leguminosa: 60, sombra: 45, potrero: 30 },
        apertura:     { raiz_leguminosa: 85, tuberculo_cobertura: 75, cereal_leguminosa: 70, sombra: 50, potrero: 25 },
        ciclo_corto:  { raiz_leguminosa: 50, tuberculo_cobertura: 60, cereal_leguminosa: 45, sombra: 90, potrero: 30 },
        sombra:       { raiz_leguminosa: 25, tuberculo_cobertura: 30, cereal_leguminosa: 25, sombra: 85, potrero: 20 },
        purma:        { raiz_leguminosa: 35, tuberculo_cobertura: 35, cereal_leguminosa: 30, sombra: 40, potrero: 15 },
        '':           { raiz_leguminosa: 60, tuberculo_cobertura: 60, cereal_leguminosa: 60, sombra: 60, potrero: 40 },
      },
      // Suelo = 100 − castigos. Propuesta.
      suelo: { castigo_ph_por_unidad: 60, castigo_p: 40, castigo_k: 40, factor_nivel: { bajo: 1, medio: 0.4, alto: 0, sin_dato: 0.5 } },
      // Clima = 100 − castigos por lluvia fuerte, encharcamiento y calor. Propuesta.
      clima: { castigo_lluvia: 50, castigo_encharcamiento: 25, castigo_calor: 25, severidad: { verde: 0, amarillo: 0.5, rojo: 1, gris: 0.5 } },
      // Encharcamiento (propuesta): terreno plano y raíces muy húmedas = medio; si además es arcilloso = alto.
      encharcamiento: { pendiente_menor: 5, humedad_raiz_desde: 0.75, arcilla_desde: 40 },
      etiquetas: { muy_buena: 75, buena: 55 },
    },
    // Prioridades de la familia (enteros 0..5, sección 3)
    prioridades: [
      { id: 'alimento', nombre: 'Tener alimento para la casa' },
      { id: 'venta', nombre: 'Vender' },
      { id: 'suelo', nombre: 'Cuidar el suelo' },
      { id: 'menos_trabajo', nombre: 'Menos trabajo' },
      { id: 'medicinales', nombre: 'Plantas medicinales' },
      { id: 'forraje', nombre: 'Forraje para animales' },
    ],

    /* ---------- Catálogo inicial de opciones de siembra (sección 7.2) ----------
       grupo: columna de la matriz de rotación · ph_min: pH mínimo tolerado
       dem_p, dem_k: demanda de fósforo y potasio (0–1) · tol_*: tolerancias (0–1)
       aporte: cuánto aporta a cada prioridad de la familia (0–1). Propuesta calibrada con la sección 7.2. */
    opciones: [
      { id: 'yuca_mani', nombre: 'Yuca + maní', grupo: 'raiz_leguminosa', cultivos: ['yuca', 'mani'], imagen: 'yuca',
        ph_min: 4.5, dem_p: 0.4, dem_k: 0.75, tol_lluvia: 0.8, tol_encharcamiento: 0.2, tol_calor: 0.8,
        aporte: { alimento: 1, venta: 0.7, suelo: 0.9, menos_trabajo: 0.8, medicinales: 0.3, forraje: 0.6 } },
      { id: 'papachina_canavalia', nombre: 'Papa china + canavalia', grupo: 'tuberculo_cobertura', cultivos: ['papachina', 'canavalia'], imagen: null,
        ph_min: 4.8, dem_p: 0.25, dem_k: 0.5, tol_lluvia: 0.6, tol_encharcamiento: 0.84, tol_calor: 0.7,
        aporte: { alimento: 0.8, venta: 0.3, suelo: 1, menos_trabajo: 0.6, medicinales: 0.1, forraje: 0.4 } },
      { id: 'maiz_frejol', nombre: 'Maíz + fréjol', grupo: 'cereal_leguminosa', cultivos: ['maiz', 'frejol'], imagen: null,
        ph_min: 5.4, dem_p: 0.45, dem_k: 0.25, tol_lluvia: 0.6, tol_encharcamiento: 0.2, tol_calor: 0.6,
        aporte: { alimento: 1, venta: 0.9, suelo: 0.7, menos_trabajo: 0.8, medicinales: 0.1, forraje: 1 } },
      { id: 'platano_cacao', nombre: 'Plátano + cacao bajo guaba', grupo: 'sombra', cultivos: ['guaba', 'platano', 'cacao'], imagen: 'cacao',
        ph_min: 5.0, dem_p: 0.35, dem_k: 1, tol_lluvia: 0.65, tol_encharcamiento: 0.4, tol_calor: 0.9,
        aporte: { alimento: 0.9, venta: 1, suelo: 0.9, menos_trabajo: 0.7, medicinales: 0.6, forraje: 0.8 } },
      { id: 'pasto', nombre: 'Pasto para forraje', grupo: 'potrero', cultivos: ['pasto'], imagen: null,
        ph_min: 5.8, dem_p: 0.4, dem_k: 0.5, tol_lluvia: 0.2, tol_encharcamiento: 0.6, tol_calor: 0.8,
        aporte: { alimento: 0.2, venta: 0.8, suelo: 0.2, menos_trabajo: 1, medicinales: 0, forraje: 1 } },
    ],
    // Textos de advertencia (sección 7.3). {mes} = primer mes de lluvia fuerte.
    advertencias: {
      fosforo_bajo: 'Fósforo bajo: poner ceniza o roca fosfórica al sembrar.',
      potasio_bajo: 'Potasio bajo: devolver al suelo la ceniza y los restos de cosecha.',
      lavado: 'La lluvia lava el suelo: cubrir el suelo antes de {mes}.',
      erosion: 'Terreno inclinado: sembrar en curvas de nivel y con barreras vivas.',
      acidez: 'Suelo ácido: ceniza o cal en pequeñas dosis, revisadas con una persona técnica.',
      calor: 'Muchos días de calor: dar sombra con guabas y mantener cobertura.',
      seco: 'Hay rachas secas: sembrar al inicio de las lluvias y cubrir el suelo.',
      purma: 'La parcela todavía descansa: lo mejor es esperar a que recupere su verdor (85 % del bosque).',
    },

    /* ---------- Cultivos del plan (sección 8) ----------
       siembra: meses en que se siembra (1 = enero) · duracion: meses en el terreno (null = hasta el fin de la etapa)
       cobertura: si protege el suelo. Maíz va en true porque se siembra asociado con fréjol y así lo exige el
       plan esperado de la sección 12 (suelo cubierto 60 de 60 meses). Propuesta por validar. */
    cultivos: {
      yuca:      { nombre: 'Yuca',       siembra: [1],  duracion: 12,   cobertura: true },
      mani:      { nombre: 'Maní',       siembra: [2],  duracion: 5,    cobertura: true },
      maiz:      { nombre: 'Maíz',       siembra: [1],  duracion: 4,    cobertura: true },
      frejol:    { nombre: 'Fréjol',     siembra: [2],  duracion: 3,    cobertura: true },
      papachina: { nombre: 'Papa china', siembra: [1],  duracion: 9,    cobertura: true },
      canavalia: { nombre: 'Canavalia',  siembra: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], duracion: 8, cobertura: true },
      guaba:     { nombre: 'Guaba (sombra)', siembra: [1], duracion: null, cobertura: true },
      platano:   { nombre: 'Plátano',    siembra: [1],  duracion: null, cobertura: true },
      cacao:     { nombre: 'Cacao',      siembra: [3],  duracion: null, cobertura: true },
      guayusa:   { nombre: 'Guayusa',    siembra: [3],  duracion: null, cobertura: true },
      pasto:     { nombre: 'Pasto',      siembra: [1],  duracion: null, cobertura: true },
    },
    plan: {
      meses_lluvia_fuerte: 4,              // los 4 meses seguidos con más lluvia media (espec.)
      cobertura_defecto: 'canavalia',      // leguminosa que se inserta si hay un hueco (espec.)
      min_meses: 36, max_meses: 60,
      // Bloques que se encadenan: apertura → ciclo corto → bajo sombra → nueva purma
      bloques: {
        yuca_mani:           { cultivos: ['yuca', 'mani'], meses: 12 },
        papachina_canavalia: { cultivos: ['papachina', 'canavalia'], meses: 12 },
        maiz_frejol:         { cultivos: ['maiz', 'frejol'], meses: 12 },
        sombra:              { cultivos: ['guaba', 'platano', 'cacao', 'guayusa'], meses: 36, etapa: 'sombra' },
        pasto:               { cultivos: ['pasto'], meses: 36, etapa: 'potrero' },
      },
      // Qué bloques siguen a cada opción elegida (propuesta: alternar raíces con granos y terminar bajo sombra)
      cadena: {
        yuca_mani: ['yuca_mani', 'maiz_frejol', 'sombra'],
        papachina_canavalia: ['papachina_canavalia', 'maiz_frejol', 'sombra'],
        maiz_frejol: ['maiz_frejol', 'yuca_mani', 'sombra'],
        platano_cacao: ['sombra'],
        pasto: ['pasto'],
      },
      etapas_cortas: ['apertura', 'ciclo_corto'],   // nombre de la 1.ª y 2.ª etapa de ciclo corto
      nombres_etapa: { apertura: 'Apertura', ciclo_corto: 'Ciclo corto', sombra: 'Bajo sombra', potrero: 'Potrero', purma: 'Nueva purma' },
      nota_purma: 'Descanso. Volver a abrir cuando la recuperación llegue al 85 % del bosque.',
    },

    /* ---------- Seguimiento y alertas (sección 9) ---------- */
    seguimiento: {
      banda: 0.03,                 // banda normal ± (espec.)
      alerta_desvio: -0.15,        // alertar si el desvío es ≤ −15 % (espec.)
      lluvia_normal: 0.20,         // lluvia dentro de ±20 % de lo normal (espec.)
      calor_margen_dias: 3,        // propuesta: días de calor de más que todavía se consideran normales
      siembras_sin_purma: 3,       // 3 o más siembras seguidas sin purma (espec.)
      // Plantilla de EVI: [días desde la siembra, fracción de la línea base]. Propuesta por validar.
      plantillas: {
        yuca:      [[0, 0.62], [30, 0.64], [90, 0.80], [180, 0.92], [270, 0.90], [365, 0.84]],
        mani:      [[0, 0.62], [30, 0.68], [70, 0.86], [110, 0.84], [150, 0.70]],
        maiz:      [[0, 0.62], [25, 0.68], [60, 0.88], [95, 0.86], [120, 0.66]],
        frejol:    [[0, 0.62], [25, 0.70], [55, 0.84], [90, 0.68]],
        papachina: [[0, 0.62], [40, 0.70], [120, 0.88], [220, 0.86], [270, 0.74]],
        canavalia: [[0, 0.62], [30, 0.72], [90, 0.90], [240, 0.86]],
        platano:   [[0, 0.62], [60, 0.70], [180, 0.84], [365, 0.90]],
        cacao:     [[0, 0.62], [90, 0.68], [365, 0.80], [1095, 0.90]],
        guayusa:   [[0, 0.62], [90, 0.68], [365, 0.80], [1095, 0.90]],
        pasto:     [[0, 0.62], [45, 0.74], [120, 0.82]],
      },
      mensajes: {
        suelo: { causa: 'suelo cansado', sugerencia: 'reforzar leguminosas' },
        lluvia_poca: { causa: 'llovió menos de lo normal', sugerencia: 'cubrir el suelo para guardar humedad' },
        lluvia_mucha: { causa: 'llovió más de lo normal', sugerencia: 'revisar drenaje y mantener el suelo cubierto' },
        calor: { causa: 'hubo más días de calor de lo normal', sugerencia: 'dar sombra y cobertura' },
        plaga: { causa: 'no la explica el clima ni el suelo; puede ser una plaga, que el satélite no ve', sugerencia: 'preguntar a la familia qué observa en las plantas' },
      },
    },

    /* ---------- Saber local (sección 10, espec.) ---------- */
    senales: { ventana_media_dias: 7, percentil: 70, coincide_min_dias: 7, coincide_max_dias: 21, buscar_hasta_dias: 120,
      alcances: [['comunidad', 'Solo la comunidad'], ['tecnicos', 'La comunidad y los técnicos'], ['publico', 'Público']] },

    /* ---------- Radar de respaldo (sección 4.7, espec.; umbral inicial) ---------- */
    radar: { caida_db: 3, meses_referencia: 3 },

    /* ---------- Registrar parcelas con un toque ---------- */
    parcela: { area_defecto_ha: 1 },       // tamaño del cuadro que se crea al tocar el mapa (luego se ajusta)
    busqueda: { url: 'https://nominatim.openstreetmap.org/search', pais: 'ec', caja: [-5.2, -92.1, 1.8, -75.0] }, // caja = sur, oeste, norte, este del país // buscador de lugares de OpenStreetMap

    /* ---------- Servidor (rutas /api): trae lo que pide cuenta Earthdata ---------- */
    servidor: { salud_ms: 4000 },   // cuánto se espera para saber si hay servidor; el sondeo (30 s) lo fija el servidor

    /* ---------- Fuentes de datos (sección 4) ----------
       servidor: true = pide cuenta Earthdata; el token nunca va al navegador (sección 2), así que
       solo se trae a través del servidor de Willak Space (netlify/functions). Sin servidor, se usan los respaldos. Los IDs marcados "verificar" se confirman contra la API. */
    fuentes: [
      { id: 'power',     nombre: 'NASA POWER',  detalle: 'Clima diario desde 2001 (T2M, T2M_MAX, RH2M, GWETROOT, PRECTOTCORR)', version: 'POWER Daily API · comunidad AG', servidor: false },
      { id: 'appeears',  nombre: 'AppEEARS',    detalle: 'Verdor MODIS MOD13Q1/MYD13Q1 v061, HLS v2.0 (verificar) y pendiente SRTMGL1_NC.003', version: 'MOD13Q1.061 · MYD13Q1.061 · SRTMGL1_NC.003', servidor: true },
      { id: 'gesdisc',   nombre: 'GES DISC',    detalle: 'Lluvia IMERG GPM_3IMERGDF v07 (Final) y GPM_3IMERGDL (Late)', version: 'GPM_3IMERGDF.07', servidor: true },
      { id: 'soilgrids', nombre: 'SoilGrids',   detalle: 'Suelo 0–30 cm: pH, carbono, nitrógeno, textura', version: 'SoilGrids 2.0 (ISRIC)', servidor: false },
    ],
    respaldos: {
      lluvia: 'PRECTOTCORR de NASA POWER (respaldo de IMERG, sección 4.1)',
      pendiente: 'Copernicus DEM 90 m vía Open-Meteo, método de Horn (respaldo de SRTM)',
    },

    /* ---------- Ayudas de una frase para términos técnicos (sección 0) ---------- */
    ayudas: {
      EVI: 'EVI: número de 0 a 1 que mide desde el satélite qué tan verde y tupida está la vegetación.',
      NDVI: 'NDVI: otro número de verdor de −1 a 1; se satura antes que el EVI cuando el bosque es muy denso.',
      IMERG: 'IMERG: lluvia estimada por los satélites de la misión GPM de la NASA.',
      pH: 'pH: mide la acidez del suelo; 7 es neutro y menos de 5,5 ya es ácido.',
      purma: 'Purma: el descanso de la chakra, cuando el monte vuelve a crecer y el suelo se recupera.',
      recuperacion: 'Recuperación: el verdor de la parcela comparado con el de un bosque cercano que no se ha tocado.',
    },
  };
})();

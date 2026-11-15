/* ==========================================================================
   csv.mjs — lectura de los archivos que devuelve la NASA.
   · Resultados por punto de AppEEARS (un CSV por producto, una fila por punto y fecha).
     Los valores ya vienen con el factor de escala aplicado (EVI 0,4750) y el
     relleno también escalado (−0,3 = −3000 × 0,0001).
   · Serie de tiempo de GES DISC (Giovanni): varias líneas de cabecera y luego
     "fecha,valor".
   Las columnas se buscan por nombre, no por posición, por si cambia el orden.
   ========================================================================== */

// Parte una línea CSV respetando comillas (las descripciones de calidad traen comas)
export function partir(linea) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (q) { if (ch === '"') { if (linea[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}
const lineas = (texto) => texto.split(/\r?\n/).filter((l) => l.length);
const dia = (iso) => Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5);
const num = (t) => { if (t == null || t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : null; };
// EVI y NDVI a enteros × 10 000, que es como los quiere la app (acepta el valor escalado o el crudo)
const aEntero = (v) => (v == null ? null : Math.abs(v) > 1.5 ? Math.round(v) : Math.round(v * 10000));

/* Verdor: devuelve, por punto, columnas paralelas de fechas (días desde `inicio`) y valores.
   { puntos: { P1: { cat, tile, linea, muestra, d:[], evi:[], ndvi:[], rel:[], q:[] }, … } } */
export function leerVerdor(texto, inicio) {
  const ls = lineas(texto); if (ls.length < 2) return { puntos: {}, filas: 0 };
  const cab = partir(ls[0]), col = (re) => cab.findIndex((c) => re.test(c.trim()));
  const iId = col(/^ID$/i), iCat = col(/^Category$/i), iFecha = col(/^Date$/i), iTile = col(/MODIS_Tile$/i), iLin = col(/_Line_Y_/i), iMue = col(/_Sample_X_/i);
  const iEvi = col(/_16_days_EVI$/), iNdvi = col(/_16_days_NDVI$/), iRel = col(/_16_days_pixel_reliability$/), iQ = col(/_16_days_VI_Quality$/);
  if (iId < 0 || iFecha < 0 || iEvi < 0 || iRel < 0) throw new Error('El CSV de AppEEARS no trae las columnas esperadas (ID, Date, EVI, pixel_reliability).');
  const d0 = dia(inicio), puntos = {};
  for (let i = 1; i < ls.length; i++) {
    const c = partir(ls[i]), id = c[iId]; if (!id || !c[iFecha]) continue;
    const p = (puntos[id] = puntos[id] || { cat: iCat >= 0 ? c[iCat] : '', tile: iTile >= 0 ? c[iTile] : '', linea: iLin >= 0 ? num(c[iLin]) : null, muestra: iMue >= 0 ? num(c[iMue]) : null, d: [], evi: [], ndvi: [], rel: [], q: [] });
    p.d.push(dia(c[iFecha].slice(0, 10)) - d0);
    p.evi.push(aEntero(num(c[iEvi])));
    p.ndvi.push(iNdvi >= 0 ? aEntero(num(c[iNdvi])) : null);
    p.rel.push(num(c[iRel]));
    p.q.push(iQ >= 0 ? num(c[iQ]) : null);
  }
  return { puntos, filas: ls.length - 1 };
}

/* Elevación SRTM: { D0_0: 512, … } en metros (relleno −32768 → null) */
export function leerDem(texto) {
  const ls = lineas(texto); if (ls.length < 2) return {};
  const cab = partir(ls[0]), iId = cab.findIndex((c) => /^ID$/i.test(c.trim())), iZ = cab.findIndex((c) => /SRTMGL1_DEM$/.test(c.trim()));
  if (iId < 0 || iZ < 0) throw new Error('El CSV de AppEEARS no trae la columna de elevación.');
  const z = {};
  for (let i = 1; i < ls.length; i++) { const c = partir(ls[i]), v = num(c[iZ]); if (c[iId]) z[c[iId]] = v == null || v <= -32768 ? null : v; }
  return z;
}

/* Serie diaria de GES DISC: devuelve [{ dia, valor }] (valor en mm/día; negativos o vacíos = sin dato) */
export function leerSerie(texto) {
  const out = [];
  for (const l of lineas(texto)) {
    if (!/^\d{4}-\d{2}-\d{2}/.test(l)) continue; // salta la cabecera (13 líneas de "clave,valor")
    const c = l.split(','), v = num(c[c.length - 1].trim());
    out.push({ dia: dia(l.slice(0, 10)), valor: v == null || v < 0 ? null : v });
  }
  return out;
}

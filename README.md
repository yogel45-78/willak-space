# Willak.space

**ES** · [English below](#english)

Apoyo a la decisión para la chakra amazónica: junta datos abiertos de la NASA, medidas del terreno y lo que sabe la familia para decidir qué sembrar, cuándo y cómo rotar.

- **Evento:** NASA Space Apps Challenge 2026 · sede Sangolquí (Universidad de las Fuerzas Armadas ESPE, Ecuador)
- **Reto:** Field Shift: Adapting Farms with NASA Data
- **Usuarios:** agroecólogos y técnicos de campo que acompañan a familias kichwa en Napo
- **Licencia:** [MIT](LICENSE)
- **Demo pública:** <https://yogel45-78.github.io/willak-space/> (la app está en <https://yogel45-78.github.io/willak-space/app/>)
- **Repositorio:** <https://github.com/yogel45-78/willak-space>

## Qué hace

Para cada parcela, la app:

1. Descarga datos de la NASA y de suelo para la ubicación exacta.
2. Calcula cinco riesgos con semáforo (erosión, lavado de nutrientes, acidez, calor, periodos secos), cada uno con su fuente, fecha y nivel de confianza.
3. Lee el verdor (EVI) de 25 años, descarta las fechas nubladas y detecta la etapa de la chakra: apertura, ciclo corto, bajo sombra o purma.
4. Suma lo que dice la familia (prioridades, historia de siembra, señales locales). Si no coincide con el satélite, gana la familia.
5. Recomienda qué sembrar con una nota de 0 a 100 y su explicación.
6. Arma un plan de rotación de 3 a 5 años que mantiene el suelo cubierto en los meses de lluvia fuerte.
7. Vigila el cultivo y alerta, con causa probable, si crece menos de lo esperado.

Registrar una parcela toma un toque en el mapa. Funciona sin internet para la ficha, el plan y el formulario de la familia.

## Datos abiertos de la NASA

| Dato | Producto | Para qué | Enlace |
| --- | --- | --- | --- |
| Clima diario desde 2001 | NASA POWER (T2M_MAX, GWETROOT, PRECTOTCORR) | Días de calor, humedad de raíces, lluvia de respaldo | <https://power.larc.nasa.gov/> |
| Verdor cada 16 días, 250 m | MODIS MOD13Q1 y MYD13Q1 v061 (Terra y Aqua), vía AppEEARS | EVI, NDVI y calidad de píxel para descartar nubes | <https://doi.org/10.5067/MODIS/MOD13Q1.061> · <https://doi.org/10.5067/MODIS/MYD13Q1.061> |
| Lluvia diaria, 0,1° | GPM IMERG v07 (GPM_3IMERGDF), vía GES DISC | Lluvia anual, aguaceros fuertes, rachas secas | <https://doi.org/10.5067/GPM/IMERGDF/DAY/07> |
| Elevación, 30 m | SRTM v3 (SRTMGL1_NC), vía AppEEARS | Pendiente por el método de Horn | <https://doi.org/10.5067/MEaSUREs/SRTM/SRTMGL1_NC.003> |
| Imagen satelital del día | NASA GIBS (MODIS) | Mapa de Napo en la portada | <https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api> |
| Globo de la portada | Blue Marble | Portada | <https://visibleearth.nasa.gov/collection/1484/blue-marble> |

Otras fuentes: SoilGrids 2.0 de ISRIC (suelo), Copernicus DEM vía Open-Meteo (elevación de respaldo), Esri World Imagery y OpenStreetMap (mapa base).

**Estado real de cada dato.** NASA POWER y GIBS funcionan en vivo desde el navegador. MODIS, IMERG y SRTM piden una cuenta Earthdata, que guarda el servidor; ese camino está programado y probado contra un simulador de los servicios, pero aún no con una cuenta real. Sin la cuenta, la app usa los respaldos y muestra el verdor solo en la parcela de prueba, con datos ilustrativos rotulados.

## Cómo se procesan los datos

- **Nubes:** se usan solo los píxeles con `pixel_reliability` 0 o 1 y sin nube adyacente ni sombra. Se unen Terra y Aqua. Una fecha con menos del 50 % del área válida queda como faltante.
- **Huecos:** suavizador de Whittaker con envolvente superior (las nubes bajan el EVI, no lo suben). Solo se rellenan huecos de hasta 48 días, y lo rellenado se dibuja distinto de lo medido.
- **Etapa de la chakra:** reglas sobre el EVI anual (por ejemplo, apertura = caída de 0,15 o más frente a los tres años anteriores).
- **Recuperación:** EVI de la parcela frente al de un bosque cercano de verdor estable.
- **Recomendación:** promedio ponderado de rotación, suelo, clima y prioridades de la familia. Los pesos los mueve el usuario.

Todos los umbrales y pesos están en [`sitio/app/config.js`](sitio/app/config.js). Son valores iniciales por validar con el CEIPA.

## Estructura

| Carpeta | Contenido |
| --- | --- |
| `sitio/` | Portada y app de parcela (`sitio/app/`). HTML, CSS y JavaScript sin framework. |
| `netlify/functions/` | Servidor: funciones que guardan la cuenta Earthdata y traen MODIS, SRTM e IMERG. |
| `pruebas/` | Simulador de los servicios de la NASA y pruebas del servidor. |

## Cómo correrlo

Hace falta Node 20 o más nuevo. No hay paquetes que instalar.

```bash
node servidor-local.mjs --simulada
```

Abre <http://localhost:5181/app/> y pulsa **Parcela de prueba**. Ese modo usa datos ilustrativos y no necesita cuenta ni internet.

```bash
npm run pruebas
```

Corre 57 pruebas de la lógica (con los valores esperados de la parcela de prueba) y 35 del servidor. Para publicar y poner la cuenta Earthdata, ver [LEEME.md](LEEME.md).

## Uso de inteligencia artificial

- **Imágenes y video:** las plantas y los dos chorongos se generaron con Google Flow. Llevan la marca «IA» en el sitio. El globo de la portada es la imagen Blue Marble de la NASA.
- **Código:** se escribió y se probó con ayuda de Claude (Anthropic), con revisión del equipo.
- **Lo que no es IA:** el semáforo, la recomendación, el plan y las alertas son reglas y fórmulas explícitas, no un modelo de IA.

## Límites

- Es un prototipo. Los umbrales, los pesos y el catálogo de cultivos son valores iniciales.
- La parcela de prueba «Guaba CEIPA» usa datos ilustrativos: comprueban la lógica, no son mediciones.
- Un píxel de MODIS mide 6,25 ha y una chakra, entre 0,5 y 2 ha. Por eso el dato del satélite acompaña a la medida en el terreno y no la reemplaza.
- Los saberes de la comunidad se guardan solo con consentimiento y la comunidad puede retirarlos.

Willak.space no está afiliado a la NASA ni cuenta con su respaldo. Usa sus datos abiertos.

---

<a id="english"></a>

# Willak.space (English)

Decision support for the Amazonian *chakra* (a Kichwa agroforestry plot): it combines NASA open data, field measurements and what the family knows to decide what to plant, when, and how to rotate.

- **Event:** NASA Space Apps Challenge 2026 · Sangolquí local event (Universidad de las Fuerzas Armadas ESPE, Ecuador)
- **Challenge:** Field Shift: Adapting Farms with NASA Data
- **Users:** agroecologists and field technicians who work with Kichwa families in Napo, Ecuadorian Amazon
- **License:** [MIT](LICENSE)
- **Interface language:** Spanish, because that is the language of its users. This document and [`sitio/en.html`](sitio/en.html) describe it in English.
- **Public demo:** <https://yogel45-78.github.io/willak-space/> (the app is at <https://yogel45-78.github.io/willak-space/app/>)
- **Repository:** <https://github.com/yogel45-78/willak-space>

## What it does

For each plot, the app:

1. Downloads NASA and soil data for the exact location.
2. Computes five traffic-light risks (erosion, nutrient leaching, acidity, extreme heat, dry spells), each with its source, date and confidence level.
3. Reads 25 years of greenness (EVI), discards cloudy dates and detects the stage of the chakra: clearing, short cycle, shaded crops, or fallow (*purma*).
4. Adds what the family says (priorities, planting history, local signs). When it disagrees with the satellite, the family wins.
5. Recommends what to plant with a 0–100 score and an explanation.
6. Builds a 3–5 year rotation plan that keeps the soil covered during the heavy-rain months.
7. Monitors the crop and raises an alert, with a probable cause, when it grows less than expected.

Registering a plot takes one tap on the map. The field sheet, the plan and the family form work offline.

## NASA open data

| Data | Product | Used for | Link |
| --- | --- | --- | --- |
| Daily climate since 2001 | NASA POWER (T2M_MAX, GWETROOT, PRECTOTCORR) | Hot days, root-zone moisture, backup rainfall | <https://power.larc.nasa.gov/> |
| Greenness every 16 days, 250 m | MODIS MOD13Q1 and MYD13Q1 v061 (Terra and Aqua), via AppEEARS | EVI, NDVI and pixel quality to discard clouds | <https://doi.org/10.5067/MODIS/MOD13Q1.061> · <https://doi.org/10.5067/MODIS/MYD13Q1.061> |
| Daily rainfall, 0.1° | GPM IMERG v07 (GPM_3IMERGDF), via GES DISC | Annual rainfall, heavy-rain days, dry spells | <https://doi.org/10.5067/GPM/IMERGDF/DAY/07> |
| Elevation, 30 m | SRTM v3 (SRTMGL1_NC), via AppEEARS | Slope with Horn's method | <https://doi.org/10.5067/MEaSUREs/SRTM/SRTMGL1_NC.003> |
| Daily satellite image | NASA GIBS (MODIS) | Map of Napo on the landing page | <https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api> |
| Globe on the landing page | Blue Marble | Landing page | <https://visibleearth.nasa.gov/collection/1484/blue-marble> |

Other sources: SoilGrids 2.0 by ISRIC (soil), Copernicus DEM via Open-Meteo (backup elevation), Esri World Imagery and OpenStreetMap (base map).

**Actual status of each dataset.** NASA POWER and GIBS run live from the browser. MODIS, IMERG and SRTM require an Earthdata account, which the server holds; that path is implemented and tested against a simulator of the services, but not yet with a real account. Without the account, the app uses the backups and shows greenness only on the test plot, with clearly labelled illustrative data.

## How the data is processed

- **Clouds:** only pixels with `pixel_reliability` 0 or 1 and no adjacent cloud or shadow are used. Terra and Aqua are merged. A date with less than 50 % valid area is marked missing.
- **Gaps:** Whittaker smoother with an upper envelope (clouds lower EVI, they do not raise it). Only gaps of up to 48 days are filled, and filled points are drawn differently from measured ones.
- **Chakra stage:** rules on annual EVI (for example, clearing = a drop of 0.15 or more against the previous three years).
- **Recovery:** plot EVI against a nearby forest with stable greenness.
- **Recommendation:** weighted average of rotation, soil, climate and family priorities. The user moves the weights.

All thresholds and weights live in [`sitio/app/config.js`](sitio/app/config.js). They are initial values, to be validated with CEIPA (the local research centre).

## Structure

| Folder | Contents |
| --- | --- |
| `sitio/` | Landing page and plot app (`sitio/app/`). Plain HTML, CSS and JavaScript. |
| `netlify/functions/` | Server: functions that hold the Earthdata account and fetch MODIS, SRTM and IMERG. |
| `pruebas/` | NASA services simulator and server tests. |

## How to run it

Requires Node 20 or newer. There are no packages to install.

```bash
node servidor-local.mjs --simulada
```

Open <http://localhost:5181/app/> and press **Parcela de prueba** (test plot). This mode uses illustrative data and needs no account or internet.

```bash
npm run pruebas
```

Runs 57 logic tests (against the expected values of the test plot) and 35 server tests. To deploy and set the Earthdata account, see [LEEME.md](LEEME.md) (Spanish).

## Use of artificial intelligence

- **Images and video:** the plants and the two woolly-monkey mascots were generated with Google Flow. They carry an "IA" (AI) mark on the site. The globe on the landing page is NASA's Blue Marble image.
- **Code:** written and tested with the help of Claude (Anthropic), reviewed by the team.
- **What is not AI:** the traffic light, the recommendation, the plan and the alerts are explicit rules and formulas, not an AI model.

## Limits

- This is a prototype. Thresholds, weights and the crop catalogue are initial values.
- The test plot "Guaba CEIPA" uses illustrative data: it checks the logic; it is not a measurement.
- A MODIS pixel covers 6.25 ha and a chakra covers 0.5 to 2 ha, so satellite data supports field measurement and does not replace it.
- Community knowledge is stored only with consent, and the community can withdraw it.

Willak.space is not affiliated with or endorsed by NASA. It uses NASA open data.

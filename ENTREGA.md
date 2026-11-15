# Entrega · NASA Space Apps Challenge Sangolquí 2026

Hoja de trabajo para la entrega del **domingo 15 de noviembre a las 09:00**. Reúne lo que audita el personal, la ficha del proyecto en los dos idiomas y el guion de las 7 diapositivas.

## 1. Lo que audita el personal

| # | Regla | Penalización | Estado | Qué falta |
| --- | --- | --- | --- | --- |
| 1 | Datos abiertos de la NASA citados y enlazados | −2 | Listo en el proyecto | Copiar la sección 3 de esta hoja en la ficha de la plataforma. |
| 2 | Repositorio público con licencia abierta en la raíz | −2 | **Listo:** <https://github.com/yogel45-78/willak-space> con `LICENSE` (MIT) en la raíz | Pegar ese enlace en la plataforma. |
| 3 | Enlaces 100 % públicos (se abren en incógnito) | −1 | **Listo:** demo en <https://yogel45-78.github.io/willak-space/> | Probar los dos enlaces en una ventana de incógnito antes de entregar. |
| 4 | Máximo 7 diapositivas (o video de 30 s) | −1 | Guion listo (sección 4) | Armar el PDF con 7 diapositivas o menos. |
| 5 | Declaración de IA, marcas de agua, logos de la NASA | −1 | Listo en el sitio | Marcar la casilla de IA en la plataforma. En las diapositivas, toda imagen generada con IA debe llevar su marca. No usar el logo de la NASA. |
| 6 | Documentación en español e inglés | −1 | Lista (`README.md`, `sitio/en.html`, sección 2) | Cargar la ficha en los dos idiomas. |

## 2. Ficha del proyecto

### Español

**Nombre:** Willak.space

**Reto:** Field Shift: Adapting Farms with NASA Data

**Resumen (una frase):** Willak.space junta datos abiertos de la NASA, medidas del terreno y el saber de las familias kichwa para decidir qué sembrar y cómo rotar la chakra amazónica.

**Descripción:**
En Napo, en la Amazonía ecuatoriana, las familias kichwa cultivan la chakra, un sistema que rota entre apertura, cultivo bajo sombra y descanso (purma). Llueve mucho todo el año, los suelos son ácidos y el clima está cambiando: decidir qué sembrar y cuándo volver a abrir una parcela es cada vez más difícil.

Willak.space es una herramienta para los agroecólogos y técnicos de campo que acompañan a esas familias. Para cada parcela descarga datos de la NASA, calcula cinco riesgos con semáforo, lee 25 años de verdor para saber en qué etapa está la chakra, recomienda qué sembrar con una nota de 0 a 100 y arma un plan de rotación que mantiene el suelo cubierto en los meses de lluvia fuerte. Después vigila el cultivo y avisa, con causa probable, si crece menos de lo esperado.

Tres decisiones de diseño la distinguen. Lo que dice la familia corrige lo que detecta el satélite. Cada número muestra su fuente, su fecha y su nivel de confianza. Y los saberes de la comunidad se guardan solo con consentimiento, y la comunidad puede retirarlos.

Registrar una parcela toma un toque en el mapa, y la ficha de campo funciona sin internet.

### English

**Name:** Willak.space

**Challenge:** Field Shift: Adapting Farms with NASA Data

**Summary (one sentence):** Willak.space combines NASA open data, field measurements and the knowledge of Kichwa families to decide what to plant and how to rotate the Amazonian chakra.

**Description:**
In Napo, in the Ecuadorian Amazon, Kichwa families farm the *chakra*, a system that rotates between clearing, crops under shade and fallow (*purma*). It rains heavily all year, soils are acidic and the climate is changing: deciding what to plant and when to reopen a plot is getting harder.

Willak.space is a tool for the agroecologists and field technicians who work with those families. For each plot it downloads NASA data, computes five traffic-light risks, reads 25 years of greenness to tell which stage the chakra is in, recommends what to plant with a 0–100 score, and builds a rotation plan that keeps the soil covered during the heavy-rain months. It then monitors the crop and raises an alert, with a probable cause, when it grows less than expected.

Three design decisions set it apart. What the family says overrides what the satellite detects. Every number shows its source, its date and its confidence level. And community knowledge is stored only with consent, and the community can withdraw it.

Registering a plot takes one tap on the map, and the field sheet works offline.

## 3. Datos de la NASA / NASA data

| Producto / Product | Uso / Use | Enlace / Link |
| --- | --- | --- |
| NASA POWER | Clima diario desde 2001 / Daily climate since 2001 | https://power.larc.nasa.gov/ |
| MODIS MOD13Q1 v061 (Terra) | Verdor EVI y NDVI / EVI and NDVI greenness | https://doi.org/10.5067/MODIS/MOD13Q1.061 |
| MODIS MYD13Q1 v061 (Aqua) | Verdor EVI / EVI greenness | https://doi.org/10.5067/MODIS/MYD13Q1.061 |
| GPM IMERG v07 (GPM_3IMERGDF) | Lluvia diaria / Daily rainfall | https://doi.org/10.5067/GPM/IMERGDF/DAY/07 |
| SRTM v3 (SRTMGL1_NC) | Elevación y pendiente / Elevation and slope | https://doi.org/10.5067/MEaSUREs/SRTM/SRTMGL1_NC.003 |
| NASA GIBS | Imagen MODIS del día / Daily MODIS image | https://www.earthdata.nasa.gov/engage/open-data-services-software/earthdata-developer-portal/gibs-api |
| AppEEARS | Acceso a MODIS y SRTM / Access to MODIS and SRTM | https://appeears.earthdatacloud.nasa.gov/ |
| Blue Marble | Textura del globo / Globe texture | https://visibleearth.nasa.gov/collection/1484/blue-marble |

**Para decirlo con exactitud ante el jurado.** NASA POWER y GIBS funcionan en vivo. MODIS, IMERG y SRTM están programados y probados contra un simulador de los servicios, pero falta probarlos con una cuenta Earthdata real. En la demo se ven con la parcela de prueba, cuyos datos son ilustrativos.

**Uso de IA / AI use.** Imágenes y video (plantas y mascotas): Google Flow. Código: escrito y probado con ayuda de Claude (Anthropic). El semáforo, la recomendación, el plan y las alertas son reglas explícitas, no IA. / Images and video (plants and mascots): Google Flow. Code: written and tested with the help of Claude (Anthropic). The traffic light, recommendation, plan and alerts are explicit rules, not AI.

## 4. Guion de las 7 diapositivas

La guía recomienda esta estructura y penaliza la octava diapositiva.

1. **Portada.** Willak.space · «Del espacio a la chakra» · Reto Field Shift: Adapting Farms with NASA Data · Sede Sangolquí · nombre del equipo.
2. **El problema.** En Napo llueve mucho todo el año sobre suelos ácidos (poner la cifra de lluvia de una fuente local). La chakra kichwa depende de saber cuándo abrir, qué sembrar y cuánto dejar descansar. Los técnicos no tienen los datos de la NASA a escala de parcela ni en su idioma.
3. **La solución.** Una app que, con un toque en el mapa, analiza la parcela y entrega semáforo de riesgos, etapa de la chakra, ranking de siembras con nota y plan de rotación. La familia corrige al satélite.
4. **Datos de la NASA y método.** Tabla de la sección 3 con capturas: el semáforo con fuente y confianza, y el gráfico de EVI con puntos medidos y rellenados. Método: filtro de nubes por calidad de píxel, suavizado de Whittaker, recuperación frente al bosque.
5. **Arquitectura y demo.** Navegador (app que funciona sin internet) → funciones del servidor que guardan la cuenta Earthdata → NASA POWER, AppEEARS, GES DISC. Capturas del flujo: tocar el mapa, analizar, qué sembrar, plan. 57 pruebas automáticas de la lógica.
6. **Impacto y camino.** Usuarios: técnicos de campo y familias de Napo. Siguiente paso: validar umbrales con el CEIPA, probar con cuenta Earthdata real, piloto en chakras de Arosemena Tola. Escala a otras provincias amazónicas cambiando el catálogo de cultivos.
7. **Transparencia y equipo.** Uso de IA (Google Flow, Claude), fuentes y créditos, datos ilustrativos de la parcela de prueba, licencia MIT, roles del equipo.

**Cuidado con la rúbrica.** El jurado puntúa más alto cuando se explica de qué misión sale cada dato y cómo se procesó (preguntas 1.1 y 1.3), cuando el prototipo se ve funcionando (2.1) y cuando el equipo es claro sobre qué es propio y qué es apoyo externo o IA (1.5). Conviene decir sin rodeos qué está en vivo y qué es ilustrativo.

# Willak Space · sitio y servidor

Esta carpeta tiene dos partes:

| Carpeta | Qué es |
| --- | --- |
| `sitio/` | El sitio que ve la gente: la landing y la app de parcela (`sitio/app/`). Son solo archivos. |
| `netlify/functions/` | El servidor: cinco funciones que atienden las rutas `/api/...`. Guardan la cuenta Earthdata y traen de la NASA lo que el navegador no puede pedir. |

Sin el servidor la app funciona igual, pero usa los respaldos: lluvia de NASA POWER en vez de IMERG, pendiente de un modelo de 90 m y verdor sin dato.

## Qué trae el servidor

| Ruta | Para qué | Fuente |
| --- | --- | --- |
| `GET /api/salud` | La app pregunta si hay servidor y si tiene la cuenta puesta. | — |
| `POST /api/verdor/pedir` | Lanza dos trabajos: verdor (MOD13Q1 y MYD13Q1 v061 desde 2001) y elevación SRTM. | AppEEARS |
| `GET /api/verdor/estado` | Avance de los trabajos. La app pregunta cada 30 s. | AppEEARS |
| `GET /api/verdor/datos` | Recoge los resultados y los entrega ya resumidos. | AppEEARS |
| `GET /api/lluvia` | Lluvia diaria IMERG desde 2001 (Final v07 y, para los meses recientes, Late). | GES DISC |

La cuenta Earthdata nunca llega al navegador ni aparece en ninguna respuesta.

## Antes de publicar: la cuenta Earthdata

1. Crea una cuenta gratis en <https://urs.earthdata.nasa.gov>.
2. Entra una vez a <https://appeears.earthdatacloud.nasa.gov> con esa cuenta, para que AppEEARS quede autorizada.
3. En tu perfil de Earthdata, en *Applications → Authorized Apps*, aprueba **NASA GESDISC DATA ARCHIVE** (lo pide GES DISC para entregar la lluvia).

## Publicar en Netlify

Arrastrar un ZIP a Netlify publica solo los archivos del sitio, sin las funciones. Para que el servidor funcione hay que publicar con la herramienta de Netlify o conectando un repositorio de Git.

Con la herramienta de Netlify, desde esta carpeta:

```bash
npm install -g netlify-cli
```

```bash
netlify login
```

```bash
netlify init
```

Luego pon la cuenta en Netlify, en *Project configuration → Environment variables*, con alcance **Functions**:

| Variable | Valor |
| --- | --- |
| `EARTHDATA_USERNAME` | Tu usuario de Earthdata |
| `EARTHDATA_PASSWORD` | Tu clave de Earthdata |
| `WILLAK_CODIGO` | Opcional. Un código que la app pedirá antes de usar el servidor. Recomendado: sin él, cualquiera que conozca la dirección puede gastar pedidos con tu cuenta. |

Y publica:

```bash
netlify deploy --prod
```

Los valores de las variables se fijan en cada publicación: si los cambias, vuelve a publicar.

Para comprobar, abre `https://TU-SITIO.netlify.app/api/salud`. Debe decir `"servidor": true` y `"earthdata": true`.

## Probar en tu equipo

No hace falta instalar paquetes; basta Node 20 o más nuevo.

```bash
node servidor-local.mjs --simulada
```

Abre <http://localhost:5181/app/>. Ese modo usa una NASA simulada con los datos ilustrativos de Guaba CEIPA: sirve para ver el recorrido completo sin cuenta y sin internet.

Con tu cuenta real, define antes `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` como variables de entorno de tu terminal y corre `node servidor-local.mjs`.

Pruebas automáticas (sección 12 de la especificación y el servidor contra la NASA simulada):

```bash
npm run pruebas
```

## Lo que falta comprobar con una cuenta real

Todo se probó contra una NASA simulada que imita el formato de los servicios reales. Con cuenta real quedan por confirmar:

- Que los nombres de las columnas de los CSV de AppEEARS sean los esperados (el servidor las busca por nombre, no por posición).
- Los identificadores de IMERG en GES DISC: `GPM_3IMERGDF_07_precipitation` y `GPM_3IMERGDL_07_precipitation`. Si alguno cambia, se corrige en `netlify/lib/comun.mjs`.
- El tiempo real de un trabajo de AppEEARS (suele ser de minutos).

## Diferencias con la especificación

- La especificación sugiere Python con FastAPI y una cola de trabajos. Aquí el servidor son funciones de Netlify, sin base de datos: el trabajo lo guarda AppEEARS y la app guarda su identificador.
- El verdor se pide por puntos (un punto por píxel de MODIS, con la fracción de la parcela en cada píxel) y vuelve en CSV, en vez del recorte por área en NetCDF. Los píxeles son los mismos.
- No incluye todavía HLS a 30 m ni radar (NISAR, Sentinel-1).

/**
 * src/web/js/datos.js
 *
 * Carga de los datos estáticos de ContratosCAM, compartida por index.html
 * (app.js) y ranking.html (ranking.js).
 *
 * Si los contratos no se pueden cargar, no se inventan datos: la página
 * muestra un mensaje de error en la tabla (ver mostrarErrorCarga).
 */

;(function () {
'use strict';

// Rutas posibles a cada JSON (se prueban en orden)
// - Producción (GitHub Pages): data/ está en la raíz del sitio (también desde /en/)
// - Desarrollo local (serve desde raíz): data/ está en la raíz del proyecto
//
// Los contratos están repartidos en un fichero por año (ver
// scripts/lib/almacen-contratos.js); indice.json dice qué ficheros hay.
const CONTRATOS_DIRS = Object.freeze([
  window.I18n.urlRaiz + 'data/processed/contratos/',
  '/data/processed/contratos/',
]);
const INDICE_ARCHIVO = 'indice.json';
const META_URLS = Object.freeze([
  window.I18n.urlRaiz + 'data/processed/meta.json',
  '/data/processed/meta.json',
]);

// Número de columnas de las tablas de index.html y ranking.html
const COLUMNAS_TABLA = 7;

/**
 * Devuelve el primer JSON que cumpla `esValido` de entre las URLs dadas.
 * @param {string[]} urls
 * @param {(json: *) => boolean} esValido
 * @returns {Promise<*|null>} JSON encontrado o null si ninguna URL responde
 */
async function cargarPrimeraUrl(urls, esValido) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      if (esValido(json)) return json;
    } catch {
      // Intentar la siguiente URL
    }
  }
  return null;
}

/**
 * Busca el índice de ficheros de contratos en las rutas posibles.
 * @returns {Promise<{dir: string, indice: object}|null>} Carpeta donde está y su contenido
 */
async function cargarIndice() {
  for (const dir of CONTRATOS_DIRS) {
    const indice = await cargarPrimeraUrl([dir + INDICE_ARCHIVO], json => Array.isArray(json && json.archivos));
    if (indice) return { dir, indice };
  }
  return null;
}

/**
 * Carga el array de contratos normalizados (todos los años).
 * @returns {Promise<Array>}
 * @throws {Error} Si no se encuentra el índice, falla algún fichero o no hay contratos
 */
async function cargarContratos() {
  const encontrado = await cargarIndice();
  if (!encontrado) throw new Error('No se encontró el índice de contratos');
  const { dir, indice } = encontrado;

  const porArchivo = await Promise.all(indice.archivos.map(async ({ archivo }) => {
    const res = await fetch(dir + archivo);
    if (!res.ok) throw new Error(`No se pudo cargar ${archivo}: HTTP ${res.status}`);
    return res.json();
  }));

  const datos = porArchivo.flat();
  if (datos.length === 0) throw new Error('No hay contratos');
  return datos;
}

/**
 * Carga los metadatos de la última actualización.
 * @returns {Promise<object|null>} Metadatos o null si no están disponibles
 */
function cargarMeta() {
  return cargarPrimeraUrl(META_URLS, () => true);
}

/**
 * Sustituye el contenido de la tabla por un mensaje de error de carga.
 * Requiere las traducciones cargadas (window.I18n.listo).
 */
function mostrarErrorCarga() {
  const { t } = window.I18n;
  document.getElementById('results-count').textContent = t('comun.datosNoDisponibles');
  const tbody = document.getElementById('tabla-body');
  tbody.innerHTML =
    '<tr><td colspan="' + COLUMNAS_TABLA + '"><div class="empty-state">' +
    '<div class="empty-state-icon">⚠️</div><p></p>' +
    '</div></td></tr>';
  tbody.querySelector('.empty-state p').textContent = t('comun.errorCargaDatos');
}

window.DatosCAM = Object.freeze({ cargarContratos, cargarMeta, mostrarErrorCarga });

})();

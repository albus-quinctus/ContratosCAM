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
// - Producción (GitHub Pages): data/ está al mismo nivel que la página
// - Desarrollo local (serve desde raíz): data/ está en la raíz del proyecto
const DATA_URLS = Object.freeze([
  './data/processed/contratos-normalizados.json',
  '/data/processed/contratos-normalizados.json',
]);
const META_URLS = Object.freeze([
  './data/processed/meta.json',
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
 * Carga el array de contratos normalizados.
 * @returns {Promise<Array>}
 * @throws {Error} Si no se encuentra un JSON con contratos en ninguna ruta
 */
async function cargarContratos() {
  const datos = await cargarPrimeraUrl(DATA_URLS, json => Array.isArray(json) && json.length > 0);
  if (!datos) throw new Error('No se encontró el JSON de contratos');
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
 */
function mostrarErrorCarga() {
  document.getElementById('results-count').textContent = 'Datos no disponibles';
  document.getElementById('tabla-body').innerHTML =
    '<tr><td colspan="' + COLUMNAS_TABLA + '"><div class="empty-state">' +
    '<div class="empty-state-icon">⚠️</div>' +
    '<p>No se han podido cargar los datos de contratos. Inténtalo de nuevo más tarde.</p>' +
    '</div></td></tr>';
}

window.DatosCAM = Object.freeze({ cargarContratos, cargarMeta, mostrarErrorCarga });

})();

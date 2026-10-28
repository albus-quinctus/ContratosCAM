/**
 * src/web/js/presentacion.js
 *
 * Utilidades de presentación compartidas por index.html (app.js) y
 * ranking.html (ranking.js): cifras abreviadas y estilo de las gráficas.
 */

;(function () {
'use strict';

const { t, locale } = window.I18n;

// A partir de este importe las cifras destacadas se muestran en millones
const UN_MILLON = 1e6;
// A partir de este número de millones ya no se muestran decimales
const MILLONES_SIN_DECIMALES = 100;
// Lo que se muestra cuando no hay importe que sumar
const SIN_IMPORTE = '—';

// Colores de las gráficas: deben coincidir con las variables de css/styles.css
const COLOR_PRINCIPAL = '#c8102e';
const COLOR_RELLENO = 'rgba(200,16,46,.08)';
const COLOR_TEXTO = '#3d434d';
const COLOR_FILETE = '#e5e0d5';
const COLOR_FONDO = '#faf8f3';
const FUENTE_GRAFICAS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

// Series de las gráficas de sectores: el rojo de acento y luego tintas y ocres
const COLORES = Object.freeze([
  COLOR_PRINCIPAL, '#16191f', '#6a6f78', '#a8a294', '#7a1f2b',
  '#3d5a73', '#b08d57', '#4f6b52', '#cfc9bd', '#8c5a3c',
]);

/**
 * Muestra un importe destacado: abreviado en millones si es grande, con la
 * cifra exacta en el title, o una raya si no hay importe.
 * @param {HTMLElement} el
 * @param {number} valor
 * @param {string} exacto - El importe ya formateado entero (p. ej. "11.763.175.469 €")
 */
function mostrarImporteDestacado(el, valor, exacto) {
  if (!(valor > 0)) {
    el.textContent = SIN_IMPORTE;
    el.title = '';
    return;
  }
  el.title = exacto;
  if (valor < UN_MILLON) {
    el.textContent = exacto;
    return;
  }
  const millones = valor / UN_MILLON;
  const decimales = millones >= MILLONES_SIN_DECIMALES ? 0 : 1;
  el.textContent = t('comun.millones', {
    cifra: millones.toLocaleString(locale, { maximumFractionDigits: decimales }),
  });
}

/**
 * Aplica a Chart.js la tipografía y los colores de la web. Se llama antes de
 * crear cada gráfica (Chart.js se carga desde un CDN).
 */
function aplicarEstiloGraficas() {
  Chart.defaults.font.family = FUENTE_GRAFICAS;
  Chart.defaults.color = COLOR_TEXTO;
  Chart.defaults.borderColor = COLOR_FILETE;
}

window.Presentacion = Object.freeze({
  COLORES,
  COLOR_PRINCIPAL,
  COLOR_RELLENO,
  COLOR_FONDO,
  mostrarImporteDestacado,
  aplicarEstiloGraficas,
});

})();

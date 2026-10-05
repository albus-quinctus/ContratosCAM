/**
 * src/web/js/i18n.js
 *
 * Internacionalización del frontend de ContratosCAM.
 *
 * - El idioma de cada página lo fija su ruta: las páginas de la raíz están en
 *   español y las de /en/ en inglés (el build pone <html lang="en">).
 * - En la primera visita a una página en español, si el idioma preferido del
 *   dispositivo (o el elegido antes con el selector) es inglés, redirige a /en/.
 * - Traduce el HTML estático marcado con atributos data-i18n* y expone
 *   window.I18n para que app.js y ranking.js traduzcan sus textos dinámicos.
 *
 * Debe cargarse de forma síncrona en <head>, después de i18next y del detector,
 * para que la redirección ocurra antes de pintar la página.
 */

;(function () {
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

// Idiomas soportados. El primero es el idioma por defecto (páginas de la raíz).
// `ruta` es el subdirectorio de sus páginas y `locale` el usado por Intl.
const IDIOMAS = Object.freeze([
  { codigo: 'es', ruta: '',    locale: 'es-ES' },
  { codigo: 'en', ruta: 'en/', locale: 'en-GB' },
]);
const IDIOMA_DEFECTO = IDIOMAS[0];

// Clave de localStorage donde se guarda el idioma elegido con el selector
const CLAVE_PREFERENCIA = 'contratoscam-idioma';

// Atributos que marcan qué traducir en el HTML estático y cómo aplicarlo
const ATRIBUTOS_TRADUCIBLES = Object.freeze([
  { atributo: 'data-i18n',             aplicar: (el, texto) => { el.textContent = texto; } },
  { atributo: 'data-i18n-html',        aplicar: (el, texto) => { el.innerHTML = texto; } },
  { atributo: 'data-i18n-placeholder', aplicar: (el, texto) => el.setAttribute('placeholder', texto) },
  { atributo: 'data-i18n-aria-label',  aplicar: (el, texto) => el.setAttribute('aria-label', texto) },
  { atributo: 'data-i18n-title',       aplicar: (el, texto) => el.setAttribute('title', texto) },
  { atributo: 'data-i18n-content',     aplicar: (el, texto) => el.setAttribute('content', texto) },
]);

// URL raíz del sitio, deducida de la ubicación de este script (<raíz>/js/i18n.js).
// Funciona igual en la raíz, en /en/ y bajo el subdirectorio de GitHub Pages.
const URL_RAIZ = new URL('../', document.currentScript.src).href;

// ─────────────────────────────────────────────────────────────────────────────
// Idioma de la página y redirección
// ─────────────────────────────────────────────────────────────────────────────

function buscarIdioma(codigo) {
  if (!codigo) return null;
  const base = String(codigo).toLowerCase().split('-')[0];
  return IDIOMAS.find(i => i.codigo === base) || null;
}

const idiomaPagina = buscarIdioma(document.documentElement.lang) || IDIOMA_DEFECTO;

// Detector de i18next: primero la elección guardada, luego el idioma del navegador
const detector = new window.i18nextBrowserLanguageDetector();
detector.init({ languageUtils: {} }, {
  order: ['localStorage', 'navigator'],
  lookupLocalStorage: CLAVE_PREFERENCIA,
  caches: ['localStorage'],
});

/** Nombre del fichero de la página actual ('' para el índice del directorio). */
function paginaActual() {
  return location.pathname.split('/').pop();
}

/** URL de la página actual en el idioma indicado, conservando query y hash. */
function urlEnIdioma(idioma) {
  return URL_RAIZ + idioma.ruta + paginaActual() + location.search + location.hash;
}

// Solo se redirige desde las páginas en el idioma por defecto: una URL /en/
// abierta explícitamente se respeta siempre (y así no hay bucles).
const idiomaPreferido = buscarIdioma(detector.detect());
const redirigiendo = idiomaPagina === IDIOMA_DEFECTO && !!idiomaPreferido && idiomaPreferido !== idiomaPagina;
if (redirigiendo) location.replace(urlEnIdioma(idiomaPreferido));

// ─────────────────────────────────────────────────────────────────────────────
// Traducción
// ─────────────────────────────────────────────────────────────────────────────

async function cargarTraducciones(idioma) {
  const res = await fetch(URL_RAIZ + 'locales/' + idioma.codigo + '.json');
  if (!res.ok) throw new Error('No se pudo cargar el idioma ' + idioma.codigo);
  return res.json();
}

function traducirDocumento() {
  for (const { atributo, aplicar } of ATRIBUTOS_TRADUCIBLES) {
    document.querySelectorAll('[' + atributo + ']').forEach(el => {
      aplicar(el, i18next.t(el.getAttribute(atributo)));
    });
  }
}

/**
 * Configura los enlaces del selector de idioma ([data-idioma="xx"]):
 * apuntan a la misma página en ese idioma y guardan la elección al pulsarlos.
 */
function inicializarSelectorIdioma() {
  document.querySelectorAll('[data-idioma]').forEach(enlace => {
    const idioma = buscarIdioma(enlace.dataset.idioma);
    if (!idioma) return;
    enlace.href = urlEnIdioma(idioma);
    if (idioma === idiomaPagina) enlace.setAttribute('aria-current', 'true');
    enlace.addEventListener('click', () => detector.cacheUserLanguage(idioma.codigo));
  });
}

async function inicializar() {
  const idiomasACargar = [...new Set([idiomaPagina, IDIOMA_DEFECTO])];
  const traducciones = await Promise.all(idiomasACargar.map(cargarTraducciones));
  const resources = {};
  idiomasACargar.forEach((idioma, i) => {
    resources[idioma.codigo] = { translation: traducciones[i] };
  });

  await i18next.init({
    lng: idiomaPagina.codigo,
    fallbackLng: IDIOMA_DEFECTO.codigo,
    resources,
    // Los textos se insertan con textContent o se escapan con esc() en origen
    interpolation: { escapeValue: false },
  });

  if (document.readyState === 'loading') {
    await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }
  traducirDocumento();
  inicializarSelectorIdioma();
}

// ─────────────────────────────────────────────────────────────────────────────
// API pública
// ─────────────────────────────────────────────────────────────────────────────

window.I18n = Object.freeze({
  /**
   * Se resuelve cuando las traducciones están cargadas y el HTML traducido.
   * Si la página se está redirigiendo a otro idioma no se resuelve nunca,
   * para que la página que se descarta no llegue a pintarse.
   */
  listo: redirigiendo ? new Promise(() => {}) : inicializar(),
  /** Traduce una clave (ver locales/*.json). */
  t: (clave, opciones) => i18next.t(clave, opciones),
  /** Locale para Intl / toLocaleString (p. ej. 'es-ES'). */
  locale: idiomaPagina.locale,
  /** URL raíz del sitio, para construir rutas a recursos compartidos. */
  urlRaiz: URL_RAIZ,
});

})();

/**
 * src/web/js/datos.js
 *
 * Carga de los datos estáticos de ContratosCAM, compartida por index.html
 * (app.js) y ranking.html (ranking.js). Los contratos se cargan por años:
 * al abrir la página, los más recientes, y el resto al marcarlos en el
 * selector de años.
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
 * @returns {Promise<{url: string, json: *}|null>} URL que ha respondido y su JSON, o null si ninguna responde
 */
async function cargarPrimeraUrl(urls, esValido) {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = await res.json();
      if (esValido(json)) return { url, json };
    } catch {
      // Intentar la siguiente URL
    }
  }
  return null;
}

// Años que se cargan al abrir la página: los más recientes del índice
const ANIOS_POR_DEFECTO = 2;

// Índice de contratos ya pedido (se pide una sola vez por página)
let indicePedido = null;

// Contratos de cada fichero ya pedido, por nombre de fichero
const contratosPorArchivo = new Map();

/**
 * Busca el índice de ficheros de contratos en las rutas posibles.
 * @returns {Promise<{dir: string, indice: object}>} Carpeta donde está y su contenido
 * @throws {Error} Si no se encuentra el índice o no tiene ficheros
 */
function cargarIndice() {
  if (!indicePedido) {
    indicePedido = cargarPrimeraUrl(
      CONTRATOS_DIRS.map(dir => dir + INDICE_ARCHIVO),
      json => Array.isArray(json && json.archivos) && json.archivos.length > 0)
      .then(encontrado => {
        if (!encontrado) throw new Error('No se encontró el índice de contratos');
        return { dir: encontrado.url.slice(0, -INDICE_ARCHIVO.length), indice: encontrado.json };
      });
  }
  return indicePedido;
}

/**
 * Ficheros del índice que se cargan por defecto: los años más recientes, sin
 * contar el de los contratos sin fecha.
 * @param {object} indice
 * @returns {Array<{anio: string|null, archivo: string, total: number}>}
 */
function archivosPorDefecto(indice) {
  return indice.archivos.filter(a => a.anio).slice(0, ANIOS_POR_DEFECTO);
}

/**
 * Carga los contratos de los ficheros del índice indicados. Cada fichero se
 * pide una sola vez: volver a seleccionar un año no lo descarga de nuevo.
 * @param {Array<{archivo: string}>} archivos - Entradas del índice
 * @returns {Promise<Array>}
 * @throws {Error} Si falla algún fichero
 */
async function cargarContratos(archivos) {
  const { dir } = await cargarIndice();
  const porArchivo = await Promise.all(archivos.map(({ archivo }) => {
    if (!contratosPorArchivo.has(archivo)) {
      const pedido = fetch(dir + archivo).then(res => {
        if (!res.ok) throw new Error(`No se pudo cargar ${archivo}: HTTP ${res.status}`);
        return res.json();
      });
      // Si falla, se podrá volver a pedir
      pedido.catch(() => contratosPorArchivo.delete(archivo));
      contratosPorArchivo.set(archivo, pedido);
    }
    return contratosPorArchivo.get(archivo);
  }));
  return porArchivo.flat();
}

// Número de la última selección de años pedida (ver cargarSeleccion)
let ultimaSeleccion = 0;

/**
 * Carga los contratos de una selección de años. Si mientras se descargan se
 * pide otra selección, esta ya no vale y devuelve null.
 * @param {Array<{archivo: string}>} archivos - Entradas del índice
 * @returns {Promise<Array|null>}
 * @throws {Error} Si falla algún fichero
 */
async function cargarSeleccion(archivos) {
  const seleccion = ++ultimaSeleccion;
  const contratos = await cargarContratos(archivos);
  return seleccion === ultimaSeleccion ? contratos : null;
}

/**
 * Carga los metadatos de la última actualización.
 * @returns {Promise<object|null>} Metadatos o null si no están disponibles
 */
async function cargarMeta() {
  const encontrado = await cargarPrimeraUrl(META_URLS, () => true);
  return encontrado && encontrado.json;
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
    '<p></p>' +
    '</div></td></tr>';
  tbody.querySelector('.empty-state p').textContent = t('comun.errorCargaDatos');
}

/**
 * Carga los contratos de los años marcados en el selector de años, mostrando
 * que se están cargando o, si falla, el error de carga.
 * @param {Array<{archivo: string}>} archivos - Entradas del índice marcadas
 * @param {(contratos: Array) => void} alCargar - Recibe los contratos cargados
 */
async function cargarAniosMarcados(archivos, alCargar) {
  document.getElementById('results-count').textContent = window.I18n.t('comun.cargandoDatos');
  let contratos;
  try {
    contratos = await cargarSeleccion(archivos);
  } catch (err) {
    console.error(err);
    mostrarErrorCarga();
    return;
  }
  // Si se ha marcado otra selección mientras tanto, se descarta esta
  if (contratos) alCargar(contratos);
}

/**
 * Monta el selector de años: una casilla por fichero del índice (marcadas las
 * de archivosPorDefecto) y el botón "Todos". No deja desmarcar el último año.
 * Al cambiar los años marcados, carga sus contratos y se los pasa a alCargar.
 * Requiere las traducciones cargadas (window.I18n.listo).
 * @param {object} indice
 * @param {(contratos: Array) => void} alCargar - Recibe los contratos de los años marcados
 * @returns {Array} Entradas del índice marcadas al empezar
 */
function montarSelectorAnios(indice, alCargar) {
  const { t } = window.I18n;
  const contenedor = document.getElementById('selector-anios-casillas');
  const porDefecto = new Set(archivosPorDefecto(indice).map(a => a.archivo));

  contenedor.innerHTML = '';
  const casillas = indice.archivos.map(entrada => {
    const casilla = document.createElement('input');
    casilla.type = 'checkbox';
    casilla.checked = porDefecto.has(entrada.archivo);
    const etiqueta = document.createElement('label');
    etiqueta.className = 'anio-chip';
    etiqueta.title = t('anios.contratos', { count: entrada.total });
    etiqueta.append(casilla, entrada.anio || t('anios.sinFecha'));
    contenedor.appendChild(etiqueta);
    return casilla;
  });
  const marcadas = () => indice.archivos.filter((_, i) => casillas[i].checked);

  casillas.forEach(casilla => casilla.addEventListener('change', () => {
    if (marcadas().length === 0) {
      casilla.checked = true;
      return;
    }
    cargarAniosMarcados(marcadas(), alCargar);
  }));
  document.getElementById('btn-todos-anios').addEventListener('click', () => {
    if (casillas.every(c => c.checked)) return;
    casillas.forEach(c => { c.checked = true; });
    cargarAniosMarcados(marcadas(), alCargar);
  });

  return marcadas();
}

/**
 * Indica en "Sobre los datos" el periodo que cubren los datos publicados.
 * Requiere las traducciones cargadas (window.I18n.listo).
 * @param {object} indice
 */
function mostrarPeriodo(indice) {
  const el = document.getElementById('sobre-periodo');
  const anios = indice.archivos.map(a => a.anio).filter(Boolean).sort();
  if (!el || anios.length === 0) return;
  el.textContent = window.I18n.t('sobre.periodo', { desde: anios[0], hasta: anios[anios.length - 1] });
}

/**
 * Valores elegidos en unos selectores.
 * @param {string[]} ids - Ids de los <select>
 * @returns {Map<string, string>} Valor de cada selector, por id
 */
function leerValores(ids) {
  return new Map(ids.map(id => [id, document.getElementById(id).value]));
}

/**
 * Vuelve a elegir en cada selector el valor guardado con leerValores, si sigue
 * entre sus opciones; si no, la primera opción ("todos").
 * @param {Map<string, string>} valores
 */
function restaurarValores(valores) {
  for (const [id, valor] of valores) {
    const select = document.getElementById(id);
    select.value = valor;
    if (select.value !== valor) select.selectedIndex = 0;
  }
}

window.DatosCAM = Object.freeze({
  cargarIndice,
  cargarSeleccion,
  cargarMeta,
  montarSelectorAnios,
  mostrarPeriodo,
  mostrarErrorCarga,
  leerValores,
  restaurarValores,
});

})();

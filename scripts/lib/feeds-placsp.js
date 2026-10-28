/**
 * scripts/lib/feeds-placsp.js
 *
 * Feeds de sindicación de PLACSP que se cargan, con la fuente que se anota en
 * sus contratos. Fuente única de estos valores para la descarga semanal
 * (download.js), la del histórico (download-historico.js) y el parseo
 * (parse.js).
 *
 * PLACSP publica cada feed de dos formas:
 * - Un feed Atom paginado con las últimas modificaciones, que se descarga
 *   cada semana en data/raw/<prefijoSemanal>-<fecha>-pNN.atom.
 * - El histórico en ficheros ZIP: uno por año para los años cerrados y uno
 *   por mes para el año en curso. Cada ZIP contiene los ficheros Atom del
 *   periodo, y se guarda sin descomprimir (ver lib/zip.js).
 *
 * Documentación de sindicación PLACSP:
 * https://contrataciondelestado.es/wps/portal/plataforma/es/Sindicacion
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { FUENTE } from './fuentes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Directorio donde se guarda el histórico: <dir>/<feed>/<periodo>.zip */
export const HISTORICO_DIR = path.join(__dirname, '../../data/raw/historico');

/** Extensión de los ZIP del histórico, en PLACSP y en local */
export const EXTENSION_ZIP = '.zip';

/** Extensión de los ficheros Atom, en PLACSP y en local */
export const EXTENSION_ATOM = '.atom';

/** Base de las URL de sindicación de PLACSP */
const URL_SINDICACION = 'https://contrataciondelsectorpublico.gob.es/sindicacion';

/**
 * Feeds de PLACSP. `paginasSemanales` es el máximo de páginas del feed Atom
 * que se descargan cada semana: el de perfiles trae unas 450 entradas por
 * página, y el de plataformas agregadas unas dos páginas por día, así que
 * con 30 cubre unas dos semanas por si falla una ejecución.
 */
export const FEEDS_HISTORICO = Object.freeze([
  {
    clave: 'perfiles',
    descripcion: 'Perfiles de contratante alojados en PLACSP (sindicación 643)',
    fuente: FUENTE.PLACSP,
    urlBase: `${URL_SINDICACION}/sindicacion_643/licitacionesPerfilesContratanteCompleto3`,
    prefijoSemanal: 'placsp-licitaciones',
    paginasSemanales: 50,
  },
  {
    clave: 'agregadas',
    descripcion: 'Plataformas autonómicas agregadas por PLACSP, sin contratos menores (sindicación 1044)',
    fuente: FUENTE.PLACSP_AGREGADAS,
    urlBase: `${URL_SINDICACION}/sindicacion_1044/PlataformasAgregadasSinMenores`,
    prefijoSemanal: 'placsp-agregadas',
    paginasSemanales: 30,
  },
]);

/**
 * Feed del histórico con una clave dada.
 * @param {string} clave
 * @returns {object}
 * @throws {Error} Si no hay ningún feed con esa clave
 */
export function feedPorClave(clave) {
  const feed = FEEDS_HISTORICO.find(f => f.clave === clave);
  if (!feed) {
    const validas = FEEDS_HISTORICO.map(f => f.clave).join(', ');
    throw new Error(`Feed desconocido "${clave}". Valores válidos: ${validas}`);
  }
  return feed;
}

/**
 * Periodos publicados en ZIP para un rango de años: el año completo
 * (AAAA) para los años cerrados y cada mes hasta el actual (AAAAMM) para
 * el año en curso.
 * @param {number} desde - Primer año
 * @param {number} hasta - Último año
 * @param {Date} hoy - Fecha de referencia para saber qué año está en curso
 * @returns {string[]}
 */
export function periodosHistorico(desde, hasta, hoy) {
  const anioActual = hoy.getUTCFullYear();
  const periodos = [];
  for (let anio = desde; anio <= Math.min(hasta, anioActual); anio++) {
    if (anio < anioActual) {
      periodos.push(String(anio));
      continue;
    }
    for (let mes = 1; mes <= hoy.getUTCMonth() + 1; mes++) {
      periodos.push(`${anio}${String(mes).padStart(2, '0')}`);
    }
  }
  return periodos;
}

/**
 * URL del ZIP de un periodo de un feed.
 * @param {object} feed - Elemento de FEEDS_HISTORICO
 * @param {string} periodo - AAAA o AAAAMM
 * @returns {string}
 */
export function urlZip(feed, periodo) {
  return `${feed.urlBase}_${periodo}${EXTENSION_ZIP}`;
}

/**
 * Ruta local del ZIP de un periodo de un feed.
 * @param {object} feed - Elemento de FEEDS_HISTORICO
 * @param {string} periodo - AAAA o AAAAMM
 * @returns {string}
 */
export function rutaZip(feed, periodo) {
  return path.join(HISTORICO_DIR, feed.clave, `${periodo}${EXTENSION_ZIP}`);
}

/**
 * URL de la primera página del feed Atom semanal de un feed.
 * @param {object} feed - Elemento de FEEDS_HISTORICO
 * @returns {string}
 */
export function urlAtomSemanal(feed) {
  return `${feed.urlBase}${EXTENSION_ATOM}`;
}

/**
 * Feed al que pertenece un fichero Atom semanal de data/raw/, por su prefijo.
 * @param {string} nombre - Nombre del fichero
 * @returns {object|undefined} Elemento de FEEDS_HISTORICO, o undefined si no es de ninguno
 */
export function feedDeFicheroSemanal(nombre) {
  return FEEDS_HISTORICO.find(f => nombre.startsWith(`${f.prefijoSemanal}-`) && nombre.endsWith(EXTENSION_ATOM));
}

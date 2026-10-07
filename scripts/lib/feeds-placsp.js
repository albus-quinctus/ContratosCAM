/**
 * scripts/lib/feeds-placsp.js
 *
 * Feeds de sindicación de PLACSP que se cargan como histórico, con la fuente
 * que se anota en sus contratos. Fuente única de estos valores para la
 * descarga (download-historico.js) y el parseo (parse.js).
 *
 * PLACSP publica el histórico de cada feed en ficheros ZIP: uno por año para
 * los años cerrados y uno por mes para el año en curso. Cada ZIP contiene los
 * ficheros Atom del periodo.
 *
 * Documentación de sindicación PLACSP:
 * https://contrataciondelestado.es/wps/portal/plataforma/es/Sindicacion
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { FUENTE } from './fuentes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Directorio donde se descomprime el histórico: <dir>/<feed>/<periodo>/*.atom */
export const HISTORICO_DIR = path.join(__dirname, '../../data/raw/historico');

/** Base de las URL de sindicación de PLACSP */
const URL_SINDICACION = 'https://contrataciondelsectorpublico.gob.es/sindicacion';

/** Feeds del histórico */
export const FEEDS_HISTORICO = Object.freeze([
  {
    clave: 'perfiles',
    descripcion: 'Perfiles de contratante alojados en PLACSP (sindicación 643)',
    fuente: FUENTE.PLACSP,
    urlBase: `${URL_SINDICACION}/sindicacion_643/licitacionesPerfilesContratanteCompleto3`,
  },
  {
    clave: 'agregadas',
    descripcion: 'Plataformas autonómicas agregadas por PLACSP, sin contratos menores (sindicación 1044)',
    fuente: FUENTE.PLACSP_AGREGADAS,
    urlBase: `${URL_SINDICACION}/sindicacion_1044/PlataformasAgregadasSinMenores`,
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
  return `${feed.urlBase}_${periodo}.zip`;
}

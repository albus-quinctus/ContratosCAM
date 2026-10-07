/**
 * scripts/lib/zip.js
 *
 * Lectura de los ZIP del histórico de PLACSP con el `unzip` del sistema, sin
 * descomprimirlos a disco: descomprimidos ocupan unas 19 veces más (un año de
 * perfiles de contratante, decenas de GB). Compartido por la descarga
 * (download-historico.js) y el parseo (parse.js).
 */

import { execFileSync } from 'child_process';

/** Extensión de los ficheros Atom que contienen los ZIP */
const EXTENSION_ATOM = '.atom';

/** Tamaño máximo de un fichero Atom leído del ZIP (bytes) */
const MAX_ATOM_BYTES = 512 * 1024 * 1024;

/**
 * Ficheros Atom que contiene un ZIP, ordenados por nombre.
 * @param {string} zip - Ruta del ZIP
 * @returns {string[]}
 * @throws {Error} Si el ZIP no se puede leer
 */
export function atomsDeZip(zip) {
  return execFileSync('unzip', ['-Z1', zip], { encoding: 'utf-8' })
    .split('\n')
    .filter(f => f.endsWith(EXTENSION_ATOM))
    .sort();
}

/**
 * Contenido de un fichero de dentro de un ZIP, sin escribirlo a disco.
 * @param {string} zip - Ruta del ZIP
 * @param {string} entrada - Nombre del fichero dentro del ZIP
 * @returns {string}
 * @throws {Error} Si el ZIP o el fichero no se pueden leer
 */
export function leerDeZip(zip, entrada) {
  return execFileSync('unzip', ['-p', zip, entrada], { encoding: 'utf-8', maxBuffer: MAX_ATOM_BYTES });
}

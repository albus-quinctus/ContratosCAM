/**
 * scripts/lib/almacen-contratos.js
 *
 * Lectura y escritura de los contratos normalizados, compartida por todos los
 * scripts del pipeline (transform, resolve-entities, import-db, validate…).
 *
 * Los contratos se guardan en un fichero por año de publicación para que
 * ninguno supere el límite de tamaño por fichero de GitHub cuando crezca el
 * histórico. La web carga los mismos ficheros (src/web/js/datos.js).
 *
 *   data/processed/contratos/indice.json   ← lista de ficheros y totales
 *   data/processed/contratos/2026.json     ← contratos publicados en 2026
 *   data/processed/contratos/sin-fecha.json ← contratos sin fecha de publicación
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Carpeta con los ficheros de contratos */
export const CONTRATOS_DIR = path.join(__dirname, '../../data/processed/contratos');

/** Índice de ficheros: es lo que lee primero la web */
export const INDICE_FILE = path.join(CONTRATOS_DIR, 'indice.json');

/** Nombre del fichero para los contratos sin fecha de publicación */
const ARCHIVO_SIN_FECHA = 'sin-fecha.json';

/**
 * Año de publicación de un contrato, o null si no tiene fecha.
 * @param {object} contrato
 * @returns {string|null}
 */
function anioDe(contrato) {
  return contrato.fecha_publicacion ? contrato.fecha_publicacion.substring(0, 4) : null;
}

/**
 * Nombre del fichero donde se guarda un año.
 * @param {string|null} anio
 * @returns {string}
 */
function archivoDe(anio) {
  return anio ? `${anio}.json` : ARCHIVO_SIN_FECHA;
}

/**
 * Indica si existen contratos guardados.
 * @returns {boolean}
 */
export function existenContratos() {
  return fs.existsSync(INDICE_FILE);
}

/**
 * Lee el índice de ficheros.
 * @returns {{ total: number, archivos: Array<{ anio: string|null, archivo: string, total: number }> }}
 */
export function leerIndice() {
  return JSON.parse(fs.readFileSync(INDICE_FILE, 'utf-8'));
}

/**
 * Lee todos los contratos, en el orden de los ficheros del índice.
 * @returns {object[]}
 * @throws {Error} Si falta o no se puede leer el índice o alguno de los ficheros
 */
export function leerContratos() {
  const { archivos } = leerIndice();
  return archivos.flatMap(({ archivo }) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(CONTRATOS_DIR, archivo), 'utf-8'));
    } catch (err) {
      throw new Error(`No se pudo leer ${archivo}: ${err.message}`);
    }
  });
}

/**
 * Guarda los contratos repartidos por año y regenera el índice. Borra los
 * ficheros de años que ya no tengan contratos.
 *
 * El orden de los contratos dentro de cada fichero es el del array recibido.
 * Los años del índice van de más reciente a más antiguo, y "sin fecha" al final.
 *
 * @param {object[]} contratos
 * @returns {{ total: number, archivos: Array<{ anio: string|null, archivo: string, total: number }> }} Índice escrito
 */
export function guardarContratos(contratos) {
  const porAnio = new Map();
  for (const contrato of contratos) {
    const anio = anioDe(contrato);
    if (!porAnio.has(anio)) porAnio.set(anio, []);
    porAnio.get(anio).push(contrato);
  }

  const anios = [...porAnio.keys()].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b.localeCompare(a);
  });

  fs.mkdirSync(CONTRATOS_DIR, { recursive: true });

  const archivos = anios.map(anio => {
    const archivo = archivoDe(anio);
    const delAnio = porAnio.get(anio);
    fs.writeFileSync(path.join(CONTRATOS_DIR, archivo), JSON.stringify(delAnio, null, 2), 'utf-8');
    return { anio, archivo, total: delAnio.length };
  });

  // Borrar ficheros de años que ya no tienen contratos
  const vigentes = new Set(archivos.map(a => a.archivo));
  for (const f of fs.readdirSync(CONTRATOS_DIR)) {
    if (f.endsWith('.json') && f !== path.basename(INDICE_FILE) && !vigentes.has(f)) {
      fs.rmSync(path.join(CONTRATOS_DIR, f));
    }
  }

  const indice = { total: contratos.length, archivos };
  fs.writeFileSync(INDICE_FILE, JSON.stringify(indice, null, 2), 'utf-8');
  return indice;
}

/**
 * Tamaño total en disco de los ficheros de contratos, en KB.
 * @returns {string}
 */
export function tamanoContratosKb() {
  const bytes = fs.readdirSync(CONTRATOS_DIR)
    .reduce((suma, f) => suma + fs.statSync(path.join(CONTRATOS_DIR, f)).size, 0);
  return (bytes / 1024).toFixed(1);
}

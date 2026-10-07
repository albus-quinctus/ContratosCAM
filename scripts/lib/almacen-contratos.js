/**
 * scripts/lib/almacen-contratos.js
 *
 * Almacén de los contratos normalizados, compartido por todos los scripts del
 * pipeline (transform, resolve-entities, import-db, validate…).
 *
 * Los contratos se guardan en un fichero por año de publicación para que
 * ninguno supere el límite de tamaño por fichero de GitHub cuando crezca el
 * histórico. La web carga los mismos ficheros (src/web/js/datos.js).
 *
 * Escritura en dos fases, para no publicar nunca datos a medias:
 *
 *   data/trabajo/contratos/      ← copia de trabajo: aquí escriben los scripts
 *        │  npm run validate    ← compara con lo publicado y, si todo está bien,
 *        │                         deja constancia en data/trabajo/validacion.json
 *        ▼  npm run publicar    ← solo publica una copia validada y sin cambios posteriores
 *   data/processed/contratos/    ← publicado (lo que se sube a git y lee la web)
 *
 * En cada carpeta:
 *   indice.json      ← ficheros, totales y registro de cargas
 *   2026.json …      ← contratos publicados en ese año
 *   sin-fecha.json   ← contratos sin fecha de publicación
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Contratos publicados (en git y en la web) */
export const PUBLICADO_DIR = path.join(__dirname, '../../data/processed/contratos');

/** Carpeta de trabajo (no se sube a git) */
export const TRABAJO_RAIZ = path.join(__dirname, '../../data/trabajo');

/** Contratos en la copia de trabajo */
export const TRABAJO_DIR = path.join(TRABAJO_RAIZ, 'contratos');

/** Constancia de la última validación aprobada de la copia de trabajo */
const VALIDACION_FILE = path.join(TRABAJO_RAIZ, 'validacion.json');

/** Claves cuyo borrado se ha autorizado con scripts/eliminar-contratos.js */
const ELIMINACIONES_FILE = path.join(TRABAJO_RAIZ, 'eliminaciones-autorizadas.json');

/** Nombre del índice dentro de cada carpeta de contratos */
export const INDICE_ARCHIVO = 'indice.json';

/** Nombre del fichero para los contratos sin fecha de publicación */
const ARCHIVO_SIN_FECHA = 'sin-fecha.json';

/** Etiqueta de los contratos sin fecha de publicación en los informes por año */
export const ETIQUETA_SIN_FECHA = 'sin fecha';

/** Tipos de entrada del registro de cargas del índice */
export const TIPO_CARGA = Object.freeze({
  INTEGRACION: 'integracion',   // transform.js integra un lote de una o varias fuentes
  ELIMINACION: 'eliminacion',   // eliminar-contratos.js borra contratos de forma explícita
});

// ─────────────────────────────────────────────────────────────────────────────
// Lectura
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Indica si hay contratos en una carpeta.
 * @param {string} dir - PUBLICADO_DIR o TRABAJO_DIR
 * @returns {boolean}
 */
export function hayContratosEn(dir) {
  return fs.existsSync(path.join(dir, INDICE_ARCHIVO));
}

/**
 * Carpeta que refleja el estado más reciente: la de trabajo si hay cambios
 * pendientes de publicar, si no la publicada.
 * @returns {string|null} null si no hay contratos en ninguna
 */
export function dirVigente() {
  if (hayContratosEn(TRABAJO_DIR)) return TRABAJO_DIR;
  if (hayContratosEn(PUBLICADO_DIR)) return PUBLICADO_DIR;
  return null;
}

/**
 * Lee el índice de una carpeta.
 * @param {string} dir
 * @returns {{ total: number, archivos: Array<{ anio: string|null, archivo: string, total: number }>, cargas: object[] }}
 */
export function leerIndice(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, INDICE_ARCHIVO), 'utf-8'));
}

/**
 * Lee todos los contratos de una carpeta, en el orden de los ficheros del índice.
 * @param {string} dir
 * @returns {object[]}
 * @throws {Error} Si falta o no se puede leer el índice o alguno de los ficheros
 */
export function leerContratosDe(dir) {
  const { archivos } = leerIndice(dir);
  return archivos.flatMap(({ archivo }) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, archivo), 'utf-8'));
    } catch (err) {
      throw new Error(`No se pudo leer ${archivo}: ${err.message}`);
    }
  });
}

/**
 * Lee los contratos vigentes (ver dirVigente).
 * @returns {object[]}
 * @throws {Error} Si no hay contratos o no se pueden leer
 */
export function leerContratos() {
  const dir = dirVigente();
  if (!dir) throw new Error(`No hay contratos en ${PUBLICADO_DIR} ni en ${TRABAJO_DIR}`);
  return leerContratosDe(dir);
}

// ─────────────────────────────────────────────────────────────────────────────
// Escritura (siempre en la copia de trabajo)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Año de publicación de un contrato, o null si no tiene fecha.
 * @param {object} contrato
 * @returns {string|null}
 */
export function anioDe(contrato) {
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
 * Guarda los contratos en la copia de trabajo, repartidos por año, y regenera
 * su índice. Conserva el registro de cargas de la carpeta vigente y, si se
 * indica, le añade la carga actual.
 *
 * El orden de los contratos dentro de cada fichero es el del array recibido.
 * Los años del índice van de más reciente a más antiguo, y "sin fecha" al final.
 *
 * Cualquier escritura invalida la validación anterior: hay que volver a
 * ejecutar validate antes de publicar.
 *
 * @param {object[]} contratos
 * @param {object} [carga] - Entrada para el registro de cargas
 * @returns {object} Índice escrito
 */
export function guardarContratos(contratos, carga) {
  const vigente = dirVigente();
  const cargasPrevias = vigente ? (leerIndice(vigente).cargas || []) : [];
  const cargas = carga ? [...cargasPrevias, carga] : cargasPrevias;

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

  fs.rmSync(VALIDACION_FILE, { force: true });
  fs.mkdirSync(TRABAJO_DIR, { recursive: true });

  const archivos = anios.map(anio => {
    const archivo = archivoDe(anio);
    const delAnio = porAnio.get(anio);
    fs.writeFileSync(path.join(TRABAJO_DIR, archivo), JSON.stringify(delAnio, null, 2), 'utf-8');
    return { anio, archivo, total: delAnio.length };
  });

  // Borrar ficheros de años que ya no tienen contratos
  const vigentes = new Set(archivos.map(a => a.archivo));
  for (const f of fs.readdirSync(TRABAJO_DIR)) {
    if (f.endsWith('.json') && f !== INDICE_ARCHIVO && !vigentes.has(f)) {
      fs.rmSync(path.join(TRABAJO_DIR, f));
    }
  }

  const indice = { total: contratos.length, archivos, cargas };
  fs.writeFileSync(path.join(TRABAJO_DIR, INDICE_ARCHIVO), JSON.stringify(indice, null, 2), 'utf-8');
  return indice;
}

/**
 * Tamaño total en disco de los ficheros de una carpeta, en KB.
 * @param {string} [dir] - Por defecto, la copia de trabajo
 * @returns {string}
 */
export function tamanoContratosKb(dir = TRABAJO_DIR) {
  const bytes = fs.readdirSync(dir)
    .reduce((suma, f) => suma + fs.statSync(path.join(dir, f)).size, 0);
  return (bytes / 1024).toFixed(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Eliminaciones autorizadas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * IDs de todos los contratos eliminados alguna vez de forma explícita, según
 * el registro de cargas. transform.js no los vuelve a incorporar aunque sigan
 * llegando en las fuentes.
 * @returns {Set<string>}
 */
export function idsEliminados() {
  const dir = dirVigente();
  if (!dir) return new Set();
  const { cargas = [] } = leerIndice(dir);
  return new Set(cargas
    .filter(c => c.tipo === TIPO_CARGA.ELIMINACION)
    .flatMap(c => c.eliminados));
}

/**
 * IDs de contratos cuyo borrado se ha autorizado en la copia de trabajo.
 * @returns {Set<string>}
 */
export function leerEliminacionesAutorizadas() {
  if (!fs.existsSync(ELIMINACIONES_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(ELIMINACIONES_FILE, 'utf-8')));
}

/**
 * Añade IDs a la lista de borrados autorizados de la copia de trabajo.
 * @param {string[]} ids
 */
export function autorizarEliminaciones(ids) {
  const todas = leerEliminacionesAutorizadas();
  ids.forEach(id => todas.add(id));
  fs.mkdirSync(TRABAJO_RAIZ, { recursive: true });
  fs.writeFileSync(ELIMINACIONES_FILE, JSON.stringify([...todas].sort(), null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Validación y publicación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Huella del contenido de la copia de trabajo: cambia con cualquier escritura.
 * @returns {string}
 */
function huellaTrabajo() {
  const hash = crypto.createHash('sha256');
  for (const f of fs.readdirSync(TRABAJO_DIR).sort()) {
    hash.update(f);
    hash.update(fs.readFileSync(path.join(TRABAJO_DIR, f)));
  }
  return hash.digest('hex');
}

/**
 * Deja constancia de que la copia de trabajo actual ha pasado la validación.
 */
export function marcarTrabajoValidado() {
  const constancia = {
    huella: huellaTrabajo(),
    total: leerIndice(TRABAJO_DIR).total,
    validado_en: new Date().toISOString(),
  };
  fs.writeFileSync(VALIDACION_FILE, JSON.stringify(constancia, null, 2), 'utf-8');
}

/**
 * Indica si la copia de trabajo está validada y no ha cambiado desde entonces.
 * @returns {boolean}
 */
export function trabajoValidado() {
  if (!fs.existsSync(VALIDACION_FILE) || !hayContratosEn(TRABAJO_DIR)) return false;
  const { huella } = JSON.parse(fs.readFileSync(VALIDACION_FILE, 'utf-8'));
  return huella === huellaTrabajo();
}

/**
 * Compara la copia de trabajo con lo publicado, por año de publicación.
 * @param {object[]} publicados
 * @param {object[]} trabajo
 * @returns {{ porAnio: Map<string, {anadidos: number, modificados: number, eliminados: number, total: number}>, eliminados: object[] }}
 */
export function compararConPublicado(publicados, trabajo) {
  const porAnio = new Map();
  const fila = anio => {
    const clave = anio || ETIQUETA_SIN_FECHA;
    if (!porAnio.has(clave)) porAnio.set(clave, { anadidos: 0, modificados: 0, eliminados: 0, total: 0 });
    return porAnio.get(clave);
  };

  const publicadosPorId = new Map(publicados.map(c => [c.id, c]));
  const idsTrabajo = new Set();
  for (const c of trabajo) {
    idsTrabajo.add(c.id);
    const f = fila(anioDe(c));
    f.total++;
    const anterior = publicadosPorId.get(c.id);
    if (!anterior) f.anadidos++;
    else if (JSON.stringify(anterior) !== JSON.stringify(c)) f.modificados++;
  }

  const eliminados = publicados.filter(c => !idsTrabajo.has(c.id));
  eliminados.forEach(c => { fila(anioDe(c)).eliminados++; });

  return { porAnio, eliminados };
}

/**
 * Muestra por consola la tabla de cambios por año de compararConPublicado.
 * @param {Map<string, {anadidos: number, modificados: number, eliminados: number, total: number}>} porAnio
 */
export function mostrarCambios(porAnio) {
  console.log('\n📋 Cambios respecto a lo publicado:');
  console.log('   Año        Total  Añadidos  Modificados  Eliminados');
  for (const anio of [...porAnio.keys()].sort().reverse()) {
    const f = porAnio.get(anio);
    console.log(`   ${anio.padEnd(9)} ${String(f.total).padStart(6)} ${String(f.anadidos).padStart(9)} ${String(f.modificados).padStart(12)} ${String(f.eliminados).padStart(11)}`);
  }
}

/**
 * Sustituye los contratos publicados por la copia de trabajo y la elimina.
 * @throws {Error} Si la copia de trabajo no está validada
 */
export function publicarTrabajo() {
  if (!trabajoValidado()) {
    throw new Error('La copia de trabajo no está validada o ha cambiado después: ejecuta npm run validate');
  }
  const anterior = PUBLICADO_DIR + '.anterior';
  fs.rmSync(anterior, { recursive: true, force: true });
  if (fs.existsSync(PUBLICADO_DIR)) fs.renameSync(PUBLICADO_DIR, anterior);
  fs.mkdirSync(path.dirname(PUBLICADO_DIR), { recursive: true });
  try {
    fs.renameSync(TRABAJO_DIR, PUBLICADO_DIR);
  } catch (err) {
    // Dejar lo publicado como estaba
    if (fs.existsSync(anterior)) fs.renameSync(anterior, PUBLICADO_DIR);
    throw err;
  }
  fs.rmSync(anterior, { recursive: true, force: true });
  descartarTrabajo();
}

/**
 * Elimina la copia de trabajo sin publicarla.
 */
export function descartarTrabajo() {
  fs.rmSync(TRABAJO_RAIZ, { recursive: true, force: true });
}

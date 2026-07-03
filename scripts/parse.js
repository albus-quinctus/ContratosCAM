/**
 * scripts/parse.js
 *
 * Lee los archivos descargados en data/raw/ y los convierte
 * a un formato JSON normalizado en data/processed/.
 *
 * Soporta: CSV, XML/Atom (PLACSP)
 *
 * Uso: node scripts/parse.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parse as parseCsv } from 'csv-parse/sync';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '../data/raw');
const PROCESSED_DIR = path.join(__dirname, '../data/processed');

// ─────────────────────────────────────────────────────────────────────────────
// Parsers por formato
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parsea un archivo CSV a array de objetos.
 * @param {string} contenido - Contenido del archivo CSV
 * @returns {Object[]} Array de registros
 */
function parsearCsv(contenido) {
  return parseCsv(contenido, {
    columns: true,           // Primera fila como cabeceras
    skip_empty_lines: true,
    trim: true,
    bom: true,               // Eliminar BOM si existe
    delimiter: ';',          // Los CSV españoles suelen usar punto y coma
    relax_column_count: true,
  });
}

/**
 * Parsea un archivo Atom/XML de PLACSP a array de objetos.
 * Usa fast-xml-parser para un parseo robusto del XML.
 * @param {string} contenido - Contenido del archivo XML/Atom
 * @returns {Object[]} Array de registros
 */
function parsearAtom(contenido) {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,       // Elimina prefijos de namespace (cbc:, cac:, etc.)
    isArray: (name) => {
      // Forzar que 'entry' siempre sea un array
      return name === 'entry';
    },
    parseTagValue: true,
    trimValues: true,
  });

  const resultado = parser.parse(contenido);
  const registros = [];

  // Navegar la estructura del feed Atom
  const feed = resultado.feed || resultado;
  const entries = feed.entry || [];

  for (const entry of entries) {
    const registro = {
      id: extraerValor(entry, 'id'),
      titulo: extraerValor(entry, 'title'),
      publicado: extraerValor(entry, 'published'),
      actualizado: extraerValor(entry, 'updated'),
      enlace: extraerEnlace(entry),
      // Campos específicos de PLACSP (sin prefijo de namespace gracias a removeNSPrefix)
      expediente: buscarCampo(entry, 'ID'),
      objeto: buscarCampo(entry, 'Description'),
      tipo_contrato: buscarCampo(entry, 'ContractTypeCode'),
      procedimiento: buscarCampo(entry, 'ProcedureCode'),
      importe: buscarCampo(entry, 'TaxExclusiveAmount'),
      importe_iva: buscarCampo(entry, 'TaxInclusiveAmount'),
      organismo: buscarCampoAnidado(entry, 'PartyName', 'Name'),
      estado: buscarCampo(entry, 'StatusCode'),
    };

    // Solo incluir si tiene datos mínimos
    if (registro.titulo || registro.objeto) {
      registros.push(registro);
    }
  }

  return registros;
}

/**
 * Extrae un valor simple de un objeto parseado.
 * Maneja el caso donde el valor puede ser un objeto con #text.
 * @param {Object} obj - Objeto parseado
 * @param {string} campo - Nombre del campo
 * @returns {string|null}
 */
function extraerValor(obj, campo) {
  if (!obj || !obj[campo]) return null;
  const val = obj[campo];
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val['#text']) return String(val['#text']);
  return null;
}

/**
 * Extrae el href del link de un entry Atom.
 * @param {Object} entry - Entry parseado
 * @returns {string|null}
 */
function extraerEnlace(entry) {
  if (!entry || !entry.link) return null;
  const link = Array.isArray(entry.link) ? entry.link[0] : entry.link;
  if (typeof link === 'string') return link;
  return link['@_href'] || null;
}

/**
 * Busca un campo en un objeto de forma recursiva (profundidad limitada).
 * Útil para encontrar campos PLACSP que pueden estar anidados.
 * @param {Object} obj - Objeto donde buscar
 * @param {string} campo - Nombre del campo a buscar
 * @param {number} maxDepth - Profundidad máxima de búsqueda
 * @returns {string|null}
 */
function buscarCampo(obj, campo, maxDepth = 5) {
  if (!obj || maxDepth <= 0) return null;

  // Buscar directamente
  if (obj[campo] !== undefined) {
    const val = obj[campo];
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (val && val['#text']) return String(val['#text']);
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Puede ser un objeto con un valor de texto
      const keys = Object.keys(val).filter(k => !k.startsWith('@_'));
      if (keys.length === 1) return extraerValor(val, keys[0]);
    }
  }

  // Buscar recursivamente en sub-objetos
  for (const key of Object.keys(obj)) {
    if (key.startsWith('@_')) continue;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = buscarCampo(val, campo, maxDepth - 1);
      if (found) return found;
    }
  }

  return null;
}

/**
 * Busca un campo anidado (ej: PartyName > Name).
 * @param {Object} obj - Objeto donde buscar
 * @param {string} padre - Nombre del campo padre
 * @param {string} hijo - Nombre del campo hijo
 * @returns {string|null}
 */
function buscarCampoAnidado(obj, padre, hijo) {
  if (!obj) return null;

  // Buscar el padre recursivamente
  const padreObj = buscarObjeto(obj, padre);
  if (!padreObj) return buscarCampo(obj, padre); // Fallback: buscar como campo simple

  // Extraer el hijo
  return extraerValor(padreObj, hijo) || buscarCampo(padreObj, hijo, 2);
}

/**
 * Busca un objeto por nombre de forma recursiva.
 * @param {Object} obj
 * @param {string} nombre
 * @param {number} maxDepth
 * @returns {Object|null}
 */
function buscarObjeto(obj, nombre, maxDepth = 5) {
  if (!obj || maxDepth <= 0) return null;

  if (obj[nombre] && typeof obj[nombre] === 'object') {
    return obj[nombre];
  }

  for (const key of Object.keys(obj)) {
    if (key.startsWith('@_')) continue;
    const val = obj[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      const found = buscarObjeto(val, nombre, maxDepth - 1);
      if (found) return found;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📄 ContratosCAM — Parseo de datos');
  console.log('═'.repeat(50));

  // Crear directorio si no existe
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  // Leer todos los archivos en data/raw/
  const archivos = fs.readdirSync(RAW_DIR).filter(f => !f.startsWith('.'));

  if (archivos.length === 0) {
    console.log('⚠️  No hay archivos en data/raw/');
    console.log('   Ejecuta primero: npm run download');
    process.exit(0);
  }

  let totalRegistros = 0;

  for (const archivo of archivos) {
    const rutaArchivo = path.join(RAW_DIR, archivo);
    const extension = path.extname(archivo).toLowerCase().replace('.', '');
    const nombreBase = path.basename(archivo, path.extname(archivo));

    console.log(`\n📂 Procesando: ${archivo}`);

    let registros = [];

    try {
      const contenido = fs.readFileSync(rutaArchivo, 'utf-8');

      if (extension === 'csv') {
        registros = parsearCsv(contenido);
      } else if (extension === 'atom' || extension === 'xml') {
        registros = parsearAtom(contenido);
      } else {
        console.log(`  ⚠️  Formato no soportado: .${extension} — omitiendo`);
        continue;
      }

      console.log(`  📊 Registros encontrados: ${registros.length}`);

      // Guardar como JSON
      const rutaSalida = path.join(PROCESSED_DIR, `${nombreBase}.json`);
      fs.writeFileSync(rutaSalida, JSON.stringify(registros, null, 2), 'utf-8');
      console.log(`  ✅ Guardado: ${path.basename(rutaSalida)}`);

      totalRegistros += registros.length;

    } catch (error) {
      console.error(`  ❌ Error procesando ${archivo}: ${error.message}`);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Parseo completado. Total registros: ${totalRegistros}`);
  console.log(`📁 Archivos en: ${PROCESSED_DIR}`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

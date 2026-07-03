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
 * Extrae los campos principales de cada <entry>.
 * @param {string} contenido - Contenido del archivo XML/Atom
 * @returns {Object[]} Array de registros
 */
function parsearAtom(contenido) {
  const registros = [];

  // Extraer cada <entry> del feed Atom
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
  let match;

  while ((match = entryRegex.exec(contenido)) !== null) {
    const entry = match[1];

    const registro = {
      id: extraerEtiqueta(entry, 'id'),
      titulo: extraerEtiqueta(entry, 'title'),
      publicado: extraerEtiqueta(entry, 'published'),
      actualizado: extraerEtiqueta(entry, 'updated'),
      enlace: extraerAtributo(entry, 'link', 'href'),
      // Campos específicos de PLACSP (namespace cac-place-ext)
      expediente: extraerEtiqueta(entry, 'cbc:ID'),
      objeto: extraerEtiqueta(entry, 'cbc:Description'),
      tipo_contrato: extraerEtiqueta(entry, 'cbc:ContractTypeCode'),
      procedimiento: extraerEtiqueta(entry, 'cbc:ProcedureCode'),
      importe: extraerEtiqueta(entry, 'cbc:TaxExclusiveAmount'),
      importe_iva: extraerEtiqueta(entry, 'cbc:TaxInclusiveAmount'),
      organismo: extraerEtiqueta(entry, 'cac:PartyName'),
      estado: extraerEtiqueta(entry, 'cbc:StatusCode'),
    };

    // Solo incluir si tiene datos mínimos
    if (registro.titulo || registro.objeto) {
      registros.push(registro);
    }
  }

  return registros;
}

/**
 * Extrae el contenido de una etiqueta XML.
 * Soporta etiquetas con namespace (cbc:ID, cac:PartyName, etc.)
 * buscando tanto el nombre completo como solo la parte local.
 * @param {string} xml - Fragmento XML
 * @param {string} etiqueta - Nombre de la etiqueta (con o sin namespace)
 * @returns {string|null}
 */
function extraerEtiqueta(xml, etiqueta) {
  // Intentar primero con el nombre completo (escapando : para regex)
  const tagEscapado = etiqueta.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let regex = new RegExp(`<${tagEscapado}[^>]*>([\\s\\S]*?)<\\/${tagEscapado}>`, 'i');
  let match = xml.match(regex);

  // Si no encuentra, intentar solo con la parte local (después del :)
  if (!match && etiqueta.includes(':')) {
    const parteLocal = etiqueta.split(':')[1];
    const parteLocalEsc = parteLocal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    regex = new RegExp(`<[^:>]*:${parteLocalEsc}[^>]*>([\\s\\S]*?)<\\/[^:>]*:${parteLocalEsc}>`, 'i');
    match = xml.match(regex);
  }

  return match
    ? match[1].trim()
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
    : null;
}

/**
 * Extrae el valor de un atributo de una etiqueta XML.
 * @param {string} xml - Fragmento XML
 * @param {string} etiqueta - Nombre de la etiqueta
 * @param {string} atributo - Nombre del atributo
 * @returns {string|null}
 */
function extraerAtributo(xml, etiqueta, atributo) {
  const regex = new RegExp(`<${etiqueta}[^>]*${atributo}="([^"]*)"`, 'i');
  const match = xml.match(regex);
  return match ? match[1] : null;
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

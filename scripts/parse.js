/**
 * scripts/parse.js
 *
 * Parsea los archivos Atom XML descargados de PLACSP y los convierte
 * a un formato JSON intermedio (un array de objetos con campos crudos).
 *
 * Entrada: data/raw/placsp-licitaciones-*.atom
 * Salida:  data/raw/parsed-licitaciones.json
 *
 * Uso: node scripts/parse.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '../data/raw');
const OUTPUT_FILE = path.join(RAW_DIR, 'parsed-licitaciones.json');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración del parser XML
// ─────────────────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  isArray: (name) => {
    // Forzar arrays para elementos que pueden repetirse
    const arrayElements = [
      'entry',
      'cac:PartyIdentification',
      'cac:TechnicalEvaluationCriteria',
      'cac:FinancialEvaluationCriteria',
      'cac:SpecificTendererRequirement',
      'cac:RequiredFinancialGuarantee',
      'cac:RequiredCommodityClassification',
      'cbc:ActivityCode',
      'cac:TenderResult',
      'cac:AwardedTenderedProject',
    ];
    return arrayElements.includes(name);
  },
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de extracción
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae de forma segura un valor anidado de un objeto.
 * @param {object} obj - Objeto fuente
 * @param {string[]} keys - Ruta de claves
 * @returns {*} Valor encontrado o undefined
 */
function get(obj, ...keys) {
  let current = obj;
  for (const key of keys) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Extrae el texto de un nodo XML que puede ser string o {#text: string, @_attr: ...}
 * @param {*} node
 * @returns {string|null}
 */
function texto(node) {
  if (node == null) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object' && node['#text'] != null) {
    return String(node['#text']).trim() || null;
  }
  return null;
}

/**
 * Extrae un importe numérico de un nodo XML.
 * @param {*} node
 * @returns {number|null}
 */
function importe(node) {
  const val = texto(node);
  if (val == null) return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
}

/**
 * Extrae los datos relevantes de una entrada del feed Atom.
 * @param {object} entry - Objeto parseado de un <entry>
 * @returns {object|null} Datos extraídos o null si no es válido
 */
function extraerContrato(entry) {
  const contractFolder = get(entry, 'cac-place-ext:ContractFolderStatus');
  if (!contractFolder) return null;

  // Expediente
  const expediente = texto(get(contractFolder, 'cbc:ContractFolderID'));

  // Estado (PUB, ADJ, RES, etc.)
  const estadoNode = get(contractFolder, 'cbc-place-ext:ContractFolderStatusCode');
  const estado = texto(estadoNode);

  // Organismo contratante
  const locatedParty = get(contractFolder, 'cac-place-ext:LocatedContractingParty');
  const party = get(locatedParty, 'cac:Party');
  const organismoNombre = texto(get(party, 'cac:PartyName', 'cbc:Name'));

  // NIF del organismo
  let nifOrganismo = null;
  const partyIds = get(party, 'cac:PartyIdentification');
  if (Array.isArray(partyIds)) {
    const nifEntry = partyIds.find(p => {
      const id = get(p, 'cbc:ID');
      return id && id['@_schemeName'] === 'NIF';
    });
    if (nifEntry) nifOrganismo = texto(get(nifEntry, 'cbc:ID'));
  }

  // Jerarquía de organismos padre (para filtrar por CAM)
  const jerarquia = extraerJerarquia(locatedParty);

  // Proyecto de contratación
  const project = get(contractFolder, 'cac:ProcurementProject');
  const objeto = texto(get(project, 'cbc:Name')) || texto(get(entry, 'title'));

  // Tipo de contrato (código numérico PLACSP)
  const tipoCode = texto(get(project, 'cbc:TypeCode'));

  // Subtipo
  const subtipoCode = texto(get(project, 'cbc:SubTypeCode'));

  // Importes del presupuesto
  const budget = get(project, 'cac:BudgetAmount');
  const importeSinIva = importe(get(budget, 'cbc:TaxExclusiveAmount'));
  const importeTotal = importe(get(budget, 'cbc:TotalAmount'));
  const importeEstimado = importe(get(budget, 'cbc:EstimatedOverallContractAmount'));

  // Ubicación
  const location = get(project, 'cac:RealizedLocation');
  const provincia = texto(get(location, 'cbc:CountrySubentity'));
  const nutsCode = texto(get(location, 'cbc:CountrySubentityCode'));

  // Procedimiento
  const tenderingProcess = get(contractFolder, 'cac:TenderingProcess');
  const procedimientoCode = texto(get(tenderingProcess, 'cbc:ProcedureCode'));

  // Resultado de adjudicación (si existe)
  const tenderResults = get(contractFolder, 'cac:TenderResult');
  let adjudicatario = null;
  let nifAdjudicatario = null;
  let importeAdjudicacion = null;
  let importeAdjudicacionIva = null;
  let fechaAdjudicacion = null;

  if (tenderResults) {
    const results = Array.isArray(tenderResults) ? tenderResults : [tenderResults];
    const result = results[0]; // Tomar el primer resultado

    // Adjudicatario
    const winningParty = get(result, 'cac:WinningParty', 'cac:PartyIdentification');
    if (winningParty) {
      const ids = Array.isArray(winningParty) ? winningParty : [winningParty];
      for (const id of ids) {
        const idNode = get(id, 'cbc:ID');
        const scheme = idNode && idNode['@_schemeName'];
        if (scheme === 'NIF' || scheme === 'ID_PLATAFORMA') {
          if (scheme === 'NIF') nifAdjudicatario = texto(idNode);
        }
      }
    }

    const winningPartyName = get(result, 'cac:WinningParty', 'cac:PartyName', 'cbc:Name');
    adjudicatario = texto(winningPartyName);

    // Importe de adjudicación
    const awardedProject = get(result, 'cac:AwardedTenderedProject');
    const awarded = Array.isArray(awardedProject) ? awardedProject[0] : awardedProject;
    if (awarded) {
      const legalTotal = get(awarded, 'cac:LegalMonetaryTotal');
      importeAdjudicacion = importe(get(legalTotal, 'cbc:TaxExclusiveAmount'));
      importeAdjudicacionIva = importe(get(legalTotal, 'cbc:PayableAmount'));
    }

    // Fecha de adjudicación
    fechaAdjudicacion = texto(get(result, 'cbc:AwardDate'));
  }

  // URL del anuncio
  const urlOrigen = texto(get(entry, 'link', '@_href'));

  // Fecha de actualización
  const fechaActualizacion = texto(get(entry, 'updated'));

  return {
    expediente,
    objeto,
    estado,
    tipo_code: tipoCode,
    subtipo_code: subtipoCode,
    procedimiento_code: procedimientoCode,
    organismo: organismoNombre,
    nif_organismo: nifOrganismo,
    jerarquia,
    importe_sin_iva: importeSinIva,
    importe_total: importeTotal,
    importe_estimado: importeEstimado,
    importe_adjudicacion: importeAdjudicacion,
    importe_adjudicacion_iva: importeAdjudicacionIva,
    adjudicatario,
    nif_adjudicatario: nifAdjudicatario,
    fecha_adjudicacion: fechaAdjudicacion,
    fecha_actualizacion: fechaActualizacion,
    provincia,
    nuts_code: nutsCode,
    url_origen: urlOrigen,
    fuente: 'placsp',
  };
}

/**
 * Extrae la jerarquía de organismos padre de un LocatedContractingParty.
 * Devuelve un array con los nombres de la jerarquía de arriba a abajo.
 * @param {object} locatedParty
 * @returns {string[]}
 */
function extraerJerarquia(locatedParty) {
  const jerarquia = [];

  function recorrer(node) {
    if (!node) return;
    const nombre = texto(get(node, 'cac:PartyName', 'cbc:Name'));
    if (nombre) jerarquia.push(nombre);
    recorrer(get(node, 'cac-place-ext:ParentLocatedParty'));
  }

  recorrer(get(locatedParty, 'cac-place-ext:ParentLocatedParty'));
  return jerarquia.reverse(); // De arriba (Estado) a abajo (organismo concreto)
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('📄 ContratosCAM — Parseo de feeds Atom');
  console.log('═'.repeat(60));

  // Buscar archivos .atom en data/raw/
  const archivos = fs.readdirSync(RAW_DIR)
    .filter(f => f.startsWith('placsp-') && f.endsWith('.atom'))
    .sort();

  if (archivos.length === 0) {
    console.error('❌ No se encontraron archivos .atom en data/raw/');
    console.error('   Ejecuta primero: npm run download');
    process.exit(1);
  }

  console.log(`📁 Archivos encontrados: ${archivos.length}`);
  archivos.forEach(f => console.log(`   • ${f}`));
  console.log('');

  const todosLosContratos = [];
  let totalEntradas = 0;
  let entradasParseadas = 0;
  let errores = 0;

  for (const archivo of archivos) {
    console.log(`\n🔍 Parseando: ${archivo}`);
    const ruta = path.join(RAW_DIR, archivo);
    const contenido = fs.readFileSync(ruta, 'utf-8');

    let parsed;
    try {
      parsed = parser.parse(contenido);
    } catch (err) {
      console.error(`  ❌ Error parseando XML: ${err.message}`);
      errores++;
      continue;
    }

    const feed = parsed.feed || parsed;
    let entries = feed.entry || [];
    if (!Array.isArray(entries)) entries = [entries];

    totalEntradas += entries.length;
    console.log(`  📝 Entradas en el feed: ${entries.length}`);

    for (const entry of entries) {
      try {
        const contrato = extraerContrato(entry);
        if (contrato && contrato.objeto) {
          todosLosContratos.push(contrato);
          entradasParseadas++;
        }
      } catch (err) {
        errores++;
      }
    }
  }

  // Guardar resultado
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE PARSEO');
  console.log('─'.repeat(60));
  console.log(`  📄 Archivos procesados: ${archivos.length}`);
  console.log(`  📝 Total entradas en feeds: ${totalEntradas}`);
  console.log(`  ✅ Contratos parseados: ${entradasParseadas}`);
  console.log(`  ❌ Errores: ${errores}`);
  console.log('─'.repeat(60));

  // Guardar JSON intermedio
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(todosLosContratos, null, 2), 'utf-8');
  const tamano = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  console.log(`\n💾 Guardado: ${path.basename(OUTPUT_FILE)} (${tamano} KB)`);
  console.log(`   ${todosLosContratos.length} contratos en formato JSON intermedio`);
  console.log('\n✅ Parseo completado.');
  console.log('💡 Siguiente paso: npm run transform');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

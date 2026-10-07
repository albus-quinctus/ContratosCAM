/**
 * scripts/parse.js
 *
 * Parsea los archivos Atom XML descargados de PLACSP y los convierte
 * a un formato JSON intermedio (un array de objetos con campos crudos).
 *
 * Solo conserva los contratos de la Comunidad de Madrid (lib/filtro-cam.js).
 *
 * Entrada: data/raw/placsp-licitaciones-*.atom
 *          data/raw/historico/<feed>/<periodo>.zip (con --historico; los
 *          .atom se leen de dentro del ZIP sin descomprimirlo a disco)
 * Salida:  data/raw/parsed-licitaciones.json
 *
 * Uso: node scripts/parse.js [--historico]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';
import { FUENTE } from './lib/fuentes.js';
import { esDeCAM } from './lib/filtro-cam.js';
import { EXTENSION_ZIP, FEEDS_HISTORICO, HISTORICO_DIR } from './lib/feeds-placsp.js';
import { atomsDeZip, leerDeZip } from './lib/zip.js';

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
      'cac:ProcurementProjectLot',
    ];
    return arrayElements.includes(name);
  },
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
});

/** Esquema de los identificadores que son un NIF */
const ESQUEMA_NIF = 'NIF';

/**
 * Esquemas de los identificadores que son un código de órgano: DIR3 en los
 * perfiles alojados en PLACSP e ID_OC_PLAT en las plataformas agregadas.
 */
const ESQUEMAS_CODIGO_ORGANO = ['DIR3', 'ID_OC_PLAT'];

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
 * Suma los importes conocidos de una lista.
 * @param {(number|null)[]} importes
 * @returns {number|null} null si no hay ningún importe conocido
 */
function sumarImportes(importes) {
  const conocidos = importes.filter(i => i != null);
  if (conocidos.length === 0) return null;
  return Math.round(conocidos.reduce((total, i) => total + i, 0) * 100) / 100;
}

/**
 * Extrae los datos de un resultado de adjudicación (<cac:TenderResult>).
 * En los contratos con lotes hay un resultado por lote adjudicado.
 * @param {object} result - Objeto parseado de un <cac:TenderResult>
 * @returns {object}
 */
function extraerAdjudicacion(result) {
  // Adjudicatario
  let nifAdjudicatario = null;
  const winningParty = get(result, 'cac:WinningParty', 'cac:PartyIdentification');
  if (winningParty) {
    const ids = Array.isArray(winningParty) ? winningParty : [winningParty];
    const nifEntry = ids.find(id => get(id, 'cbc:ID', '@_schemeName') === ESQUEMA_NIF);
    if (nifEntry) nifAdjudicatario = texto(get(nifEntry, 'cbc:ID'));
  }
  const adjudicatario = texto(get(result, 'cac:WinningParty', 'cac:PartyName', 'cbc:Name'));

  // Lote e importe de adjudicación
  const awardedProject = get(result, 'cac:AwardedTenderedProject');
  const awarded = Array.isArray(awardedProject) ? awardedProject[0] : awardedProject;
  const legalTotal = get(awarded, 'cac:LegalMonetaryTotal');

  return {
    lote: texto(get(awarded, 'cbc:ProcurementProjectLotID')),
    adjudicatario,
    nif_adjudicatario: nifAdjudicatario,
    importe_adjudicacion: importe(get(legalTotal, 'cbc:TaxExclusiveAmount')),
    importe_adjudicacion_iva: importe(get(legalTotal, 'cbc:PayableAmount')),
    fecha_adjudicacion: texto(get(result, 'cbc:AwardDate')),
  };
}

/**
 * Extrae los datos relevantes de una entrada del feed Atom.
 * @param {object} entry - Objeto parseado de un <entry>
 * @param {string} fuente - Fuente del feed (FUENTE en lib/fuentes.js)
 * @returns {object|null} Datos extraídos o null si no es válido
 */
function extraerContrato(entry, fuente) {
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
      return id && id['@_schemeName'] === ESQUEMA_NIF;
    });
    if (nifEntry) nifOrganismo = texto(get(nifEntry, 'cbc:ID'));
  }

  // Códigos de órgano del organismo (para filtrar por CAM)
  const codigosOrgano = (partyIds || [])
    .filter(p => ESQUEMAS_CODIGO_ORGANO.includes(get(p, 'cbc:ID', '@_schemeName')))
    .map(p => texto(get(p, 'cbc:ID')))
    .filter(Boolean);

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

  // CPV (código de producto/servicio)
  const cpvClassifications = get(project, 'cac:RequiredCommodityClassification');
  let cpv = null;
  let cpvDescripcion = null;
  if (cpvClassifications) {
    const cpvArr = Array.isArray(cpvClassifications) ? cpvClassifications : [cpvClassifications];
    const cpvPrincipal = cpvArr[0];
    if (cpvPrincipal) {
      const cpvNode = get(cpvPrincipal, 'cbc:ItemClassificationCode');
      cpv = texto(cpvNode);
      if (cpvNode && typeof cpvNode === 'object') {
        cpvDescripcion = cpvNode['@_name'] || null;
      }
    }
  }

  // Duración del contrato (meses o días)
  const periodo = get(project, 'cac:PlannedPeriod');
  const duracionMedida = get(periodo, 'cbc:DurationMeasure');
  let duracionMeses = null;
  if (duracionMedida) {
    const valor = parseFloat(texto(duracionMedida));
    const unidad = duracionMedida['@_unitCode'] || 'MON';
    if (!isNaN(valor)) {
      // Convertir a meses si está en días
      duracionMeses = unidad === 'DAY' ? Math.round(valor / 30) : Math.round(valor);
    }
  }

  // Número de lotes
  const lotes = get(contractFolder, 'cac:ProcurementProjectLot');
  let numLotes = null;
  if (lotes) {
    numLotes = Array.isArray(lotes) ? lotes.length : 1;
  }

  // Ubicación
  const location = get(project, 'cac:RealizedLocation');
  const provincia = texto(get(location, 'cbc:CountrySubentity'));
  const nutsCode = texto(get(location, 'cbc:CountrySubentityCode'));

  // Procedimiento
  const tenderingProcess = get(contractFolder, 'cac:TenderingProcess');
  const procedimientoCode = texto(get(tenderingProcess, 'cbc:ProcedureCode'));

  // Resultados de adjudicación (uno por lote adjudicado, si existen)
  const tenderResults = get(contractFolder, 'cac:TenderResult') || [];
  const adjudicaciones = tenderResults.map(extraerAdjudicacion);

  // Datos generales del contrato: el adjudicatario y la fecha del primer
  // resultado, y como importe la suma de todos los lotes adjudicados
  const primera = adjudicaciones[0] || {};
  const adjudicatario = primera.adjudicatario ?? null;
  const nifAdjudicatario = primera.nif_adjudicatario ?? null;
  const fechaAdjudicacion = primera.fecha_adjudicacion ?? null;
  const importeAdjudicacion = sumarImportes(adjudicaciones.map(a => a.importe_adjudicacion));
  const importeAdjudicacionIva = sumarImportes(adjudicaciones.map(a => a.importe_adjudicacion_iva));

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
    codigos_organo: codigosOrgano,
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
    fuente,
    // Campos adicionales (Fase mejora calidad)
    cpv,
    cpv_descripcion: cpvDescripcion,
    duracion_meses: duracionMeses,
    num_lotes: numLotes,
    adjudicaciones,
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

/**
 * Ficheros Atom que hay que parsear, con la fuente de cada uno y cómo leerlo:
 * el feed semanal de data/raw/ y, con --historico, los que hay dentro de los
 * ZIP que guarda download-historico.js en data/raw/historico/<feed>/<periodo>.zip.
 * @param {boolean} conHistorico
 * @returns {{nombre: string, fuente: string, leer: () => string}[]}
 */
function listarFicheros(conHistorico) {
  const ficheros = fs.readdirSync(RAW_DIR)
    .filter(f => f.startsWith('placsp-') && f.endsWith('.atom'))
    .sort()
    .map(f => ({ nombre: f, fuente: FUENTE.PLACSP, leer: () => fs.readFileSync(path.join(RAW_DIR, f), 'utf-8') }));

  if (!conHistorico) return ficheros;

  for (const feed of FEEDS_HISTORICO) {
    const dirFeed = path.join(HISTORICO_DIR, feed.clave);
    if (!fs.existsSync(dirFeed)) continue;
    for (const archivoZip of fs.readdirSync(dirFeed).filter(f => f.endsWith(EXTENSION_ZIP)).sort()) {
      const zip = path.join(dirFeed, archivoZip);
      const periodo = path.basename(archivoZip, EXTENSION_ZIP);
      for (const atom of atomsDeZip(zip)) {
        ficheros.push({ nombre: `${feed.clave}/${periodo}/${atom}`, fuente: feed.fuente, leer: () => leerDeZip(zip, atom) });
      }
    }
  }
  return ficheros;
}

async function main() {
  const conHistorico = process.argv.includes('--historico');

  console.log('📄 ContratosCAM — Parseo de feeds Atom');
  console.log('═'.repeat(60));

  const archivos = listarFicheros(conHistorico);

  if (archivos.length === 0) {
    console.error('❌ No se encontraron archivos .atom en data/raw/');
    console.error(`   Ejecuta primero: ${conHistorico ? 'node scripts/download-historico.js' : 'npm run download'}`);
    process.exit(1);
  }

  console.log(`📁 Archivos encontrados: ${archivos.length}${conHistorico ? ' (incluido el histórico)' : ''}`);
  console.log('');

  // Solo se guardan los contratos de la Comunidad de Madrid: el histórico
  // contiene los de toda España y no cabría en memoria.
  const todosLosContratos = [];
  let totalEntradas = 0;
  let entradasParseadas = 0;
  let descartadosOtrasCCAA = 0;
  let errores = 0;

  for (const archivo of archivos) {
    const contenido = archivo.leer();

    let parsed;
    try {
      parsed = parser.parse(contenido);
    } catch (err) {
      console.error(`  ❌ ${archivo.nombre}: error parseando XML: ${err.message}`);
      errores++;
      continue;
    }

    const feed = parsed.feed || parsed;
    let entries = feed.entry || [];
    if (!Array.isArray(entries)) entries = [entries];

    totalEntradas += entries.length;
    let deCAM = 0;

    for (const entry of entries) {
      try {
        const contrato = extraerContrato(entry, archivo.fuente);
        if (!contrato || !contrato.objeto) continue;
        entradasParseadas++;
        if (!esDeCAM(contrato)) {
          descartadosOtrasCCAA++;
          continue;
        }
        todosLosContratos.push(contrato);
        deCAM++;
      } catch (err) {
        errores++;
      }
    }
    console.log(`  🔍 ${archivo.nombre}: ${entries.length} entradas, ${deCAM} de la CAM`);
  }

  // Guardar resultado
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE PARSEO');
  console.log('─'.repeat(60));
  console.log(`  📄 Archivos procesados: ${archivos.length}`);
  console.log(`  📝 Total entradas en feeds: ${totalEntradas}`);
  console.log(`  ✅ Contratos parseados: ${entradasParseadas}`);
  console.log(`  🏛️  De la Comunidad de Madrid: ${todosLosContratos.length}`);
  console.log(`  🚫 Descartados (otras administraciones): ${descartadosOtrasCCAA}`);
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

/**
 * scripts/parse-ted.js
 *
 * Parsea los archivos XML descargados de TED (Tenders Electronic Daily)
 * y los convierte a un formato JSON intermedio compatible con el pipeline.
 *
 * Entrada: data/raw/ted/ted-*.xml
 * Salida:  data/raw/parsed-ted.json
 *
 * Formato XML de TED: TED_EXPORT (schema R2.0.9)
 * Contiene: CODED_DATA_SECTION (metadatos) + FORM_SECTION (datos del formulario)
 *
 * Uso: node scripts/parse-ted.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { XMLParser } from 'fast-xml-parser';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '../data/raw/ted');
const OUTPUT_FILE = path.join(__dirname, '../data/raw/parsed-ted.json');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración del parser XML
// ─────────────────────────────────────────────────────────────────────────────

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: false,
  isArray: (name) => {
    const arrayElements = [
      'ORIGINAL_CPV',
      'ORIGINAL_NUTS',
      'CA_CE_NUTS',
      'TENDERER_NUTS',
      'OBJECT_CONTRACT',
      'AWARD_CONTRACT',
      'AWARDED_CONTRACT',
      'CONTRACTOR',
      'ADDRESS_CONTRACTOR',
      'NO_DOC_OJS',
      'VALUES',
      'VALUE',
      'OBJECT_DESCR',
      'SHORT_DESCR',
      'P',
      'AC_QUALITY',
      'AC_COST',
    ];
    return arrayElements.includes(name);
  },
  textNodeName: '#text',
  parseTagValue: true,
  trimValues: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// Mapeo de códigos de criterio de adjudicación (AC_AWARD_CRIT en CODIF_DATA)
// ─────────────────────────────────────────────────────────────────────────────

const CRITERIOS_ADJUDICACION_CODES = {
  '1': 'Precio más bajo',
  '2': 'Mejor relación calidad-precio',
  '8': 'No especificado',
};

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de extracción
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrae de forma segura un valor anidado de un objeto.
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
 * Extrae texto de un nodo que puede ser string, number, o {#text: ...}
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
 * Extrae un array de textos de nodos <P> (párrafos en TED).
 */
function textoParrafos(node) {
  if (node == null) return null;
  if (typeof node === 'string') return node.trim() || null;
  if (Array.isArray(node)) {
    return node.map(p => texto(p)).filter(Boolean).join(' ');
  }
  return texto(node);
}

/**
 * Mapea códigos de tipo de contrato de TED al esquema normalizado.
 */
function mapearTipoContrato(code) {
  const mapa = {
    '1': 'obras',
    '2': 'suministros',
    '4': 'servicios',
    '3': 'servicios', // En TED, 3 = public works concession, mapeamos a servicios
  };
  return mapa[code] || 'otros';
}

/**
 * Mapea códigos de procedimiento de TED al esquema normalizado.
 */
function mapearProcedimiento(code) {
  const mapa = {
    '1': 'abierto',
    '2': 'restringido',
    '3': 'negociado',
    '4': 'negociado',
    '6': 'negociado_sin_publicidad',
    'V': 'negociado_sin_publicidad', // Award without prior publication
  };
  return mapa[code] || 'abierto';
}

/**
 * Extrae los criterios de adjudicación del formulario TED.
 *
 * Los criterios pueden estar en:
 * - OBJECT_DESCR > DIRECTIVE_2014_24_EU > AC_QUALITY / AC_COST / AC_PRICE
 * - CODIF_DATA > AC_AWARD_CRIT (código resumen: 1=precio, 2=calidad-precio)
 *
 * Devuelve un string legible con los criterios y ponderaciones.
 * Ejemplo: "Calidad técnica (25%), Precio (43%), Mejoras (12%)"
 *
 * @param {object} form - Formulario parseado (F02, F03, etc.)
 * @param {object} codifData - Sección CODIF_DATA del XML
 * @returns {string|null} Criterios formateados o null
 */
function extraerCriteriosAdjudicacion(form, codifData) {
  const criterios = [];

  // Intentar extraer criterios detallados del formulario
  if (form) {
    const objectContract = get(form, 'OBJECT_CONTRACT');
    const oc = objectContract
      ? (Array.isArray(objectContract) ? objectContract[0] : objectContract)
      : null;

    // Buscar en OBJECT_DESCR (puede haber varios lotes)
    const objectDescrs = get(oc, 'OBJECT_DESCR') || [];
    const descrs = Array.isArray(objectDescrs) ? objectDescrs : [objectDescrs];

    for (const descr of descrs) {
      if (!descr || typeof descr !== 'object') continue;

      // Buscar dentro de DIRECTIVE_2014_24_EU o directamente en OBJECT_DESCR
      const directive = get(descr, 'DIRECTIVE_2014_24_EU') || descr;

      // Criterios de calidad (AC_QUALITY)
      const acQuality = get(directive, 'AC_QUALITY');
      if (acQuality) {
        const qualityArr = Array.isArray(acQuality) ? acQuality : [acQuality];
        for (const q of qualityArr) {
          const criterio = texto(get(q, 'AC_CRITERION'));
          const peso = texto(get(q, 'AC_WEIGHTING'));
          if (criterio) {
            criterios.push(peso ? `${criterio} (${peso}%)` : criterio);
          }
        }
      }

      // Criterios de coste (AC_COST)
      const acCost = get(directive, 'AC_COST');
      if (acCost) {
        const costArr = Array.isArray(acCost) ? acCost : [acCost];
        for (const c of costArr) {
          const criterio = texto(get(c, 'AC_CRITERION'));
          const peso = texto(get(c, 'AC_WEIGHTING'));
          if (criterio) {
            criterios.push(peso ? `${criterio} (${peso}%)` : criterio);
          }
        }
      }

      // Solo precio (AC_PRICE) — indica que el único criterio es el precio
      if (get(directive, 'AC_PRICE') != null && criterios.length === 0) {
        criterios.push('Precio (100%)');
      }

      // Si encontramos criterios en el primer OBJECT_DESCR, no seguir buscando
      if (criterios.length > 0) break;
    }
  }

  // Si no se encontraron criterios detallados, usar el código resumen de CODIF_DATA
  if (criterios.length === 0 && codifData) {
    const acCode = get(codifData, 'AC_AWARD_CRIT', '@_CODE');
    if (acCode && CRITERIOS_ADJUDICACION_CODES[acCode]) {
      return CRITERIOS_ADJUDICACION_CODES[acCode];
    }
  }

  return criterios.length > 0 ? criterios.join('; ') : null;
}

/**
 * Extrae los datos relevantes de un XML de TED.
 * @param {object} parsed - Objeto parseado del XML
 * @param {string} publicationNumber - Número de publicación TED
 * @returns {object|null} Datos extraídos o null si no es relevante
 */
function extraerContratoTED(parsed, publicationNumber) {
  const tedExport = parsed.TED_EXPORT || parsed['TED_EXPORT'];
  if (!tedExport) return null;

  const codedData = get(tedExport, 'CODED_DATA_SECTION');
  const noticeData = get(codedData, 'NOTICE_DATA');
  const codifData = get(codedData, 'CODIF_DATA');

  // Verificar que es de España
  const country = get(noticeData, 'ISO_COUNTRY', '@_VALUE');
  if (country !== 'ES') return null;

  // Verificar NUTS — filtrar por ES300 (Madrid) o ES30
  const nutsNodes = get(noticeData, 'ORIGINAL_NUTS') || [];
  const caNuts = get(noticeData, 'CA_CE_NUTS') || [];
  const allNuts = [...(Array.isArray(nutsNodes) ? nutsNodes : [nutsNodes]),
                   ...(Array.isArray(caNuts) ? caNuts : [caNuts])];

  const nutsCodes = allNuts
    .map(n => n?.['@_CODE'] || texto(n))
    .filter(Boolean);

  const esMadrid = nutsCodes.some(code =>
    code === 'ES300' || code === 'ES30' || code?.startsWith('ES30')
  );

  if (!esMadrid) return null;

  // Tipo de documento (solo nos interesan adjudicaciones: TD=7)
  const tdCode = get(codifData, 'TD_DOCUMENT_TYPE', '@_CODE');

  // Tipo de contrato
  const ncCode = get(codifData, 'NC_CONTRACT_NATURE', '@_CODE');
  const tipo = mapearTipoContrato(ncCode);

  // Procedimiento
  const prCode = get(codifData, 'PR_PROC', '@_CODE');
  const procedimiento = mapearProcedimiento(prCode);

  // Valores
  const valuesNode = get(noticeData, 'VALUES');
  let importeTotal = null;
  if (valuesNode) {
    const values = Array.isArray(valuesNode) ? valuesNode : [valuesNode];
    for (const v of values) {
      const valueNodes = get(v, 'VALUE') || [];
      const vals = Array.isArray(valueNodes) ? valueNodes : [valueNodes];
      for (const val of vals) {
        const type = val?.['@_TYPE'];
        const currency = val?.['@_CURRENCY'];
        const amount = parseFloat(texto(val));
        if (!isNaN(amount) && currency === 'EUR') {
          if (type === 'PROCUREMENT_TOTAL' || type === 'CONTRACT_TOTAL') {
            importeTotal = amount;
          }
        }
      }
    }
  }

  // Fecha de publicación
  const fechaPub = texto(get(get(codedData, 'REF_OJS'), 'DATE_PUB'));
  let fechaPublicacion = null;
  if (fechaPub && fechaPub.length === 8) {
    fechaPublicacion = `${fechaPub.substring(0, 4)}-${fechaPub.substring(4, 6)}-${fechaPub.substring(6, 8)}`;
  }

  // Fecha de envío
  const fechaDispatch = texto(get(codifData, 'DS_DATE_DISPATCH'));
  let fechaAdjudicacion = null;
  if (fechaDispatch && fechaDispatch.length === 8) {
    fechaAdjudicacion = `${fechaDispatch.substring(0, 4)}-${fechaDispatch.substring(4, 6)}-${fechaDispatch.substring(6, 8)}`;
  }

  // Extraer datos del formulario (FORM_SECTION)
  const formSection = get(tedExport, 'FORM_SECTION');
  let organismo = null;
  let objeto = null;
  let adjudicatario = null;
  let numOfertas = null;
  let criteriosAdjudicacion = null;

  if (formSection) {
    // Buscar el formulario principal (puede ser F02, F03, F06, CONTRACT_AWARD, etc.)
    const form = findForm(formSection);

    if (form) {
      // Organismo contratante — buscar en múltiples rutas posibles
      const ca = get(form, 'CONTRACTING_BODY')
        || get(form, 'CONTRACTING_AUTHORITY')
        || get(form, 'AUTHORITY_PRIOR_INFORMATION')
        || get(form, 'AUTHORITY_CONTRACT_UTILITIES')
        || get(form, 'AUTHORITY_CONTRACT');
      organismo = extraerNombreOrganismo(ca);

      // Fallback: buscar OFFICIALNAME recursivamente en el formulario
      if (!organismo) {
        organismo = buscarOfficialName(form);
      }

      // Objeto del contrato
      const objectContract = get(form, 'OBJECT_CONTRACT');
      if (objectContract) {
        const oc = Array.isArray(objectContract) ? objectContract[0] : objectContract;
        const title = get(oc, 'TITLE');
        objeto = textoParrafos(get(title, 'P')) || textoParrafos(title);

        // Short description como fallback
        if (!objeto) {
          const shortDescr = get(oc, 'SHORT_DESCR');
          if (shortDescr) {
            const sd = Array.isArray(shortDescr) ? shortDescr[0] : shortDescr;
            objeto = textoParrafos(get(sd, 'P')) || textoParrafos(sd);
          }
        }
      }

      // Criterios de adjudicación (nuevo — Fase 5c)
      criteriosAdjudicacion = extraerCriteriosAdjudicacion(form, codifData);

      // Adjudicación (si es un contract award notice)
      const awardContracts = get(form, 'AWARD_CONTRACT');
      if (awardContracts) {
        const awards = Array.isArray(awardContracts) ? awardContracts : [awardContracts];
        const firstAward = awards[0];

        // Número de ofertas
        const nbTenders = get(firstAward, 'AWARDED_CONTRACT');
        if (nbTenders) {
          const ac = Array.isArray(nbTenders) ? nbTenders[0] : nbTenders;
          const nb = get(ac, 'NB_TENDERS_RECEIVED');
          if (nb != null) numOfertas = parseInt(texto(nb)) || null;

          // Adjudicatario
          const contractors = get(ac, 'CONTRACTOR') || get(ac, 'CONTRACTORS');
          if (contractors) {
            const contractorList = Array.isArray(contractors) ? contractors : [contractors];
            const firstContractor = contractorList[0];
            const addr = get(firstContractor, 'ADDRESS_CONTRACTOR');
            const addrObj = Array.isArray(addr) ? addr[0] : addr;
            adjudicatario = texto(get(addrObj, 'OFFICIALNAME')) || texto(get(firstContractor, 'OFFICIALNAME'));
          }

          // Importe de adjudicación (más preciso que el de CODED_DATA)
          const valTotal = get(ac, 'VALUES', 'VALUE');
          if (valTotal) {
            const vt = Array.isArray(valTotal) ? valTotal[0] : valTotal;
            const amount = parseFloat(texto(vt));
            if (!isNaN(amount)) importeTotal = amount;
          }
          const valElement = get(ac, 'VAL_TOTAL');
          if (valElement) {
            const amount = parseFloat(texto(valElement));
            if (!isNaN(amount)) importeTotal = amount;
          }
        }
      }
    }
  }

  // URL del notice en TED
  const urlOrigen = `https://ted.europa.eu/es/notice/${publicationNumber}/html`;

  // Referencia al expediente nacional (si existe)
  const refNotice = get(noticeData, 'REF_NOTICE', 'NO_DOC_OJS');
  const expedienteRef = refNotice
    ? (Array.isArray(refNotice) ? texto(refNotice[0]) : texto(refNotice))
    : null;

  return {
    expediente: expedienteRef || publicationNumber,
    objeto: objeto || `Contrato TED ${publicationNumber}`,
    estado: tdCode === '7' ? 'ADJ' : 'PUB',
    tipo_code: ncCode,
    procedimiento_code: prCode,
    organismo,
    importe_sin_iva: importeTotal,
    importe_total: importeTotal,
    adjudicatario,
    fecha_publicacion: fechaPublicacion,
    fecha_adjudicacion: fechaAdjudicacion,
    nuts_code: nutsCodes[0] || 'ES300',
    url_origen: urlOrigen,
    fuente: 'ted_ue',
    // Campos enriquecidos exclusivos de TED
    ted_publication_number: publicationNumber,
    num_ofertas: numOfertas,
    criterios_adjudicacion: criteriosAdjudicacion,
    tipo_documento_ted: tdCode,
  };
}

/**
 * Busca el formulario principal dentro de FORM_SECTION.
 * TED usa diferentes formularios: F02 (contract notice), F03 (contract award),
 * F06 (corrigendum), etc.
 */
function findForm(formSection) {
  // Prioridad: F03 (award) > F06 > F02 (notice) > formularios legacy > cualquier otro
  const formNames = ['F03_2014', 'CONTRACT_AWARD_NOTICE', 'F03',
                     'F06_2014', 'F06',
                     'F02_2014', 'CONTRACT_NOTICE', 'F02',
                     'F01_2014', 'F01',
                     'F05_2014', 'F05',
                     'F21_2014', 'F21',
                     'F25_2014', 'F25',
                     // Formularios legacy (pre-2014) — nivel directo
                     'FD_CONTRACT_AWARD', 'FD_OTH_NOT',
                     'FD_PRIOR_INFORMATION', 'FD_CONTRACT',
                     'FD_UTILITIES_CONTRACT', 'FD_UTILITIES_CONTRACT_AWARD'];

  // Buscar directamente en FORM_SECTION
  for (const name of formNames) {
    if (formSection[name]) return formSection[name];
  }

  // Buscar dentro de wrappers (PRIOR_INFORMATION, CONTRACT_AWARD, etc.)
  // TED legacy usa: FORM_SECTION > PRIOR_INFORMATION > FD_PRIOR_INFORMATION
  const wrapperNames = ['PRIOR_INFORMATION', 'CONTRACT_AWARD', 'CONTRACT',
                        'UTILITIES_CONTRACT', 'UTILITIES_CONTRACT_AWARD',
                        'OTH_NOT', 'DESIGN_CONTEST'];
  for (const wrapper of wrapperNames) {
    if (formSection[wrapper] && typeof formSection[wrapper] === 'object') {
      // Buscar formularios dentro del wrapper
      for (const name of formNames) {
        if (formSection[wrapper][name]) return formSection[wrapper][name];
      }
      // Si el wrapper mismo tiene datos útiles, devolverlo
      if (formSection[wrapper].CONTRACTING_BODY || formSection[wrapper].OBJECT_CONTRACT
          || formSection[wrapper].AUTHORITY_PRIOR_INFORMATION) {
        return formSection[wrapper];
      }
    }
  }

  // Fallback: buscar cualquier clave que empiece con F
  for (const key of Object.keys(formSection)) {
    if (key.startsWith('F') && typeof formSection[key] === 'object') {
      return formSection[key];
    }
  }

  return null;
}

/**
 * Extrae el nombre del organismo contratante.
 * Busca en múltiples rutas posibles según el tipo de formulario TED.
 */
function extraerNombreOrganismo(ca) {
  if (!ca) return null;

  // Intentar varias rutas posibles (formularios 2014 y legacy)
  const nombre = texto(get(ca, 'ADDRESS_CONTRACTING_BODY', 'OFFICIALNAME'))
    || texto(get(ca, 'ADDRESS_CONTRACTING_BODY_ADDITIONAL', 'OFFICIALNAME'))
    || texto(get(ca, 'OFFICIALNAME'))
    || texto(get(ca, 'CA_ACTIVITY', 'OFFICIALNAME'))
    // Formularios legacy (prior information, etc.)
    || texto(get(ca, 'NAME_ADDRESSES_CONTACT_PRIOR_INFORMATION', 'CA_CE_CONCESSIONAIRE_PROFILE', 'ORGANISATION', 'OFFICIALNAME'))
    || texto(get(ca, 'NAME_ADDRESSES_CONTACT_CONTRACT', 'CA_CE_CONCESSIONAIRE_PROFILE', 'ORGANISATION', 'OFFICIALNAME'))
    || texto(get(ca, 'NAME_ADDRESSES_CONTACT_CONTRACT_AWARD', 'CA_CE_CONCESSIONAIRE_PROFILE', 'ORGANISATION', 'OFFICIALNAME'))
    // Rutas genéricas
    || texto(get(ca, 'CA_CE_CONCESSIONAIRE_PROFILE', 'ORGANISATION', 'OFFICIALNAME'))
    || texto(get(ca, 'ORGANISATION', 'OFFICIALNAME'));

  return nombre;
}

/**
 * Busca recursivamente el primer OFFICIALNAME en un objeto.
 * Fallback cuando las rutas conocidas no funcionan.
 * @param {object} obj - Objeto a buscar
 * @param {number} depth - Profundidad máxima de búsqueda
 * @returns {string|null}
 */
function buscarOfficialName(obj, depth = 6) {
  if (!obj || typeof obj !== 'object' || depth <= 0) return null;

  // Buscar directamente
  if (obj.OFFICIALNAME) {
    const result = texto(obj.OFFICIALNAME);
    if (result) return result;
  }

  // Buscar en hijos
  for (const key of Object.keys(obj)) {
    if (key.startsWith('@_')) continue; // Saltar atributos XML
    const child = obj[key];
    if (child && typeof child === 'object') {
      const result = buscarOfficialName(child, depth - 1);
      if (result) return result;
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🇪🇺 ContratosCAM — Parseo de XMLs de TED');
  console.log('═'.repeat(60));

  // Verificar que existe el directorio
  if (!fs.existsSync(RAW_DIR)) {
    console.error('❌ No se encontró el directorio data/raw/ted/');
    console.error('   Ejecuta primero: node scripts/download-ted.js');
    process.exit(1);
  }

  // Buscar archivos XML de TED
  const archivos = fs.readdirSync(RAW_DIR)
    .filter(f => f.startsWith('ted-') && f.endsWith('.xml'))
    .sort();

  if (archivos.length === 0) {
    console.error('❌ No se encontraron archivos ted-*.xml en data/raw/ted/');
    console.error('   Ejecuta primero: node scripts/download-ted.js');
    process.exit(1);
  }

  console.log(`📁 Archivos XML encontrados: ${archivos.length}`);
  console.log('');

  const contratos = [];
  let parseados = 0;
  let filtrados = 0; // No son de Madrid
  let errores = 0;

  for (const archivo of archivos) {
    const pubNumber = archivo.replace('ted-', '').replace('.xml', '');
    const ruta = path.join(RAW_DIR, archivo);

    try {
      const contenido = fs.readFileSync(ruta, 'utf-8');
      const parsed = parser.parse(contenido);
      const contrato = extraerContratoTED(parsed, pubNumber);

      if (contrato) {
        contratos.push(contrato);
        parseados++;
      } else {
        filtrados++;
      }
    } catch (err) {
      errores++;
      if (errores <= 5) {
        console.error(`  ❌ Error parseando ${archivo}: ${err.message}`);
      }
    }
  }

  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE PARSEO TED');
  console.log('─'.repeat(60));
  console.log(`  📄 Archivos procesados: ${archivos.length}`);
  console.log(`  ✅ Contratos de Madrid parseados: ${parseados}`);
  console.log(`  🚫 Filtrados (no Madrid): ${filtrados}`);
  console.log(`  ❌ Errores: ${errores}`);
  console.log('─'.repeat(60));

  // Guardar JSON intermedio
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(contratos, null, 2), 'utf-8');
  const tamano = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);
  console.log(`\n💾 Guardado: parsed-ted.json (${tamano} KB)`);
  console.log(`   ${contratos.length} contratos TED de la Comunidad de Madrid`);

  // Estadísticas
  if (contratos.length > 0) {
    const conAdjudicatario = contratos.filter(c => c.adjudicatario).length;
    const conOfertas = contratos.filter(c => c.num_ofertas).length;
    const conImporte = contratos.filter(c => c.importe_total).length;
    const conCriterios = contratos.filter(c => c.criterios_adjudicacion).length;
    console.log(`\n📈 Estadísticas:`);
    console.log(`   Con adjudicatario: ${conAdjudicatario} (${(conAdjudicatario / contratos.length * 100).toFixed(0)}%)`);
    console.log(`   Con num_ofertas: ${conOfertas} (${(conOfertas / contratos.length * 100).toFixed(0)}%)`);
    console.log(`   Con importe: ${conImporte} (${(conImporte / contratos.length * 100).toFixed(0)}%)`);
    console.log(`   Con criterios_adjudicacion: ${conCriterios} (${(conCriterios / contratos.length * 100).toFixed(0)}%)`);
  }

  console.log('\n✅ Parseo TED completado.');
  console.log('💡 Siguiente paso: npm run transform');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

/**
 * scripts/download-ted.js
 *
 * Descarga datos de contratos de la Comunidad de Madrid desde
 * TED (Tenders Electronic Daily) — el diario oficial de licitaciones de la UE.
 *
 * Los contratos que superan los umbrales europeos (~221.000€ servicios,
 * ~5,5M€ obras) se publican obligatoriamente en TED.
 *
 * Estrategia:
 * 1. Buscar notices de España con buyer-city=Madrid via API v3
 * 2. Descargar el XML de cada notice
 * 3. Guardar los XMLs en data/raw/ted/
 *
 * API: POST https://api.ted.europa.eu/v3/notices/search
 * Docs: https://docs.ted.europa.eu
 *
 * Uso: node scripts/download-ted.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '../data/raw/ted');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Timeout máximo por petición (ms) */
const TIMEOUT_MS = 30_000;

/** Pausa entre descargas de XMLs individuales (ms) */
const DELAY_ENTRE_DESCARGAS_MS = 1_000;

/** Pausa entre páginas de búsqueda (ms) */
const DELAY_ENTRE_PAGINAS_MS = 2_000;

/** Número máximo de páginas de búsqueda */
const MAX_PAGINAS = 20;

/** Resultados por página de búsqueda */
const RESULTADOS_POR_PAGINA = 100;

/** User-Agent identificativo del proyecto */
const USER_AGENT = 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM)';

// ─────────────────────────────────────────────────────────────────────────────
// API de TED
// ─────────────────────────────────────────────────────────────────────────────

const TED_SEARCH_URL = 'https://api.ted.europa.eu/v3/notices/search';

/**
 * Query de búsqueda para TED.
 * - buyer-country=ESP: contratos de España
 * - buyer-city=Madrid: compradores en Madrid (incluye CAM y Ayuntamiento)
 *
 * Nota: No existe un campo "buyer-nuts-code" en la API v3.
 * El filtrado fino por NUTS ES300 se hace en el parser al leer el XML.
 */
const SEARCH_QUERY = 'buyer-country=ESP AND buyer-city=Madrid';

/**
 * Campos que pedimos en la búsqueda (solo para que la API acepte la petición).
 * Los datos reales se extraen del XML de cada notice.
 */
const SEARCH_FIELDS = ['BT-01-notice'];

// ─────────────────────────────────────────────────────────────────────────────
// Funciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pausa la ejecución durante un tiempo determinado.
 * @param {number} ms - Milisegundos de espera
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Busca notices en la API de TED.
 * @param {number} page - Número de página (1-based)
 * @returns {Promise<{notices: Array<{publication-number: string, links: object}>}>}
 */
async function buscarNotices(page) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(TED_SEARCH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({
        query: SEARCH_QUERY,
        fields: SEARCH_FIELDS,
        limit: RESULTADOS_POR_PAGINA,
        page: page,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Descarga el XML de un notice de TED.
 * @param {string} publicationNumber - Número de publicación (ej: "239313-2016")
 * @param {string} xmlUrl - URL del XML
 * @returns {Promise<string>} Contenido XML
 */
async function descargarNoticeXml(publicationNumber, xmlUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(xmlUrl, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} descargando ${publicationNumber}`);
    }

    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Función principal: busca y descarga notices de TED para la CAM.
 */
async function main() {
  console.log('🇪🇺 ContratosCAM — Descarga de datos de TED (UE)');
  console.log('═'.repeat(60));
  console.log(`📡 API: ${TED_SEARCH_URL}`);
  console.log(`🔍 Query: ${SEARCH_QUERY}`);
  console.log(`📑 Máximo de páginas: ${MAX_PAGINAS} (${MAX_PAGINAS * RESULTADOS_POR_PAGINA} notices max)`);
  console.log('');

  // Crear directorio si no existe
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }

  // Fase 1: Buscar todos los publication-numbers
  console.log('📋 Fase 1: Buscando notices en TED...');
  console.log('─'.repeat(60));

  const todosLosNotices = [];
  let pagina = 1;
  let hayMasResultados = true;

  while (hayMasResultados && pagina <= MAX_PAGINAS) {
    console.log(`  📥 Página ${pagina}/${MAX_PAGINAS}...`);

    try {
      const resultado = await buscarNotices(pagina);
      const notices = resultado.notices || [];

      if (notices.length === 0) {
        console.log(`  🏁 No hay más resultados`);
        hayMasResultados = false;
      } else {
        todosLosNotices.push(...notices);
        console.log(`  ✅ ${notices.length} notices encontrados (total: ${todosLosNotices.length})`);

        if (notices.length < RESULTADOS_POR_PAGINA) {
          hayMasResultados = false;
        }
      }
    } catch (error) {
      const msg = error.name === 'AbortError' ? `Timeout (>${TIMEOUT_MS / 1000}s)` : error.message;
      console.error(`  ❌ Error en búsqueda: ${msg}`);

      if (pagina === 1) {
        console.error('\n❌ Error en la primera página. Abortando.');
        process.exit(1);
      }
      break;
    }

    pagina++;

    if (hayMasResultados) {
      await esperar(DELAY_ENTRE_PAGINAS_MS);
    }
  }

  console.log(`\n📊 Total notices encontrados: ${todosLosNotices.length}`);

  if (todosLosNotices.length === 0) {
    console.log('⚠️  No se encontraron notices. Finalizando.');
    return;
  }

  // Fase 2: Descargar XMLs de cada notice
  console.log('\n📥 Fase 2: Descargando XMLs de notices...');
  console.log('─'.repeat(60));

  let descargados = 0;
  let omitidos = 0;
  let erroresDescarga = 0;

  for (const notice of todosLosNotices) {
    const pubNumber = notice['publication-number'];
    const xmlUrl = notice.links?.xml?.MUL;

    if (!xmlUrl) {
      console.log(`  ⚠️  ${pubNumber}: sin URL de XML`);
      erroresDescarga++;
      continue;
    }

    // Nombre del archivo: ted-{publication-number}.xml
    const nombreArchivo = `ted-${pubNumber}.xml`;
    const rutaDestino = path.join(RAW_DIR, nombreArchivo);

    // No volver a descargar si ya existe
    if (fs.existsSync(rutaDestino)) {
      omitidos++;
      continue;
    }

    try {
      const xml = await descargarNoticeXml(pubNumber, xmlUrl);

      // Validación básica
      if (!xml.includes('<TED_EXPORT') && !xml.includes('<?xml')) {
        throw new Error('Respuesta no parece XML válido');
      }

      fs.writeFileSync(rutaDestino, xml, 'utf-8');
      descargados++;

      if (descargados % 50 === 0) {
        console.log(`  📊 Progreso: ${descargados} descargados, ${omitidos} omitidos, ${erroresDescarga} errores`);
      }
    } catch (error) {
      erroresDescarga++;
      if (erroresDescarga <= 5) {
        console.error(`  ❌ ${pubNumber}: ${error.message}`);
      }
    }

    // Pausa entre descargas
    if (descargados % 10 === 0) {
      await esperar(DELAY_ENTRE_DESCARGAS_MS);
    }
  }

  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE DESCARGA TED');
  console.log('─'.repeat(60));
  console.log(`  🔍 Notices encontrados: ${todosLosNotices.length}`);
  console.log(`  📥 XMLs descargados: ${descargados}`);
  console.log(`  ⏭️  Omitidos (ya existían): ${omitidos}`);
  console.log(`  ❌ Errores: ${erroresDescarga}`);
  console.log(`  📁 Directorio: ${RAW_DIR}`);
  console.log('═'.repeat(60));

  console.log('\n✅ Descarga TED completada.');
  console.log('💡 Siguiente paso: npm run parse');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

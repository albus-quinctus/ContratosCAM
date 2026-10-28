/**
 * scripts/download.js
 *
 * Descarga los datos de contratos de la Comunidad de Madrid
 * desde la Plataforma de Contratación del Sector Público (PLACSP).
 *
 * Fuente: los feeds Atom paginados de lib/feeds-placsp.js (perfiles de
 * contratante y plataformas agregadas), cada uno en sus propios ficheros.
 * Los feeds contienen contratos de toda España; el filtrado por CAM se
 * realiza en el parseo (parse.js).
 *
 * Uso: node scripts/download.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EXTENSION_ATOM, FEEDS_HISTORICO, urlAtomSemanal } from './lib/feeds-placsp.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '../data/raw');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Timeout máximo por descarga (ms) */
const TIMEOUT_MS = 120_000;

/** Pausa entre descargas de páginas para no sobrecargar servidores (ms) */
const DELAY_ENTRE_PAGINAS_MS = 3_000;

/**
 * Número máximo de páginas a descargar de cada feed Atom.
 * - Modo normal (semanal): las `paginasSemanales` de cada feed (lib/feeds-placsp.js)
 * - Modo full (--full): 500 páginas (~225.000 licitaciones por feed)
 */
const MODO_FULL = process.argv.includes('--full');
const PAGINAS_FULL = 500;

/** User-Agent identificativo del proyecto */
const USER_AGENT = 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM)';

// ─────────────────────────────────────────────────────────────────────────────
// Funciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descarga un archivo desde una URL con timeout y validación.
 * @param {string} url - URL del archivo a descargar
 * @param {string} destino - Ruta local donde guardar el archivo
 * @returns {Promise<{bytes: number, contenido: string}>} Bytes descargados y contenido
 */
async function descargarArchivo(url, destino) {
  console.log(`  ↓ Descargando: ${url.substring(0, 100)}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const contenido = await response.text();

    // Validación básica: verificar que no es una página de error HTML
    if (contenido.length < 200 && contenido.includes('<html')) {
      throw new Error('La respuesta parece una página de error HTML, no un archivo de datos');
    }

    // Verificar que es XML/Atom válido (debe empezar con <?xml o <feed)
    const trimmed = contenido.trimStart();
    if (!trimmed.startsWith('<?xml') && !trimmed.startsWith('<feed')) {
      throw new Error('La respuesta no parece ser un feed Atom válido');
    }

    fs.writeFileSync(destino, contenido, 'utf-8');

    const kb = (contenido.length / 1024).toFixed(1);
    console.log(`  ✅ Guardado: ${path.basename(destino)} (${kb} KB)`);

    return { bytes: contenido.length, contenido };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extrae la URL de la siguiente página del feed Atom.
 * Busca <link rel="next" href="..."/> en cualquier orden de atributos.
 * @param {string} xml - Contenido XML del feed
 * @returns {string|null} URL de la siguiente página o null si no hay más
 */
function extraerUrlSiguientePagina(xml) {
  // Buscar cualquier <link> que contenga rel="next" y extraer su href
  const regex = /<link\s+[^>]*rel=["']next["'][^>]*>/i;
  const linkMatch = xml.match(regex);
  if (!linkMatch) return null;

  const hrefRegex = /href=["']([^"']+)["']/i;
  const hrefMatch = linkMatch[0].match(hrefRegex);
  return hrefMatch ? hrefMatch[1] : null;
}

/**
 * Cuenta el número de entradas (<entry>) en un feed Atom.
 * @param {string} xml - Contenido XML del feed
 * @returns {number}
 */
function contarEntradas(xml) {
  const matches = xml.match(/<entry>/gi);
  return matches ? matches.length : 0;
}

/**
 * Pausa la ejecución durante un tiempo determinado.
 * @param {number} ms - Milisegundos de espera
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Descarga el feed Atom paginado de un feed de PLACSP.
 *
 * Estrategia:
 * 1. Descarga la primera página del feed (las licitaciones más recientes)
 * 2. Sigue los enlaces <link rel="next"> para obtener más páginas
 * 3. Se detiene cuando no hay más páginas o se alcanza el máximo de páginas
 * 4. Guarda cada página como un archivo separado en data/raw/
 *
 * @param {object} feed - Elemento de FEEDS_HISTORICO
 * @param {string} fecha - Fecha de la descarga (AAAA-MM-DD), para el nombre de los ficheros
 * @returns {Promise<{archivos: string[], entradas: number, bytes: number}>}
 */
async function descargarFeed(feed, fecha) {
  const maxPaginas = MODO_FULL ? PAGINAS_FULL : feed.paginasSemanales;

  console.log(`\n📡 Feed ${feed.clave}: ${feed.descripcion}`);
  console.log(`📑 Máximo de páginas: ${maxPaginas}`);

  let totalBytes = 0;
  let totalEntradas = 0;
  let paginaActual = 1;
  let urlActual = urlAtomSemanal(feed);
  const archivosDescargados = [];

  while (urlActual && paginaActual <= maxPaginas) {
    console.log(`\n📥 ${feed.clave}: página ${paginaActual}/${maxPaginas}`);

    const nombreArchivo = `${feed.prefijoSemanal}-${fecha}-p${String(paginaActual).padStart(2, '0')}${EXTENSION_ATOM}`;
    const rutaDestino = path.join(RAW_DIR, nombreArchivo);

    // No volver a descargar si ya existe el archivo de hoy
    if (fs.existsSync(rutaDestino)) {
      const tamano = (fs.statSync(rutaDestino).size / 1024).toFixed(1);
      console.log(`  ⏭️  Ya existe: ${nombreArchivo} (${tamano} KB) — omitiendo`);

      // Leer para extraer el enlace next
      const contenidoExistente = fs.readFileSync(rutaDestino, 'utf-8');
      const entradas = contarEntradas(contenidoExistente);
      totalEntradas += entradas;
      totalBytes += contenidoExistente.length;
      archivosDescargados.push(nombreArchivo);

      urlActual = extraerUrlSiguientePagina(contenidoExistente);
      paginaActual++;
      continue;
    }

    try {
      const { bytes, contenido } = await descargarArchivo(urlActual, rutaDestino);
      totalBytes += bytes;
      archivosDescargados.push(nombreArchivo);

      const entradas = contarEntradas(contenido);
      totalEntradas += entradas;
      console.log(`  📊 Entradas en esta página: ${entradas}`);

      // Extraer URL de la siguiente página
      urlActual = extraerUrlSiguientePagina(contenido);

      if (urlActual) {
        console.log(`  ➡️  Siguiente página disponible`);
      } else {
        console.log(`  🏁 No hay más páginas`);
      }
    } catch (error) {
      const mensaje = error.name === 'AbortError'
        ? `Timeout (>${TIMEOUT_MS / 1000}s)`
        : error.message;
      console.error(`  ❌ Error: ${mensaje}`);

      // Si falla una página intermedia, no abortar todo
      if (paginaActual === 1) {
        console.error(`\n❌ Error en la primera página del feed ${feed.clave}. Abortando.`);
        process.exit(1);
      }
      console.error('  ⚠️  Continuando con las páginas ya descargadas.');
      break;
    }

    paginaActual++;

    // Pausa entre descargas (excepto la última)
    if (urlActual && paginaActual <= maxPaginas) {
      console.log(`  ⏳ Esperando ${DELAY_ENTRE_PAGINAS_MS / 1000}s antes de la siguiente página...`);
      await esperar(DELAY_ENTRE_PAGINAS_MS);
    }
  }

  return { archivos: archivosDescargados, entradas: totalEntradas, bytes: totalBytes };
}

/**
 * Función principal: descarga uno tras otro los feeds de PLACSP.
 */
async function main() {
  console.log('🔽 ContratosCAM — Descarga de datos de PLACSP');
  console.log('═'.repeat(60));
  console.log(`📡 Fuente: Plataforma de Contratación del Sector Público`);
  console.log(`📄 Feeds: ${FEEDS_HISTORICO.map(f => f.clave).join(', ')} (Atom v3)`);
  console.log(`📑 Modo: ${MODO_FULL ? 'FULL — descarga histórica completa' : 'normal — últimas semanas'}`);
  if (MODO_FULL) {
    console.log(`⚠️  Modo FULL: esto puede tardar 30-60 minutos por feed y descargar ~1-2 GB`);
  }

  // Crear directorio si no existe
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }

  const fecha = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const resultados = [];
  for (const feed of FEEDS_HISTORICO) {
    resultados.push({ feed, ...await descargarFeed(feed, fecha) });
  }

  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE DESCARGA');
  for (const { feed, archivos, entradas, bytes } of resultados) {
    console.log('─'.repeat(60));
    console.log(`  📡 Feed ${feed.clave}`);
    console.log(`  📄 Páginas descargadas: ${archivos.length}`);
    console.log(`  📝 Total de entradas (licitaciones): ${entradas}`);
    console.log(`  💾 Tamaño total: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
    console.log('  Archivos:');
    archivos.forEach(f => console.log(`    • ${f}`));
  }
  console.log('─'.repeat(60));
  console.log(`  📁 Directorio: ${RAW_DIR}`);
  console.log('═'.repeat(60));

  console.log('\n✅ Descarga completada.');
  console.log('💡 Siguiente paso: npm run parse');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

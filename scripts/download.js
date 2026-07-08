/**
 * scripts/download.js
 *
 * Descarga los datos de contratos de la Comunidad de Madrid
 * desde la Plataforma de Contratación del Sector Público (PLACSP).
 *
 * Fuente principal: Feed Atom paginado de licitaciones.
 * El feed contiene contratos de toda España; el filtrado por CAM
 * se realiza en la fase de transformación (transform.js).
 *
 * Uso: node scripts/download.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '../data/raw');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Timeout máximo por descarga (ms) */
const TIMEOUT_MS = 120_000;

/** Pausa entre descargas de páginas para no sobrecargar servidores (ms) */
const DELAY_ENTRE_PAGINAS_MS = 3_000;

/** Número máximo de páginas a descargar del feed Atom (seguridad anti-loop) */
const MAX_PAGINAS = 50;

/** User-Agent identificativo del proyecto */
const USER_AGENT = 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM)';

// ─────────────────────────────────────────────────────────────────────────────
// URLs de descarga
//
// Fuente: Plataforma de Contratación del Sector Público (PLACSP)
// https://contrataciondelestado.es
//
// El feed Atom v3 contiene licitaciones de todos los perfiles de contratante
// de España. Es paginado: cada página tiene un enlace <link rel="next">
// que apunta a la siguiente página.
//
// Documentación de sindicación PLACSP:
// https://contrataciondelestado.es/wps/portal/plataforma/es/Sindicacion
// ─────────────────────────────────────────────────────────────────────────────

const FEED_ATOM_URL = 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom';

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
 * Función principal: descarga el feed Atom paginado de PLACSP.
 *
 * Estrategia:
 * 1. Descarga la primera página del feed (las licitaciones más recientes)
 * 2. Sigue los enlaces <link rel="next"> para obtener más páginas
 * 3. Se detiene cuando no hay más páginas o se alcanza MAX_PAGINAS
 * 4. Guarda cada página como un archivo separado en data/raw/
 */
async function main() {
  console.log('🔽 ContratosCAM — Descarga de datos de PLACSP');
  console.log('═'.repeat(60));
  console.log(`📡 Fuente: Plataforma de Contratación del Sector Público`);
  console.log(`📄 Feed: licitacionesPerfilesContratanteCompleto3 (Atom v3)`);
  console.log(`📑 Máximo de páginas: ${MAX_PAGINAS}`);
  console.log('');

  // Crear directorio si no existe
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }

  const fecha = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let totalBytes = 0;
  let totalEntradas = 0;
  let paginaActual = 1;
  let urlActual = FEED_ATOM_URL;
  const archivosDescargados = [];

  while (urlActual && paginaActual <= MAX_PAGINAS) {
    console.log(`\n📥 Página ${paginaActual}/${MAX_PAGINAS}`);

    const nombreArchivo = `placsp-licitaciones-${fecha}-p${String(paginaActual).padStart(2, '0')}.atom`;
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
        console.error('\n❌ Error en la primera página. Abortando.');
        process.exit(1);
      }
      console.error('  ⚠️  Continuando con las páginas ya descargadas.');
      break;
    }

    paginaActual++;

    // Pausa entre descargas (excepto la última)
    if (urlActual && paginaActual <= MAX_PAGINAS) {
      console.log(`  ⏳ Esperando ${DELAY_ENTRE_PAGINAS_MS / 1000}s antes de la siguiente página...`);
      await esperar(DELAY_ENTRE_PAGINAS_MS);
    }
  }

  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE DESCARGA');
  console.log('─'.repeat(60));
  console.log(`  📄 Páginas descargadas: ${archivosDescargados.length}`);
  console.log(`  📝 Total de entradas (licitaciones): ${totalEntradas}`);
  console.log(`  💾 Tamaño total: ${(totalBytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  📁 Directorio: ${RAW_DIR}`);
  console.log('─'.repeat(60));
  console.log('  Archivos:');
  archivosDescargados.forEach(f => console.log(`    • ${f}`));
  console.log('═'.repeat(60));

  if (archivosDescargados.length === 0) {
    console.error('\n❌ No se descargó ningún archivo.');
    process.exit(1);
  }

  console.log('\n✅ Descarga completada.');
  console.log('💡 Siguiente paso: npm run parse');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

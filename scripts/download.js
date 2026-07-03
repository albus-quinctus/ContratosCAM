/**
 * scripts/download.js
 *
 * Descarga los datos de contratos de la Comunidad de Madrid
 * desde fuentes oficiales de datos abiertos.
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
const TIMEOUT_MS = 60_000;

/** Pausa entre descargas para no sobrecargar servidores (ms) */
const DELAY_ENTRE_DESCARGAS_MS = 2_000;

/** User-Agent identificativo del proyecto */
const USER_AGENT = 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM)';

// ─────────────────────────────────────────────────────────────────────────────
// URLs de descarga — Datos Abiertos de la Comunidad de Madrid
// Fuente: https://datos.comunidad.madrid/catalogo
//
// ⚠️ Las URLs de los portales de datos abiertos cambian con frecuencia.
//    Verificar periódicamente que siguen siendo válidas.
// ─────────────────────────────────────────────────────────────────────────────
const FUENTES = [
  {
    nombre: 'contratos-menores-cam',
    url: 'https://datos.comunidad.madrid/catalogo/dataset/b3d55e40-8263-4b09-9cf6-5e34ae2fb8c9/resource/75b28e6e-3b56-4e3f-8b5f-7e1e5e5c5e5e/download/contratos_menores.csv',
    formato: 'csv',
    descripcion: 'Contratos menores de la Comunidad de Madrid (datos abiertos)',
  },
  {
    nombre: 'licitaciones-cam',
    url: 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
    formato: 'atom',
    descripcion: 'Feed Atom de licitaciones PLACSP (toda España, filtrar por CAM)',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Funciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Descarga un archivo desde una URL con timeout y validación.
 * @param {string} url - URL del archivo a descargar
 * @param {string} destino - Ruta local donde guardar el archivo
 * @returns {Promise<number>} Bytes descargados
 */
async function descargarArchivo(url, destino) {
  console.log(`  ↓ Descargando: ${url}`);

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

    const contentType = response.headers.get('content-type') || '';
    const contenido = await response.text();

    // Validación básica: verificar que no es una página de error HTML
    if (contenido.length < 100 && contenido.includes('<html')) {
      throw new Error('La respuesta parece una página de error HTML, no un archivo de datos');
    }

    // Verificar que CSV tiene al menos una cabecera
    if (destino.endsWith('.csv') && !contenido.includes(';') && !contenido.includes(',')) {
      throw new Error('El archivo CSV no contiene separadores válidos');
    }

    fs.writeFileSync(destino, contenido, 'utf-8');

    const kb = (contenido.length / 1024).toFixed(1);
    console.log(`  ✅ Guardado: ${path.basename(destino)} (${kb} KB)`);

    return contenido.length;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pausa la ejecución durante un tiempo determinado.
 * @param {number} ms - Milisegundos de espera
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Función principal
 */
async function main() {
  console.log('🔽 ContratosCAM — Descarga de datos');
  console.log('═'.repeat(50));

  // Crear directorio si no existe
  if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
  }

  const fecha = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  let totalBytes = 0;
  const fuentesConError = [];

  for (let i = 0; i < FUENTES.length; i++) {
    const fuente = FUENTES[i];
    console.log(`\n📥 [${i + 1}/${FUENTES.length}] ${fuente.nombre}`);
    console.log(`   ${fuente.descripcion}`);

    const nombreArchivo = `${fuente.nombre}-${fecha}.${fuente.formato}`;
    const rutaDestino = path.join(RAW_DIR, nombreArchivo);

    // No volver a descargar si ya existe el archivo de hoy
    if (fs.existsSync(rutaDestino)) {
      const tamano = (fs.statSync(rutaDestino).size / 1024).toFixed(1);
      console.log(`  ⏭️  Ya existe: ${nombreArchivo} (${tamano} KB) — omitiendo`);
      continue;
    }

    try {
      const bytes = await descargarArchivo(fuente.url, rutaDestino);
      totalBytes += bytes;
    } catch (error) {
      const mensaje = error.name === 'AbortError'
        ? `Timeout (>${TIMEOUT_MS / 1000}s)`
        : error.message;
      console.error(`  ❌ Error: ${mensaje}`);
      fuentesConError.push(fuente.nombre);
    }

    // Pausa entre descargas (excepto la última)
    if (i < FUENTES.length - 1) {
      await esperar(DELAY_ENTRE_DESCARGAS_MS);
    }
  }

  console.log('\n' + '═'.repeat(50));
  if (fuentesConError.length > 0) {
    console.error(`❌ Fuentes con error: ${fuentesConError.join(', ')}`);
    console.error('   Verifica que las URLs siguen siendo válidas.');
    process.exit(1);
  }
  console.log(`✅ Descarga completada. Total: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`📁 Archivos en: ${RAW_DIR}`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

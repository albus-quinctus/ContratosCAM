/**
 * scripts/download.js
 *
 * Descarga los datos de contratos de la Comunidad de Madrid
 * desde la Plataforma de Contratación del Sector Público (PLACSP).
 *
 * Uso: node scripts/download.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAW_DIR = path.join(__dirname, '../data/raw');

// ─────────────────────────────────────────────────────────────────────────────
// URL de descarga de la Plataforma de Contratación del Estado
// Datos de licitaciones de la Comunidad de Madrid en formato CSV
// Fuente: https://contrataciondelestado.es/wps/portal/plataforma
// ─────────────────────────────────────────────────────────────────────────────
const FUENTES = [
  {
    nombre: 'contratos-cam',
    // Dataset de contratos menores y licitaciones de la CAM
    // NOTA: Actualiza esta URL con la descarga real del portal
    url: 'https://contrataciondelestado.es/sindicacion/sindicacion_643/licitacionesPerfilesContratanteCompleto3.atom',
    formato: 'atom',
  },
];

/**
 * Descarga un archivo desde una URL y lo guarda en disco.
 * @param {string} url - URL del archivo a descargar
 * @param {string} destino - Ruta local donde guardar el archivo
 */
async function descargarArchivo(url, destino) {
  console.log(`  ↓ Descargando: ${url}`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM)',
    },
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }

  const contenido = await response.text();
  fs.writeFileSync(destino, contenido, 'utf-8');

  const kb = (contenido.length / 1024).toFixed(1);
  console.log(`  ✅ Guardado: ${path.basename(destino)} (${kb} KB)`);

  return contenido.length;
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

  for (const fuente of FUENTES) {
    console.log(`\n📥 Fuente: ${fuente.nombre}`);

    const nombreArchivo = `${fuente.nombre}-${fecha}.${fuente.formato}`;
    const rutaDestino = path.join(RAW_DIR, nombreArchivo);

    // No volver a descargar si ya existe el archivo de hoy
    if (fs.existsSync(rutaDestino)) {
      console.log(`  ⏭️  Ya existe: ${nombreArchivo} — omitiendo`);
      continue;
    }

    try {
      const bytes = await descargarArchivo(fuente.url, rutaDestino);
      totalBytes += bytes;

      // Pequeña pausa para no sobrecargar el servidor
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  ❌ Error descargando ${fuente.nombre}: ${error.message}`);
      process.exit(1);
    }
  }

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Descarga completada. Total: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`📁 Archivos en: ${RAW_DIR}`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

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
// URLs de descarga — Datos Abiertos de la Comunidad de Madrid
// Fuente: https://datos.comunidad.madrid/catalogo
//
// Se usan los datasets CSV del portal de datos abiertos de la CAM,
// que contienen contratos menores y licitaciones adjudicadas.
// ─────────────────────────────────────────────────────────────────────────────
const FUENTES = [
  {
    nombre: 'contratos-menores-cam',
    // Contratos menores de la Comunidad de Madrid (datos abiertos)
    url: 'https://datos.comunidad.madrid/catalogo/dataset/b3d55e40-8263-4b09-9cf6-5e34ae2fb8c9/resource/75b28e6e-3b56-4e3f-8b5f-7e1e5e5c5e5e/download/contratos_menores.csv',
    formato: 'csv',
  },
  {
    nombre: 'licitaciones-cam',
    // Feed Atom de licitaciones de la CAM en PLACSP (filtrado por órgano de contratación CAM)
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
  const fuentesConError = [];

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
      // No salir inmediatamente: intentar las demás fuentes
      fuentesConError.push(fuente.nombre);
    }
  }

  console.log('\n' + '═'.repeat(50));
  if (fuentesConError.length > 0) {
    console.error(`❌ Fuentes con error: ${fuentesConError.join(', ')}`);
    process.exit(1);
  }
  console.log(`✅ Descarga completada. Total: ${(totalBytes / 1024).toFixed(1)} KB`);
  console.log(`📁 Archivos en: ${RAW_DIR}`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

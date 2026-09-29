/**
 * scripts/update-estados.js
 *
 * Actualiza el estado de contratos "en_licitacion" o "en_evaluacion"
 * que llevan más de 30 días sin actualización, consultando la ficha
 * web de PLACSP para obtener el estado actual.
 *
 * El script es idempotente: puede interrumpirse y reanudarse.
 * Respeta rate limits con delays entre peticiones.
 *
 * Entrada:  data/processed/contratos-normalizados.json
 * Salida:   data/processed/contratos-normalizados.json (actualizado in-place)
 *
 * Uso: node scripts/update-estados.js [--max=N] [--dias=N]
 *
 * Opciones:
 *   --max=N    Máximo de contratos a procesar (por defecto: sin límite)
 *   --dias=N   Antigüedad mínima en días para considerar actualización (por defecto: 30)
 *   --dry-run  Mostrar qué se actualizaría sin guardar cambios
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRATOS_FILE = path.join(__dirname, '../data/processed/contratos-normalizados.json');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Delay entre peticiones a PLACSP (ms) */
const DELAY_MS = 2_000;

/** Timeout por petición HTTP (ms) */
const TIMEOUT_MS = 15_000;

/** User-Agent identificativo del proyecto */
const USER_AGENT = 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM; transparencia ciudadana)';

/**
 * Mapeo de textos de estado encontrados en el HTML de PLACSP
 * a los valores normalizados del modelo de datos.
 */
const ESTADOS_HTML = {
  // Textos en español que aparecen en la ficha PLACSP
  'publicada':                'en_licitacion',
  'en plazo':                 'en_licitacion',
  'admisión de solicitudes':  'en_licitacion',
  'en evaluación':            'en_evaluacion',
  'evaluación':               'en_evaluacion',
  'pre-adjudicada':           'pre_adjudicado',
  'pre adjudicada':           'pre_adjudicado',
  'adjudicada':               'adjudicado',
  'adjudicado':               'adjudicado',
  'formalizada':              'formalizado',
  'formalizado':              'formalizado',
  'resuelta':                 'resuelto',
  'resuelto':                 'resuelto',
  'anulada':                  'anulado',
  'anulado':                  'anulado',
  'desistida':                'anulado',
  'desierta':                 'anulado',
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch con timeout y User-Agent.
 * @param {string} url
 * @returns {Promise<Response>}
 */
async function fetchConTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extrae el estado actual de la ficha HTML de PLACSP.
 * Busca patrones conocidos en el HTML de la página del contrato.
 *
 * @param {string} html - Contenido HTML de la ficha
 * @returns {string|null} Estado normalizado o null si no se detecta
 */
function extraerEstadoDeHTML(html) {
  const htmlLower = html.toLowerCase();

  // Buscar en elementos con clases típicas de estado en PLACSP
  // Patrones: "Estado: Adjudicada", "Estado del expediente: Resuelta", etc.
  const patronesEstado = [
    /estado[^:]*:\s*<[^>]*>([^<]+)</i,
    /estado[^:]*:\s*([a-záéíóúñ\s-]+?)(?:<|\n|$)/i,
    /class="[^"]*estado[^"]*"[^>]*>([^<]+)</i,
    /class="[^"]*status[^"]*"[^>]*>([^<]+)</i,
  ];

  for (const patron of patronesEstado) {
    const match = html.match(patron);
    if (match) {
      const textoEstado = match[1].trim().toLowerCase();
      for (const [clave, valor] of Object.entries(ESTADOS_HTML)) {
        if (textoEstado.includes(clave)) {
          return valor;
        }
      }
    }
  }

  // Búsqueda directa de palabras clave de estado en el HTML
  for (const [clave, valor] of Object.entries(ESTADOS_HTML)) {
    // Buscar la clave rodeada de contexto de "estado" (dentro de 200 chars)
    const posEstado = htmlLower.indexOf('estado');
    if (posEstado !== -1) {
      const contexto = htmlLower.substring(posEstado, posEstado + 300);
      if (contexto.includes(clave)) {
        return valor;
      }
    }
  }

  return null;
}

/**
 * Consulta la ficha web de PLACSP y extrae el estado actual del contrato.
 *
 * @param {string} url - URL de la ficha del contrato en PLACSP
 * @returns {Promise<string|null>} Estado normalizado o null si no se puede determinar
 */
async function obtenerEstadoActual(url) {
  if (!url || !url.startsWith('https://contrataciondelestado.es')) {
    return null;
  }

  try {
    const response = await fetchConTimeout(url);
    if (!response.ok) return null;

    const html = await response.text();
    return extraerEstadoDeHTML(html);
  } catch (error) {
    // Timeout, error de red, etc. — no es crítico
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 ContratosCAM — Actualización de estados');
  console.log('═'.repeat(60));

  // Parsear argumentos
  const args = process.argv.slice(2);
  const maxArg = args.find(a => a.startsWith('--max='));
  const diasArg = args.find(a => a.startsWith('--dias='));
  const dryRun = args.includes('--dry-run');

  const maxContratos = maxArg ? parseInt(maxArg.split('=')[1]) : Infinity;
  const diasMinimos = diasArg ? parseInt(diasArg.split('=')[1]) : 30;

  console.log(`📋 Configuración:`);
  console.log(`   Máximo contratos: ${maxContratos === Infinity ? 'sin límite' : maxContratos}`);
  console.log(`   Antigüedad mínima: ${diasMinimos} días`);
  console.log(`   Modo: ${dryRun ? 'DRY-RUN (sin guardar cambios)' : 'REAL (guardará cambios)'}`);
  console.log('');

  // Verificar que existe el archivo de contratos
  if (!fs.existsSync(CONTRATOS_FILE)) {
    console.error('❌ No se encontró contratos-normalizados.json');
    console.error('   Ejecuta primero: npm run transform');
    process.exit(1);
  }

  // Cargar contratos
  const contratos = JSON.parse(fs.readFileSync(CONTRATOS_FILE, 'utf-8'));
  console.log(`📥 Contratos cargados: ${contratos.length}`);

  // Fecha límite: contratos publicados hace más de N días
  const ahora = new Date();
  const fechaLimite = new Date(ahora.getTime() - diasMinimos * 24 * 60 * 60 * 1000);
  const fechaLimiteStr = fechaLimite.toISOString().split('T')[0];

  // Fecha límite para re-verificación: no volver a verificar si se verificó hace menos de 7 días
  const fechaReVerificacion = new Date(ahora.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fechaReVerificacionStr = fechaReVerificacion.toISOString().split('T')[0];

  // Seleccionar contratos candidatos a actualización
  const candidatos = contratos.filter(c => {
    // Solo contratos en estados "activos" (no terminales)
    const estadosActivos = ['en_licitacion', 'en_evaluacion', 'publicado', 'pre_adjudicado', 'pre_adjudicacion'];
    if (!estadosActivos.includes(c.estado)) return false;

    // Solo contratos con URL de origen (para poder consultar la ficha)
    if (!c.url_origen) return false;

    // Solo contratos con antigüedad suficiente
    if (!c.fecha_publicacion || c.fecha_publicacion > fechaLimiteStr) return false;

    // No re-verificar si se verificó recientemente
    if (c.estado_verificado_en && c.estado_verificado_en > fechaReVerificacionStr) return false;

    return true;
  });

  console.log(`🔍 Contratos candidatos a actualización: ${candidatos.length}`);
  console.log(`   (estado activo + publicados hace >${diasMinimos} días + no verificados recientemente)`);

  if (candidatos.length === 0) {
    console.log('\n✅ No hay contratos que necesiten actualización de estado.');
    return;
  }

  // Limitar el número de contratos a procesar
  const aActualizar = candidatos.slice(0, maxContratos);
  console.log(`\n🚀 Procesando ${aActualizar.length} contratos...`);
  console.log('─'.repeat(60));

  // Estadísticas
  let actualizados = 0;
  let sinCambio = 0;
  let noDetectado = 0;
  let errores = 0;
  const hoy = ahora.toISOString().split('T')[0];

  // Crear mapa de contratos por ID para actualización eficiente
  const mapaContratos = new Map(contratos.map(c => [c.id, c]));

  for (let i = 0; i < aActualizar.length; i++) {
    const contrato = aActualizar[i];

    // Progreso cada 20 contratos
    if (i > 0 && i % 20 === 0) {
      console.log(`  📊 Progreso: ${i}/${aActualizar.length} | Actualizados: ${actualizados} | Sin cambio: ${sinCambio} | No detectado: ${noDetectado}`);
    }

    const estadoAnterior = contrato.estado;

    try {
      await esperar(DELAY_MS);
      const estadoNuevo = await obtenerEstadoActual(contrato.url_origen);

      if (estadoNuevo === null) {
        // No se pudo detectar el estado — marcar como verificado igualmente
        noDetectado++;
        if (!dryRun) {
          const c = mapaContratos.get(contrato.id);
          if (c) c.estado_verificado_en = hoy;
        }
        continue;
      }

      if (estadoNuevo === estadoAnterior) {
        // Estado sin cambio — actualizar fecha de verificación
        sinCambio++;
        if (!dryRun) {
          const c = mapaContratos.get(contrato.id);
          if (c) c.estado_verificado_en = hoy;
        }
        continue;
      }

      // Estado cambió
      actualizados++;
      console.log(`  ✅ #${contrato.id} "${(contrato.objeto || '').substring(0, 50)}..."`);
      console.log(`     ${estadoAnterior} → ${estadoNuevo}`);

      if (!dryRun) {
        const c = mapaContratos.get(contrato.id);
        if (c) {
          c.estado = estadoNuevo;
          c.estado_verificado_en = hoy;
        }
      }
    } catch (error) {
      errores++;
      console.error(`  ❌ Error procesando #${contrato.id}: ${error.message}`);
    }
  }

  // ─── Guardar resultados ─────────────────────────────────────────────────
  if (!dryRun && (actualizados > 0 || sinCambio > 0 || noDetectado > 0)) {
    console.log('\n💾 Guardando contratos actualizados...');
    fs.writeFileSync(CONTRATOS_FILE, JSON.stringify(contratos, null, 2), 'utf-8');
    const tamano = (fs.statSync(CONTRATOS_FILE).size / 1024).toFixed(1);
    console.log(`   ✅ Guardado: contratos-normalizados.json (${tamano} KB)`);
  }

  // ─── Resumen ────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE ACTUALIZACIÓN DE ESTADOS');
  console.log('─'.repeat(60));
  console.log(`  🔍 Contratos procesados: ${aActualizar.length}`);
  console.log(`  ✅ Estados actualizados: ${actualizados}`);
  console.log(`  ➡️  Sin cambio de estado: ${sinCambio}`);
  console.log(`  ❓ Estado no detectado: ${noDetectado}`);
  console.log(`  ❌ Errores: ${errores}`);
  if (dryRun) {
    console.log('\n  ⚠️  Modo DRY-RUN: no se guardaron cambios');
  }
  console.log('═'.repeat(60));

  if (actualizados > 0) {
    console.log(`\n✅ ${actualizados} contratos actualizados correctamente.`);
  } else {
    console.log('\n✅ Verificación completada. No hubo cambios de estado.');
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

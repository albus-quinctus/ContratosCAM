/**
 * scripts/publicar-datos.js
 *
 * Publica la copia de trabajo de los contratos (data/trabajo/contratos/) en
 * data/processed/contratos/, que es lo que se sube a git y lee la web.
 *
 * Solo publica si `npm run validate` aprobó la copia de trabajo y no ha
 * cambiado después (ver lib/almacen-contratos.js).
 *
 * Uso:
 *   node scripts/publicar-datos.js              → publica la copia validada
 *   node scripts/publicar-datos.js --descartar  → descarta la copia de trabajo sin publicarla
 */

import { hayContratosEn, leerIndice, publicarTrabajo, descartarTrabajo, TRABAJO_DIR, PUBLICADO_DIR } from './lib/almacen-contratos.js';

function main() {
  console.log('📤 ContratosCAM — Publicar datos');
  console.log('═'.repeat(60));

  if (!hayContratosEn(TRABAJO_DIR)) {
    console.log('ℹ️  No hay cambios pendientes de publicar.');
    return;
  }

  if (process.argv.includes('--descartar')) {
    descartarTrabajo();
    console.log('🗑️  Copia de trabajo descartada. Lo publicado no ha cambiado.');
    return;
  }

  const antes = hayContratosEn(PUBLICADO_DIR) ? leerIndice(PUBLICADO_DIR).total : 0;
  publicarTrabajo();
  const despues = leerIndice(PUBLICADO_DIR).total;

  console.log(`✅ Publicado: ${despues} contratos (antes ${antes})`);
}

try {
  main();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

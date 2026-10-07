/**
 * scripts/publicar-datos.js
 *
 * Publica la copia de trabajo de los contratos (data/trabajo/contratos/) en
 * data/processed/contratos/, que es lo que se sube a git y lee la web.
 *
 * Solo publica si `npm run validate` aprobó la copia de trabajo y no ha
 * cambiado después (ver lib/almacen-contratos.js).
 *
 * Por defecto no escribe nada: muestra los cambios por año respecto a lo
 * publicado. Para publicar o descartar hay que repetir la orden con
 * --confirmar=N, donde N es el número exacto de contratos de la copia de trabajo.
 *
 * Uso:
 *   node scripts/publicar-datos.js                           → muestra qué se publicaría
 *   node scripts/publicar-datos.js --confirmar=N             → publica la copia validada
 *   node scripts/publicar-datos.js --descartar               → muestra qué se descartaría
 *   node scripts/publicar-datos.js --descartar --confirmar=N → descarta la copia de trabajo
 *
 * Opciones:
 *   --descartar     Descarta la copia de trabajo en lugar de publicarla
 *   --confirmar=N   Ejecuta la orden; N debe coincidir con los contratos de la copia de trabajo
 *   --dry-run       Solo muestra los cambios (es lo que se hace sin --confirmar)
 */

import {
  hayContratosEn, leerIndice, leerContratosDe, compararConPublicado, mostrarCambios,
  trabajoValidado, publicarTrabajo, descartarTrabajo, TRABAJO_DIR, PUBLICADO_DIR,
} from './lib/almacen-contratos.js';
import { opcion, leerConfirmacion, CONFIRMACION } from './lib/argumentos.js';

function main() {
  const args = process.argv.slice(2);
  const descartar = args.includes('--descartar');
  const accion = descartar ? 'descartar' : 'publicar';

  console.log('📤 ContratosCAM — Publicar datos');
  console.log('═'.repeat(60));

  if (!hayContratosEn(TRABAJO_DIR)) {
    console.log('ℹ️  No hay cambios pendientes de publicar.');
    return;
  }

  const trabajo = leerContratosDe(TRABAJO_DIR);
  const publicados = hayContratosEn(PUBLICADO_DIR) ? leerContratosDe(PUBLICADO_DIR) : [];
  mostrarCambios(compararConPublicado(publicados, trabajo).porAnio);
  console.log(`\n📊 Copia de trabajo: ${trabajo.length} contratos · Publicado: ${publicados.length} contratos`);

  if (!descartar && !trabajoValidado()) {
    console.error('\n❌ La copia de trabajo no está validada o ha cambiado después: ejecuta npm run validate');
    process.exit(1);
  }

  const confirmacion = leerConfirmacion(args, trabajo.length);
  const orden = `npm run ${accion} -- --confirmar=${trabajo.length}`;
  if (confirmacion === CONFIRMACION.SIMULAR) {
    console.log(`\n🔍 Sin cambios (simulación). Para ${accion} los ${trabajo.length} contratos: ${orden}`);
    return;
  }
  if (confirmacion === CONFIRMACION.NO_COINCIDE) {
    console.error(`\n❌ --confirmar=${opcion(args, 'confirmar')} no coincide con los ${trabajo.length} contratos de la copia de trabajo. No se ha hecho nada.`);
    process.exit(1);
  }

  if (descartar) {
    descartarTrabajo();
    console.log('🗑️  Copia de trabajo descartada. Lo publicado no ha cambiado.');
    return;
  }

  publicarTrabajo();
  console.log(`✅ Publicado: ${leerIndice(PUBLICADO_DIR).total} contratos (antes ${publicados.length})`);
}

try {
  main();
} catch (err) {
  console.error(`❌ ${err.message}`);
  process.exit(1);
}

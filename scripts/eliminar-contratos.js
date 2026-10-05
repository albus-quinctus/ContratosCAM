/**
 * scripts/eliminar-contratos.js
 *
 * Única forma de eliminar contratos del almacén. El pipeline normal nunca
 * borra (ver lib/integrar-lote.js) y validate.js rechaza cualquier contrato
 * que desaparezca sin pasar por aquí.
 *
 * Por defecto no escribe nada: muestra qué contratos se eliminarían. Para
 * eliminarlos hay que repetir la orden con --confirmar=N, donde N es el número
 * exacto de contratos que se van a eliminar. El borrado queda en la copia de
 * trabajo y en el registro de cargas; se publica con
 * npm run validate && npm run publicar.
 *
 * Uso:
 *   node scripts/eliminar-contratos.js --ids=ID1,ID2 --motivo="..."
 *   node scripts/eliminar-contratos.js --archivo=ids.txt --motivo="..." --confirmar=2
 *
 * Opciones:
 *   --ids=A,B       IDs de los contratos a eliminar, separados por comas
 *   --archivo=RUTA  Fichero con un ID por línea
 *   --motivo=TEXTO  Motivo del borrado (obligatorio, queda en el registro)
 *   --confirmar=N   Elimina de verdad; N debe coincidir con los contratos encontrados
 *   --dry-run       Solo muestra qué se eliminaría (es lo que se hace sin --confirmar)
 */

import fs from 'fs';
import { leerContratos, guardarContratos, autorizarEliminaciones, dirVigente, TIPO_CARGA } from './lib/almacen-contratos.js';

/**
 * Valor de una opción --nombre=valor, o null si no se ha pasado.
 * @param {string[]} args
 * @param {string} nombre
 * @returns {string|null}
 */
function opcion(args, nombre) {
  const arg = args.find(a => a.startsWith(`--${nombre}=`));
  return arg ? arg.substring(nombre.length + 3) : null;
}

/**
 * IDs pedidos por --ids y --archivo, sin repetir.
 * @param {string[]} args
 * @returns {string[]}
 */
function idsPedidos(args) {
  const deLista = (opcion(args, 'ids') || '').split(',');
  const rutaArchivo = opcion(args, 'archivo');
  const deArchivo = rutaArchivo ? fs.readFileSync(rutaArchivo, 'utf-8').split('\n') : [];
  return [...new Set([...deLista, ...deArchivo].map(id => id.trim()).filter(Boolean))];
}

function main() {
  const args = process.argv.slice(2);
  const ids = idsPedidos(args);
  const motivo = opcion(args, 'motivo');
  const confirmar = opcion(args, 'confirmar');
  const dryRun = args.includes('--dry-run') || confirmar === null;

  console.log('🗑️  ContratosCAM — Eliminar contratos');
  console.log('═'.repeat(60));

  if (ids.length === 0 || !motivo) {
    console.error('❌ Indica los contratos (--ids o --archivo) y el motivo (--motivo).');
    process.exit(1);
  }
  if (!dirVigente()) {
    console.error('❌ No hay contratos almacenados.');
    process.exit(1);
  }

  const contratos = leerContratos();
  const pedidos = new Set(ids);
  const aEliminar = contratos.filter(c => pedidos.has(c.id));
  const noEncontrados = ids.filter(id => !aEliminar.some(c => c.id === id));

  console.log(`📋 Pedidos: ${ids.length} · Encontrados: ${aEliminar.length} · Total almacenado: ${contratos.length}`);
  aEliminar.forEach(c => console.log(`   • ${c.id} ${c.fecha_publicacion || ''} ${c.expediente || ''} ${(c.objeto || '').substring(0, 60)}`));
  if (noEncontrados.length > 0) {
    console.log(`⚠️  No encontrados: ${noEncontrados.join(', ')}`);
  }

  if (dryRun) {
    console.log(`\n🔍 Sin cambios (simulación). Para eliminar ${aEliminar.length} contratos, repite con --confirmar=${aEliminar.length}`);
    return;
  }
  if (Number(confirmar) !== aEliminar.length) {
    console.error(`\n❌ --confirmar=${confirmar} no coincide con los ${aEliminar.length} contratos encontrados. No se ha eliminado nada.`);
    process.exit(1);
  }

  const restantes = contratos.filter(c => !pedidos.has(c.id));
  autorizarEliminaciones(aEliminar.map(c => c.id));
  guardarContratos(restantes, {
    tipo: TIPO_CARGA.ELIMINACION,
    fecha: new Date().toISOString(),
    motivo,
    eliminados: aEliminar.map(c => c.id),
  });

  console.log(`\n✅ Eliminados ${aEliminar.length} contratos de la copia de trabajo (quedan ${restantes.length}).`);
  console.log('💡 Para publicarlo: npm run validate && npm run publicar');
}

main();

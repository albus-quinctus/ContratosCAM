/**
 * scripts/lib/comprobaciones.js
 *
 * Utilidades compartidas por los scripts que comprueban el código del
 * proyecto (ejecutar-tests.js, comprobar-sintaxis.js): ejecutan Node sobre
 * una lista de ficheros y resumen cuáles han fallado.
 */

import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ = path.join(__dirname, '../..');

/**
 * Ejecuta `node <argsNode> <fichero>` para cada fichero, uno tras otro, y
 * sigue aunque alguno falle.
 * @param {string[]} ficheros - Rutas absolutas
 * @param {string[]} argsNode - Opciones de Node que van antes del fichero
 * @returns {string[]} Ficheros cuya ejecución ha terminado con error
 */
export function ejecutarCadaUno(ficheros, argsNode = []) {
  return ficheros.filter(fichero => {
    const { status } = spawnSync(process.execPath, [...argsNode, fichero], { stdio: 'inherit' });
    return status !== 0;
  });
}

/**
 * Muestra el resumen y termina con código 1 si algún fichero ha fallado.
 * @param {string} titulo - Qué se ha comprobado (p. ej. "suites de tests")
 * @param {number} total - Ficheros comprobados
 * @param {string[]} fallidos - Ficheros que han fallado
 */
export function terminarComprobacion(titulo, total, fallidos) {
  console.log('\n' + '═'.repeat(60));
  console.log(`📊 ${titulo}: ${total - fallidos.length}/${total} sin errores`);
  if (fallidos.length > 0) {
    fallidos.forEach(f => console.log(`   ❌ ${path.relative(RAIZ, f)}`));
    process.exit(1);
  }
  console.log('✅ Todo correcto');
}

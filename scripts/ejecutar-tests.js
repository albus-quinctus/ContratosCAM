/**
 * scripts/ejecutar-tests.js
 *
 * Ejecuta todas las suites de tests del proyecto (scripts/_qa-*.js), sin
 * tener que listarlas a mano: una suite nueva entra sola en npm test.
 *
 * Ejecuta todas aunque falle alguna y termina con código 1 si ha fallado
 * cualquiera.
 *
 * Uso: node scripts/ejecutar-tests.js
 */

import fs from 'fs';
import path from 'path';
import { RAIZ, ejecutarCadaUno, terminarComprobacion } from './lib/comprobaciones.js';

const SCRIPTS_DIR = path.join(RAIZ, 'scripts');
const PREFIJO_SUITE = '_qa-';
const EXTENSION_SUITE = '.js';

const suites = fs.readdirSync(SCRIPTS_DIR)
  .filter(f => f.startsWith(PREFIJO_SUITE) && f.endsWith(EXTENSION_SUITE))
  .sort()
  .map(f => path.join(SCRIPTS_DIR, f));

console.log(`🧪 ContratosCAM — Tests (${suites.length} suites)`);
const fallidas = ejecutarCadaUno(suites);
terminarComprobacion('Suites de tests', suites.length, fallidas);

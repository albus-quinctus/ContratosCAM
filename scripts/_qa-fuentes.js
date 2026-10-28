/**
 * scripts/_qa-fuentes.js
 *
 * Suite de tests de los identificadores de fuente (scripts/lib/fuentes.js).
 *
 * El frontend no puede importar los módulos de scripts/lib, así que guarda
 * su propia copia de los identificadores que usa. Esta suite comprueba que
 * esas copias coinciden con FUENTE, para que no se desincronicen.
 *
 * Uso: node scripts/_qa-fuentes.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { FUENTE } from './lib/fuentes.js';
import { assert, terminar } from './lib/qa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_JS = path.join(__dirname, '../src/web/js/app.js');

/** Copias de FUENTE en el frontend: constante de app.js y su valor en FUENTE */
const COPIAS_FRONTEND = Object.freeze([
  { constante: 'FUENTE_TED', esperado: FUENTE.TED },
]);

/**
 * Valor de una constante de texto declarada en el código fuente.
 * @param {string} codigo
 * @param {string} constante
 * @returns {string|null} El valor, o null si no está declarada
 */
function valorConstante(codigo, constante) {
  const declaracion = codigo.match(new RegExp(`const ${constante} = '([^']*)';`));
  return declaracion ? declaracion[1] : null;
}

console.log('🧪 Identificadores de fuente en el frontend (src/web/js/app.js)');
const codigoApp = fs.readFileSync(APP_JS, 'utf-8');
for (const { constante, esperado } of COPIAS_FRONTEND) {
  assert(`${constante} coincide con FUENTE`, valorConstante(codigoApp, constante), esperado);
}

terminar();

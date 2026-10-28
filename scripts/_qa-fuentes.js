/**
 * scripts/_qa-fuentes.js
 *
 * Suite de tests de los identificadores de fuente (scripts/lib/fuentes.js).
 *
 * El frontend no puede importar los módulos de scripts/lib, así que guarda
 * su propia copia de los identificadores que usa. Esta suite comprueba que
 * esas copias coinciden con FUENTE, para que no se desincronicen.
 *
 * También comprueba que meta.json, que escribe import-db.js, lista las fuentes
 * que hay en los contratos. Ejecuta import-db de verdad sobre una copia de los
 * scripts en una carpeta temporal, con datos de prueba.
 *
 * Uso: node scripts/_qa-fuentes.js
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { FUENTE } from './lib/fuentes.js';
import { assert, assertDeep, terminar } from './lib/qa.js';

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

console.log('\n📋 Tests: identificadores de fuente en el frontend (src/web/js/app.js)');
const codigoApp = fs.readFileSync(APP_JS, 'utf-8');
for (const { constante, esperado } of COPIAS_FRONTEND) {
  assert(`${constante} coincide con FUENTE`, valorConstante(codigoApp, constante), esperado);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: fuentes en meta.json
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: fuentes en meta.json (import-db.js)');

{
  const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'contratoscam-qa-'));
  process.on('exit', () => fs.rmSync(RAIZ, { recursive: true, force: true }));
  fs.cpSync(__dirname, path.join(RAIZ, 'scripts'), { recursive: true });
  // import-db.js necesita sql.js
  fs.symlinkSync(path.join(__dirname, '../node_modules'), path.join(RAIZ, 'node_modules'), 'dir');
  // En el repositorio data/processed/ existe siempre: ahí se publica meta.json
  fs.mkdirSync(path.join(RAIZ, 'data/processed'), { recursive: true });

  // Un contrato solo de PLACSP y otro que aportan PLACSP y TED
  const { guardarContratos } = await import(path.join(RAIZ, 'scripts/lib/almacen-contratos.js'));
  guardarContratos([
    { expediente: 'QA-1', objeto: 'Solo PLACSP', fecha_publicacion: '2026-09-01', fuente: FUENTE.PLACSP, fuentes: [FUENTE.PLACSP] },
    { expediente: 'QA-2', objeto: 'PLACSP y TED', fecha_publicacion: '2026-09-02', fuente: FUENTE.PLACSP, fuentes: [FUENTE.PLACSP, FUENTE.TED] },
  ]);

  const importacion = spawnSync(process.execPath, [path.join(RAIZ, 'scripts/import-db.js')], { cwd: RAIZ, encoding: 'utf-8' });
  assert('import-db termina sin errores', importacion.status, 0);

  const meta = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data/processed/meta.json'), 'utf-8'));
  assertDeep('meta.json lista cada fuente una vez y ordenadas', meta.fuentes, [FUENTE.PLACSP, FUENTE.TED].sort());
}

terminar();

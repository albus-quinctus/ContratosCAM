/**
 * scripts/comprobar-sintaxis.js
 *
 * Comprueba la sintaxis de todo el JavaScript del proyecto con `node --check`,
 * que solo analiza el código y no lo ejecuta. Recorre los scripts del
 * pipeline y el frontend, salvo las librerías de terceros.
 *
 * Uso: node scripts/comprobar-sintaxis.js
 */

import fs from 'fs';
import path from 'path';
import { RAIZ, ejecutarCadaUno, terminarComprobacion } from './lib/comprobaciones.js';

// Carpetas que se recorren (con sus subcarpetas) y carpetas que se saltan
const DIRECTORIOS = ['scripts', 'src/web/js'];
const EXCLUIDOS = ['vendor'];
const EXTENSION = '.js';

function ficherosJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entrada => {
    const ruta = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return EXCLUIDOS.includes(entrada.name) ? [] : ficherosJs(ruta);
    return entrada.name.endsWith(EXTENSION) ? [ruta] : [];
  });
}

const ficheros = DIRECTORIOS.flatMap(dir => ficherosJs(path.join(RAIZ, dir))).sort();

console.log(`🔎 ContratosCAM — Sintaxis (${ficheros.length} ficheros)`);
const fallidos = ejecutarCadaUno(ficheros, ['--check']);
terminarComprobacion('Ficheros', ficheros.length, fallidos);

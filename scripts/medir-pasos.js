/**
 * scripts/medir-pasos.js
 *
 * Ejecuta un paso del pipeline (un script de npm) y apunta cuánto ha tardado
 * y cuánto ocupa data/raw/ al terminar. Con --resumen muestra en Markdown
 * todos los pasos medidos, para el resumen de los workflows de GitHub
 * Actions; así se ve dónde se va el tiempo antes de optimizar nada.
 *
 * Termina con el mismo código que el paso, así que se puede encadenar con &&
 * igual que npm run.
 *
 * Uso:
 *   node scripts/medir-pasos.js <script> [-- opciones]  → ejecuta npm run <script> y lo mide
 *   node scripts/medir-pasos.js --resumen               → tabla con los pasos medidos
 *
 * Ejemplo:
 *   node scripts/medir-pasos.js parse -- --historico
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.join(__dirname, '..');
const RAW_DIR = path.join(RAIZ, 'data/raw');
// Un paso medido por línea (JSON). tmp/ está fuera de git.
const TIEMPOS_ARCHIVO = path.join(RAIZ, 'tmp/tiempos-pasos.jsonl');
const OPCION_RESUMEN = '--resumen';
const SEPARADOR_OPCIONES = '--';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/**
 * Tamaño total de una carpeta y sus subcarpetas, en bytes.
 * @param {string} dir
 * @returns {number}
 */
function tamanoBytes(dir) {
  if (!fs.existsSync(dir)) return 0;
  return fs.readdirSync(dir, { withFileTypes: true }).reduce((suma, entrada) => {
    const ruta = path.join(dir, entrada.name);
    return suma + (entrada.isDirectory() ? tamanoBytes(ruta) : fs.statSync(ruta).size);
  }, 0);
}

function medir(script, opciones) {
  const args = ['run', script, ...(opciones.length ? [SEPARADOR_OPCIONES, ...opciones] : [])];
  const inicio = Date.now();
  const { status } = spawnSync(NPM, args, { cwd: RAIZ, stdio: 'inherit' });
  const paso = {
    paso: [script, ...opciones].join(' '),
    segundos: Math.round((Date.now() - inicio) / 1000),
    raw_mb: Number((tamanoBytes(RAW_DIR) / 1024 / 1024).toFixed(1)),
    ok: status === 0,
  };
  fs.mkdirSync(path.dirname(TIEMPOS_ARCHIVO), { recursive: true });
  fs.appendFileSync(TIEMPOS_ARCHIVO, JSON.stringify(paso) + '\n');
  console.log(`⏱️  ${paso.paso}: ${paso.segundos} s · data/raw: ${paso.raw_mb} MB`);
  return status ?? 1;
}

function formatoDuracion(segundos) {
  const minutos = Math.floor(segundos / 60);
  return minutos > 0 ? `${minutos} min ${segundos % 60} s` : `${segundos} s`;
}

function resumen() {
  if (!fs.existsSync(TIEMPOS_ARCHIVO)) {
    console.log('No hay pasos medidos.');
    return;
  }
  const pasos = fs.readFileSync(TIEMPOS_ARCHIVO, 'utf-8').trim().split('\n').map(l => JSON.parse(l));
  const total = pasos.reduce((suma, p) => suma + p.segundos, 0);
  console.log('### ⏱️ Tiempo por paso\n');
  console.log('| Paso | Duración | % | data/raw (MB) | Resultado |');
  console.log('|------|---------:|--:|--------------:|:---------:|');
  for (const p of pasos) {
    const porcentaje = total > 0 ? Math.round((p.segundos / total) * 100) : 0;
    console.log(`| \`${p.paso}\` | ${formatoDuracion(p.segundos)} | ${porcentaje} | ${p.raw_mb} | ${p.ok ? '✅' : '❌'} |`);
  }
  console.log(`| **Total** | **${formatoDuracion(total)}** | | | |`);
}

const args = process.argv.slice(2);
if (args[0] === OPCION_RESUMEN) {
  resumen();
} else if (args.length === 0 || args[0].startsWith(SEPARADOR_OPCIONES)) {
  console.error(`Uso: node scripts/medir-pasos.js <script> [${SEPARADOR_OPCIONES} opciones] | ${OPCION_RESUMEN}`);
  process.exit(1);
} else {
  const [script, ...resto] = args;
  const opciones = resto[0] === SEPARADOR_OPCIONES ? resto.slice(1) : resto;
  process.exit(medir(script, opciones));
}

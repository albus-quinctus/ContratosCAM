/**
 * scripts/_qa-publicacion.js
 *
 * Suite de tests del flujo de publicación del almacén de contratos
 * (scripts/lib/almacen-contratos.js). Ejecuta de verdad transform, validate,
 * publicar y eliminar sobre una copia de los scripts en una carpeta temporal,
 * con datos de prueba, sin tocar los datos del proyecto.
 *
 * Comprueba las salvaguardas de las que depende no publicar nunca datos
 * perdidos o a medias: validación obligatoria antes de publicar, confirmación
 * con el número exacto, detección de borrados sin autorizar, errores de
 * integridad y que una carga sin cambios deja lo publicado igual.
 *
 * Uso: node scripts/_qa-publicacion.js
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { assert, terminar } from './lib/qa.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─────────────────────────────────────────────────────────────────────────────
// Entorno de prueba
// ─────────────────────────────────────────────────────────────────────────────

const RAIZ = fs.mkdtempSync(path.join(os.tmpdir(), 'contratoscam-qa-'));
process.on('exit', () => fs.rmSync(RAIZ, { recursive: true, force: true }));
fs.cpSync(__dirname, path.join(RAIZ, 'scripts'), { recursive: true });
fs.mkdirSync(path.join(RAIZ, 'data/raw'), { recursive: true });

const PUBLICADO = path.join(RAIZ, 'data/processed/contratos');
const TRABAJO = path.join(RAIZ, 'data/trabajo/contratos');
const ENTRADA_PLACSP = path.join(RAIZ, 'data/raw/parsed-licitaciones.json');

/**
 * Ejecuta un script del pipeline en la copia temporal.
 * @param {string} script - Nombre del fichero en scripts/
 * @param {string[]} [args]
 * @returns {{ codigo: number, salida: string }}
 */
function ejecutar(script, args = []) {
  const r = spawnSync(process.execPath, [path.join(RAIZ, 'scripts', script), ...args], { cwd: RAIZ, encoding: 'utf-8' });
  return { codigo: r.status, salida: r.stdout + r.stderr };
}

/**
 * Contrato tal como lo deja parse.js a partir del feed de PLACSP.
 * @param {number} n - Número de contrato (define su URL y por tanto su identidad)
 * @param {object} [cambios]
 * @returns {object}
 */
function crudo(n, cambios = {}) {
  return {
    expediente: `QA-${n}`,
    objeto: `Contrato de prueba ${n}`,
    estado: 'ADJ',
    tipo_code: '2',
    procedimiento_code: '1',
    organismo: 'Consejería de Prueba',
    jerarquia: ['Comunidad de Madrid', 'Consejería de Prueba'],
    importe_sin_iva: 1000 * n,
    importe_total: 1210 * n,
    importe_adjudicacion: 900 * n,
    importe_adjudicacion_iva: 1089 * n,
    adjudicatario: 'Empresa de Prueba SL',
    nif_adjudicatario: 'B12345678',
    fecha_adjudicacion: '2026-09-01',
    fecha_actualizacion: '2026-10-05T09:00:00.000+02:00',
    url_origen: `https://contrataciondelestado.es/qa/${n}`,
    fuente: 'placsp',
    duracion_meses: 12,
    ...cambios,
  };
}

/** Escribe la entrada de PLACSP que leerá transform.js */
function prepararEntrada(contratos) {
  fs.writeFileSync(ENTRADA_PLACSP, JSON.stringify(contratos), 'utf-8');
}

/** Lee el índice de una carpeta de contratos */
function indice(dir) {
  return JSON.parse(fs.readFileSync(path.join(dir, 'indice.json'), 'utf-8'));
}

/** Contenido de todos los ficheros de una carpeta, para comparar byte a byte */
function contenido(dir) {
  return fs.readdirSync(dir).sort().map(f => f + fs.readFileSync(path.join(dir, f), 'utf-8')).join('\n');
}

/** Contratos de la copia de trabajo */
function contratosTrabajo() {
  return indice(TRABAJO).archivos.flatMap(({ archivo }) =>
    JSON.parse(fs.readFileSync(path.join(TRABAJO, archivo), 'utf-8')));
}

/** Integra la entrada, valida y publica con la confirmación correcta */
function cargarYPublicar() {
  ejecutar('transform.js');
  ejecutar('validate.js');
  return ejecutar('publicar-datos.js', [`--confirmar=${indice(TRABAJO).total}`]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: validar antes de publicar
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: validación y confirmación antes de publicar');

{
  prepararEntrada([crudo(1), crudo(2)]);
  assert('transform crea la copia de trabajo', ejecutar('transform.js').codigo, 0);
  assert('…con los dos contratos', indice(TRABAJO).total, 2);

  assert('publicar sin validar falla', ejecutar('publicar-datos.js', ['--confirmar=2']).codigo, 1);
  assert('…y no publica nada', fs.existsSync(PUBLICADO), false);

  assert('validate aprueba la copia', ejecutar('validate.js').codigo, 0);

  const simulacion = ejecutar('publicar-datos.js');
  assert('publicar sin --confirmar solo simula', simulacion.codigo, 0);
  assert('…muestra la orden con el número exacto', simulacion.salida.includes('--confirmar=2'), true);
  assert('…y no publica nada', fs.existsSync(PUBLICADO), false);

  assert('publicar con un número distinto falla', ejecutar('publicar-datos.js', ['--confirmar=3']).codigo, 1);
  assert('…y no publica nada', fs.existsSync(PUBLICADO), false);

  assert('publicar con el número exacto publica', ejecutar('publicar-datos.js', ['--confirmar=2']).codigo, 0);
  assert('…los dos contratos', indice(PUBLICADO).total, 2);
  assert('…y elimina la copia de trabajo', fs.existsSync(TRABAJO), false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: cargas sin cambios
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: cargas sin cambios');

{
  const antes = contenido(PUBLICADO);
  assert('Repetir la misma carga se publica sin errores', cargarYPublicar().codigo, 0);
  assert('…y deja lo publicado igual byte a byte', contenido(PUBLICADO), antes);
  assert('…sin añadir otra entrada al registro de cargas', indice(PUBLICADO).cargas.length, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: cambios después de validar
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: cambios después de validar');

{
  prepararEntrada([crudo(1), crudo(2), crudo(3)]);
  ejecutar('transform.js');
  ejecutar('validate.js');
  const [archivo] = indice(TRABAJO).archivos;
  const ruta = path.join(TRABAJO, archivo.archivo);
  const contratos = JSON.parse(fs.readFileSync(ruta, 'utf-8'));
  contratos[0].objeto = 'Cambiado después de validar';
  fs.writeFileSync(ruta, JSON.stringify(contratos, null, 2), 'utf-8');

  assert('publicar falla si la copia cambió después de validar',
    ejecutar('publicar-datos.js', ['--confirmar=3']).codigo, 1);
  assert('…y lo publicado no cambia', indice(PUBLICADO).total, 2);

  const descartarSimulado = ejecutar('publicar-datos.js', ['--descartar']);
  assert('descartar sin --confirmar solo simula', descartarSimulado.codigo, 0);
  assert('…y conserva la copia de trabajo', fs.existsSync(TRABAJO), true);
  assert('descartar con el número exacto descarta la copia',
    ejecutar('publicar-datos.js', ['--descartar', '--confirmar=3']).codigo, 0);
  assert('…y la elimina', fs.existsSync(TRABAJO), false);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: borrados sin autorizar
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: borrados sin autorizar');

{
  prepararEntrada([crudo(1), crudo(2)]);
  ejecutar('transform.js');
  // Simula un fallo del pipeline que pierde un contrato de la copia de trabajo
  const [archivo] = indice(TRABAJO).archivos;
  const ruta = path.join(TRABAJO, archivo.archivo);
  fs.writeFileSync(ruta, JSON.stringify(JSON.parse(fs.readFileSync(ruta, 'utf-8')).slice(1), null, 2), 'utf-8');
  const indiceTrabajo = indice(TRABAJO);
  indiceTrabajo.total = 1;
  indiceTrabajo.archivos[0].total = 1;
  fs.writeFileSync(path.join(TRABAJO, 'indice.json'), JSON.stringify(indiceTrabajo, null, 2), 'utf-8');

  const validacion = ejecutar('validate.js');
  assert('validate falla si desaparece un contrato sin autorización', validacion.codigo, 1);
  assert('…y lo explica', validacion.salida.includes('sin autorización'), true);
  assert('publicar sigue sin estar permitido', ejecutar('publicar-datos.js', ['--confirmar=1']).codigo, 1);
  ejecutar('publicar-datos.js', ['--descartar', '--confirmar=1']);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: eliminar contratos
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: eliminar contratos');

{
  assert('eliminar sin motivo falla', ejecutar('eliminar-contratos.js', ['--ids=x']).codigo, 1);
  assert('eliminar un id que no existe falla aunque se confirme 0',
    ejecutar('eliminar-contratos.js', ['--ids=no-existe', '--motivo=prueba', '--confirmar=0']).codigo, 1);
  assert('…y no crea la copia de trabajo ni registra el borrado', fs.existsSync(TRABAJO), false);

  const [primero] = JSON.parse(fs.readFileSync(path.join(PUBLICADO, indice(PUBLICADO).archivos[0].archivo), 'utf-8'));
  const id = primero.id;
  assert('eliminar sin --confirmar solo simula',
    ejecutar('eliminar-contratos.js', [`--ids=${id}`, '--motivo=prueba']).codigo, 0);
  assert('…y no crea la copia de trabajo', fs.existsSync(TRABAJO), false);

  assert('eliminar con el número exacto elimina',
    ejecutar('eliminar-contratos.js', [`--ids=${id}`, '--motivo=prueba', '--confirmar=1']).codigo, 0);
  assert('validate acepta el borrado autorizado', ejecutar('validate.js').codigo, 0);
  assert('…y se publica', ejecutar('publicar-datos.js', ['--confirmar=1']).codigo, 0);
  assert('…con un contrato menos', indice(PUBLICADO).total, 1);

  prepararEntrada([crudo(1), crudo(2)]);
  cargarYPublicar();
  assert('Una carga posterior no vuelve a incorporar el contrato eliminado', indice(PUBLICADO).total, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: integridad
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: errores de integridad');

{
  prepararEntrada([crudo(1), crudo(2), crudo(4, { fecha_actualizacion: null })]);
  ejecutar('transform.js');
  assert('La copia de trabajo tiene un contrato sin fecha de versión',
    contratosTrabajo().filter(c => !c.fecha_actualizacion).length, 1);
  const validacion = ejecutar('validate.js');
  assert('Un solo error de integridad hace fallar validate', validacion.codigo, 1);
  assert('…y no se puede publicar', ejecutar('publicar-datos.js', [`--confirmar=${indice(TRABAJO).total}`]).codigo, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────

terminar();

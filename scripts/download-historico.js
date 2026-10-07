/**
 * scripts/download-historico.js
 *
 * Descarga el histórico de contratos de PLACSP: los ZIP anuales y mensuales
 * de los feeds de lib/feeds-placsp.js, y los guarda sin descomprimir en
 * data/raw/historico/<feed>/<periodo>.zip para que los procese
 * parse.js --historico (ver lib/zip.js).
 *
 * Es reanudable: un periodo ya descargado no se vuelve a descargar, salvo
 * el mes en curso, que PLACSP sigue actualizando.
 *
 * Uso:
 *   node scripts/download-historico.js --desde=2017 --hasta=2026 --dry-run
 *     → lista los ficheros que se descargarían, sin descargar nada. PLACSP no
 *       informa del tamaño de los ZIP antes de descargarlos, así que no se muestra
 *   node scripts/download-historico.js --desde=2017 --hasta=2026
 *
 * Opciones:
 *   --desde=AAAA    Primer año (obligatorio)
 *   --hasta=AAAA    Último año (por defecto, el actual)
 *   --feed=CLAVE    Solo ese feed (perfiles, agregadas); por defecto, todos
 *   --dry-run       Solo muestra lo que se descargaría
 */

import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { FEEDS_HISTORICO, HISTORICO_DIR, feedPorClave, periodosHistorico, rutaZip, urlZip } from './lib/feeds-placsp.js';
import { opcion } from './lib/argumentos.js';
import { atomsDeZip } from './lib/zip.js';

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Timeout máximo por fichero (ms). Los ZIP anuales del feed de perfiles
 * ocupan varios GB y en GitHub Actions tardan más de 30 minutos en bajar
 * desde 2021. Queda por debajo del timeout del job (carga-historica.yml)
 * para que el fallo se registre aquí.
 */
const TIMEOUT_MS = 5 * 60 * 60_000;

/** Pausa entre descargas para no sobrecargar servidores (ms) */
const DELAY_ENTRE_DESCARGAS_MS = 3_000;

/** User-Agent identificativo del proyecto */
const USER_AGENT = 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM)';

/** Primer año con histórico en PLACSP que tiene sentido pedir */
const ANIO_MINIMO = 2012;

/**
 * Tipo de contenido de los ZIP. PLACSP responde 200 con una página HTML
 * cuando el fichero no existe, así que el código de estado no basta.
 */
const TIPO_ZIP = 'application/zip';

// ─────────────────────────────────────────────────────────────────────────────
// Funciones
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee y valida las opciones de la línea de comandos.
 * @param {string[]} args
 * @param {Date} hoy
 * @returns {{desde: number, hasta: number, feeds: object[], simular: boolean}}
 */
function leerOpciones(args, hoy) {
  const anioActual = hoy.getUTCFullYear();
  const desde = Number(opcion(args, 'desde'));
  const hasta = Number(opcion(args, 'hasta') ?? anioActual);

  for (const [nombre, valor] of [['desde', desde], ['hasta', hasta]]) {
    if (!Number.isInteger(valor) || valor < ANIO_MINIMO || valor > anioActual) {
      throw new Error(`--${nombre} debe ser un año entre ${ANIO_MINIMO} y ${anioActual}`);
    }
  }
  if (desde > hasta) throw new Error('--desde no puede ser posterior a --hasta');

  const clave = opcion(args, 'feed');
  const feeds = clave ? [feedPorClave(clave)] : FEEDS_HISTORICO;

  return { desde, hasta, feeds, simular: args.includes('--dry-run') };
}

/**
 * Indica si el periodo es el mes en curso, que PLACSP sigue actualizando.
 * @param {string} periodo - AAAA o AAAAMM
 * @param {Date} hoy
 * @returns {boolean}
 */
function esMesEnCurso(periodo, hoy) {
  const mesActual = `${hoy.getUTCFullYear()}${String(hoy.getUTCMonth() + 1).padStart(2, '0')}`;
  return periodo === mesActual;
}

/**
 * Comprueba que la respuesta trae un ZIP.
 * @param {Response} response
 * @throws {Error} Si el servidor no responde con éxito o no envía un ZIP
 */
function comprobarRespuesta(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const tipo = response.headers.get('content-type') ?? '';
  if (!tipo.startsWith(TIPO_ZIP)) throw new Error(`No es un ZIP (${tipo || 'sin tipo'}): el periodo no está publicado`);
}

/**
 * Comprueba que un fichero remoto existe sin descargarlo: pide el fichero y
 * corta la conexión en cuanto llegan las cabeceras. No usa HEAD porque PLACSP
 * responde 503 a esas peticiones.
 * @param {string} url
 * @throws {Error} Si el servidor no responde con éxito o no envía un ZIP
 */
async function comprobarDisponible(url) {
  const controller = new AbortController();
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    comprobarRespuesta(response);
  } finally {
    controller.abort();
  }
}

/**
 * Descarga un ZIP en streaming, sin cargarlo en memoria. Escribe primero
 * en un fichero provisional y solo le da el nombre definitivo cuando está
 * completo y contiene ficheros Atom, así que un ZIP con el nombre definitivo
 * siempre está completo.
 * @param {string} url
 * @param {string} destino
 * @returns {Promise<{bytes: number, atoms: number}>} Bytes descargados y ficheros Atom que contiene
 */
async function descargarFichero(url, destino) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const provisional = `${destino}.part`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: controller.signal,
    });
    comprobarRespuesta(response);

    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(provisional));
    const atoms = atomsDeZip(provisional).length;
    if (atoms === 0) throw new Error(`El ZIP ${path.basename(destino)} no contiene ficheros .atom`);
    fs.renameSync(provisional, destino);
    return { bytes: fs.statSync(destino).size, atoms };
  } finally {
    clearTimeout(timeout);
    fs.rmSync(provisional, { force: true });
  }
}

/**
 * Pausa la ejecución durante un tiempo determinado.
 * @param {number} ms - Milisegundos de espera
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Formatea un tamaño en MB.
 * @param {number} bytes
 * @returns {string}
 */
function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Función principal: recorre feeds y periodos, y descarga los pendientes.
 */
async function main() {
  const hoy = new Date();
  const { desde, hasta, feeds, simular } = leerOpciones(process.argv.slice(2), hoy);
  const periodos = periodosHistorico(desde, hasta, hoy);

  console.log('🔽 ContratosCAM — Descarga del histórico de PLACSP');
  console.log('═'.repeat(60));
  console.log(`📅 Años: ${desde}–${hasta} (${periodos.length} periodos por feed)`);
  feeds.forEach(f => console.log(`📡 ${f.clave}: ${f.descripcion}`));
  if (simular) console.log('🔍 Modo --dry-run: no se descarga nada');
  console.log('');

  let totalBytes = 0;
  let pendientes = 0;
  const errores = [];

  for (const feed of feeds) {
    for (const periodo of periodos) {
      const zip = rutaZip(feed, periodo);
      const url = urlZip(feed, periodo);

      if (fs.existsSync(zip) && !esMesEnCurso(periodo, hoy)) {
        console.log(`  ⏭️  ${feed.clave}/${periodo}: ya descargado`);
        continue;
      }
      pendientes++;

      try {
        if (simular) {
          await comprobarDisponible(url);
          console.log(`  📄 ${feed.clave}/${periodo}: ${url}`);
          continue;
        }

        console.log(`  ↓ ${feed.clave}/${periodo}: ${url}`);
        fs.mkdirSync(path.dirname(zip), { recursive: true });
        const { bytes, atoms } = await descargarFichero(url, zip);
        totalBytes += bytes;
        console.log(`  ✅ ${feed.clave}/${periodo}: ${mb(bytes)}, ${atoms} ficheros .atom`);

        await esperar(DELAY_ENTRE_DESCARGAS_MS);
      } catch (error) {
        const mensaje = error.name === 'AbortError' ? `Timeout (>${TIMEOUT_MS / 1000}s)` : error.message;
        console.error(`  ❌ ${feed.clave}/${periodo}: ${mensaje}`);
        errores.push(`${feed.clave}/${periodo}`);
      }
    }
  }

  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE DESCARGA DEL HISTÓRICO');
  console.log('─'.repeat(60));
  console.log(`  📄 Periodos ${simular ? 'por descargar' : 'descargados'}: ${pendientes - errores.length}`);
  if (!simular) console.log(`  💾 Tamaño total de los ZIP: ${mb(totalBytes)}`);
  console.log(`  📁 Directorio: ${HISTORICO_DIR}`);
  console.log('═'.repeat(60));

  // Un periodo que falla no se da por bueno: queda pendiente para la próxima
  // ejecución y la orden termina con error para que no pase desapercibido.
  if (errores.length > 0) {
    console.error(`\n❌ Fallaron ${errores.length} periodos: ${errores.join(', ')}`);
    process.exit(1);
  }

  console.log(simular ? '\n✅ Simulación completada.' : '\n✅ Descarga completada.');
  console.log('💡 Siguiente paso: npm run parse -- --historico');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

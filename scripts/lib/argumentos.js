/**
 * scripts/lib/argumentos.js
 *
 * Lectura de opciones de línea de comandos compartida por los scripts que
 * modifican datos y exigen confirmación (eliminar-contratos.js, publicar-datos.js).
 */

/** Resultado de leer la confirmación de una orden */
export const CONFIRMACION = Object.freeze({
  SIMULAR: 'simular',         // Sin --confirmar o con --dry-run: no se escribe nada
  CONFIRMADA: 'confirmada',   // --confirmar=N con N igual al número esperado
  NO_COINCIDE: 'no_coincide', // --confirmar=N con otro número
});

/**
 * Valor de una opción --nombre=valor, o null si no se ha pasado.
 * @param {string[]} args
 * @param {string} nombre
 * @returns {string|null}
 */
export function opcion(args, nombre) {
  const arg = args.find(a => a.startsWith(`--${nombre}=`));
  return arg ? arg.substring(nombre.length + 3) : null;
}

/**
 * Lee --confirmar=N y --dry-run. La orden solo se confirma si N es
 * exactamente el número de elementos afectados.
 * @param {string[]} args
 * @param {number} esperado - Número de elementos afectados
 * @returns {string} Un valor de CONFIRMACION
 */
export function leerConfirmacion(args, esperado) {
  const valor = opcion(args, 'confirmar');
  if (args.includes('--dry-run') || valor === null) return CONFIRMACION.SIMULAR;
  return /^\d+$/.test(valor) && Number(valor) === esperado ? CONFIRMACION.CONFIRMADA : CONFIRMACION.NO_COINCIDE;
}

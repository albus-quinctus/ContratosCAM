/**
 * scripts/lib/integrar-lote.js
 *
 * Integra un lote de contratos (una carga de cualquier fuente: el feed semanal,
 * un mes del histórico, una fuente nueva…) en los contratos ya almacenados.
 *
 * Garantías (comprobadas en scripts/_qa-almacen.js):
 * - Nunca se pierde un contrato: integrar solo añade o fusiona.
 * - Nunca se sustituye un valor por uno vacío (salvo la fecha de comprobación
 *   de un campo verificado, que se vacía para que se vuelva a comprobar).
 * - Integrar dos veces el mismo lote no cambia nada (idempotencia).
 * - El resultado no depende del orden de carga. Cada versión de un contrato
 *   tiene un rango: primero la prioridad de su fuente y, a igualdad, su fecha
 *   de modificación en origen (fecha_actualizacion). Cada campo toma el valor
 *   de la versión de mayor rango que lo tenga. Así, cargar un mes antiguo del
 *   histórico después del feed semanal no pisa datos más nuevos, pero sí
 *   rellena lo que a la versión nueva le falte.
 *
 * Cuando un campo viene de una versión distinta de la principal del contrato,
 * su versión queda anotada en `origen_campos`, para poder seguir decidiendo
 * bien en cargas posteriores.
 *
 * Si llegan dos veces la misma versión de origen (misma fuente y misma
 * fecha_actualizacion), se conserva la almacenada, que ya lleva los campos
 * calculados después (entidades, categorías…), y la nueva solo rellena huecos.
 *
 * Los campos que se comprueban fuera de las fuentes (el estado, que
 * update-estados.js consulta en la ficha web) llevan su propia fecha de
 * comprobación y se fusionan junto a ella (ver CAMPOS_VERIFICADOS).
 *
 * Los contratos se identifican por su id, que se calcula una sola vez, al
 * entrar, a partir de los datos de origen (ver idDeContrato). Así siguen
 * casando aunque pasos posteriores cambien los campos de su clave.
 */

import crypto from 'crypto';
import { claveContrato } from './clave-contrato.js';
import { prioridadDe } from './fuentes.js';

/** Campo donde se anota la versión de origen de los campos rellenados */
export const CAMPO_ORIGEN = 'origen_campos';

/**
 * Campos que no vienen de las fuentes sino de pasos posteriores del pipeline
 * (resolve-entities, update-estados). No tienen versión de origen: se toma el
 * de la versión principal y, si está vacío, el de la otra.
 */
const CAMPOS_DERIVADOS = new Set([
  'entity_id',
  'categoria_organismo',
  'es_ute',
  'miembros_ute',
]);

/**
 * Campos que se comprueban fuera de las fuentes, con el campo donde se anota
 * la fecha de la comprobación. Entre el valor comprobado y el de las fuentes
 * gana el más reciente; a igualdad de día, el comprobado. Si gana el de las
 * fuentes, la fecha de comprobación se vacía para que se vuelva a comprobar.
 */
const CAMPOS_VERIFICADOS = Object.freeze({
  estado: 'estado_verificado_en', // scripts/update-estados.js
});

/** Campos con la fecha de comprobación de un campo de CAMPOS_VERIFICADOS */
const FECHAS_VERIFICACION = new Set(Object.values(CAMPOS_VERIFICADOS));

/**
 * Campos con regla de fusión propia. Cada regla recibe
 * (principal, secundaria, existente) y devuelve el valor final.
 */
const REGLAS_CAMPO = Object.freeze({
  // El id se asigna al entrar el contrato y no cambia nunca
  id: (principal, secundaria, existente) => existente.id,
  // Todas las fuentes que han aportado el contrato
  fuentes: (principal, secundaria) => [...new Set([...fuentesDe(principal), ...fuentesDe(secundaria)])].sort(),
  // Fuente y fecha de la versión principal: definen qué versión es
  fuente: principal => principal.fuente,
  fecha_actualizacion: principal => principal.fecha_actualizacion,
});

/**
 * ID estable de un contrato, derivado de su clave de identidad.
 * @param {object} contrato
 * @returns {string}
 */
export function idDeContrato(contrato) {
  return crypto.createHash('sha1').update(claveContrato(contrato)).digest('hex').substring(0, 12);
}

/**
 * Fuentes que han aportado un contrato.
 * @param {object} contrato
 * @returns {string[]}
 */
function fuentesDe(contrato) {
  return contrato.fuentes || [contrato.fuente];
}

/**
 * Indica si un valor cuenta como vacío (no aporta información).
 * @param {*} valor
 * @returns {boolean}
 */
export function esVacio(valor) {
  return valor === null || valor === undefined || valor === '' || (Array.isArray(valor) && valor.length === 0);
}

/** Fecha sin hora (AAAA-MM-DD) */
const FECHA_SOLO_DIA = /^\d{4}-\d{2}-\d{2}$/;

/** Longitud de la parte de día de una fecha ISO (AAAA-MM-DD) */
const LONGITUD_DIA = 10;

/**
 * Normaliza una fecha de modificación en origen para poder compararla con
 * otras: las fechas con hora pasan a UTC (sin depender de la zona horaria ni
 * del cambio de hora) y las que solo tienen día se dejan tal cual.
 * @param {string|null} valor - Fecha ISO 8601, con o sin hora y zona
 * @returns {string|null} null si no es una fecha válida
 */
export function normalizarFechaVersion(valor) {
  if (!valor) return null;
  if (FECHA_SOLO_DIA.test(valor)) return valor;
  const fecha = new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha.toISOString();
}

/**
 * Compara dos fechas normalizadas con la precisión que tengan en común: si
 * alguna solo tiene día, se comparan solo los días. Así una versión guardada
 * con día no se toma por más antigua que la misma versión con hora.
 * @param {string} a
 * @param {string} b
 * @returns {number} Negativo si `a` es anterior, positivo si es posterior, 0 si coinciden
 */
export function compararFechas(a, b) {
  const soloDia = FECHA_SOLO_DIA.test(a) || FECHA_SOLO_DIA.test(b);
  return soloDia
    ? compararTexto(a.substring(0, LONGITUD_DIA), b.substring(0, LONGITUD_DIA))
    : compararTexto(a, b);
}

/**
 * Compara textos por sus códigos (igual en cualquier idioma del sistema).
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compararTexto(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Versión de origen de un contrato.
 * @param {object} contrato
 * @returns {{ fuente: string, fecha_actualizacion: string }}
 */
function versionDe(contrato) {
  return { fuente: contrato.fuente, fecha_actualizacion: contrato.fecha_actualizacion };
}

/**
 * Versión de origen del valor de un campo: la anotada en origen_campos o,
 * si no hay, la del propio contrato.
 * @param {object} contrato
 * @param {string} campo
 * @returns {{ fuente: string, fecha_actualizacion: string }}
 */
function versionDelCampo(contrato, campo) {
  return (contrato[CAMPO_ORIGEN] && contrato[CAMPO_ORIGEN][campo]) || versionDe(contrato);
}

/**
 * Compara dos versiones de origen: negativo si `a` tiene más rango,
 * positivo si lo tiene `b` y 0 si son la misma versión.
 * @param {{ fuente: string, fecha_actualizacion: string }} a
 * @param {{ fuente: string, fecha_actualizacion: string }} b
 * @returns {number}
 */
function compararVersiones(a, b) {
  const porFuente = prioridadDe(b.fuente) - prioridadDe(a.fuente);
  if (porFuente !== 0) return porFuente;
  return compararFechas(b.fecha_actualizacion || '', a.fecha_actualizacion || '');
}

/**
 * Fusiona dos versiones del mismo contrato.
 * @param {object} existente - Versión almacenada
 * @param {object} nuevo - Versión que llega en el lote
 * @returns {object}
 */
export function fusionarContrato(existente, nuevo) {
  // A igualdad de versión se queda la almacenada
  const [principal, secundaria] = compararVersiones(versionDe(existente), versionDe(nuevo)) <= 0
    ? [existente, nuevo]
    : [nuevo, existente];

  // Mismo orden de campos que la versión almacenada, para no generar cambios falsos
  const campos = [...new Set([...Object.keys(existente), ...Object.keys(nuevo)])];
  const fusionado = Object.fromEntries(campos.map(campo => [campo, null]));

  const origen = {};
  for (const campo of campos) {
    const regla = REGLAS_CAMPO[campo];
    if (campo === CAMPO_ORIGEN || FECHAS_VERIFICACION.has(campo)) {
      continue; // Se calculan aparte
    } else if (regla) {
      fusionado[campo] = regla(principal, secundaria, existente);
    } else if (CAMPOS_DERIVADOS.has(campo)) {
      fusionado[campo] = esVacio(principal[campo]) && !esVacio(secundaria[campo]) ? secundaria[campo] : principal[campo] ?? null;
    } else {
      // El valor de la versión de mayor rango que lo tenga (a igualdad, la almacenada)
      const candidatas = [existente, nuevo].filter(c => !esVacio(c[campo]));
      if (candidatas.length === 0) {
        fusionado[campo] = principal[campo] ?? null;
        continue;
      }
      const elegida = candidatas.reduce((mejor, c) =>
        compararVersiones(versionDelCampo(mejor, campo), versionDelCampo(c, campo)) <= 0 ? mejor : c);
      fusionado[campo] = elegida[campo];
      const version = versionDelCampo(elegida, campo);
      if (compararVersiones(version, versionDe(principal)) !== 0) origen[campo] = version;
    }
  }

  for (const [campo, campoFecha] of Object.entries(CAMPOS_VERIFICADOS)) {
    aplicarVerificacion(fusionado, origen, campo, campoFecha, [existente, nuevo]);
  }

  const camposConOrigen = Object.keys(origen).sort();
  if (camposConOrigen.length > 0) {
    fusionado[CAMPO_ORIGEN] = Object.fromEntries(camposConOrigen.map(c => [c, origen[c]]));
  } else {
    delete fusionado[CAMPO_ORIGEN];
  }
  return fusionado;
}

/**
 * Decide entre el valor comprobado de un campo (con su fecha de comprobación)
 * y el que resulta de las fuentes, que ya está en `fusionado`.
 * @param {object} fusionado - Contrato fusionado (se modifica)
 * @param {object} origen - Versiones de origen anotadas (se modifica)
 * @param {string} campo - Campo comprobado
 * @param {string} campoFecha - Campo con la fecha de la comprobación
 * @param {object[]} versiones - Versiones del contrato (almacenada primero)
 */
function aplicarVerificacion(fusionado, origen, campo, campoFecha, versiones) {
  if (!(campo in fusionado)) return;

  // La comprobación más reciente (a igualdad, la almacenada)
  const comprobada = versiones
    .filter(c => !esVacio(c[campoFecha]) && !esVacio(c[campo]))
    .reduce((mejor, c) => (mejor && compararFechas(mejor[campoFecha], c[campoFecha]) >= 0 ? mejor : c), null);
  if (!comprobada) {
    if (campoFecha in fusionado) fusionado[campoFecha] = null;
    return;
  }

  // Fecha de la versión de las fuentes de la que sale el valor fusionado
  const fechaFuentes = (origen[campo] || versionDe(fusionado)).fecha_actualizacion || '';
  if (compararFechas(comprobada[campoFecha], fechaFuentes) >= 0) {
    fusionado[campo] = comprobada[campo];
    fusionado[campoFecha] = comprobada[campoFecha];
    delete origen[campo];
  } else {
    fusionado[campoFecha] = null;
  }
}

/**
 * Prepara un contrato del lote: id estable, lista de fuentes y campos sin
 * valor como null (JSON no guarda undefined: el campo desaparecería al guardar
 * y volvería en la siguiente carga como un cambio falso).
 * @param {object} contrato
 * @returns {object}
 */
function prepararNuevo(contrato) {
  const conNulos = Object.fromEntries(Object.entries(contrato).map(([campo, valor]) => [campo, valor ?? null]));
  return { ...conNulos, id: contrato.id || idDeContrato(contrato), fuentes: fuentesDe(contrato) };
}

/**
 * Integra un lote en los contratos almacenados.
 *
 * @param {object[]} existentes - Contratos almacenados (todos con id)
 * @param {object[]} lote - Contratos que llegan en esta carga
 * @returns {{ contratos: object[], resumen: { recibidos: number, anadidos: number, modificados: number, sin_cambios: number } }}
 */
export function integrarLote(existentes, lote) {
  // Indexar lo almacenado por id (fusionando si ya hubiera duplicados)
  const mapa = new Map();
  for (const contrato of existentes) {
    mapa.set(contrato.id, mapa.has(contrato.id) ? fusionarContrato(mapa.get(contrato.id), contrato) : contrato);
  }
  const antes = new Map([...mapa].map(([id, c]) => [id, JSON.stringify(c)]));

  for (const contrato of lote) {
    const nuevo = prepararNuevo(contrato);
    mapa.set(nuevo.id, mapa.has(nuevo.id) ? fusionarContrato(mapa.get(nuevo.id), nuevo) : nuevo);
  }

  const resumen = { recibidos: lote.length, anadidos: 0, modificados: 0, sin_cambios: 0 };
  for (const [id, contrato] of mapa) {
    if (!antes.has(id)) resumen.anadidos++;
    else if (antes.get(id) !== JSON.stringify(contrato)) resumen.modificados++;
    else resumen.sin_cambios++;
  }

  return { contratos: [...mapa.values()], resumen };
}

/**
 * Ordena contratos de forma determinista: más recientes primero y, a igualdad
 * de fecha, por id. Así los ficheros no cambian por el orden de carga.
 * @param {object[]} contratos
 * @returns {object[]} El mismo array, ordenado
 */
export function ordenarContratos(contratos) {
  return contratos.sort((a, b) =>
    compararTexto(b.fecha_publicacion || '', a.fecha_publicacion || '') || compararTexto(a.id, b.id));
}

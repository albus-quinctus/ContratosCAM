/**
 * scripts/lib/fuentes.js
 *
 * Fuentes de datos de los contratos: identificadores y prioridad cuando
 * varias aportan el mismo contrato. Fuente única de estos valores para el
 * pipeline (transform.js, lib/integrar-lote.js, validate.js).
 */

/** Identificadores de las fuentes, tal como se guardan en `fuente` y `fuentes` */
export const FUENTE = Object.freeze({
  PLACSP: 'placsp',                         // Plataforma de Contratación del Sector Público
  PLACSP_AGREGADAS: 'placsp_agregadas',     // Plataformas autonómicas que agrega PLACSP (sindicación 1044)
  TED: 'ted_ue',                            // Tenders Electronic Daily (Diario Oficial de la UE)
  PLACE_HISTORICO: 'place_historico',
  CAM_TRANSPARENCIA: 'cam_transparencia',
  CAM_DATOS_ABIERTOS: 'cam_datos_abiertos',
});

/** Todas las fuentes válidas */
export const FUENTES_VALIDAS = Object.freeze(Object.values(FUENTE));

/**
 * Prioridad de las fuentes que se integran hoy cuando aportan el mismo
 * contrato: gana la mayor. PLACSP es la fuente oficial española, tanto en
 * los perfiles de contratante como en las plataformas que agrega (a igualdad
 * de prioridad gana la versión más reciente); TED solo complementa. Una
 * fuente nueva necesita su prioridad antes de integrarse.
 */
const PRIORIDAD_FUENTE = Object.freeze({
  [FUENTE.PLACSP]: 2,
  [FUENTE.PLACSP_AGREGADAS]: 2,
  [FUENTE.TED]: 1,
});

/**
 * Prioridad de una fuente al integrar.
 * @param {string} fuente
 * @returns {number}
 * @throws {Error} Si la fuente no tiene prioridad asignada
 */
export function prioridadDe(fuente) {
  if (!(fuente in PRIORIDAD_FUENTE)) {
    throw new Error(`La fuente "${fuente}" no tiene prioridad asignada en scripts/lib/fuentes.js`);
  }
  return PRIORIDAD_FUENTE[fuente];
}

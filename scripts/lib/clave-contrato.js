/**
 * scripts/lib/clave-contrato.js
 *
 * Clave de identidad de un contrato, compartida por la deduplicación
 * (transform.js) y la comprobación de duplicados (validate.js).
 */

/**
 * Devuelve la clave que identifica de forma única a un contrato.
 *
 * Se usa la URL del anuncio (`url_origen`): es única por licitación tanto en
 * PLACSP como en TED y no cambia cuando resolve-entities.js normaliza el
 * nombre del organismo. Si falta, se recurre a expediente + organismo.
 *
 * @param {object} contrato - Contrato normalizado
 * @returns {string}
 */
export function claveContrato(contrato) {
  if (contrato.url_origen) return `URL:${contrato.url_origen}`;
  return `EXP:${contrato.expediente || ''}|${contrato.organismo || ''}`;
}

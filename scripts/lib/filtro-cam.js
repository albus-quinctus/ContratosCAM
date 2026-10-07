/**
 * scripts/lib/filtro-cam.js
 *
 * Filtro de los contratos de la Comunidad de Madrid, compartido por el
 * parseo (parse.js, que descarta pronto el resto de España para no acumular
 * el volumen nacional del histórico) y la transformación (transform.js).
 */

/**
 * Palabras clave que identifican organismos de la Comunidad de Madrid
 * en la jerarquía de PLACSP.
 */
const FILTROS_CAM = [
  'Comunidad de Madrid',
  'COMUNIDAD DE MADRID',
  'Comunidad Autónoma de Madrid',
];

/**
 * Prefijo de los códigos de órgano (DIR3) de la administración de la
 * Comunidad de Madrid. Hace falta para las plataformas agregadas (feed 1044),
 * cuya jerarquía no nombra a la Comunidad: solo trae la consejería o el
 * organismo (p. ej. "Consejería de Sanidad > Servicio Madrileño de Salud").
 */
const PREFIJO_CODIGO_ORGANO_CAM = 'A13';

/**
 * Determina si un contrato pertenece a la Comunidad de Madrid
 * basándose en su jerarquía de organismos y en sus códigos de órgano.
 * @param {object} contrato - Contrato parseado
 * @returns {boolean}
 */
export function esDeCAM(contrato) {
  // Verificar en la jerarquía
  if (contrato.jerarquia && Array.isArray(contrato.jerarquia)) {
    for (const nivel of contrato.jerarquia) {
      for (const filtro of FILTROS_CAM) {
        if (nivel.includes(filtro)) return true;
      }
    }
  }

  // Verificar en el nombre del organismo directamente
  if (contrato.organismo) {
    for (const filtro of FILTROS_CAM) {
      if (contrato.organismo.includes(filtro)) return true;
    }
  }

  // Verificar en los códigos de órgano
  if (Array.isArray(contrato.codigos_organo)) {
    return contrato.codigos_organo.some(codigo => codigo.startsWith(PREFIJO_CODIGO_ORGANO_CAM));
  }

  return false;
}

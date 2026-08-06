/**
 * scripts/lib/entity-resolver.js
 *
 * Módulo puro de resolución de identidad de entidades (empresas y organismos).
 *
 * Responsabilidad única: dado un nombre de adjudicatario y opcionalmente un NIF,
 * determinar a qué entidad canónica pertenece y devolver su entity_id + nombre canónico.
 *
 * Estrategias de resolución (en cascada):
 *   1. NIF exacto → lookup en registro maestro
 *   2. Clave normalizada del nombre → lookup en índice de aliases
 *   3. Sin match → devuelve null (candidato para revisión futura)
 *
 * Este módulo NO tiene efectos secundarios (no lee/escribe archivos).
 * Los datos se pasan como parámetros.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de normalización
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Genera una clave de comparación normalizada para un nombre de empresa.
 * Elimina puntuación societaria (comas, puntos, punto y coma), tildes,
 * y diferencias de mayúsculas. Conserva las letras de la forma jurídica
 * (SL, SA, SLU, SAU) para evitar fusionar empresas con distinta personalidad.
 *
 * @example
 *   claveEmpresa("RECIO, S.L.")  → "recio sl"
 *   claveEmpresa("Recio, S.L.")  → "recio sl"
 *   claveEmpresa("RECIO S.L.")   → "recio sl"
 *   claveEmpresa("RECIO SL")     → "recio sl"
 *   claveEmpresa("RECIO, S.A.")  → "recio sa"  ← distinta
 *
 * @param {string} nombre
 * @returns {string}
 */
export function claveEmpresa(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Genera una clave de comparación normalizada para un nombre de organismo público.
 * Más agresiva que claveEmpresa: elimina toda puntuación (no solo societaria).
 *
 * @param {string} nombre
 * @returns {string}
 */
export function claveOrganismo(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Dado un Map(nombre → frecuencia), devuelve el nombre canónico:
 * el más frecuente; en caso de empate, el más largo (más descriptivo).
 *
 * @param {Map<string, number>} frecuencias
 * @returns {string}
 */
export function nombreCanónico(frecuencias) {
  return [...frecuencias.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}

/**
 * Calcula el coeficiente de Dice entre dos strings (similitud basada en bigramas).
 * Útil para detectar candidatos de merge en nombres con diferencias semánticas
 * (ej: "OFI PAPEL CENTER" vs "OFIPAPEL CENTER").
 *
 * @param {string} a
 * @param {string} b
 * @returns {number} Valor entre 0 (sin similitud) y 1 (idénticos)
 */
export function diceCoefficient(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set();
  const bigramsB = new Set();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.slice(i, i + 2));
  for (let i = 0; i < b.length - 1; i++) bigramsB.add(b.slice(i, i + 2));

  let interseccion = 0;
  for (const bg of bigramsA) if (bigramsB.has(bg)) interseccion++;

  return (2 * interseccion) / (bigramsA.size + bigramsB.size);
}

// ─────────────────────────────────────────────────────────────────────────────
// Clase EntityResolver
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resuelve la identidad de adjudicatarios y organismos usando un registro maestro.
 *
 * Uso:
 *   const resolver = new EntityResolver(registro);
 *   const { entityId, nombreCanónico } = resolver.resolver('RECIO, S.L.', null);
 */
export class EntityResolver {
  /**
   * @param {object} registro - Registro maestro de entidades (entities.json)
   * @param {object} registro.empresas - Map NIF → { nombre_canonico, aliases[] }
   * @param {object} registro.aliases_sin_nif - Map clave_normalizada → NIF
   * @param {object} registro.organismos - Map clave → { nombre_canonico, aliases[] }
   */
  constructor(registro = { empresas: {}, aliases_sin_nif: {}, organismos: {} }) {
    this.registro = registro;

    // Índice: clave normalizada → NIF (para lookup rápido)
    this._indiceClave = new Map();
    for (const [nif, empresa] of Object.entries(registro.empresas)) {
      // Indexar el nombre canónico
      this._indiceClave.set(claveEmpresa(empresa.nombre_canonico), nif);
      // Indexar todos los aliases
      for (const alias of (empresa.aliases || [])) {
        this._indiceClave.set(claveEmpresa(alias), nif);
      }
    }

    // Índice de aliases sin NIF (ya normalizados en el registro)
    for (const [clave, nif] of Object.entries(registro.aliases_sin_nif || {})) {
      this._indiceClave.set(clave, nif);
    }

    // Índice de organismos
    this._indiceOrganismos = new Map();
    for (const [, org] of Object.entries(registro.organismos || {})) {
      const clave = claveOrganismo(org.nombre_canonico);
      this._indiceOrganismos.set(clave, org.nombre_canonico);
      for (const alias of (org.aliases || [])) {
        this._indiceOrganismos.set(claveOrganismo(alias), org.nombre_canonico);
      }
    }
  }

  /**
   * Resuelve la identidad de un adjudicatario.
   *
   * @param {string|null} adjudicatario - Nombre del adjudicatario
   * @param {string|null} nif - NIF del adjudicatario (si disponible)
   * @returns {{ entityId: string|null, nombreCanónico: string|null }}
   */
  resolverEmpresa(adjudicatario, nif) {
    if (!adjudicatario) return { entityId: null, nombreCanónico: null };

    // Estrategia 1: NIF exacto
    if (nif && this.registro.empresas[nif]) {
      return {
        entityId: nif,
        nombreCanónico: this.registro.empresas[nif].nombre_canonico,
      };
    }

    // Estrategia 2: clave normalizada del nombre
    const clave = claveEmpresa(adjudicatario);
    const nifEncontrado = this._indiceClave.get(clave);
    if (nifEncontrado && this.registro.empresas[nifEncontrado]) {
      return {
        entityId: nifEncontrado,
        nombreCanónico: this.registro.empresas[nifEncontrado].nombre_canonico,
      };
    }

    // Estrategia 3: NIF proporcionado pero no en registro → usar NIF como entityId
    if (nif) {
      return { entityId: nif, nombreCanónico: adjudicatario };
    }

    // Sin match: usar clave como entityId provisional
    return { entityId: null, nombreCanónico: null };
  }

  /**
   * Resuelve el nombre canónico de un organismo público.
   *
   * @param {string|null} nombre - Nombre del organismo
   * @returns {string|null} Nombre canónico o el original limpio
   */
  resolverOrganismo(nombre) {
    if (!nombre) return null;
    const limpio = nombre.replace(/\s+/g, ' ').trim();
    const clave = claveOrganismo(limpio);
    return this._indiceOrganismos.get(clave) || limpio;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de construcción del registro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construye un registro maestro de entidades a partir de un array de contratos.
 * Detecta automáticamente empresas con múltiples variantes de nombre por NIF
 * y genera aliases. También agrupa contratos sin NIF por clave suave.
 *
 * @param {object[]} contratos - Array de contratos normalizados
 * @param {object} registroExistente - Registro previo para preservar datos manuales
 * @returns {object} Registro maestro actualizado
 */
export function construirRegistro(contratos, registroExistente = null) {
  const registro = registroExistente
    ? JSON.parse(JSON.stringify(registroExistente))
    : { empresas: {}, aliases_sin_nif: {}, organismos: {} };

  // ── Paso 1: Agrupar nombres por NIF ────────────────────────────────────────
  const porNIF = new Map(); // nif → Map(nombre → frecuencia)

  for (const c of contratos) {
    if (!c.nif_adjudicatario || !c.adjudicatario) continue;
    if (!porNIF.has(c.nif_adjudicatario)) porNIF.set(c.nif_adjudicatario, new Map());
    const freq = porNIF.get(c.nif_adjudicatario);
    freq.set(c.adjudicatario, (freq.get(c.adjudicatario) || 0) + 1);
  }

  // Crear/actualizar entradas en el registro
  for (const [nif, freq] of porNIF) {
    const nombre = nombreCanónico(freq);
    const aliases = [...freq.keys()].filter(n => n !== nombre);

    if (!registro.empresas[nif]) {
      registro.empresas[nif] = {
        nombre_canonico: nombre,
        aliases,
        fuente: 'auto',
      };
    } else {
      // Preservar nombre canónico si fue establecido manualmente
      if (registro.empresas[nif].fuente !== 'manual') {
        registro.empresas[nif].nombre_canonico = nombre;
      }
      // Añadir aliases nuevos
      const existentes = new Set(registro.empresas[nif].aliases || []);
      for (const alias of aliases) existentes.add(alias);
      registro.empresas[nif].aliases = [...existentes];
    }
  }

  // ── Paso 2: Agrupar contratos sin NIF por clave suave ──────────────────────
  const porClave = new Map(); // clave → Map(nombre → frecuencia)

  for (const c of contratos) {
    if (c.nif_adjudicatario || !c.adjudicatario) continue;
    const clave = claveEmpresa(c.adjudicatario);
    if (!porClave.has(clave)) porClave.set(clave, new Map());
    const freq = porClave.get(clave);
    freq.set(c.adjudicatario, (freq.get(c.adjudicatario) || 0) + 1);
  }

  // Para cada grupo sin NIF, verificar si algún alias coincide con una empresa conocida
  for (const [clave, freq] of porClave) {
    // ¿Ya existe en el índice de aliases?
    if (registro.aliases_sin_nif[clave]) continue;

    // ¿Coincide con alguna empresa del registro por clave?
    let nifEncontrado = null;
    for (const [nif, empresa] of Object.entries(registro.empresas)) {
      if (claveEmpresa(empresa.nombre_canonico) === clave) {
        nifEncontrado = nif;
        break;
      }
      for (const alias of (empresa.aliases || [])) {
        if (claveEmpresa(alias) === clave) {
          nifEncontrado = nif;
          break;
        }
      }
      if (nifEncontrado) break;
    }

    if (nifEncontrado) {
      registro.aliases_sin_nif[clave] = nifEncontrado;
    }
  }

  return registro;
}

/**
 * Aplica la resolución de entidades a un array de contratos.
 * Asigna entity_id y unifica nombres de adjudicatario y organismo.
 *
 * @param {object[]} contratos - Array de contratos normalizados
 * @param {EntityResolver} resolver - Instancia del resolver
 * @returns {{ contratos: object[], stats: { resueltos: number, sinResolver: number, organismosNormalizados: number } }}
 */
export function aplicarResolucion(contratos, resolver) {
  let resueltos = 0;
  let sinResolver = 0;
  let organismosNormalizados = 0;

  const resultado = contratos.map(c => {
    const copia = { ...c };

    // Resolver empresa
    if (c.adjudicatario) {
      const { entityId, nombreCanónico: nombre } = resolver.resolverEmpresa(
        c.adjudicatario,
        c.nif_adjudicatario
      );

      if (entityId) {
        copia.entity_id = entityId;
        if (nombre && nombre !== c.adjudicatario) {
          copia.adjudicatario = nombre;
        }
        resueltos++;
      } else {
        // Usar clave suave como entity_id provisional para agrupar variantes
        copia.entity_id = claveEmpresa(c.adjudicatario);
        sinResolver++;
      }
    } else {
      copia.entity_id = null;
    }

    // Resolver organismo
    if (c.organismo) {
      const orgResuelto = resolver.resolverOrganismo(c.organismo);
      if (orgResuelto !== c.organismo) {
        copia.organismo = orgResuelto;
        organismosNormalizados++;
      }
    }

    return copia;
  });

  return {
    contratos: resultado,
    stats: { resueltos, sinResolver, organismosNormalizados },
  };
}

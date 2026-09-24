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
    .replace(/[^a-z0-9\s]/g, ' ')
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

  // ── Paso 3: Detectar variantes de organismos automáticamente ────────────────
  const porClaveOrg = new Map(); // claveOrganismo → Map(nombre → frecuencia)

  for (const c of contratos) {
    if (!c.organismo) continue;
    const limpio = c.organismo.replace(/\s+/g, ' ').trim();
    const clave = claveOrganismo(limpio);
    if (!porClaveOrg.has(clave)) porClaveOrg.set(clave, new Map());
    const freq = porClaveOrg.get(clave);
    freq.set(limpio, (freq.get(limpio) || 0) + 1);
  }

  for (const [clave, freq] of porClaveOrg) {
    // Solo registrar si hay más de una variante o si no existe ya
    if (freq.size <= 1 && registro.organismos[clave]) continue;

    const nombre = nombreCanónico(freq);
    const aliases = [...freq.keys()].filter(n => n !== nombre);

    if (!registro.organismos[clave]) {
      // Solo registrar si hay variantes que unificar
      if (aliases.length > 0) {
        registro.organismos[clave] = {
          nombre_canonico: nombre,
          aliases,
          fuente: 'auto',
        };
      }
    } else if (registro.organismos[clave].fuente !== 'manual') {
      // Actualizar aliases (preservar manuales)
      const existentes = new Set(registro.organismos[clave].aliases || []);
      for (const alias of aliases) existentes.add(alias);
      registro.organismos[clave].aliases = [...existentes];
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

// ─────────────────────────────────────────────────────────────────────────────
// Categorización de organismos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Etiquetas de categoría para organismos públicos.
 * Orden de evaluación: las reglas más específicas van primero.
 */
const REGLAS_CATEGORIA = [
  // Universidades (rectorados, gerencias, fundaciones universitarias)
  { regex: /rectorado de la universidad|rector de la universidad|gerencia de la universidad|universidad.*de madrid|universidad.*alcal[aá]|universidad.*carlos iii|universidad.*menéndez pelayo|universidad.*educaci[oó]n a distancia|consorcio madro[ñn]o/i, categoria: 'universidades', label: 'Universidades' },

  // Distritos de Madrid
  { regex: /distrito de |distrito centro|junta municipal.*distrito/i, categoria: 'distritos_madrid', label: 'Distritos de Madrid' },

  // Ayuntamiento de Madrid (áreas de gobierno, organismos autónomos, empresas municipales de Madrid)
  { regex: /ayuntamiento de madrid|informática del ayuntamiento de madrid|madrid calle 30|madrid destino|empresa municipal de transportes de madrid|empresa municipal de servicios funerarios|empresa municipal de la vivienda y suelo de madrid|organismo aut[oó]nomo.*madrid|coordinaci[oó]n general de la alcald[ií]a|tribunal econ[oó]mico.*madrid|[aá]rea de gobierno de/i, categoria: 'ayto_madrid', label: 'Ayuntamiento de Madrid' },

  // Consejerías de la Comunidad de Madrid
  { regex: /consejer[ií]a de(?! administraci[oó]n)|comunidad de madrid.*consejer[ií]a/i, categoria: 'consejerias', label: 'Consejerías de la CAM' },

  // Servicio Madrileño de Salud y hospitales
  { regex: /servicio madrile[ñn]o de salud|hospital.*universitario|hospital.*general|hospital.*infanta|gerencia asistencial/i, categoria: 'salud', label: 'Salud (SERMAS y hospitales)' },

  // Agencias y entes de la Comunidad de Madrid
  { regex: /agencia.*vivienda social|agencia.*administraci[oó]n digital|agencia madrile[ñn]a|c[aá]mara de cuentas|asamblea de madrid|mesa de la asamblea|presidencia de la asamblea|consorcio regional de transportes/i, categoria: 'entes_cam', label: 'Entes y agencias de la CAM' },

  // Plenos de ayuntamiento
  { regex: /pleno del ayuntamiento/i, categoria: 'aytos_pleno', label: 'Ayuntamientos (Pleno)' },

  // Juntas de gobierno de ayuntamiento
  { regex: /junta de gobierno.*ayuntamiento|junta de gobierno local/i, categoria: 'aytos_junta', label: 'Ayuntamientos (Junta de Gobierno)' },

  // Alcaldías
  { regex: /alcald[ií]a.*ayuntamiento|alcaldia.*ayuntamiento/i, categoria: 'aytos_alcaldia', label: 'Ayuntamientos (Alcaldía)' },

  // Otros ayuntamientos (concejales, asambleas vecinales, etc.)
  { regex: /ayuntamiento de |concejal.*ayuntamiento|asamblea vecinal/i, categoria: 'aytos_otros', label: 'Ayuntamientos (otros)' },

  // Mancomunidades
  { regex: /mancomunidad/i, categoria: 'mancomunidades', label: 'Mancomunidades' },

  // Empresas municipales y consejos de administración
  { regex: /consejo de administraci[oó]n|consejer[iao] delegad[ao]|empresa municipal|gerencia.*municipal|gerencia.*empresa|ente p[uú]blico|patrimonio municipal|instituto municipal|club de campo/i, categoria: 'empresas_municipales', label: 'Empresas y entes municipales' },

  // Infraestructuras ferroviarias
  { regex: /adif|renfe|infraestructuras ferroviarias|seguridad ferroviaria/i, categoria: 'ferroviario', label: 'Sector ferroviario' },

  // Estado central (ministerios, tribunales, Senado, Congreso, etc.)
  { regex: /ministerio|senado|congreso de los diputados|tribunal constitucional|banco de espa[ñn]a|tesorer[ií]a general|fondo de garant[ií]a|oficina espa[ñn]ola|f[aá]brica nacional|instituto social de las fuerzas|consejo superior de deportes|instituto de mayores/i, categoria: 'estado_central', label: 'Administración General del Estado' },

  // Fundaciones e investigación
  { regex: /fundaci[oó]n|imdea|ciemat|investigaci[oó]n|cient[ií]fico|csic|inta|british council|red\.es/i, categoria: 'investigacion', label: 'Investigación y fundaciones' },

  // Asociaciones de desarrollo
  { regex: /asociaci[oó]n.*desarrollo|presidencia del centro iniciativas/i, categoria: 'desarrollo_rural', label: 'Desarrollo rural y local' },
];

/**
 * Determina la categoría de un organismo público a partir de su nombre.
 *
 * @param {string} nombre - Nombre del organismo
 * @returns {{ categoria: string, label: string }} Categoría y etiqueta legible
 */
export function categorizarOrganismo(nombre) {
  if (!nombre) return { categoria: 'otros', label: 'Otros' };
  for (const regla of REGLAS_CATEGORIA) {
    if (regla.regex.test(nombre)) {
      return { categoria: regla.categoria, label: regla.label };
    }
  }
  return { categoria: 'otros', label: 'Otros' };
}

/**
 * Devuelve el mapa completo de categorías con sus etiquetas legibles.
 * Útil para el frontend al construir los selectores.
 * @returns {Object<string, string>} Map categoria → label
 */
export function obtenerMapaCategorias() {
  const mapa = {};
  for (const regla of REGLAS_CATEGORIA) {
    mapa[regla.categoria] = regla.label;
  }
  mapa['otros'] = 'Otros';
  return mapa;
}

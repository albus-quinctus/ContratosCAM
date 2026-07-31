/**
 * scripts/enrich-nif.js
 *
 * Enriquece los contratos adjudicados que carecen de NIF del adjudicatario.
 * Usa múltiples fuentes gratuitas en cascada:
 *
 *   1. Caché local (data/processed/nif-cache.json)
 *   2. Scraping de la ficha PLACSP (url_origen del contrato)
 *   3. OpenCorporates API (500 req/día gratis)
 *
 * El script es idempotente: puede interrumpirse y reanudarse sin duplicar consultas.
 * Respeta rate limits y añade delays entre peticiones.
 *
 * Entrada:  data/processed/contratos-normalizados.json
 * Salida:   data/processed/contratos-normalizados.json (actualizado in-place)
 *           data/processed/nif-cache.json (caché persistente)
 *
 * Uso: node scripts/enrich-nif.js [--max=N] [--source=placsp|opencorporates|all]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRATOS_FILE = path.join(__dirname, '../data/processed/contratos-normalizados.json');
const CACHE_FILE = path.join(__dirname, '../data/processed/nif-cache.json');

// ─────────────────────────────────────────────────────────────────────────────
// Configuración
// ─────────────────────────────────────────────────────────────────────────────

/** Delay entre peticiones a PLACSP (ms) */
const DELAY_PLACSP_MS = 2_000;

/** Delay entre peticiones a OpenCorporates (ms) */
const DELAY_OPENCORPORATES_MS = 3_000;

/** Timeout por petición HTTP (ms) */
const TIMEOUT_MS = 15_000;

/** Máximo de consultas a OpenCorporates por ejecución (margen de seguridad sobre 500/día) */
const MAX_OPENCORPORATES_POR_EJECUCION = 400;

/** User-Agent identificativo del proyecto */
const USER_AGENT = 'ContratosCAM/0.1 (https://github.com/albus-quinctus/ContratosCAM; transparencia ciudadana)';

/** Regex para detectar NIF/CIF español en texto HTML */
const NIF_REGEX_HTML = /\b([ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J])\b/g;

/** Regex para validar formato NIF/CIF */
const NIF_VALIDO_REGEX = /^[ABCDEFGHJKLMNPQRSUVW]\d{7}[0-9A-J]$/;

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pausa la ejecución.
 * @param {number} ms
 */
function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Normaliza un nombre de empresa para usarlo como clave de caché.
 * Elimina puntuación, convierte a minúsculas, elimina formas jurídicas comunes.
 * @param {string} nombre
 * @returns {string}
 */
function normalizarNombreEmpresa(nombre) {
  if (!nombre) return '';
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Eliminar tildes
    .replace(/[.,;:'"()\-\/\\]/g, ' ')  // Puntuación → espacio
    .replace(/\b(s\.?l\.?u?\.?|s\.?a\.?|s\.?l\.?l\.?|s\.?c\.?|coop\.?)\b/gi, '') // Formas jurídicas
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch con timeout.
 * @param {string} url
 * @param {object} options
 * @returns {Promise<Response>}
 */
async function fetchConTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': USER_AGENT,
        ...options.headers,
      },
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Caché de NIFs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Carga la caché de NIFs desde disco.
 * @returns {Map<string, {nif: string, fuente: string, fecha: string}>}
 */
function cargarCache() {
  if (!fs.existsSync(CACHE_FILE)) {
    return new Map();
  }
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

/**
 * Guarda la caché de NIFs a disco.
 * @param {Map<string, object>} cache
 */
function guardarCache(cache) {
  const obj = Object.fromEntries(cache);
  fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuente 1: Scraping de ficha PLACSP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Intenta extraer el NIF del adjudicatario de la ficha web de PLACSP.
 * La página del contrato a veces muestra el NIF aunque no esté en el feed Atom.
 *
 * @param {string} url - URL de la ficha del contrato en PLACSP
 * @param {string} nombreAdjudicatario - Nombre del adjudicatario para validar
 * @returns {Promise<string|null>} NIF encontrado o null
 */
async function buscarNifEnPLACSP(url, nombreAdjudicatario) {
  if (!url || !url.startsWith('https://contrataciondelestado.es')) {
    return null;
  }

  try {
    const response = await fetchConTimeout(url, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'es-ES,es;q=0.9',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();

    // Buscar todos los NIFs en la página
    const nifs = [...html.matchAll(NIF_REGEX_HTML)].map(m => m[1]);

    if (nifs.length === 0) {
      return null;
    }

    // Si solo hay un NIF que no sea del organismo, es probablemente el adjudicatario
    // Filtrar NIFs que empiecen por letras típicas de empresas (B, A, etc.)
    const nifsEmpresa = nifs.filter(n => /^[ABCDEFGHJNPQRSUVW]/.test(n));

    if (nifsEmpresa.length === 1) {
      return nifsEmpresa[0];
    }

    // Si hay varios, buscar el que esté cerca del nombre del adjudicatario en el HTML
    if (nombreAdjudicatario && nifsEmpresa.length > 1) {
      const nombreLower = nombreAdjudicatario.toLowerCase();
      const posNombre = html.toLowerCase().indexOf(nombreLower);
      if (posNombre !== -1) {
        // Buscar el NIF más cercano al nombre del adjudicatario
        let nifMasCercano = null;
        let distanciaMinima = Infinity;

        for (const nif of nifsEmpresa) {
          const posNif = html.indexOf(nif, Math.max(0, posNombre - 500));
          if (posNif !== -1) {
            const distancia = Math.abs(posNif - posNombre);
            if (distancia < distanciaMinima) {
              distanciaMinima = distancia;
              nifMasCercano = nif;
            }
          }
        }

        if (nifMasCercano && distanciaMinima < 2000) {
          return nifMasCercano;
        }
      }
    }

    // Fallback: devolver el primer NIF de empresa encontrado
    return nifsEmpresa[0] || null;
  } catch (error) {
    // Timeout, error de red, etc. — no es crítico
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuente 2: OpenCorporates API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Busca el NIF/CIF de una empresa en OpenCorporates.
 * API gratuita con límite de 500 req/día.
 *
 * @param {string} nombreEmpresa - Nombre de la empresa
 * @returns {Promise<string|null>} NIF encontrado o null
 */
async function buscarNifEnOpenCorporates(nombreEmpresa) {
  if (!nombreEmpresa || nombreEmpresa.length < 3) {
    return null;
  }

  const query = encodeURIComponent(nombreEmpresa);
  const url = `https://api.opencorporates.com/v0.4/companies/search?q=${query}&jurisdiction_code=es&per_page=5&order=score`;

  try {
    const response = await fetchConTimeout(url, {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log('  ⚠️  Rate limit alcanzado en OpenCorporates');
        return 'RATE_LIMITED';
      }
      return null;
    }

    const data = await response.json();
    const companies = data?.results?.companies || [];

    if (companies.length === 0) {
      return null;
    }

    // Buscar la empresa con mejor coincidencia
    for (const item of companies) {
      const company = item.company;
      if (!company) continue;

      const companyNumber = company.company_number;
      // En España, company_number es el CIF/NIF
      if (companyNumber && NIF_VALIDO_REGEX.test(companyNumber)) {
        return companyNumber;
      }
    }

    return null;
  } catch (error) {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔍 ContratosCAM — Enriquecimiento de NIFs');
  console.log('═'.repeat(60));

  // Parsear argumentos
  const args = process.argv.slice(2);
  const maxArg = args.find(a => a.startsWith('--max='));
  const sourceArg = args.find(a => a.startsWith('--source='));
  const maxContratos = maxArg ? parseInt(maxArg.split('=')[1]) : Infinity;
  const source = sourceArg ? sourceArg.split('=')[1] : 'all';

  console.log(`📋 Configuración:`);
  console.log(`   Máximo contratos: ${maxContratos === Infinity ? 'sin límite' : maxContratos}`);
  console.log(`   Fuentes: ${source}`);
  console.log('');

  // Verificar que existe el archivo de contratos
  if (!fs.existsSync(CONTRATOS_FILE)) {
    console.error('❌ No se encontró contratos-normalizados.json');
    console.error('   Ejecuta primero: npm run transform');
    process.exit(1);
  }

  // Cargar contratos
  const contratos = JSON.parse(fs.readFileSync(CONTRATOS_FILE, 'utf-8'));
  console.log(`📥 Contratos cargados: ${contratos.length}`);

  // Identificar contratos que necesitan NIF
  const sinNif = contratos.filter(c =>
    c.adjudicatario != null &&
    c.adjudicatario !== '' &&
    c.nif_adjudicatario == null
  );
  console.log(`🔍 Contratos adjudicados sin NIF: ${sinNif.length}`);

  if (sinNif.length === 0) {
    console.log('\n✅ Todos los contratos adjudicados ya tienen NIF. Nada que hacer.');
    return;
  }

  // Cargar caché
  const cache = cargarCache();
  console.log(`💾 Caché cargada: ${cache.size} empresas conocidas`);

  // Estadísticas
  let encontradosCache = 0;
  let encontradosPLACSP = 0;
  let encontradosOpenCorp = 0;
  let noEncontrados = 0;
  let consultasPLACSP = 0;
  let consultasOpenCorp = 0;
  let rateLimited = false;

  // Limitar el número de contratos a procesar
  const contratosAProcesar = sinNif.slice(0, maxContratos);
  console.log(`\n🚀 Procesando ${contratosAProcesar.length} contratos...`);
  console.log('─'.repeat(60));

  for (let i = 0; i < contratosAProcesar.length; i++) {
    const contrato = contratosAProcesar[i];
    const nombreNorm = normalizarNombreEmpresa(contrato.adjudicatario);

    if (!nombreNorm) {
      noEncontrados++;
      continue;
    }

    // Progreso cada 50 contratos
    if (i > 0 && i % 50 === 0) {
      console.log(`  📊 Progreso: ${i}/${contratosAProcesar.length} | Cache: ${encontradosCache} | PLACSP: ${encontradosPLACSP} | OpenCorp: ${encontradosOpenCorp} | No encontrados: ${noEncontrados}`);
      // Guardar caché intermedia
      guardarCache(cache);
    }

    // ─── Paso 1: Consultar caché ─────────────────────────────────────────
    if (cache.has(nombreNorm)) {
      const cached = cache.get(nombreNorm);
      if (cached.nif) {
        contrato.nif_adjudicatario = cached.nif;
        encontradosCache++;
        continue;
      } else if (cached.no_encontrado) {
        // Ya se buscó antes y no se encontró — no repetir
        noEncontrados++;
        continue;
      }
    }

    // ─── Paso 2: Scraping PLACSP ─────────────────────────────────────────
    if (source === 'all' || source === 'placsp') {
      if (contrato.url_origen) {
        await esperar(DELAY_PLACSP_MS);
        consultasPLACSP++;

        const nif = await buscarNifEnPLACSP(contrato.url_origen, contrato.adjudicatario);
        if (nif) {
          contrato.nif_adjudicatario = nif;
          cache.set(nombreNorm, {
            nif,
            fuente: 'placsp_scraping',
            fecha: new Date().toISOString().split('T')[0],
            nombre_original: contrato.adjudicatario,
          });
          encontradosPLACSP++;
          continue;
        }
      }
    }

    // ─── Paso 3: OpenCorporates API ──────────────────────────────────────
    if ((source === 'all' || source === 'opencorporates') && !rateLimited) {
      if (consultasOpenCorp >= MAX_OPENCORPORATES_POR_EJECUCION) {
        if (!rateLimited) {
          console.log(`  ⚠️  Límite de OpenCorporates alcanzado (${MAX_OPENCORPORATES_POR_EJECUCION} consultas)`);
          rateLimited = true;
        }
      } else {
        await esperar(DELAY_OPENCORPORATES_MS);
        consultasOpenCorp++;

        const nif = await buscarNifEnOpenCorporates(contrato.adjudicatario);
        if (nif === 'RATE_LIMITED') {
          rateLimited = true;
        } else if (nif) {
          contrato.nif_adjudicatario = nif;
          cache.set(nombreNorm, {
            nif,
            fuente: 'opencorporates',
            fecha: new Date().toISOString().split('T')[0],
            nombre_original: contrato.adjudicatario,
          });
          encontradosOpenCorp++;
          continue;
        }
      }
    }

    // No encontrado en ninguna fuente
    cache.set(nombreNorm, {
      nif: null,
      no_encontrado: true,
      fecha: new Date().toISOString().split('T')[0],
      nombre_original: contrato.adjudicatario,
    });
    noEncontrados++;
  }

  // ─── Guardar resultados ─────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log('💾 Guardando resultados...');

  // Actualizar los contratos en el array original (por referencia de ID)
  const mapaActualizados = new Map();
  for (const c of contratosAProcesar) {
    if (c.nif_adjudicatario) {
      mapaActualizados.set(c.id, c.nif_adjudicatario);
    }
  }

  for (const contrato of contratos) {
    if (mapaActualizados.has(contrato.id)) {
      contrato.nif_adjudicatario = mapaActualizados.get(contrato.id);
    }
  }

  // Guardar contratos actualizados
  fs.writeFileSync(CONTRATOS_FILE, JSON.stringify(contratos, null, 2), 'utf-8');

  // Guardar caché
  guardarCache(cache);

  // ─── Resumen ────────────────────────────────────────────────────────────
  const totalEncontrados = encontradosCache + encontradosPLACSP + encontradosOpenCorp;
  const tamanoCache = (fs.statSync(CACHE_FILE).size / 1024).toFixed(1);

  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE ENRIQUECIMIENTO DE NIFs');
  console.log('─'.repeat(60));
  console.log(`  🔍 Contratos procesados: ${contratosAProcesar.length}`);
  console.log(`  ✅ NIFs encontrados: ${totalEncontrados} (${(totalEncontrados / contratosAProcesar.length * 100).toFixed(1)}%)`);
  console.log(`     • Desde caché: ${encontradosCache}`);
  console.log(`     • Desde PLACSP scraping: ${encontradosPLACSP}`);
  console.log(`     • Desde OpenCorporates: ${encontradosOpenCorp}`);
  console.log(`  ❌ No encontrados: ${noEncontrados}`);
  console.log(`  📡 Consultas realizadas:`);
  console.log(`     • PLACSP: ${consultasPLACSP}`);
  console.log(`     • OpenCorporates: ${consultasOpenCorp}/${MAX_OPENCORPORATES_POR_EJECUCION}`);
  console.log(`  💾 Caché: ${cache.size} empresas (${tamanoCache} KB)`);
  console.log('═'.repeat(60));

  // Completitud final
  const totalConNif = contratos.filter(c => c.nif_adjudicatario).length;
  const totalAdjudicados = contratos.filter(c => c.adjudicatario).length;
  console.log(`\n📈 Completitud NIF: ${totalConNif}/${totalAdjudicados} adjudicados (${(totalConNif / totalAdjudicados * 100).toFixed(1)}%)`);

  console.log('\n✅ Enriquecimiento completado.');
  if (noEncontrados > 0) {
    console.log(`💡 Ejecuta de nuevo mañana para reintentar con OpenCorporates (${MAX_OPENCORPORATES_POR_EJECUCION} consultas/día).`);
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

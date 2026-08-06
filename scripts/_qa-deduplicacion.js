/**
 * scripts/_qa-deduplicacion.js
 *
 * QA de las funciones de unificación de duplicados implementadas en:
 *   - scripts/transform.js  → canonizarAdjudicatarios(), normalizarOrganismo()
 *   - src/web/js/ranking.js → construirRanking() (agrupación por NIF + clave suave)
 *
 * Uso: node scripts/_qa-deduplicacion.js
 */

// ─────────────────────────────────────────────────────────────────────────────
// Copias inline de las funciones a testear (espejo de los archivos fuente)
// ─────────────────────────────────────────────────────────────────────────────

// ── Funciones de normalización compartidas ───────────────────────────────────

function _claveOrganismo(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _claveEmpresa(nombre) {
  return nombre
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[.,;]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function _nombreCanónico(frecuencias) {
  return [...frecuencias.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
}

// ── normalizarOrganismo ───────────────────────────────────────────────────────

const NORMALIZACION_ORGANISMOS = {
  'Consejeria de Sanidad': 'Consejería de Sanidad',
  'CONSEJERÍA DE SANIDAD': 'Consejería de Sanidad',
  'Consejería de Sanidad de la Comunidad de Madrid': 'Consejería de Sanidad',
  'Consejeria de Educación, Ciencia y Universidades': 'Consejería de Educación, Ciencia y Universidades',
  'CONSEJERÍA DE EDUCACIÓN, CIENCIA Y UNIVERSIDADES': 'Consejería de Educación, Ciencia y Universidades',
  'Consejería de Educación y Juventud': 'Consejería de Educación, Ciencia y Universidades',
  'Consejeria de Educacion': 'Consejería de Educación, Ciencia y Universidades',
  'Canal de Isabel II, S.A.': 'Canal de Isabel II',
  'Canal de Isabel II SA': 'Canal de Isabel II',
  'CANAL DE ISABEL II': 'Canal de Isabel II',
  'Canal Isabel II': 'Canal de Isabel II',
  'Agencia Madrileña de Atención Social (AMAS)': 'Agencia Madrileña de Atención Social',
  'AGENCIA MADRILEÑA DE ATENCIÓN SOCIAL': 'Agencia Madrileña de Atención Social',
};

const _indiceOrganismos = new Map(
  Object.entries(NORMALIZACION_ORGANISMOS).map(([v, c]) => [_claveOrganismo(v), c])
);

function normalizarOrganismo(nombre) {
  if (!nombre) return null;
  const limpio = nombre.replace(/\s+/g, ' ').trim();
  if (NORMALIZACION_ORGANISMOS[limpio]) return NORMALIZACION_ORGANISMOS[limpio];
  const clave = _claveOrganismo(limpio);
  if (_indiceOrganismos.has(clave)) return _indiceOrganismos.get(clave);
  return limpio;
}

// ── canonizarAdjudicatarios ───────────────────────────────────────────────────

function canonizarAdjudicatarios(contratos) {
  // Pasada A: agrupar por NIF
  const porNIF = new Map();
  for (const c of contratos) {
    if (!c.nif_adjudicatario || !c.adjudicatario) continue;
    if (!porNIF.has(c.nif_adjudicatario)) porNIF.set(c.nif_adjudicatario, new Map());
    const freq = porNIF.get(c.nif_adjudicatario);
    freq.set(c.adjudicatario, (freq.get(c.adjudicatario) || 0) + 1);
  }
  const canonicoNIF = new Map();
  for (const [nif, freq] of porNIF) canonicoNIF.set(nif, _nombreCanónico(freq));

  // Pasada B: agrupar por clave suave (sin NIF)
  const porClave = new Map();
  for (const c of contratos) {
    if (c.nif_adjudicatario || !c.adjudicatario) continue;
    const clave = _claveEmpresa(c.adjudicatario);
    if (!porClave.has(clave)) porClave.set(clave, new Map());
    const freq = porClave.get(clave);
    freq.set(c.adjudicatario, (freq.get(c.adjudicatario) || 0) + 1);
  }
  const canonicoClave = new Map();
  for (const [clave, freq] of porClave) canonicoClave.set(clave, _nombreCanónico(freq));

  // Aplicar
  let renombrados = 0;
  const resultado = contratos.map(c => {
    if (!c.adjudicatario) return c;
    const nombreCanónico = c.nif_adjudicatario
      ? canonicoNIF.get(c.nif_adjudicatario)
      : canonicoClave.get(_claveEmpresa(c.adjudicatario));
    if (!nombreCanónico || c.adjudicatario === nombreCanónico) return c;
    renombrados++;
    return { ...c, adjudicatario: nombreCanónico };
  });
  return { contratos: resultado, stats: { nifs: canonicoNIF.size, claves: canonicoClave.size, renombrados } };
}

// ── construirRanking ──────────────────────────────────────────────────────────

function construirRanking(contratos) {
  const mapa = new Map();
  for (const c of contratos) {
    if (!c.adjudicatario) continue;
    const clave = c.nif_adjudicatario
      ? 'NIF:' + c.nif_adjudicatario
      : 'NOMBRE:' + _claveEmpresa(c.adjudicatario);
    if (!mapa.has(clave)) {
      mapa.set(clave, {
        nif: c.nif_adjudicatario || null,
        frecuenciaNombres: new Map(),
        contratos: [],
        importeTotal: 0,
        tipos: new Set(),
        organismos: new Set(),
        anios: new Set(),
      });
    }
    const entrada = mapa.get(clave);
    if (!entrada.nif && c.nif_adjudicatario) entrada.nif = c.nif_adjudicatario;
    const nombreLimpio = c.adjudicatario.trim();
    entrada.frecuenciaNombres.set(nombreLimpio, (entrada.frecuenciaNombres.get(nombreLimpio) || 0) + 1);
    entrada.contratos.push(c);
    entrada.importeTotal += c.importe || 0;
    if (c.tipo) entrada.tipos.add(c.tipo);
    if (c.organismo) entrada.organismos.add(c.organismo);
    if (c.fecha_publicacion) {
      const anio = c.fecha_publicacion.substring(0, 4);
      if (anio) entrada.anios.add(anio);
    }
  }
  return [...mapa.values()].map(entrada => {
    const n = entrada.contratos.length;
    return {
      nombre: _nombreCanónico(entrada.frecuenciaNombres),
      nif: entrada.nif,
      numContratos: n,
      importeTotal: entrada.importeTotal,
      importeMedio: n > 0 ? entrada.importeTotal / n : 0,
      tipos: [...entrada.tipos].sort(),
      organismos: [...entrada.organismos].sort(),
      anios: [...entrada.anios].sort(),
      contratos: entrada.contratos,
    };
  }).sort((a, b) => b.importeTotal - a.importeTotal);
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de test
// ─────────────────────────────────────────────────────────────────────────────

let pasados = 0;
let fallados = 0;

function assert(descripcion, obtenido, esperado) {
  const ok = obtenido === esperado;
  if (ok) {
    console.log(`  ✅ ${descripcion}`);
    pasados++;
  } else {
    console.error(`  ❌ ${descripcion}`);
    console.error(`     Esperado : ${JSON.stringify(esperado)}`);
    console.error(`     Obtenido : ${JSON.stringify(obtenido)}`);
    fallados++;
  }
}

function assertDeep(descripcion, obtenido, esperado) {
  const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
  if (ok) {
    console.log(`  ✅ ${descripcion}`);
    pasados++;
  } else {
    console.error(`  ❌ ${descripcion}`);
    console.error(`     Esperado : ${JSON.stringify(esperado)}`);
    console.error(`     Obtenido : ${JSON.stringify(obtenido)}`);
    fallados++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 1: normalizarOrganismo()
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('SUITE 1: normalizarOrganismo()');
console.log('══════════════════════════════════════════════════════════');

// Coincidencia exacta en tabla
assert(
  'Coincidencia exacta: "Consejeria de Sanidad"',
  normalizarOrganismo('Consejeria de Sanidad'),
  'Consejería de Sanidad'
);
assert(
  'Coincidencia exacta: "CONSEJERÍA DE SANIDAD" (mayúsculas)',
  normalizarOrganismo('CONSEJERÍA DE SANIDAD'),
  'Consejería de Sanidad'
);
assert(
  'Coincidencia exacta: "Canal de Isabel II, S.A."',
  normalizarOrganismo('Canal de Isabel II, S.A.'),
  'Canal de Isabel II'
);

// Equivalencia normalizada (sin tilde + sin puntuación)
assert(
  'Equivalencia normalizada: "consejeria de sanidad" (todo minúsculas)',
  normalizarOrganismo('consejeria de sanidad'),
  'Consejería de Sanidad'
);
assert(
  'Equivalencia normalizada: "CONSEJERIA DE SANIDAD" (mayúsculas sin tilde)',
  normalizarOrganismo('CONSEJERIA DE SANIDAD'),
  'Consejería de Sanidad'
);
assert(
  'Equivalencia normalizada: "canal de isabel ii sa" (sin puntuación)',
  normalizarOrganismo('canal de isabel ii sa'),
  'Canal de Isabel II'
);
assert(
  'Equivalencia normalizada: "AGENCIA MADRILEÑA DE ATENCION SOCIAL" (sin tilde)',
  normalizarOrganismo('AGENCIA MADRILEÑA DE ATENCION SOCIAL'),
  'Agencia Madrileña de Atención Social'
);

// Sin cambio (nombre desconocido)
assert(
  'Sin cambio: nombre desconocido se devuelve limpio',
  normalizarOrganismo('  Organismo Desconocido S.L.  '),
  'Organismo Desconocido S.L.'
);

// Null/vacío
assert('null → null', normalizarOrganismo(null), null);

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 2: canonizarAdjudicatarios()
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('SUITE 2: canonizarAdjudicatarios()');
console.log('══════════════════════════════════════════════════════════');

// Caso ACSA: 5 variantes del mismo NIF
const contratosACSA = [
  { id: 1, adjudicatario: 'ACSA OBRAS E INFRAESTRUCTURAS SA',              nif_adjudicatario: 'A08112716', importe: 100000 },
  { id: 2, adjudicatario: 'ACSA, OBRAS E INFRAESTRUCTURAS, S.A.U.',        nif_adjudicatario: 'A08112716', importe: 200000 },
  { id: 3, adjudicatario: 'ACSA OBRAS E INFRAESTRUCTURAS S.A.U',           nif_adjudicatario: 'A08112716', importe: 150000 },
  { id: 4, adjudicatario: 'ACSA OBRAS E INFRAESTRUCTURAS SAU',             nif_adjudicatario: 'A08112716', importe: 300000 },
  { id: 5, adjudicatario: 'ACSA OBRAS E INFRAESTRUCTURAS SAU',             nif_adjudicatario: 'A08112716', importe: 250000 },
  // NIF diferente: no debe verse afectado
  { id: 6, adjudicatario: 'ACSA AUXILIAR DE SERVICIOS Y ASISTENCIA SLU',   nif_adjudicatario: 'U19360510', importe: 50000  },
];

const { contratos: canonizados, stats } = canonizarAdjudicatarios(contratosACSA);

// El nombre más frecuente de A08112716 es "ACSA OBRAS E INFRAESTRUCTURAS SAU" (2 veces)
assert(
  'ACSA: nombre canónico es el más frecuente ("ACSA OBRAS E INFRAESTRUCTURAS SAU")',
  canonizados.find(c => c.id === 1).adjudicatario,
  'ACSA OBRAS E INFRAESTRUCTURAS SAU'
);
assert(
  'ACSA: variante con coma también se unifica',
  canonizados.find(c => c.id === 2).adjudicatario,
  'ACSA OBRAS E INFRAESTRUCTURAS SAU'
);
assert(
  'ACSA: NIF diferente (U19360510) no se modifica',
  canonizados.find(c => c.id === 6).adjudicatario,
  'ACSA AUXILIAR DE SERVICIOS Y ASISTENCIA SLU'
);
assert(
  'Stats: 2 NIFs procesados (A08112716 + U19360510)',
  stats.nifs,
  2
);
assert(
  'Stats: 3 contratos renombrados (ids 1, 2, 3 — los que no eran el canónico)',
  stats.renombrados,
  3
);

// Caso: empate en frecuencia → gana el más largo
const contratosEmpate = [
  { id: 10, adjudicatario: 'EMPRESA CORTA SA',          nif_adjudicatario: 'B12345678', importe: 10000 },
  { id: 11, adjudicatario: 'EMPRESA CORTA SOCIEDAD ANONIMA', nif_adjudicatario: 'B12345678', importe: 20000 },
];
const { contratos: canonizadosEmpate } = canonizarAdjudicatarios(contratosEmpate);
assert(
  'Empate en frecuencia: gana el nombre más largo',
  canonizadosEmpate.find(c => c.id === 10).adjudicatario,
  'EMPRESA CORTA SOCIEDAD ANONIMA'
);

// Caso: empresas sin NIF con variantes de puntuación → clave suave las unifica
const contratosRecio = [
  { id: 30, adjudicatario: 'RECIO, S.L.U.',  nif_adjudicatario: null, importe: 10000 },
  { id: 31, adjudicatario: 'Recio, S.L.',    nif_adjudicatario: null, importe: 20000 },
  { id: 32, adjudicatario: 'RECIO, S.L.',    nif_adjudicatario: null, importe: 15000 },
  { id: 33, adjudicatario: 'RECIO S.L.',     nif_adjudicatario: null, importe: 30000 },
  { id: 34, adjudicatario: 'RECIO SL',       nif_adjudicatario: null, importe: 25000 },
  // Forma jurídica distinta → NO debe unificarse con las anteriores
  { id: 35, adjudicatario: 'RECIO, S.A.',    nif_adjudicatario: null, importe: 50000 },
];
const { contratos: canonizadosRecio, stats: statsRecio } = canonizarAdjudicatarios(contratosRecio);

// "RECIO SL" es el más frecuente (1 vez cada variante) → gana el más largo: "RECIO, S.L.U."
// Pero "RECIO, S.L.U." y "RECIO SL" tienen clave "recio slu" vs "recio sl" → son distintas
// "RECIO, S.L.", "RECIO, S.L.", "RECIO S.L.", "RECIO SL" → clave "recio sl" (4 contratos)
// "RECIO, S.L.U." → clave "recio slu" (1 contrato, no se modifica)
// "RECIO, S.A." → clave "recio sa" (1 contrato, no se modifica)
assert(
  'Clave suave: "RECIO, S.L." y "RECIO SL" se unifican (misma clave "recio sl")',
  canonizadosRecio.find(c => c.id === 31).adjudicatario,
  canonizadosRecio.find(c => c.id === 34).adjudicatario
);
assert(
  'Clave suave: "RECIO, S.A." NO se unifica con "RECIO SL" (forma jurídica distinta)',
  canonizadosRecio.find(c => c.id === 35).adjudicatario,
  'RECIO, S.A.'
);
assert(
  'Clave suave: "RECIO, S.L.U." NO se unifica con "RECIO SL" (forma jurídica distinta)',
  canonizadosRecio.find(c => c.id === 30).adjudicatario,
  'RECIO, S.L.U.'
);
assert(
  'Stats: 0 NIFs procesados (todos sin NIF)',
  statsRecio.nifs,
  0
);
assert(
  'Stats: 3 claves suaves procesadas (recio sl, recio slu, recio sa)',
  statsRecio.claves,
  3
);

// Caso: contrato sin NIF único → no se modifica
const contratosSinNIF = [
  { id: 20, adjudicatario: 'EMPRESA UNICA SIN NIF', nif_adjudicatario: null,       importe: 5000 },
  { id: 21, adjudicatario: 'EMPRESA CON NIF',        nif_adjudicatario: 'C99999999', importe: 5000 },
];
const { contratos: canonizadosSinNIF } = canonizarAdjudicatarios(contratosSinNIF);
assert(
  'Contrato sin NIF único: adjudicatario no se modifica',
  canonizadosSinNIF.find(c => c.id === 20).adjudicatario,
  'EMPRESA UNICA SIN NIF'
);

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: construirRanking() — agrupación por NIF y clave suave
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('SUITE 3: construirRanking() — agrupación por NIF y clave suave');
console.log('══════════════════════════════════════════════════════════');

const contratosRanking = [
  // Misma empresa, mismo NIF, nombres distintos → debe ser 1 entrada
  { adjudicatario: 'ACSA OBRAS SA',          nif_adjudicatario: 'A08112716', importe: 100000, tipo: 'obras',     organismo: 'Consejería de Sanidad',    fecha_publicacion: '2024-01-01' },
  { adjudicatario: 'ACSA, OBRAS, S.A.U.',    nif_adjudicatario: 'A08112716', importe: 200000, tipo: 'servicios', organismo: 'Consejería de Educación',   fecha_publicacion: '2024-02-01' },
  { adjudicatario: 'ACSA OBRAS SA',          nif_adjudicatario: 'A08112716', importe: 150000, tipo: 'obras',     organismo: 'Consejería de Sanidad',    fecha_publicacion: '2024-03-01' },
  // Empresa diferente, sin NIF → entrada separada por nombre
  { adjudicatario: 'OTRA EMPRESA SL',        nif_adjudicatario: null,        importe:  50000, tipo: 'servicios', organismo: 'Consejería de Hacienda',   fecha_publicacion: '2024-01-15' },
  { adjudicatario: 'OTRA EMPRESA SL',        nif_adjudicatario: null,        importe:  30000, tipo: 'servicios', organismo: 'Consejería de Hacienda',   fecha_publicacion: '2024-02-15' },
  // Sin adjudicatario → no debe aparecer en el ranking
  { adjudicatario: null,                     nif_adjudicatario: null,        importe:  10000, tipo: 'obras',     organismo: 'Consejería de Sanidad',    fecha_publicacion: '2024-01-01' },
];

const ranking = construirRanking(contratosRanking);

assert(
  'Ranking: 2 entradas (ACSA agrupada por NIF + OTRA EMPRESA agrupada por nombre)',
  ranking.length,
  2
);

const entradaACSA = ranking.find(e => e.nif === 'A08112716');
assert(
  'ACSA: 3 contratos agrupados bajo el mismo NIF',
  entradaACSA?.numContratos,
  3
);
assert(
  'ACSA: importe total correcto (100k + 200k + 150k = 450k)',
  entradaACSA?.importeTotal,
  450000
);
assert(
  'ACSA: nombre canónico es el más frecuente ("ACSA OBRAS SA", 2 veces)',
  entradaACSA?.nombre,
  'ACSA OBRAS SA'
);
assert(
  'ACSA: 2 tipos distintos detectados',
  entradaACSA?.tipos.length,
  2
);

const entradaOtra = ranking.find(e => e.nombre === 'OTRA EMPRESA SL');
assert(
  'OTRA EMPRESA: 2 contratos agrupados por clave suave (sin NIF)',
  entradaOtra?.numContratos,
  2
);
assert(
  'OTRA EMPRESA: importe total correcto (50k + 30k = 80k)',
  entradaOtra?.importeTotal,
  80000
);
assert(
  'Ranking ordenado: ACSA (450k) antes que OTRA EMPRESA (80k)',
  ranking[0].nif,
  'A08112716'
);

// Test clave suave en construirRanking: variantes de puntuación sin NIF → 1 entrada
const contratosRankingSuave = [
  { adjudicatario: 'RECIO, S.L.',  nif_adjudicatario: null, importe: 20000, tipo: 'servicios', organismo: 'Org A', fecha_publicacion: '2024-01-01' },
  { adjudicatario: 'RECIO S.L.',   nif_adjudicatario: null, importe: 15000, tipo: 'servicios', organismo: 'Org A', fecha_publicacion: '2024-02-01' },
  { adjudicatario: 'RECIO SL',     nif_adjudicatario: null, importe: 30000, tipo: 'servicios', organismo: 'Org B', fecha_publicacion: '2024-03-01' },
  // Forma jurídica distinta → entrada separada
  { adjudicatario: 'RECIO, S.A.',  nif_adjudicatario: null, importe: 50000, tipo: 'obras',     organismo: 'Org C', fecha_publicacion: '2024-01-15' },
];
const rankingSuave = construirRanking(contratosRankingSuave);

assert(
  'Ranking clave suave: 2 entradas (RECIO SL + RECIO SA, formas jurídicas distintas)',
  rankingSuave.length,
  2
);
const entradaRecioSL = rankingSuave.find(e => _claveEmpresa(e.nombre).startsWith('recio sl'));
assert(
  'Ranking clave suave: RECIO SL agrupa 3 contratos',
  entradaRecioSL?.numContratos,
  3
);
assert(
  'Ranking clave suave: RECIO SL importe total (20k+15k+30k=65k)',
  entradaRecioSL?.importeTotal,
  65000
);
const entradaRecioSA = rankingSuave.find(e => _claveEmpresa(e.nombre) === 'recio sa');
assert(
  'Ranking clave suave: RECIO SA es entrada separada (1 contrato)',
  entradaRecioSA?.numContratos,
  1
);

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 4: QA sobre datos reales (contratos-normalizados.json)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log('SUITE 4: Análisis de datos reales');
console.log('══════════════════════════════════════════════════════════');

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, '../data/processed/contratos-normalizados.json');

if (!fs.existsSync(DATA_FILE)) {
  console.log('  ⚠️  No se encontró contratos-normalizados.json — omitiendo suite 4');
} else {
  const contratos = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  console.log(`  📥 ${contratos.length} contratos cargados`);

  // 4a: Detectar NIFs con múltiples nombres (antes de canonizar)
  const nifANombres = new Map();
  for (const c of contratos) {
    if (!c.nif_adjudicatario || !c.adjudicatario) continue;
    if (!nifANombres.has(c.nif_adjudicatario)) nifANombres.set(c.nif_adjudicatario, new Set());
    nifANombres.get(c.nif_adjudicatario).add(c.adjudicatario.trim());
  }
  const nifsConVariantes = [...nifANombres.entries()].filter(([, nombres]) => nombres.size > 1);
  console.log(`\n  📊 NIFs con múltiples nombres de empresa: ${nifsConVariantes.length}`);
  if (nifsConVariantes.length > 0) {
    console.log('  Top 5 casos con más variantes:');
    nifsConVariantes
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 5)
      .forEach(([nif, nombres]) => {
        console.log(`    NIF ${nif} (${nombres.size} variantes):`);
        [...nombres].forEach(n => console.log(`      · ${n}`));
      });
  }

  // 4b: Aplicar canonización y medir impacto
  const { contratos: canonizados2, stats: stats2 } = canonizarAdjudicatarios(contratos);
  console.log(`\n  🏷️  Canonización aplicada:`);
  console.log(`    · NIFs únicos procesados: ${stats2.nifs}`);
  console.log(`    · Contratos renombrados:  ${stats2.renombrados}`);

  // 4c: Verificar que ACSA queda unificado si existe en los datos
  const contratosACSAReal = canonizados2.filter(c => c.nif_adjudicatario === 'A08112716');
  if (contratosACSAReal.length > 0) {
    const nombresACSA = new Set(contratosACSAReal.map(c => c.adjudicatario));
    console.log(`\n  🔍 ACSA (NIF A08112716): ${contratosACSAReal.length} contratos`);
    console.log(`    · Nombres distintos tras canonizar: ${nombresACSA.size} (esperado: 1)`);
    if (nombresACSA.size === 1) {
      console.log(`    · ✅ Nombre canónico: "${[...nombresACSA][0]}"`);
      pasados++;
    } else {
      console.error(`    · ❌ Aún hay ${nombresACSA.size} variantes: ${[...nombresACSA].join(', ')}`);
      fallados++;
    }
  } else {
    console.log('\n  ℹ️  NIF A08112716 (ACSA) no encontrado en los datos actuales');
  }

  // 4d: Verificar normalización de organismos en datos reales
  const organismosBrutos = [...new Set(contratos.map(c => c.organismo).filter(Boolean))];
  const organismosNormalizados = organismosBrutos.map(o => normalizarOrganismo(o));
  const cambiosOrganismos = organismosBrutos.filter((o, i) => o !== organismosNormalizados[i]);
  console.log(`\n  🏛️  Organismos únicos en datos: ${organismosBrutos.length}`);
  console.log(`    · Organismos que serían normalizados: ${cambiosOrganismos.length}`);
  if (cambiosOrganismos.length > 0) {
    console.log('    Ejemplos:');
    cambiosOrganismos.slice(0, 5).forEach(o => {
      console.log(`      "${o}" → "${normalizarOrganismo(o)}"`);
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resumen final
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════════════════════');
console.log(`RESULTADO: ${pasados} pasados, ${fallados} fallados`);
console.log('══════════════════════════════════════════════════════════\n');

if (fallados > 0) process.exit(1);

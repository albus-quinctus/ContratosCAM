/**
 * scripts/_qa-deduplicacion.js
 *
 * Suite de tests unitarios para el módulo de resolución de entidades.
 * Verifica: claveEmpresa, claveOrganismo, nombreCanónico, diceCoefficient,
 * EntityResolver, construirRegistro y aplicarResolucion.
 *
 * Uso: node scripts/_qa-deduplicacion.js
 */

import {
  claveEmpresa,
  claveOrganismo,
  nombreCanónico,
  diceCoefficient,
  EntityResolver,
  construirRegistro,
  aplicarResolucion,
} from './lib/entity-resolver.js';

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de test
// ─────────────────────────────────────────────────────────────────────────────

let totalTests = 0;
let pasados = 0;
let fallidos = 0;

function assert(descripcion, obtenido, esperado) {
  totalTests++;
  if (obtenido === esperado) {
    pasados++;
    console.log(`  ✅ ${descripcion}`);
  } else {
    fallidos++;
    console.error(`  ❌ ${descripcion}`);
    console.error(`     Esperado: ${JSON.stringify(esperado)}`);
    console.error(`     Obtenido: ${JSON.stringify(obtenido)}`);
  }
}

function assertDeep(descripcion, obtenido, esperado) {
  totalTests++;
  const a = JSON.stringify(obtenido);
  const b = JSON.stringify(esperado);
  if (a === b) {
    pasados++;
    console.log(`  ✅ ${descripcion}`);
  } else {
    fallidos++;
    console.error(`  ❌ ${descripcion}`);
    console.error(`     Esperado: ${b}`);
    console.error(`     Obtenido: ${a}`);
  }
}

function assertApprox(descripcion, obtenido, esperado, tolerancia = 0.01) {
  totalTests++;
  if (Math.abs(obtenido - esperado) <= tolerancia) {
    pasados++;
    console.log(`  ✅ ${descripcion}`);
  } else {
    fallidos++;
    console.error(`  ❌ ${descripcion}`);
    console.error(`     Esperado: ~${esperado} (±${tolerancia})`);
    console.error(`     Obtenido: ${obtenido}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: claveEmpresa
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: claveEmpresa()');

assert('Minúsculas y sin puntos',
  claveEmpresa('RECIO, S.L.'), 'recio sl');

assert('Sin tildes',
  claveEmpresa('Construcción Técnica, S.A.'), 'construccion tecnica sa');

assert('Variantes de ACSA convergen',
  claveEmpresa('ACSA, Obras e Infraestructuras, S.A.U.'),
  claveEmpresa('ACSA Obras e Infraestructuras SAU'));

assert('Conserva forma jurídica (SL ≠ SA)',
  claveEmpresa('RECIO S.L.') !== claveEmpresa('RECIO S.A.'), true);

assert('Espacios múltiples se colapsan',
  claveEmpresa('  Empresa   Test   S.L.  '), 'empresa test sl');

assert('Punto y coma se elimina',
  claveEmpresa('Empresa; Test; S.L.'), 'empresa test sl');

assert('String vacío con espacios',
  claveEmpresa('   '), '');

// ─────────────────────────────────────────────────────────────────────────────
// Tests: claveOrganismo
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: claveOrganismo()');

assert('Elimina toda puntuación',
  claveOrganismo('Consejería de Educación, Ciencia y Universidades'),
  'consejeria de educacion ciencia y universidades');

assert('Paréntesis y guiones se eliminan',
  claveOrganismo('Canal de Isabel II (Gestión)'),
  'canal de isabel ii gestion');

assert('Variantes convergen',
  claveOrganismo('CONSEJERÍA DE EDUCACIÓN'),
  claveOrganismo('Consejeria de Educacion'));

assert('Barras y dos puntos se eliminan',
  claveOrganismo('D.G. de Patrimonio / Cultura'),
  'dg de patrimonio cultura');

// ─────────────────────────────────────────────────────────────────────────────
// Tests: nombreCanónico
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: nombreCanónico()');

assert('Elige el más frecuente',
  nombreCanónico(new Map([['ACSA S.A.U.', 3], ['ACSA, S.A.U.', 1], ['Acsa SAU', 1]])),
  'ACSA S.A.U.');

assert('Empate → elige el más largo',
  nombreCanónico(new Map([['RECIO S.L.', 2], ['RECIO, S.L.', 2]])),
  'RECIO, S.L.');

assert('Un solo nombre',
  nombreCanónico(new Map([['Empresa Única', 5]])),
  'Empresa Única');

// ─────────────────────────────────────────────────────────────────────────────
// Tests: diceCoefficient
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: diceCoefficient()');

assert('Strings idénticos → 1',
  diceCoefficient('hello', 'hello'), 1);

assert('Strings totalmente distintos → 0',
  diceCoefficient('ab', 'cd'), 0);

assert('String corto (1 char) → 0',
  diceCoefficient('a', 'ab'), 0);

assertApprox('Strings similares → alto',
  diceCoefficient('ofipapel center', 'ofi papel center'), 0.86, 0.1);

assertApprox('Strings muy distintos → bajo',
  diceCoefficient('empresa abc', 'xyz corporation'), 0.1, 0.15);

// ─────────────────────────────────────────────────────────────────────────────
// Tests: EntityResolver
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: EntityResolver');

const registroTest = {
  empresas: {
    'A12345678': {
      nombre_canonico: 'ACSA Obras e Infraestructuras S.A.U.',
      aliases: ['ACSA, Obras e Infraestructuras, S.A.U.', 'ACSA S.A.U.', 'Acsa SAU'],
      fuente: 'auto',
    },
    'B87654321': {
      nombre_canonico: 'Recio S.L.',
      aliases: ['RECIO, S.L.', 'RECIO S.L.'],
      fuente: 'auto',
    },
  },
  aliases_sin_nif: {
    'recio sl': 'B87654321',
  },
  organismos: {
    'org1': {
      nombre_canonico: 'Consejería de Educación, Ciencia y Universidades',
      aliases: ['Consejeria de Educacion', 'CONSEJERÍA DE EDUCACIÓN, CIENCIA Y UNIVERSIDADES'],
    },
  },
};

const resolver = new EntityResolver(registroTest);

// Resolución por NIF exacto
{
  const r = resolver.resolverEmpresa('ACSA S.A.U.', 'A12345678');
  assert('Resolver por NIF → entityId correcto', r.entityId, 'A12345678');
  assert('Resolver por NIF → nombre canónico', r.nombreCanónico, 'ACSA Obras e Infraestructuras S.A.U.');
}

// Resolución por clave normalizada (alias)
{
  const r = resolver.resolverEmpresa('ACSA, Obras e Infraestructuras, S.A.U.', null);
  assert('Resolver por alias → entityId correcto', r.entityId, 'A12345678');
  assert('Resolver por alias → nombre canónico', r.nombreCanónico, 'ACSA Obras e Infraestructuras S.A.U.');
}

// Resolución por alias_sin_nif
{
  const r = resolver.resolverEmpresa('RECIO SL', null);
  assert('Resolver por alias_sin_nif → entityId', r.entityId, 'B87654321');
  assert('Resolver por alias_sin_nif → nombre canónico', r.nombreCanónico, 'Recio S.L.');
}

// NIF no registrado → usa NIF como entityId
{
  const r = resolver.resolverEmpresa('Empresa Desconocida', 'X99999999');
  assert('NIF no registrado → entityId = NIF', r.entityId, 'X99999999');
  assert('NIF no registrado → nombre = original', r.nombreCanónico, 'Empresa Desconocida');
}

// Sin NIF ni match → null
{
  const r = resolver.resolverEmpresa('Empresa Totalmente Nueva', null);
  assert('Sin match → entityId null', r.entityId, null);
  assert('Sin match → nombreCanónico null', r.nombreCanónico, null);
}

// Resolver organismo
{
  const r = resolver.resolverOrganismo('Consejeria de Educacion');
  assert('Organismo alias → nombre canónico',
    r, 'Consejería de Educación, Ciencia y Universidades');
}

{
  const r = resolver.resolverOrganismo('Organismo Desconocido');
  assert('Organismo sin match → devuelve original', r, 'Organismo Desconocido');
}

{
  const r = resolver.resolverOrganismo(null);
  assert('Organismo null → null', r, null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests: construirRegistro
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: construirRegistro()');

const contratosTest = [
  { adjudicatario: 'ACSA S.A.U.', nif_adjudicatario: 'A12345678', organismo: 'Test' },
  { adjudicatario: 'ACSA S.A.U.', nif_adjudicatario: 'A12345678', organismo: 'Test' },
  { adjudicatario: 'ACSA S.A.U.', nif_adjudicatario: 'A12345678', organismo: 'Test' },
  { adjudicatario: 'ACSA, Obras e Infraestructuras, S.A.U.', nif_adjudicatario: 'A12345678', organismo: 'Test' },
  { adjudicatario: 'Acsa SAU', nif_adjudicatario: 'A12345678', organismo: 'Test' },
  { adjudicatario: 'Recio S.L.', nif_adjudicatario: 'B11111111', organismo: 'Test' },
  { adjudicatario: 'RECIO, S.L.', nif_adjudicatario: 'B11111111', organismo: 'Test' },
  { adjudicatario: 'Empresa Sin NIF', nif_adjudicatario: null, organismo: 'Test' },
  { adjudicatario: 'Empresa Sin NIF', nif_adjudicatario: null, organismo: 'Test' },
];

const registro = construirRegistro(contratosTest);

assert('Registro tiene empresa A12345678',
  registro.empresas['A12345678'] !== undefined, true);

assert('Nombre canónico ACSA = más frecuente',
  registro.empresas['A12345678'].nombre_canonico, 'ACSA S.A.U.');

assert('Aliases ACSA incluye variantes',
  registro.empresas['A12345678'].aliases.length >= 2, true);

assert('Registro tiene empresa B11111111',
  registro.empresas['B11111111'] !== undefined, true);

assert('Nombre canónico Recio (empate → más largo)',
  registro.empresas['B11111111'].nombre_canonico, 'RECIO, S.L.');

// ─────────────────────────────────────────────────────────────────────────────
// Tests: aplicarResolucion
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: aplicarResolucion()');

const registroParaResolver = construirRegistro(contratosTest);
const resolverTest = new EntityResolver(registroParaResolver);

const { contratos: resueltos, stats } = aplicarResolucion(contratosTest, resolverTest);

assert('Todos los contratos se procesan',
  resueltos.length, contratosTest.length);

assert('Contratos con NIF tienen entity_id',
  resueltos[0].entity_id, 'A12345678');

assert('Nombre unificado para ACSA variante',
  resueltos[3].adjudicatario, 'ACSA S.A.U.');

assert('Stats: resueltos > 0',
  stats.resueltos > 0, true);

assert('Contratos sin NIF tienen entity_id provisional (clave)',
  resueltos[7].entity_id, claveEmpresa('Empresa Sin NIF'));

assert('entity_id provisional es consistente entre variantes iguales',
  resueltos[7].entity_id, resueltos[8].entity_id);

// ─────────────────────────────────────────────────────────────────────────────
// Tests: integración con ranking (simulación)
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n📋 Tests: integración ranking (agrupación por entity_id)');

// Simular lo que haría construirRanking del frontend
function construirRankingSimple(contratos) {
  const mapa = new Map();
  for (const c of contratos) {
    if (!c.adjudicatario) continue;
    let clave;
    if (c.entity_id) {
      clave = 'EID:' + c.entity_id;
    } else if (c.nif_adjudicatario) {
      clave = 'NIF:' + c.nif_adjudicatario;
    } else {
      clave = 'NOMBRE:' + claveEmpresa(c.adjudicatario);
    }
    if (!mapa.has(clave)) mapa.set(clave, { nombre: c.adjudicatario, count: 0, importe: 0 });
    const e = mapa.get(clave);
    e.count++;
    e.importe += c.importe || 0;
  }
  return [...mapa.values()];
}

const contratosResueltos = resueltos;
const ranking = construirRankingSimple(contratosResueltos);

// ACSA (5 contratos con NIF A12345678) debe ser 1 entrada
const entradaACSA = ranking.find(e => e.nombre === 'ACSA S.A.U.');
assert('ACSA agrupa 5 contratos en 1 entrada', entradaACSA.count, 5);

// Recio (2 contratos con NIF B11111111) debe ser 1 entrada
const entradaRecio = ranking.find(e => e.nombre.includes('RECIO') || e.nombre.includes('Recio'));
assert('Recio agrupa 2 contratos en 1 entrada', entradaRecio.count, 2);

// Empresa Sin NIF (2 contratos) debe ser 1 entrada
const entradaSinNIF = ranking.find(e => e.nombre.includes('Sin NIF'));
assert('Empresa sin NIF agrupa por entity_id provisional', entradaSinNIF.count, 2);

// Total de entradas en el ranking
assert('Ranking tiene 3 entradas únicas', ranking.length, 3);

// ─────────────────────────────────────────────────────────────────────────────
// Resumen
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(60));
console.log(`📊 Resultado: ${pasados}/${totalTests} tests pasados`);
if (fallidos > 0) {
  console.log(`❌ ${fallidos} tests fallidos`);
  process.exit(1);
} else {
  console.log('✅ Todos los tests pasaron correctamente');
}

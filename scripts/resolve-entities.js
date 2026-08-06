/**
 * scripts/resolve-entities.js
 *
 * Resuelve la identidad de adjudicatarios y organismos en los contratos normalizados.
 * Usa el módulo entity-resolver.js con un registro maestro (entities.json).
 *
 * Pipeline:
 *   1. Carga contratos-normalizados.json
 *   2. Carga o genera entities.json (registro maestro)
 *   3. Aplica resolución de entidades (asigna entity_id, unifica nombres)
 *   4. Guarda contratos actualizados y registro actualizado
 *
 * Uso:
 *   node scripts/resolve-entities.js           → resolución normal
 *   node scripts/resolve-entities.js --rebuild → regenera el registro desde cero
 *
 * Entrada:  data/processed/contratos-normalizados.json
 * Salida:   data/processed/contratos-normalizados.json (actualizado)
 *           data/processed/entities.json (registro maestro)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  EntityResolver,
  construirRegistro,
  aplicarResolucion,
} from './lib/entity-resolver.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONTRATOS_FILE = path.join(__dirname, '../data/processed/contratos-normalizados.json');
const ENTITIES_FILE = path.join(__dirname, '../data/processed/entities.json');

// ─────────────────────────────────────────────────────────────────────────────
// Tabla de organismos conocidos (migrada desde transform.js)
// ─────────────────────────────────────────────────────────────────────────────

const ORGANISMOS_CONOCIDOS = {
  consejeria_sanidad: {
    nombre_canonico: 'Consejería de Sanidad',
    aliases: [
      'Consejeria de Sanidad',
      'CONSEJERÍA DE SANIDAD',
      'Consejería de Sanidad de la Comunidad de Madrid',
    ],
  },
  consejeria_educacion: {
    nombre_canonico: 'Consejería de Educación, Ciencia y Universidades',
    aliases: [
      'Consejeria de Educación, Ciencia y Universidades',
      'CONSEJERÍA DE EDUCACIÓN, CIENCIA Y UNIVERSIDADES',
      'Consejería de Educación y Juventud',
      'Consejeria de Educacion',
    ],
  },
  consejeria_transportes: {
    nombre_canonico: 'Consejería de Transportes, Movilidad e Infraestructuras',
    aliases: [
      'Consejeria de Transportes, Movilidad e Infraestructuras',
      'CONSEJERÍA DE TRANSPORTES, MOVILIDAD E INFRAESTRUCTURAS',
      'Consejería de Transportes e Infraestructuras',
    ],
  },
  consejeria_hacienda: {
    nombre_canonico: 'Consejería de Hacienda y Función Pública',
    aliases: [
      'Consejeria de Hacienda y Función Pública',
      'CONSEJERÍA DE HACIENDA Y FUNCIÓN PÚBLICA',
      'Consejería de Hacienda',
    ],
  },
  consejeria_medio_ambiente: {
    nombre_canonico: 'Consejería de Medio Ambiente, Agricultura e Interior',
    aliases: [
      'Consejeria de Medio Ambiente, Agricultura e Interior',
      'CONSEJERÍA DE MEDIO AMBIENTE, AGRICULTURA E INTERIOR',
      'Consejería de Medio Ambiente y Ordenación del Territorio',
    ],
  },
  consejeria_presidencia: {
    nombre_canonico: 'Consejería de Presidencia, Justicia y Administración Local',
    aliases: [
      'Consejeria de Presidencia, Justicia y Administración Local',
      'CONSEJERÍA DE PRESIDENCIA, JUSTICIA Y ADMINISTRACIÓN LOCAL',
    ],
  },
  consejeria_economia: {
    nombre_canonico: 'Consejería de Economía, Hacienda y Empleo',
    aliases: [
      'Consejeria de Economía, Hacienda y Empleo',
      'CONSEJERÍA DE ECONOMÍA, HACIENDA Y EMPLEO',
    ],
  },
  canal_isabel_ii: {
    nombre_canonico: 'Canal de Isabel II',
    aliases: [
      'Canal de Isabel II, S.A.',
      'Canal de Isabel II SA',
      'CANAL DE ISABEL II',
      'Canal Isabel II',
    ],
  },
  amas: {
    nombre_canonico: 'Agencia Madrileña de Atención Social',
    aliases: [
      'Agencia Madrileña de Atención Social (AMAS)',
      'AGENCIA MADRILEÑA DE ATENCIÓN SOCIAL',
    ],
  },
  adif_alta_velocidad: {
    nombre_canonico: 'Adif, Alta Velocidad',
    aliases: [
      'ADI, Alta Velocidad',
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const rebuild = process.argv.includes('--rebuild');

  console.log('🏷️  ContratosCAM — Resolución de entidades');
  console.log('═'.repeat(60));

  // 1. Cargar contratos
  if (!fs.existsSync(CONTRATOS_FILE)) {
    console.error(`❌ No se encontró: ${path.basename(CONTRATOS_FILE)}`);
    console.error('   Ejecuta primero: npm run transform');
    process.exit(1);
  }

  const contratos = JSON.parse(fs.readFileSync(CONTRATOS_FILE, 'utf-8'));
  console.log(`📥 ${contratos.length} contratos cargados`);

  // 2. Cargar o construir registro maestro
  let registroBase = null;
  if (!rebuild && fs.existsSync(ENTITIES_FILE)) {
    registroBase = JSON.parse(fs.readFileSync(ENTITIES_FILE, 'utf-8'));
    console.log(`📂 Registro existente: ${Object.keys(registroBase.empresas || {}).length} empresas`);
  } else {
    console.log(rebuild
      ? '🔄 Reconstruyendo registro desde cero (--rebuild)'
      : '📂 Sin registro previo — generando semilla');
  }

  // Asegurar que organismos conocidos están en el registro
  if (!registroBase) registroBase = { empresas: {}, aliases_sin_nif: {}, organismos: {} };
  registroBase.organismos = { ...ORGANISMOS_CONOCIDOS, ...(registroBase.organismos || {}) };

  // 3. Construir/actualizar registro desde los datos
  console.log('\n🔧 Paso 1: Construir registro maestro desde datos...');
  const registro = construirRegistro(contratos, registroBase);

  const numEmpresas = Object.keys(registro.empresas).length;
  const numAliases = Object.keys(registro.aliases_sin_nif).length;
  const numOrganismos = Object.keys(registro.organismos).length;
  console.log(`   ${numEmpresas} empresas en registro`);
  console.log(`   ${numAliases} aliases sin NIF indexados`);
  console.log(`   ${numOrganismos} organismos conocidos`);

  // 4. Aplicar resolución
  console.log('\n🏷️  Paso 2: Aplicar resolución de entidades...');
  const resolver = new EntityResolver(registro);
  const { contratos: resueltos, stats } = aplicarResolucion(contratos, resolver);

  console.log(`   ${stats.resueltos} contratos con entity_id resuelto`);
  console.log(`   ${stats.sinResolver} contratos sin match en registro (entity_id provisional)`);
  console.log(`   ${stats.organismosNormalizados} organismos normalizados`);

  // 5. Guardar resultados
  console.log('\n💾 Paso 3: Guardar resultados...');
  fs.writeFileSync(CONTRATOS_FILE, JSON.stringify(resueltos, null, 2), 'utf-8');
  fs.writeFileSync(ENTITIES_FILE, JSON.stringify(registro, null, 2), 'utf-8');

  const tamContratos = (fs.statSync(CONTRATOS_FILE).size / 1024).toFixed(1);
  const tamEntities = (fs.statSync(ENTITIES_FILE).size / 1024).toFixed(1);
  console.log(`   ${path.basename(CONTRATOS_FILE)} (${tamContratos} KB)`);
  console.log(`   ${path.basename(ENTITIES_FILE)} (${tamEntities} KB)`);

  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN');
  console.log('─'.repeat(60));
  console.log(`  Empresas en registro:     ${numEmpresas}`);
  console.log(`  Aliases sin NIF:          ${numAliases}`);
  console.log(`  Contratos resueltos:      ${stats.resueltos} / ${contratos.length}`);
  console.log(`  Organismos normalizados:  ${stats.organismosNormalizados}`);
  console.log('═'.repeat(60));
  console.log('\n✅ Resolución completada.');
  console.log('💡 Siguiente paso: npm run validate');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

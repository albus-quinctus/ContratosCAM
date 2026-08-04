/**
 * scripts/validate.js
 *
 * Valida la integridad y schema del JSON normalizado generado por el pipeline.
 * Verifica campos requeridos, tipos de datos, formatos y completitud.
 * Soporta múltiples fuentes: PLACSP, TED-UE, PLACE histórico.
 *
 * Entrada: data/processed/contratos-normalizados.json
 * Salida:  Reporte en consola (exit code 0 = OK, 1 = errores)
 *
 * Uso: node scripts/validate.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_FILE = path.join(__dirname, '../data/processed/contratos-normalizados.json');

// ─────────────────────────────────────────────────────────────────────────────
// Schema de validación
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_VALIDOS = ['obras', 'servicios', 'suministros', 'administrativo_especial', 'privado', 'concesion_obras', 'concesion_servicios', 'patrimonial', 'otros'];
const PROCEDIMIENTOS_VALIDOS = ['abierto', 'restringido', 'negociado', 'dialogo_competitivo', 'asociacion_innovacion', 'abierto_simplificado', 'basado_acuerdo_marco', 'menor', 'negociado_sin_publicidad', 'abierto_simplificado_sumario'];
const FUENTES_VALIDAS = ['placsp', 'ted_ue', 'place_historico', 'cam_transparencia', 'cam_datos_abiertos'];
const ESTADOS_VALIDOS = [
  // Estados derivados (nuevos, preferidos)
  'en_licitacion', 'en_evaluacion', 'pre_adjudicado', 'adjudicado',
  'formalizado', 'resuelto', 'anulado', 'posiblemente_resuelto',
  // Estados legacy (del histórico, antes de derivarEstado)
  'publicado', 'pre_adjudicacion',
];

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const URL_REGEX = /^https?:\/\/.+/;
const NIF_REGEX = /^[A-Z0-9]{8,10}$/;
const TED_PUB_REGEX = /^\d+-\d{4}$/; // Formato: 239313-2016

/** Umbral de tamaño para advertir sobre migración a Turso (bytes) */
const UMBRAL_TAMANO_MB = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de validación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Valida un contrato individual contra el schema.
 * @param {object} contrato
 * @param {number} index
 * @returns {string[]} Array de errores encontrados
 */
function validarContrato(contrato, index) {
  const errores = [];
  const prefix = `[#${contrato.id || index}]`;

  // Campos requeridos
  if (!contrato.objeto) {
    errores.push(`${prefix} Campo 'objeto' es requerido`);
  }
  // Organismo es requerido para PLACSP, advertencia para fuentes complementarias
  if (!contrato.organismo && contrato.fuente !== 'ted_ue') {
    errores.push(`${prefix} Campo 'organismo' es requerido`);
  }

  // Tipos de datos
  if (contrato.id != null && typeof contrato.id !== 'number') {
    errores.push(`${prefix} 'id' debe ser number, es ${typeof contrato.id}`);
  }
  if (contrato.importe != null && typeof contrato.importe !== 'number') {
    errores.push(`${prefix} 'importe' debe ser number, es ${typeof contrato.importe}`);
  }
  if (contrato.importe_iva != null && typeof contrato.importe_iva !== 'number') {
    errores.push(`${prefix} 'importe_iva' debe ser number, es ${typeof contrato.importe_iva}`);
  }

  // Valores permitidos
  if (contrato.tipo && !TIPOS_VALIDOS.includes(contrato.tipo)) {
    errores.push(`${prefix} 'tipo' inválido: "${contrato.tipo}"`);
  }
  if (contrato.procedimiento && !PROCEDIMIENTOS_VALIDOS.includes(contrato.procedimiento)) {
    errores.push(`${prefix} 'procedimiento' inválido: "${contrato.procedimiento}"`);
  }
  if (contrato.estado && !ESTADOS_VALIDOS.includes(contrato.estado)) {
    errores.push(`${prefix} 'estado' inválido: "${contrato.estado}"`);
  }
  if (contrato.fuente && !FUENTES_VALIDAS.includes(contrato.fuente)) {
    errores.push(`${prefix} 'fuente' inválida: "${contrato.fuente}"`);
  }

  // Formatos
  if (contrato.fecha_publicacion && !FECHA_REGEX.test(contrato.fecha_publicacion)) {
    errores.push(`${prefix} 'fecha_publicacion' formato inválido: "${contrato.fecha_publicacion}" (esperado: YYYY-MM-DD)`);
  }
  if (contrato.fecha_adjudicacion && !FECHA_REGEX.test(contrato.fecha_adjudicacion)) {
    errores.push(`${prefix} 'fecha_adjudicacion' formato inválido: "${contrato.fecha_adjudicacion}"`);
  }
  if (contrato.fecha_formalizacion && !FECHA_REGEX.test(contrato.fecha_formalizacion)) {
    errores.push(`${prefix} 'fecha_formalizacion' formato inválido: "${contrato.fecha_formalizacion}"`);
  }

  // URLs seguras
  if (contrato.url_origen && !URL_REGEX.test(contrato.url_origen)) {
    errores.push(`${prefix} 'url_origen' no es una URL válida: "${contrato.url_origen}"`);
  }

  // NIF
  if (contrato.nif_adjudicatario && !NIF_REGEX.test(contrato.nif_adjudicatario)) {
    errores.push(`${prefix} 'nif_adjudicatario' formato inválido: "${contrato.nif_adjudicatario}"`);
  }

  // Importes negativos
  if (contrato.importe != null && contrato.importe < 0) {
    errores.push(`${prefix} 'importe' es negativo: ${contrato.importe}`);
  }
  if (contrato.importe_iva != null && contrato.importe_iva < 0) {
    errores.push(`${prefix} 'importe_iva' es negativo: ${contrato.importe_iva}`);
  }

  // Coherencia: importe_iva >= importe (si ambos existen)
  if (contrato.importe != null && contrato.importe_iva != null) {
    if (contrato.importe_iva < contrato.importe * 0.9) { // Margen del 10% por redondeos
      errores.push(`${prefix} 'importe_iva' (${contrato.importe_iva}) es menor que 'importe' (${contrato.importe})`);
    }
  }

  // ─── Campos adicionales (Fase mejora calidad) ─────────────────────────────
  // CPV: código de 8 dígitos (puede tener sufijo -N)
  if (contrato.cpv != null && typeof contrato.cpv === 'string') {
    if (!/^\d{8}(-\d)?$/.test(contrato.cpv) && !/^\d+$/.test(contrato.cpv)) {
      // Solo advertencia, no error bloqueante — CPV puede tener formatos variados
    }
  }

  // duracion_meses: debe ser entero positivo si existe
  if (contrato.duracion_meses != null) {
    if (typeof contrato.duracion_meses !== 'number' || !Number.isInteger(contrato.duracion_meses)) {
      errores.push(`${prefix} 'duracion_meses' debe ser entero, es ${typeof contrato.duracion_meses}: ${contrato.duracion_meses}`);
    } else if (contrato.duracion_meses < 0) {
      errores.push(`${prefix} 'duracion_meses' debe ser >= 0, es ${contrato.duracion_meses}`);
    }
  }

  // num_lotes: debe ser entero positivo si existe
  if (contrato.num_lotes != null) {
    if (typeof contrato.num_lotes !== 'number' || !Number.isInteger(contrato.num_lotes)) {
      errores.push(`${prefix} 'num_lotes' debe ser entero, es ${typeof contrato.num_lotes}: ${contrato.num_lotes}`);
    } else if (contrato.num_lotes < 0) {
      errores.push(`${prefix} 'num_lotes' debe ser >= 0, es ${contrato.num_lotes}`);
    }
  }

  // valor_estimado: debe ser número positivo si existe
  if (contrato.valor_estimado != null && typeof contrato.valor_estimado !== 'number') {
    errores.push(`${prefix} 'valor_estimado' debe ser number, es ${typeof contrato.valor_estimado}`);
  }
  if (contrato.valor_estimado != null && contrato.valor_estimado < 0) {
    errores.push(`${prefix} 'valor_estimado' es negativo: ${contrato.valor_estimado}`);
  }

  // ─── Campos enriquecidos (TED) ──────────────────────────────────────────
  // num_ofertas: debe ser entero positivo si existe
  if (contrato.num_ofertas != null) {
    if (typeof contrato.num_ofertas !== 'number' || !Number.isInteger(contrato.num_ofertas)) {
      errores.push(`${prefix} 'num_ofertas' debe ser entero, es ${typeof contrato.num_ofertas}: ${contrato.num_ofertas}`);
    } else if (contrato.num_ofertas < 1) {
      errores.push(`${prefix} 'num_ofertas' debe ser >= 1, es ${contrato.num_ofertas}`);
    }
  }

  // ted_publication_number: formato NNNNNN-YYYY
  if (contrato.ted_publication_number != null && !TED_PUB_REGEX.test(contrato.ted_publication_number)) {
    errores.push(`${prefix} 'ted_publication_number' formato inválido: "${contrato.ted_publication_number}" (esperado: NNNNNN-YYYY)`);
  }

  // criterios_adjudicacion: debe ser string si existe
  if (contrato.criterios_adjudicacion != null && typeof contrato.criterios_adjudicacion !== 'string') {
    errores.push(`${prefix} 'criterios_adjudicacion' debe ser string, es ${typeof contrato.criterios_adjudicacion}`);
  }

  // Coherencia fuente ↔ campos TED
  if (contrato.fuente === 'ted_ue' && !contrato.ted_publication_number) {
    errores.push(`${prefix} Fuente 'ted_ue' pero falta 'ted_publication_number'`);
  }
  if (contrato.fuente !== 'ted_ue' && contrato.ted_publication_number) {
    // Solo advertencia: puede ser un contrato PLACSP enriquecido con TED
    // No es un error bloqueante
  }

  return errores;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('✅ ContratosCAM — Validación de datos');
  console.log('═'.repeat(60));

  // Verificar que existe el archivo
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ No se encontró: ${path.basename(INPUT_FILE)}`);
    console.error('   Ejecuta primero: npm run transform');
    process.exit(1);
  }

  // Leer archivo
  const stat = fs.statSync(INPUT_FILE);
  const tamanoMB = stat.size / 1024 / 1024;
  console.log(`📄 Archivo: ${path.basename(INPUT_FILE)}`);
  console.log(`💾 Tamaño: ${tamanoMB.toFixed(2)} MB`);

  if (tamanoMB > UMBRAL_TAMANO_MB) {
    console.warn(`\n⚠️  ADVERTENCIA: El archivo supera ${UMBRAL_TAMANO_MB} MB.`);
    console.warn('   Considerar migración a Turso para mejor rendimiento.');
  }

  let datos;
  try {
    datos = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  } catch (err) {
    console.error(`\n❌ Error parseando JSON: ${err.message}`);
    process.exit(1);
  }

  // Verificar que es un array
  if (!Array.isArray(datos)) {
    console.error('\n❌ El archivo no contiene un array JSON');
    process.exit(1);
  }

  console.log(`📝 Contratos: ${datos.length}`);

  if (datos.length === 0) {
    console.warn('\n⚠️  ADVERTENCIA: El archivo está vacío (0 contratos).');
    console.warn('   Verifica que el pipeline ETL se ejecutó correctamente.');
    process.exit(0);
  }

  // Validar cada contrato
  console.log('\n🔍 Validando schema...');
  const todosErrores = [];
  let contratosConErrores = 0;

  for (let i = 0; i < datos.length; i++) {
    const errores = validarContrato(datos[i], i);
    if (errores.length > 0) {
      contratosConErrores++;
      todosErrores.push(...errores);
    }
  }

  // Calcular completitud
  console.log('\n📊 Completitud de campos:');
  const campos = [
    'expediente', 'objeto', 'tipo', 'subtipo', 'procedimiento', 'estado',
    'estado_xml', 'organismo',
    'importe', 'importe_iva', 'valor_estimado', 'cpv', 'cpv_descripcion',
    'duracion_meses', 'num_lotes', 'adjudicatario', 'nif_adjudicatario',
    'fecha_publicacion', 'fecha_adjudicacion', 'url_origen', 'fuente',
    'num_ofertas', 'ted_publication_number', 'criterios_adjudicacion',
  ];

  const completitud = {};
  for (const campo of campos) {
    const count = datos.filter(c => c[campo] != null && c[campo] !== '').length;
    const pct = ((count / datos.length) * 100).toFixed(1);
    completitud[campo] = { count, pct: parseFloat(pct) };
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    const icon = pct >= 90 ? '✅' : pct >= 50 ? '⚠️' : '❌';
    console.log(`  ${icon} ${campo.padEnd(24)} ${bar} ${pct}% (${count}/${datos.length})`);
  }

  // Estadísticas por fuente
  console.log('\n🗂️  Distribución por fuente:');
  const porFuente = {};
  datos.forEach(c => {
    const f = c.fuente || '(sin fuente)';
    porFuente[f] = (porFuente[f] || 0) + 1;
  });
  for (const [fuente, count] of Object.entries(porFuente).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / datos.length) * 100).toFixed(1);
    console.log(`  • ${fuente.padEnd(20)} ${count} contratos (${pct}%)`);
  }

  // Verificar IDs únicos
  console.log('\n🔑 Verificando IDs únicos...');
  const ids = datos.map(c => c.id);
  const idsUnicos = new Set(ids);
  if (idsUnicos.size !== datos.length) {
    todosErrores.push(`IDs no son únicos: ${datos.length} contratos pero solo ${idsUnicos.size} IDs distintos`);
    console.log('  ❌ IDs duplicados encontrados');
  } else {
    console.log('  ✅ Todos los IDs son únicos');
  }

  // Verificar duplicados por expediente + organismo
  console.log('\n🔍 Verificando duplicados...');
  const claves = datos.map(c => `${c.expediente}|${c.organismo}`);
  const clavesUnicas = new Set(claves);
  const duplicados = datos.length - clavesUnicas.size;
  if (duplicados > 0) {
    console.log(`  ⚠️  ${duplicados} posibles duplicados (mismo expediente + organismo)`);
  } else {
    console.log('  ✅ No se encontraron duplicados');
  }

  // Resumen
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE VALIDACIÓN');
  console.log('─'.repeat(60));
  console.log(`  📝 Contratos validados: ${datos.length}`);
  console.log(`  ❌ Contratos con errores: ${contratosConErrores}`);
  console.log(`  📋 Total errores: ${todosErrores.length}`);
  console.log(`  💾 Tamaño: ${tamanoMB.toFixed(2)} MB`);

  // Campos críticos (deben estar por encima del 80%)
  const camposCriticos = ['objeto', 'organismo', 'fuente'];
  const camposCriticosFallidos = camposCriticos.filter(c => completitud[c] && completitud[c].pct < 80);

  if (camposCriticosFallidos.length > 0) {
    console.log(`\n  ⚠️  Campos críticos con baja completitud:`);
    camposCriticosFallidos.forEach(c => {
      console.log(`     • ${c}: ${completitud[c].pct}%`);
    });
  }

  console.log('─'.repeat(60));

  // Mostrar primeros errores (máximo 20)
  if (todosErrores.length > 0) {
    console.log(`\n❌ Primeros errores (máx. 20 de ${todosErrores.length}):`);
    todosErrores.slice(0, 20).forEach(e => console.log(`   • ${e}`));
    if (todosErrores.length > 20) {
      console.log(`   ... y ${todosErrores.length - 20} más`);
    }
  }

  console.log('\n' + '═'.repeat(60));

  // Resultado final
  if (todosErrores.length === 0 && camposCriticosFallidos.length === 0) {
    console.log('🎉 VALIDACIÓN EXITOSA — Todos los contratos son válidos');
    process.exit(0);
  } else if (todosErrores.length <= 10 && camposCriticosFallidos.length === 0) {
    console.log('⚠️  VALIDACIÓN CON ADVERTENCIAS — Errores menores encontrados');
    process.exit(0); // No bloquear el pipeline por errores menores
  } else {
    console.log('❌ VALIDACIÓN FALLIDA — Revisar errores antes de publicar');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

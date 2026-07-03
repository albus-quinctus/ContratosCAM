/**
 * scripts/validate.js
 *
 * Valida la integridad y estructura del JSON de datos procesados.
 * Se ejecuta después del pipeline ETL para asegurar que los datos
 * cumplen con el esquema esperado antes de publicarlos.
 *
 * Uso: node scripts/validate.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.join(__dirname, '../data/processed/contratos-normalizados.json');

// ─────────────────────────────────────────────────────────────────────────────
// Esquema de validación
// ─────────────────────────────────────────────────────────────────────────────

const CAMPOS_REQUERIDOS = ['objeto'];
const CAMPOS_OPCIONALES = [
  'expediente', 'tipo', 'procedimiento', 'organismo',
  'importe', 'importe_iva', 'adjudicatario', 'nif_adjudicatario',
  'fecha_publicacion', 'fecha_adjudicacion', 'fecha_formalizacion',
  'url_origen',
];
const CAMPOS_VALIDOS = new Set([...CAMPOS_REQUERIDOS, ...CAMPOS_OPCIONALES]);

const TIPOS_VALIDOS = [
  'Obras', 'Servicios', 'Suministros', 'Administrativo especial',
  'Gestión de servicios públicos', 'Colaboración entre el sector público y privado',
  'Privado', 'Patrimonial', 'Concesión de obras', 'Concesión de servicios',
];

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const URL_REGEX = /^https?:\/\//i;

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de validación
// ─────────────────────────────────────────────────────────────────────────────

function validarRegistro(registro, indice) {
  const errores = [];

  // Verificar campos desconocidos
  for (const campo of Object.keys(registro)) {
    if (!CAMPOS_VALIDOS.has(campo)) {
      errores.push(`[${indice}] Campo desconocido: "${campo}"`);
    }
  }

  // Campos requeridos
  for (const campo of CAMPOS_REQUERIDOS) {
    if (!registro[campo] || (typeof registro[campo] === 'string' && registro[campo].trim() === '')) {
      errores.push(`[${indice}] Campo requerido vacío: "${campo}"`);
    }
  }

  // Validar tipos de datos
  if (registro.importe !== null && registro.importe !== undefined) {
    if (typeof registro.importe !== 'number' || isNaN(registro.importe)) {
      errores.push(`[${indice}] Importe no es un número válido: ${registro.importe}`);
    } else if (registro.importe < 0) {
      errores.push(`[${indice}] Importe negativo: ${registro.importe}`);
    }
  }

  if (registro.importe_iva !== null && registro.importe_iva !== undefined) {
    if (typeof registro.importe_iva !== 'number' || isNaN(registro.importe_iva)) {
      errores.push(`[${indice}] Importe IVA no es un número válido: ${registro.importe_iva}`);
    }
  }

  // Validar fechas
  for (const campoFecha of ['fecha_publicacion', 'fecha_adjudicacion', 'fecha_formalizacion']) {
    if (registro[campoFecha] && !FECHA_REGEX.test(registro[campoFecha])) {
      errores.push(`[${indice}] Fecha con formato inválido (${campoFecha}): "${registro[campoFecha]}"`);
    }
  }

  // Validar URL
  if (registro.url_origen && !URL_REGEX.test(registro.url_origen)) {
    errores.push(`[${indice}] URL con protocolo inseguro o inválido: "${registro.url_origen}"`);
  }

  // Validar tipo de contrato (si existe)
  if (registro.tipo && !TIPOS_VALIDOS.includes(registro.tipo)) {
    // Solo advertencia, no error — puede haber tipos nuevos
    return { errores, advertencias: [`[${indice}] Tipo de contrato no reconocido: "${registro.tipo}"`] };
  }

  return { errores, advertencias: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  console.log('✅ ContratosCAM — Validación de datos');
  console.log('═'.repeat(50));

  // Verificar que existe el archivo
  if (!fs.existsSync(JSON_PATH)) {
    console.error('❌ No se encontró: data/processed/contratos-normalizados.json');
    console.error('   Ejecuta primero: npm run etl');
    process.exit(1);
  }

  // Leer y parsear
  let datos;
  try {
    const contenido = fs.readFileSync(JSON_PATH, 'utf-8');
    datos = JSON.parse(contenido);
  } catch (err) {
    console.error(`❌ Error parseando JSON: ${err.message}`);
    process.exit(1);
  }

  // Verificar que es un array
  if (!Array.isArray(datos)) {
    console.error('❌ El JSON no es un array de registros');
    process.exit(1);
  }

  console.log(`\n📊 Registros a validar: ${datos.length}`);

  if (datos.length === 0) {
    console.warn('⚠️  El archivo está vacío (0 registros)');
    process.exit(0);
  }

  // Validar cada registro
  let totalErrores = 0;
  let totalAdvertencias = 0;
  const erroresMuestra = [];

  for (let i = 0; i < datos.length; i++) {
    const { errores, advertencias } = validarRegistro(datos[i], i);
    totalErrores += errores.length;
    totalAdvertencias += advertencias.length;

    // Guardar solo los primeros errores para no saturar la consola
    if (erroresMuestra.length < 20) {
      erroresMuestra.push(...errores);
    }
  }

  // Estadísticas de completitud
  const stats = {
    conExpediente: datos.filter(d => d.expediente).length,
    conOrganismo: datos.filter(d => d.organismo).length,
    conImporte: datos.filter(d => d.importe !== null && d.importe !== undefined).length,
    conFecha: datos.filter(d => d.fecha_publicacion).length,
    conAdjudicatario: datos.filter(d => d.adjudicatario).length,
    conUrl: datos.filter(d => d.url_origen).length,
  };

  console.log('\n📋 Completitud de campos:');
  console.log(`   Expediente:     ${stats.conExpediente}/${datos.length} (${(stats.conExpediente / datos.length * 100).toFixed(1)}%)`);
  console.log(`   Organismo:      ${stats.conOrganismo}/${datos.length} (${(stats.conOrganismo / datos.length * 100).toFixed(1)}%)`);
  console.log(`   Importe:        ${stats.conImporte}/${datos.length} (${(stats.conImporte / datos.length * 100).toFixed(1)}%)`);
  console.log(`   Fecha:          ${stats.conFecha}/${datos.length} (${(stats.conFecha / datos.length * 100).toFixed(1)}%)`);
  console.log(`   Adjudicatario:  ${stats.conAdjudicatario}/${datos.length} (${(stats.conAdjudicatario / datos.length * 100).toFixed(1)}%)`);
  console.log(`   URL origen:     ${stats.conUrl}/${datos.length} (${(stats.conUrl / datos.length * 100).toFixed(1)}%)`);

  // Resultado
  console.log('\n' + '═'.repeat(50));

  if (totalErrores > 0) {
    console.error(`❌ Validación fallida: ${totalErrores} error(es), ${totalAdvertencias} advertencia(s)`);
    console.error('\nPrimeros errores encontrados:');
    erroresMuestra.slice(0, 10).forEach(e => console.error(`   ${e}`));
    if (totalErrores > 10) {
      console.error(`   ... y ${totalErrores - 10} errores más`);
    }
    process.exit(1);
  }

  if (totalAdvertencias > 0) {
    console.warn(`⚠️  Validación correcta con ${totalAdvertencias} advertencia(s)`);
  } else {
    console.log('✅ Validación correcta. Todos los registros cumplen el esquema.');
  }

  // Verificar tamaño del archivo para advertir sobre límites
  const tamanoMB = fs.statSync(JSON_PATH).size / (1024 * 1024);
  console.log(`\n📦 Tamaño del archivo: ${tamanoMB.toFixed(2)} MB`);
  if (tamanoMB > 20) {
    console.warn('⚠️  El archivo supera 20 MB. Considerar migración a Turso.');
  }
}

main();

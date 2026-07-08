/**
 * scripts/transform.js
 *
 * Transforma los datos parseados del feed Atom de PLACSP:
 * 1. Filtra solo los contratos de la Comunidad de Madrid
 * 2. Normaliza campos (tipos, procedimientos, fechas, importes)
 * 3. Limpia NIFs y nombres de organismos
 * 4. Deduplica por expediente + organismo
 * 5. Genera el JSON normalizado final
 *
 * Entrada: data/raw/parsed-licitaciones.json
 * Salida:  data/processed/contratos-normalizados.json
 *
 * Uso: node scripts/transform.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const INPUT_FILE = path.join(__dirname, '../data/raw/parsed-licitaciones.json');
const OUTPUT_FILE = path.join(__dirname, '../data/processed/contratos-normalizados.json');
const PROCESSED_DIR = path.join(__dirname, '../data/processed');

// ─────────────────────────────────────────────────────────────────────────────
// Tablas de mapeo — Códigos PLACSP a valores legibles
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipos de contrato según PLACSP ContractCode
 * Fuente: http://contrataciondelestado.es/codice/cl/2.08/ContractCode-2.08.gc
 */
const TIPOS_CONTRATO = {
  '1': 'suministros',
  '2': 'servicios',
  '3': 'obras',
  '7': 'administrativo_especial',
  '8': 'privado',
  '21': 'concesion_obras',
  '31': 'concesion_servicios',
  '40': 'patrimonial',
  '50': 'otros',
};

/**
 * Procedimientos de adjudicación según PLACSP SyndicationTenderingProcessCode
 * Fuente: https://contrataciondelestado.es/codice/cl/2.07/SyndicationTenderingProcessCode-2.07.gc
 */
const PROCEDIMIENTOS = {
  '1': 'abierto',
  '2': 'restringido',
  '3': 'negociado',
  '4': 'dialogo_competitivo',
  '5': 'asociacion_innovacion',
  '6': 'abierto_simplificado',
  '7': 'basado_acuerdo_marco',
  '8': 'menor',
  '9': 'negociado_sin_publicidad',
  '100': 'abierto_simplificado_sumario',
};

/**
 * Estados del contrato
 */
const ESTADOS = {
  'PUB': 'publicado',
  'EV': 'en_evaluacion',
  'ADJ': 'adjudicado',
  'RES': 'resuelto',
  'ANUL': 'anulado',
  'PRE': 'pre_adjudicacion',
};

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
 * Tabla de normalización de nombres de organismos.
 * Mapea variantes conocidas (abreviaturas, erratas, nombres antiguos)
 * a un nombre canónico. Se amplía conforme se detectan variantes en los datos.
 */
const NORMALIZACION_ORGANISMOS = {
  // Variantes con/sin tilde o abreviaturas detectadas en los datos
  'Consejeria de Sanidad': 'Consejería de Sanidad',
  'Consejeria de Educación, Ciencia y Universidades': 'Consejería de Educación, Ciencia y Universidades',
  'CONSEJERÍA DE SANIDAD': 'Consejería de Sanidad',
  'CONSEJERÍA DE EDUCACIÓN, CIENCIA Y UNIVERSIDADES': 'Consejería de Educación, Ciencia y Universidades',
};

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de transformación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determina si un contrato pertenece a la Comunidad de Madrid
 * basándose en su jerarquía de organismos.
 * @param {object} contrato - Contrato parseado
 * @returns {boolean}
 */
function esDeCAM(contrato) {
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

  return false;
}

/**
 * Normaliza un NIF eliminando caracteres no alfanuméricos.
 * @param {string|null} nif
 * @returns {string|null}
 */
function normalizarNIF(nif) {
  if (!nif) return null;
  // Eliminar guiones, puntos, espacios
  const limpio = nif.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  // Validar formato básico (letra + 8 dígitos o 8 dígitos + letra, o letra + 7 dígitos + letra)
  if (limpio.length < 8 || limpio.length > 10) return null;
  return limpio;
}

/**
 * Normaliza una fecha a formato ISO 8601 (YYYY-MM-DD).
 * Acepta formatos: YYYY-MM-DD, DD/MM/YYYY, YYYY-MM-DDTHH:mm:ss
 * @param {string|null} fecha
 * @returns {string|null}
 */
function normalizarFecha(fecha) {
  if (!fecha) return null;

  // Ya es ISO 8601 con hora
  if (/^\d{4}-\d{2}-\d{2}T/.test(fecha)) {
    return fecha.split('T')[0];
  }

  // Ya es ISO 8601 solo fecha
  if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return fecha;
  }

  // Formato DD/MM/YYYY
  const match = fecha.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`;
  }

  return null;
}

/**
 * Normaliza un importe.
 * Maneja formatos: "45.000,00", "45000.00", "45000", "45.000,00 €"
 * @param {number|string|null} valor
 * @returns {number|null}
 */
function normalizarImporte(valor) {
  if (valor == null) return null;
  if (typeof valor === 'number') return valor > 0 ? valor : null;

  // Eliminar símbolo de moneda y espacios
  let str = String(valor).replace(/[€\s]/g, '');

  // Formato europeo: 45.000,00 → 45000.00
  if (str.includes(',') && str.includes('.')) {
    str = str.replace(/\./g, '').replace(',', '.');
  } else if (str.includes(',') && !str.includes('.')) {
    // Solo coma: 45000,00 → 45000.00
    str = str.replace(',', '.');
  }

  const num = parseFloat(str);
  return isNaN(num) || num <= 0 ? null : Math.round(num * 100) / 100;
}

/**
 * Normaliza el tipo de contrato.
 * @param {string|null} code
 * @returns {string|null}
 */
function normalizarTipo(code) {
  if (!code) return null;
  return TIPOS_CONTRATO[code] || null;
}

/**
 * Normaliza el procedimiento de adjudicación.
 * @param {string|null} code
 * @returns {string|null}
 */
function normalizarProcedimiento(code) {
  if (!code) return null;
  return PROCEDIMIENTOS[code] || null;
}

/**
 * Normaliza el nombre de un organismo.
 * Busca primero en la tabla de variantes conocidas, luego limpia espacios.
 * @param {string|null} nombre
 * @returns {string|null}
 */
function normalizarOrganismo(nombre) {
  if (!nombre) return null;

  // Limpiar espacios múltiples primero
  const limpio = nombre.replace(/\s+/g, ' ').trim();

  // Buscar en tabla de normalización (case-sensitive)
  if (NORMALIZACION_ORGANISMOS[limpio]) {
    return NORMALIZACION_ORGANISMOS[limpio];
  }

  return limpio;
}

/**
 * Convierte un campo vacío o string vacío a null.
 * @param {*} valor
 * @returns {*}
 */
function limpiarVacio(valor) {
  if (valor === '' || valor === '-' || valor === 'N/A') return null;
  return valor;
}

/**
 * Transforma un contrato crudo a formato normalizado.
 * @param {object} crudo - Contrato parseado del feed Atom
 * @param {number} id - ID secuencial
 * @returns {object} Contrato normalizado
 */
function transformarContrato(crudo, id) {
  // Determinar el importe principal (preferir adjudicación sobre presupuesto)
  const importeFinal = crudo.importe_adjudicacion || crudo.importe_sin_iva || null;
  const importeIvaFinal = crudo.importe_adjudicacion_iva || crudo.importe_total || null;

  return {
    id,
    expediente: limpiarVacio(crudo.expediente),
    objeto: limpiarVacio(crudo.objeto),
    tipo: normalizarTipo(crudo.tipo_code),
    procedimiento: normalizarProcedimiento(crudo.procedimiento_code),
    estado: ESTADOS[crudo.estado] || crudo.estado || null,
    organismo: normalizarOrganismo(crudo.organismo),
    importe: normalizarImporte(importeFinal),
    importe_iva: normalizarImporte(importeIvaFinal),
    adjudicatario: limpiarVacio(crudo.adjudicatario),
    nif_adjudicatario: normalizarNIF(crudo.nif_adjudicatario),
    fecha_publicacion: normalizarFecha(crudo.fecha_actualizacion),
    fecha_adjudicacion: normalizarFecha(crudo.fecha_adjudicacion),
    fecha_formalizacion: null, // No disponible en el feed Atom
    url_origen: limpiarVacio(crudo.url_origen),
    fuente: 'placsp',
  };
}

/**
 * Deduplica contratos por expediente + organismo.
 * En caso de duplicados, mantiene el más reciente (por fecha_publicacion)
 * y enriquece con datos del otro registro si faltan campos.
 * @param {object[]} contratos
 * @returns {object[]}
 */
function deduplicar(contratos) {
  const mapa = new Map();

  for (const contrato of contratos) {
    const clave = `${contrato.expediente || ''}|${contrato.organismo || ''}`;

    if (mapa.has(clave)) {
      const existente = mapa.get(clave);
      // Determinar cuál es más reciente
      const existenteEsMasReciente =
        (existente.fecha_publicacion || '') >= (contrato.fecha_publicacion || '');

      const masReciente = existenteEsMasReciente ? existente : contrato;
      const masAntiguo = existenteEsMasReciente ? contrato : existente;

      // Enriquecer: usar el más reciente como base, rellenar nulls con el antiguo
      const fusionado = { ...masReciente };
      if (!fusionado.adjudicatario && masAntiguo.adjudicatario) {
        fusionado.adjudicatario = masAntiguo.adjudicatario;
        fusionado.nif_adjudicatario = fusionado.nif_adjudicatario || masAntiguo.nif_adjudicatario;
        fusionado.fecha_adjudicacion = fusionado.fecha_adjudicacion || masAntiguo.fecha_adjudicacion;
        fusionado.importe = fusionado.importe || masAntiguo.importe;
        fusionado.importe_iva = fusionado.importe_iva || masAntiguo.importe_iva;
      }

      mapa.set(clave, fusionado);
    } else {
      mapa.set(clave, contrato);
    }
  }

  return Array.from(mapa.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 ContratosCAM — Transformación y normalización');
  console.log('═'.repeat(60));

  // Verificar que existe el archivo de entrada
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ No se encontró: ${path.basename(INPUT_FILE)}`);
    console.error('   Ejecuta primero: npm run parse');
    process.exit(1);
  }

  // Crear directorio de salida si no existe
  if (!fs.existsSync(PROCESSED_DIR)) {
    fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  }

  // Leer datos parseados
  const datos = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
  console.log(`📥 Contratos cargados: ${datos.length}`);

  // Paso 1: Filtrar por Comunidad de Madrid
  console.log('\n🏛️  Paso 1: Filtrar por Comunidad de Madrid...');
  const contratosCAM = datos.filter(esDeCAM);
  console.log(`   ${contratosCAM.length} contratos de la CAM (${((contratosCAM.length / datos.length) * 100).toFixed(1)}%)`);
  console.log(`   ${datos.length - contratosCAM.length} contratos descartados (otras CCAA)`);

  // Paso 2: Transformar y normalizar
  console.log('\n🔧 Paso 2: Normalizar campos...');
  let id = 1;
  const contratosNormalizados = contratosCAM.map(c => transformarContrato(c, id++));

  // Estadísticas de normalización
  const stats = {
    con_objeto: contratosNormalizados.filter(c => c.objeto).length,
    con_tipo: contratosNormalizados.filter(c => c.tipo).length,
    con_procedimiento: contratosNormalizados.filter(c => c.procedimiento).length,
    con_importe: contratosNormalizados.filter(c => c.importe).length,
    con_adjudicatario: contratosNormalizados.filter(c => c.adjudicatario).length,
    con_fecha: contratosNormalizados.filter(c => c.fecha_publicacion).length,
    con_url: contratosNormalizados.filter(c => c.url_origen).length,
  };

  console.log('   Completitud de campos:');
  for (const [campo, count] of Object.entries(stats)) {
    const pct = ((count / contratosNormalizados.length) * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(pct / 5)) + '░'.repeat(20 - Math.round(pct / 5));
    console.log(`     ${campo.padEnd(20)} ${bar} ${pct}% (${count})`);
  }

  // Paso 3: Deduplicar
  console.log('\n🔍 Paso 3: Deduplicar...');
  const contratosUnicos = deduplicar(contratosNormalizados);
  const duplicados = contratosNormalizados.length - contratosUnicos.length;
  console.log(`   ${duplicados} duplicados eliminados`);
  console.log(`   ${contratosUnicos.length} contratos únicos`);

  // Reasignar IDs secuenciales
  contratosUnicos.forEach((c, i) => { c.id = i + 1; });

  // Paso 4: Ordenar por fecha (más recientes primero)
  console.log('\n📅 Paso 4: Ordenar por fecha...');
  contratosUnicos.sort((a, b) => {
    if (!a.fecha_publicacion && !b.fecha_publicacion) return 0;
    if (!a.fecha_publicacion) return 1;
    if (!b.fecha_publicacion) return -1;
    return b.fecha_publicacion.localeCompare(a.fecha_publicacion);
  });

  // Guardar resultado
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(contratosUnicos, null, 2), 'utf-8');
  const tamano = (fs.statSync(OUTPUT_FILE).size / 1024).toFixed(1);

  // Resumen final
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMEN DE TRANSFORMACIÓN');
  console.log('─'.repeat(60));
  console.log(`  📥 Entrada: ${datos.length} contratos (todas las CCAA)`);
  console.log(`  🏛️  Filtrados CAM: ${contratosCAM.length}`);
  console.log(`  🔍 Tras deduplicar: ${contratosUnicos.length}`);
  console.log(`  💾 Archivo: ${path.basename(OUTPUT_FILE)} (${tamano} KB)`);
  console.log('─'.repeat(60));

  // Estadísticas adicionales
  if (contratosUnicos.length > 0) {
    const tipos = {};
    const procedimientos = {};
    contratosUnicos.forEach(c => {
      if (c.tipo) tipos[c.tipo] = (tipos[c.tipo] || 0) + 1;
      if (c.procedimiento) procedimientos[c.procedimiento] = (procedimientos[c.procedimiento] || 0) + 1;
    });

    console.log('\n  📊 Distribución por tipo:');
    Object.entries(tipos).sort((a, b) => b[1] - a[1]).forEach(([tipo, count]) => {
      console.log(`     • ${tipo}: ${count}`);
    });

    console.log('\n  📊 Distribución por procedimiento:');
    Object.entries(procedimientos).sort((a, b) => b[1] - a[1]).forEach(([proc, count]) => {
      console.log(`     • ${proc}: ${count}`);
    });

    // Rango de importes
    const importes = contratosUnicos.filter(c => c.importe).map(c => c.importe);
    if (importes.length > 0) {
      console.log(`\n  💰 Importes:`);
      console.log(`     • Mínimo: ${Math.min(...importes).toLocaleString('es-ES')} €`);
      console.log(`     • Máximo: ${Math.max(...importes).toLocaleString('es-ES')} €`);
      console.log(`     • Media: ${(importes.reduce((a, b) => a + b, 0) / importes.length).toLocaleString('es-ES', { maximumFractionDigits: 0 })} €`);
    }
  }

  console.log('\n═'.repeat(60));
  console.log('\n✅ Transformación completada.');
  console.log('💡 Siguiente paso: npm run validate');
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

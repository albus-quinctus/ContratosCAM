/**
 * scripts/transform.js
 *
 * Lee los archivos JSON de data/processed/ y aplica transformaciones
 * de limpieza y normalización para preparar los datos para la base de datos.
 *
 * Transformaciones aplicadas:
 * - Normalización de fechas a formato ISO 8601 (YYYY-MM-DD)
 * - Normalización de importes a número flotante
 * - Limpieza de strings (trim, eliminar caracteres extraños)
 * - Normalización de nombres de organismos
 * - Eliminación de duplicados
 * - Mapeo de códigos a valores legibles
 *
 * Uso: node scripts/transform.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROCESSED_DIR = path.join(__dirname, '../data/processed');

// ─────────────────────────────────────────────────────────────────────────────
// Mapas de normalización
// ─────────────────────────────────────────────────────────────────────────────

const TIPOS_CONTRATO = {
  '1': 'Obras',
  '2': 'Gestión de servicios públicos',
  '3': 'Suministros',
  '4': 'Servicios',
  '5': 'Colaboración entre el sector público y privado',
  '7': 'Administrativo especial',
  '8': 'Privado',
  '21': 'Patrimonial',
  '31': 'Concesión de obras',
  '32': 'Concesión de servicios',
  'obras': 'Obras',
  'servicios': 'Servicios',
  'suministros': 'Suministros',
};

const PROCEDIMIENTOS = {
  '1': 'Abierto',
  '2': 'Restringido',
  '3': 'Negociado con publicidad',
  '4': 'Negociado sin publicidad',
  '5': 'Diálogo competitivo',
  '6': 'Adjudicación directa',
  '7': 'Concurso',
  '8': 'Abierto simplificado',
  '9': 'Basado en acuerdo marco',
  '10': 'Asociación para la innovación',
  'open': 'Abierto',
  'restricted': 'Restringido',
  'negotiated': 'Negociado',
};

// ─────────────────────────────────────────────────────────────────────────────
// Funciones de transformación
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Convierte una fecha en varios formatos a ISO 8601 (YYYY-MM-DD).
 * @param {string} fecha - Fecha en cualquier formato
 * @returns {string|null}
 */
function normalizarFecha(fecha) {
  if (!fecha || fecha.trim() === '') return null;

  const f = fecha.trim();

  // Ya está en formato ISO: YYYY-MM-DD o YYYY-MM-DDTHH:MM:SS
  if (/^\d{4}-\d{2}-\d{2}/.test(f)) {
    return f.substring(0, 10);
  }

  // Formato español: DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(f)) {
    const [dia, mes, anio] = f.split('/');
    return `${anio}-${mes}-${dia}`;
  }

  // Formato DD-MM-YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(f)) {
    const [dia, mes, anio] = f.split('-');
    return `${anio}-${mes}-${dia}`;
  }

  // Intentar parseo genérico
  const date = new Date(f);
  if (!isNaN(date.getTime())) {
    return date.toISOString().substring(0, 10);
  }

  return null;
}

/**
 * Convierte un string de importe a número flotante.
 * Maneja formatos: "1.234,56" "1234.56" "1,234.56" "1234"
 * @param {string|number} importe - Importe en cualquier formato
 * @returns {number|null}
 */
function normalizarImporte(importe) {
  if (importe === null || importe === undefined || importe === '') return null;
  if (typeof importe === 'number') return importe;

  let s = String(importe).trim();

  // Eliminar símbolo de euro y espacios
  s = s.replace(/[€\s]/g, '');

  // Formato europeo: 1.234,56 → 1234.56
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  // Formato con coma como separador de miles: 1,234.56 → 1234.56
  else if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  }
  // Solo coma decimal: 1234,56 → 1234.56
  else if (/^\d+,\d+$/.test(s)) {
    s = s.replace(',', '.');
  }

  const num = parseFloat(s);
  return isNaN(num) ? null : Math.round(num * 100) / 100;
}

/**
 * Limpia un string: trim, elimina caracteres de control, normaliza espacios.
 * @param {string} str
 * @returns {string|null}
 */
function limpiarString(str) {
  if (!str || typeof str !== 'string') return null;
  const limpio = str
    .trim()
    .replace(/[\x00-\x1F\x7F]/g, ' ') // Caracteres de control
    .replace(/\s+/g, ' ')              // Múltiples espacios
    .trim();
  return limpio === '' ? null : limpio;
}

/**
 * Normaliza el nombre de un organismo.
 * Elimina el prefijo "COMUNIDAD DE MADRID —" si existe.
 * @param {string} nombre
 * @returns {string|null}
 */
function normalizarOrganismo(nombre) {
  if (!nombre) return null;
  const limpio = limpiarString(nombre);
  if (!limpio) return null;
  // Eliminar prefijo institucional redundante
  return limpio.replace(/^COMUNIDAD DE MADRID\s*[-–—]\s*/i, '').trim() || null;
}

/**
 * Transforma un registro crudo al esquema normalizado.
 * @param {Object} registro - Registro crudo del parseo
 * @returns {Object} Registro normalizado
 */
function transformarRegistro(registro) {
  // Intentar mapear campos de diferentes formatos de fuente
  return {
    expediente: limpiarString(registro.expediente || registro.NumExpediente || registro.id || null),
    objeto: limpiarString(registro.objeto || registro.Objeto || registro.titulo || registro.title || null),
    tipo: TIPOS_CONTRATO[registro.tipo_contrato || registro.TipoContrato] || limpiarString(registro.tipo_contrato || registro.TipoContrato || null),
    procedimiento: PROCEDIMIENTOS[registro.procedimiento || registro.Procedimiento] || limpiarString(registro.procedimiento || registro.Procedimiento || null),
    organismo: normalizarOrganismo(registro.organismo || registro.OrganoContratacion || registro.Organismo || null),
    importe: normalizarImporte(registro.importe || registro.ImporteAdjudicacion || registro.ImporteSinIVA || null),
    importe_iva: normalizarImporte(registro.importe_iva || registro.ImporteConIVA || null),
    adjudicatario: limpiarString(registro.adjudicatario || registro.Adjudicatario || null),
    nif_adjudicatario: limpiarString(registro.nif_adjudicatario || registro.NIF || registro.CIF || null),
    fecha_publicacion: normalizarFecha(registro.publicado || registro.FechaPublicacion || registro.fecha_publicacion || null),
    fecha_adjudicacion: normalizarFecha(registro.FechaAdjudicacion || registro.fecha_adjudicacion || null),
    fecha_formalizacion: normalizarFecha(registro.FechaFormalizacion || registro.fecha_formalizacion || null),
    url_origen: limpiarString(registro.enlace || registro.URLPublicacion || registro.url_origen || null),
  };
}

/**
 * Elimina duplicados basándose en el número de expediente.
 * @param {Object[]} registros
 * @returns {Object[]}
 */
function eliminarDuplicados(registros) {
  const vistos = new Set();
  return registros.filter(r => {
    if (!r.expediente) return true; // Sin expediente, no podemos deduplicar
    if (vistos.has(r.expediente)) return false;
    vistos.add(r.expediente);
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 ContratosCAM — Transformación de datos');
  console.log('═'.repeat(50));

  const archivos = fs.readdirSync(PROCESSED_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('contratos-normalizados'));

  if (archivos.length === 0) {
    console.log('⚠️  No hay archivos JSON en data/processed/');
    console.log('   Ejecuta primero: npm run parse');
    process.exit(0);
  }

  let todosLosRegistros = [];

  for (const archivo of archivos) {
    const rutaArchivo = path.join(PROCESSED_DIR, archivo);
    console.log(`\n📂 Transformando: ${archivo}`);

    const registrosCrudos = JSON.parse(fs.readFileSync(rutaArchivo, 'utf-8'));
    console.log(`  📊 Registros crudos: ${registrosCrudos.length}`);

    const registrosTransformados = registrosCrudos.map(transformarRegistro);

    // Filtrar registros sin datos mínimos
    const registrosValidos = registrosTransformados.filter(r => r.objeto || r.expediente);
    console.log(`  ✅ Registros válidos: ${registrosValidos.length}`);

    todosLosRegistros.push(...registrosValidos);
  }

  // Deduplicar
  const antesDedup = todosLosRegistros.length;
  todosLosRegistros = eliminarDuplicados(todosLosRegistros);
  const duplicadosEliminados = antesDedup - todosLosRegistros.length;

  if (duplicadosEliminados > 0) {
    console.log(`\n🔍 Duplicados eliminados: ${duplicadosEliminados}`);
  }

  // Guardar resultado final
  const rutaSalida = path.join(PROCESSED_DIR, 'contratos-normalizados.json');
  fs.writeFileSync(rutaSalida, JSON.stringify(todosLosRegistros, null, 2), 'utf-8');

  console.log('\n' + '═'.repeat(50));
  console.log(`✅ Transformación completada.`);
  console.log(`   Total registros normalizados: ${todosLosRegistros.length}`);
  console.log(`   Guardado en: ${rutaSalida}`);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

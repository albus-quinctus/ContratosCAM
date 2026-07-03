/**
 * scripts/import-db.js
 *
 * Importa los datos normalizados de data/processed/contratos-normalizados.json
 * a la base de datos SQLite en data/db/contratos.db.
 *
 * Usa sql.js (SQLite compilado a WebAssembly) — no requiere Visual Studio
 * ni compilación nativa. Funciona en cualquier plataforma sin configuración.
 *
 * Uso: node scripts/import-db.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PROCESSED_DIR = path.join(__dirname, '../data/processed');
const DB_DIR = path.join(__dirname, '../data/db');
const DB_PATH = path.join(DB_DIR, 'contratos.db');
const JSON_PATH = path.join(PROCESSED_DIR, 'contratos-normalizados.json');

// ─────────────────────────────────────────────────────────────────────────────
// Esquema de la base de datos
// ─────────────────────────────────────────────────────────────────────────────

const SQL_CREAR_TABLAS = `
  CREATE TABLE IF NOT EXISTS contratos (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    expediente          TEXT UNIQUE,
    objeto              TEXT NOT NULL,
    tipo                TEXT,
    procedimiento       TEXT,
    organismo           TEXT,
    importe             REAL,
    importe_iva         REAL,
    adjudicatario       TEXT,
    nif_adjudicatario   TEXT,
    fecha_publicacion   TEXT,
    fecha_adjudicacion  TEXT,
    fecha_formalizacion TEXT,
    url_origen          TEXT,
    created_at          TEXT DEFAULT (datetime('now')),
    updated_at          TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_contratos_organismo
    ON contratos(organismo);

  CREATE INDEX IF NOT EXISTS idx_contratos_tipo
    ON contratos(tipo);

  CREATE INDEX IF NOT EXISTS idx_contratos_fecha_publicacion
    ON contratos(fecha_publicacion);

  CREATE INDEX IF NOT EXISTS idx_contratos_importe
    ON contratos(importe);

  CREATE INDEX IF NOT EXISTS idx_contratos_adjudicatario
    ON contratos(adjudicatario);

  CREATE TABLE IF NOT EXISTS importaciones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha        TEXT DEFAULT (datetime('now')),
    registros    INTEGER,
    insertados   INTEGER,
    actualizados INTEGER
  );
`;

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🗄️  ContratosCAM — Importación a base de datos (sql.js)');
  console.log('═'.repeat(50));

  // Verificar que existe el JSON normalizado
  if (!fs.existsSync(JSON_PATH)) {
    console.error('❌ No se encontró: data/processed/contratos-normalizados.json');
    console.error('   Ejecuta primero: npm run transform');
    process.exit(1);
  }

  // Crear directorio de BD si no existe
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // Leer datos normalizados
  console.log('\n📂 Leyendo datos normalizados...');
  const contratos = JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
  console.log('   Registros a importar: ' + contratos.length);

  // Inicializar sql.js
  console.log('\n⚙️  Inicializando SQLite (sql.js)...');
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  // Cargar BD existente o crear nueva
  let db;
  if (fs.existsSync(DB_PATH)) {
    console.log('   Cargando base de datos existente...');
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    console.log('   Creando nueva base de datos...');
    db = new SQL.Database();
  }

  // Crear tablas e índices
  console.log('\n🏗️  Creando tablas e índices...');
  db.run(SQL_CREAR_TABLAS);

  // Importar registros
  console.log('\n⬆️  Importando registros...');

  let insertados = 0;
  let actualizados = 0;
  let errores = 0;

  // Usar transacción para mayor velocidad
  db.run('BEGIN TRANSACTION');

  for (const contrato of contratos) {
    try {
      // Asegurarse de que objeto no sea null (campo NOT NULL)
      if (!contrato.objeto) {
        contrato.objeto = contrato.expediente || 'Sin descripción';
      }

      if (contrato.expediente) {
        // Comprobar si ya existe
        const resultado = db.exec(
          'SELECT id FROM contratos WHERE expediente = ?',
          [contrato.expediente]
        );
        const existe = resultado.length > 0 && resultado[0].values.length > 0;

        db.run(`
          INSERT INTO contratos (
            expediente, objeto, tipo, procedimiento, organismo,
            importe, importe_iva, adjudicatario, nif_adjudicatario,
            fecha_publicacion, fecha_adjudicacion, fecha_formalizacion,
            url_origen, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(expediente) DO UPDATE SET
            objeto              = excluded.objeto,
            tipo                = excluded.tipo,
            procedimiento       = excluded.procedimiento,
            organismo           = excluded.organismo,
            importe             = excluded.importe,
            importe_iva         = excluded.importe_iva,
            adjudicatario       = excluded.adjudicatario,
            nif_adjudicatario   = excluded.nif_adjudicatario,
            fecha_publicacion   = excluded.fecha_publicacion,
            fecha_adjudicacion  = excluded.fecha_adjudicacion,
            fecha_formalizacion = excluded.fecha_formalizacion,
            url_origen          = excluded.url_origen,
            updated_at          = datetime('now')
        `, [
          contrato.expediente,
          contrato.objeto,
          contrato.tipo ?? null,
          contrato.procedimiento ?? null,
          contrato.organismo ?? null,
          contrato.importe ?? null,
          contrato.importe_iva ?? null,
          contrato.adjudicatario ?? null,
          contrato.nif_adjudicatario ?? null,
          contrato.fecha_publicacion ?? null,
          contrato.fecha_adjudicacion ?? null,
          contrato.fecha_formalizacion ?? null,
          contrato.url_origen ?? null,
        ]);

        if (existe) actualizados++; else insertados++;

      } else {
        db.run(`
          INSERT INTO contratos (
            objeto, tipo, procedimiento, organismo,
            importe, importe_iva, adjudicatario, nif_adjudicatario,
            fecha_publicacion, fecha_adjudicacion, fecha_formalizacion,
            url_origen
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          contrato.objeto,
          contrato.tipo ?? null,
          contrato.procedimiento ?? null,
          contrato.organismo ?? null,
          contrato.importe ?? null,
          contrato.importe_iva ?? null,
          contrato.adjudicatario ?? null,
          contrato.nif_adjudicatario ?? null,
          contrato.fecha_publicacion ?? null,
          contrato.fecha_adjudicacion ?? null,
          contrato.fecha_formalizacion ?? null,
          contrato.url_origen ?? null,
        ]);
        insertados++;
      }
    } catch (err) {
      errores++;
      if (errores <= 5) {
        console.error('  ⚠️  Error en registro:', err.message);
      }
    }
  }

  db.run('COMMIT');

  // Registrar la importación
  db.run(
    'INSERT INTO importaciones (registros, insertados, actualizados) VALUES (?, ?, ?)',
    [contratos.length, insertados, actualizados]
  );

  // Estadísticas finales
  const totalEnBD = db.exec('SELECT COUNT(*) as total FROM contratos')[0]?.values[0][0] ?? 0;
  const organismos = db.exec('SELECT COUNT(DISTINCT organismo) as total FROM contratos')[0]?.values[0][0] ?? 0;
  const importeRow = db.exec('SELECT SUM(importe) as total FROM contratos')[0]?.values[0][0];

  // Guardar la BD en disco (sql.js trabaja en memoria, hay que exportar)
  console.log('\n💾 Guardando base de datos en disco...');
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Importación completada.');
  console.log('   Insertados:   ' + insertados);
  console.log('   Actualizados: ' + actualizados);
  if (errores > 0) console.log('   Errores:      ' + errores);
  console.log('\n📊 Estado de la base de datos:');
  console.log('   Total contratos: ' + Number(totalEnBD).toLocaleString('es-ES'));
  console.log('   Organismos:      ' + Number(organismos).toLocaleString('es-ES'));
  if (importeRow) {
    console.log('   Importe total:   ' + Number(importeRow).toLocaleString('es-ES', {
      style: 'currency', currency: 'EUR',
    }));
  }
  console.log('\n📁 Base de datos: ' + DB_PATH);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

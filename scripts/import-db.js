/**
 * scripts/import-db.js
 *
 * Importa los datos normalizados de data/processed/contratos-normalizados.json
 * a la base de datos SQLite en data/db/contratos.db.
 *
 * Crea las tablas si no existen y hace un upsert de los registros
 * (inserta nuevos, actualiza los existentes por expediente).
 *
 * Uso: node scripts/import-db.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';

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
    created_at          TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at          TEXT DEFAULT CURRENT_TIMESTAMP
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

  CREATE VIRTUAL TABLE IF NOT EXISTS contratos_fts USING fts5(
    objeto,
    organismo,
    adjudicatario,
    content='contratos',
    content_rowid='id'
  );

  CREATE TABLE IF NOT EXISTS importaciones (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha        TEXT DEFAULT CURRENT_TIMESTAMP,
    registros    INTEGER,
    insertados   INTEGER,
    actualizados INTEGER
  );
`;

// ─────────────────────────────────────────────────────────────────────────────
// Función principal
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🗄️  ContratosCAM — Importación a base de datos');
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

  // Abrir/crear base de datos
  const db = new Database(DB_PATH);
  console.log('\n🗄️  Base de datos: ' + DB_PATH);

  // Activar WAL mode para mejor rendimiento
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Crear tablas e índices
  console.log('\n🏗️  Creando tablas e índices...');
  db.exec(SQL_CREAR_TABLAS);

  // Preparar sentencia de upsert
  const upsert = db.prepare(`
    INSERT INTO contratos (
      expediente, objeto, tipo, procedimiento, organismo,
      importe, importe_iva, adjudicatario, nif_adjudicatario,
      fecha_publicacion, fecha_adjudicacion, fecha_formalizacion,
      url_origen, updated_at
    ) VALUES (
      @expediente, @objeto, @tipo, @procedimiento, @organismo,
      @importe, @importe_iva, @adjudicatario, @nif_adjudicatario,
      @fecha_publicacion, @fecha_adjudicacion, @fecha_formalizacion,
      @url_origen, CURRENT_TIMESTAMP
    )
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
      updated_at          = CURRENT_TIMESTAMP
  `);

  // Insertar sin expediente (no se puede deduplicar)
  const insertarSinExpediente = db.prepare(`
    INSERT INTO contratos (
      objeto, tipo, procedimiento, organismo,
      importe, importe_iva, adjudicatario, nif_adjudicatario,
      fecha_publicacion, fecha_adjudicacion, fecha_formalizacion,
      url_origen
    ) VALUES (
      @objeto, @tipo, @procedimiento, @organismo,
      @importe, @importe_iva, @adjudicatario, @nif_adjudicatario,
      @fecha_publicacion, @fecha_adjudicacion, @fecha_formalizacion,
      @url_origen
    )
  `);

  // Importar en una sola transacción para mayor velocidad
  console.log('\n⬆️  Importando registros...');

  let insertados = 0;
  let actualizados = 0;
  let errores = 0;

  const importarTodo = db.transaction((registros) => {
    for (const contrato of registros) {
      try {
        // Asegurarse de que objeto no sea null (campo NOT NULL)
        if (!contrato.objeto) {
          contrato.objeto = contrato.expediente || 'Sin descripción';
        }

        if (contrato.expediente) {
          // Comprobar si ya existe para contar insertados vs actualizados
          const existe = db.prepare('SELECT id FROM contratos WHERE expediente = ?')
            .get(contrato.expediente);

          upsert.run(contrato);

          if (existe) {
            actualizados++;
          } else {
            insertados++;
          }
        } else {
          insertarSinExpediente.run(contrato);
          insertados++;
        }
      } catch (err) {
        errores++;
        if (errores <= 5) {
          console.error('  ⚠️  Error en registro:', err.message);
        }
      }
    }
  });

  importarTodo(contratos);

  // Reconstruir índice FTS
  console.log('\n🔍 Reconstruyendo índice de búsqueda de texto...');
  try {
    db.exec("INSERT INTO contratos_fts(contratos_fts) VALUES('rebuild')");
  } catch (err) {
    console.warn('  ⚠️  No se pudo reconstruir FTS:', err.message);
  }

  // Registrar la importación
  db.prepare(`
    INSERT INTO importaciones (registros, insertados, actualizados)
    VALUES (?, ?, ?)
  `).run(contratos.length, insertados, actualizados);

  // Estadísticas finales
  const totalEnBD = db.prepare('SELECT COUNT(*) as total FROM contratos').get().total;
  const organismos = db.prepare('SELECT COUNT(DISTINCT organismo) as total FROM contratos').get().total;
  const importeTotal = db.prepare('SELECT SUM(importe) as total FROM contratos').get().total;

  db.close();

  console.log('\n' + '═'.repeat(50));
  console.log('✅ Importación completada.');
  console.log('   Insertados:  ' + insertados);
  console.log('   Actualizados: ' + actualizados);
  if (errores > 0) console.log('   Errores:     ' + errores);
  console.log('\n📊 Estado de la base de datos:');
  console.log('   Total contratos: ' + totalEnBD.toLocaleString('es-ES'));
  console.log('   Organismos:      ' + organismos.toLocaleString('es-ES'));
  if (importeTotal) {
    console.log('   Importe total:   ' + importeTotal.toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }));
  }
  console.log('\n📁 Base de datos: ' + DB_PATH);
}

main().catch(err => {
  console.error('❌ Error fatal:', err.message);
  process.exit(1);
});

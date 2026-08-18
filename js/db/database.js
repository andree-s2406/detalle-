// ============================================================
//  DATABASE — Inicialización sql.js + persistencia IndexedDB
// ============================================================

import {
  CREATE_TABLES_SQL, DEFAULT_CONFIG, INITIAL_COLORS,
  INITIAL_PRODUCTS, SCHEMA_VERSION
} from './schema.js';
import { uuid, nowISO } from '../components/Formatter.js';

const DB_NAME   = 'DetallePedidosDB';
const DB_STORE  = 'sqliteStore';
const DB_KEY    = 'mainDatabase';

let _db = null;          // instancia sql.js activa
let _SQL = null;         // clase sql.js

// --------------------------------------------------------
//  Inicializar
// --------------------------------------------------------
export async function initDatabase() {
  // Cargar sql.js localmente
  _SQL = await window.initSqlJs({
    locateFile: file => `./lib/${file}`
  });

  // Intentar recuperar DB de IndexedDB
  const saved = await loadFromIndexedDB();

  if (saved) {
    _db = new _SQL.Database(saved);
    // Ejecutar migraciones si es necesario
    await runMigrations();
  } else {
    // Base de datos nueva
    _db = new _SQL.Database();
    await bootstrapDatabase();
  }

  // Auto-guardar cada 30 segundos
  setInterval(persistDatabase, 30000);

  return _db;
}

// --------------------------------------------------------
//  Bootstrap (primera vez)
// --------------------------------------------------------
async function bootstrapDatabase() {
  _db.run(CREATE_TABLES_SQL);

  // Versión de esquema
  _db.run(
    `INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`,
    [SCHEMA_VERSION, nowISO()]
  );

  // Configuración
  for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
    _db.run(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`, [key, value]);
  }

  // Colores iniciales
  const colorMap = {}; // nombre -> id
  for (const nombre of INITIAL_COLORS) {
    const id = uuid();
    colorMap[nombre] = id;
    _db.run(
      `INSERT OR IGNORE INTO colors (id, nombre, activo, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
      [id, nombre, nowISO(), nowISO()]
    );
  }

  // Productos iniciales
  for (const [nombre, precio, colores] of INITIAL_PRODUCTS) {
    const productId = uuid();
    _db.run(
      `INSERT INTO products (id, nombre, precio, activo, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
      [productId, nombre, precio, nowISO(), nowISO()]
    );
    for (const colorName of colores) {
      const colorId = colorMap[colorName];
      if (colorId) {
        _db.run(
          `INSERT OR IGNORE INTO product_colors (product_id, color_id) VALUES (?, ?)`,
          [productId, colorId]
        );
      }
    }
  }

  await persistDatabase();
}

// --------------------------------------------------------
//  Migraciones
// --------------------------------------------------------
async function runMigrations() {
  try {
    // Asegurar que las tablas existen
    _db.run(CREATE_TABLES_SQL);

    const res = _db.exec(`SELECT MAX(version) as v FROM schema_version`);
    const current = res[0]?.values[0]?.[0] ?? 0;

    if (current < 4) {
      try {
        // Migración V4: Permitir order_id NULL en payments para pagos independientes
        _db.run('PRAGMA foreign_keys = OFF');
        _db.run(`
          CREATE TABLE IF NOT EXISTS payments_temp (
            id            TEXT PRIMARY KEY,
            order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
            fecha         TEXT NOT NULL,
            tipo_pago     TEXT NOT NULL,
            importe       REAL NOT NULL DEFAULT 0,
            fecha_cobro   TEXT DEFAULT '',
            observaciones TEXT DEFAULT '',
            created_at    TEXT NOT NULL
          );
        `);
        _db.run(`INSERT OR IGNORE INTO payments_temp SELECT id, order_id, fecha, tipo_pago, importe, fecha_cobro, observaciones, created_at FROM payments;`);
        _db.run(`DROP TABLE IF EXISTS payments;`);
        _db.run(`ALTER TABLE payments_temp RENAME TO payments;`);
        _db.run('PRAGMA foreign_keys = ON');
      } catch (migErr) {
        console.warn('V4 table migration note:', migErr);
      }
    }

    if (current < 5) {
      try {
        // Migración V5: Agregar saldo anterior a pedidos
        _db.run(`ALTER TABLE orders ADD COLUMN saldo_anterior_monto REAL NOT NULL DEFAULT 0;`);
      } catch (e) { console.warn('V5 col saldo_anterior_monto already exists'); }
      try {
        _db.run(`ALTER TABLE orders ADD COLUMN saldo_anterior_tipo TEXT DEFAULT '';`);
      } catch (e) { console.warn('V5 col saldo_anterior_tipo already exists'); }
    }

    if (current < SCHEMA_VERSION) {
      _db.run(
        `INSERT INTO schema_version (version, applied_at) VALUES (?, ?)`,
        [SCHEMA_VERSION, nowISO()]
      );

      // Asegurar config defaults
      for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
        _db.run(`INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)`, [key, value]);
      }
      await persistDatabase();
    }
  } catch(e) {
    console.warn('Migration error (non-fatal):', e);
  }
}

// --------------------------------------------------------
//  API de consultas
// --------------------------------------------------------

/** Ejecutar SELECT y devolver array de objetos */
export function queryAll(sql, params = []) {
  const res = _db.exec(sql, params);
  if (!res.length) return [];
  const { columns, values } = res[0];
  return values.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  });
}

/** Ejecutar SELECT y devolver primer resultado o null */
export function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length ? rows[0] : null;
}

/** Ejecutar INSERT/UPDATE/DELETE */
export function run(sql, params = []) {
  _db.run(sql, params);
}

/** Ejecutar múltiples statements en transacción */
export function transaction(fn) {
  _db.run('BEGIN TRANSACTION');
  try {
    fn();
    _db.run('COMMIT');
    persistDatabase();
  } catch(e) {
    _db.run('ROLLBACK');
    throw e;
  }
}

// --------------------------------------------------------
//  Persistencia IndexedDB
// --------------------------------------------------------
export async function persistDatabase() {
  if (!_db) return;
  const data = _db.export();
  await saveToIndexedDB(data);
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = e => {
      e.target.result.createObjectStore(DB_STORE);
    };
    req.onsuccess  = e => resolve(e.target.result);
    req.onerror    = e => reject(e.target.error);
  });
}

async function saveToIndexedDB(data) {
  const db = await openIndexedDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(DB_STORE, 'readwrite');
    const store = tx.objectStore(DB_STORE);
    store.put(data, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror    = e => reject(e.target.error);
  });
}

async function loadFromIndexedDB() {
  try {
    const db = await openIndexedDB();
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(DB_STORE, 'readonly');
      const store = tx.objectStore(DB_STORE);
      const req   = store.get(DB_KEY);
      req.onsuccess = e => resolve(e.target.result ?? null);
      req.onerror   = e => reject(e.target.error);
    });
  } catch(e) {
    return null;
  }
}

// --------------------------------------------------------
//  Exportar / Importar
// --------------------------------------------------------
export function exportDatabase() {
  if (!_db) return;
  const data = _db.export();
  const blob = new Blob([data], { type: 'application/octet-stream' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `detalle_backup_${new Date().toISOString().slice(0,10)}.db`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importDatabase(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data  = new Uint8Array(e.target.result);
        const newDb = new _SQL.Database(data);
        // Verificar que es válida
        newDb.exec('SELECT 1 FROM products LIMIT 1');
        _db = newDb;
        await persistDatabase();
        resolve(true);
      } catch(err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function getDb() { return _db; }

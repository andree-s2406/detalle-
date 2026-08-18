// ============================================================
//  SCHEMA — SQL para crear todas las tablas y datos iniciales
// ============================================================

export const SCHEMA_VERSION = 6;

export const CREATE_TABLES_SQL = `
-- Configuración general del sistema
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Colores globales
CREATE TABLE IF NOT EXISTS colors (
  id      TEXT PRIMARY KEY,
  nombre  TEXT NOT NULL UNIQUE,
  activo  INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Productos
CREATE TABLE IF NOT EXISTS products (
  id         TEXT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  precio     REAL NOT NULL DEFAULT 0,
  activo     INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Relación N:M Producto <-> Color
CREATE TABLE IF NOT EXISTS product_colors (
  product_id TEXT NOT NULL REFERENCES products(id),
  color_id   TEXT NOT NULL REFERENCES colors(id),
  PRIMARY KEY (product_id, color_id)
);

-- Pedidos
CREATE TABLE IF NOT EXISTS orders (
  id                      TEXT PRIMARY KEY,
  numero                  INTEGER UNIQUE NOT NULL,
  fecha                   TEXT NOT NULL,
  estado                  TEXT NOT NULL DEFAULT 'borrador',
  total                   REAL NOT NULL DEFAULT 0,
  importe_sin_factura     REAL NOT NULL DEFAULT 0,
  importe_facturado       REAL NOT NULL DEFAULT 0,
  saldo_anterior_monto    REAL NOT NULL DEFAULT 0,
  saldo_anterior_tipo     TEXT DEFAULT '',
  saldo_anterior_efectivo REAL NOT NULL DEFAULT 0,
  saldo_anterior_blanco   REAL NOT NULL DEFAULT 0,
  notas                   TEXT DEFAULT '',
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL
);

-- Líneas de pedido (precio histórico guardado aquí)
CREATE TABLE IF NOT EXISTS order_items (
  id                        TEXT PRIMARY KEY,
  order_id                  TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id                TEXT REFERENCES products(id),
  producto_nombre_historico TEXT NOT NULL,
  color                     TEXT NOT NULL DEFAULT '',
  cantidad                  REAL NOT NULL DEFAULT 1,
  precio_unitario_historico REAL NOT NULL,
  subtotal                  REAL NOT NULL,
  sort_order                INTEGER DEFAULT 0
);

-- Pagos (order_id es opcional para permitir pagos generales independientes)
CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  order_id      TEXT REFERENCES orders(id) ON DELETE SET NULL,
  fecha         TEXT NOT NULL,
  tipo_pago     TEXT NOT NULL,
  importe       REAL NOT NULL DEFAULT 0,
  fecha_cobro   TEXT DEFAULT '',
  observaciones TEXT DEFAULT '',
  created_at    TEXT NOT NULL
);

-- Historial de cambios (preparado para auditoría futura)
CREATE TABLE IF NOT EXISTS order_history (
  id            TEXT PRIMARY KEY,
  order_id      TEXT NOT NULL,
  campo         TEXT NOT NULL,
  valor_antes   TEXT DEFAULT '',
  valor_despues TEXT DEFAULT '',
  usuario       TEXT DEFAULT 'admin',
  created_at    TEXT NOT NULL
);

-- Versión del esquema
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL
);
`;

// ---- Valores por defecto de configuración ----
export const DEFAULT_CONFIG = {
  pct_sin_factura: '0.70',
  pct_facturado:   '0.30',
  recargo_factura: '0.245',
  moneda_simbolo:  '$',
  moneda_decimales:'2',
  moneda_separador_miles: '.',
  moneda_separador_decimal: ',',
};

// ---- Colores iniciales ----
export const INITIAL_COLORS = [
  'Gris', 'Beige', 'Vision', 'Negro', 'Rojo', 'Blanco', 'Azul', 'Verde', 'Natural', 'Topo'
];

// ---- Productos iniciales ----
// Formato: [nombre, precio, colores[]]
export const INITIAL_PRODUCTS = [
  ['BED XL',         31972.00,   ['Gris', 'Beige', 'Vision']],
  ['BED L',          25500.00,   ['Gris', 'Beige', 'Vision']],
  ['BED M',          19113.00,   ['Gris', 'Beige', 'Vision']],
  ['BED S',          19408.00,   ['Gris', 'Beige', 'Vision']],
  ['COBERTOR XL',    29689.19,   ['Gris', 'Beige', 'Natural']],
  ['COBERTOR M',     25675.00,   ['Gris', 'Beige', 'Natural']],
  ['PELO CORTO XL',  32647.00,   ['Gris', 'Beige', 'Topo']],
  ['PELO CORTO L',   26457.00,   ['Gris', 'Beige', 'Topo']],
  ['PELO CORTO M',   20966.00,   ['Gris', 'Beige', 'Topo']],
  ['BAMBU XL',       31569.00,   ['Natural', 'Blanco']],
  ['BAMBU L',        24480.00,   ['Natural', 'Blanco']],
  ['BAMBU M',        20487.00,   ['Natural', 'Blanco']],
  ['BAMBU S',        16712.00,   ['Natural', 'Blanco']],
  ['COMFY SOFA L',   38000.00,   ['Gris', 'Negro', 'Beige']],
  ['COMFY SOFA M',   23675.00,   ['Gris', 'Negro', 'Beige']],
  ['MANTAS',          3000.00,   ['Gris', 'Beige', 'Blanco', 'Natural']],
  ['Funda M bed',     9797.30,   ['Blanco']],
  ['Funda XL bed',   16486.49,   ['Blanco']],
  ['Funda L bed',    13108.11,   ['Blanco']],
];

// ---- Estados de pedido ----
export const ORDER_STATES = [
  { value: 'borrador',     label: 'Borrador' },
  { value: 'confirmado',   label: 'Confirmado' },
  { value: 'en_produccion',label: 'En Producción' },
  { value: 'listo',        label: 'Listo' },
  { value: 'entregado',    label: 'Entregado' },
  { value: 'cancelado',    label: 'Cancelado' },
];

// ---- Tipos de pago ----
export const PAYMENT_TYPES = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'blanco',   label: 'Abono en blanco' },
  { value: 'echeq',    label: 'E-cheq' },
];

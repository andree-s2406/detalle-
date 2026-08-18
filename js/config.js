// ============================================================
//  CONFIG — Lee y escribe configuración desde tabla `config`
// ============================================================

import { queryAll, run, persistDatabase } from './db/database.js';

let _cache = null;

export function loadConfig() {
  const rows = queryAll('SELECT key, value FROM config');
  _cache = {};
  for (const row of rows) {
    _cache[row.key] = row.value;
  }
  return _cache;
}

export function getConfig(key, defaultValue = null) {
  if (!_cache) loadConfig();
  return _cache[key] !== undefined ? _cache[key] : defaultValue;
}

export function setConfig(key, value) {
  run(`INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)`, [key, String(value)]);
  if (_cache) _cache[key] = String(value);
  persistDatabase();
}

// ---- Getters de cálculo ----
export function getPctSinFactura() {
  return parseFloat(getConfig('pct_sin_factura', '0.70'));
}

export function getPctFacturado() {
  return parseFloat(getConfig('pct_facturado', '0.30'));
}

export function getRecargoFactura() {
  return parseFloat(getConfig('recargo_factura', '0.245'));
}

// ---- Calcular importes ----
export function calcularImportes(total) {
  const pctSF   = getPctSinFactura();
  const pctF    = getPctFacturado();
  const recargo = getRecargoFactura();

  const sinFactura = total * pctSF;
  const facturado  = total * pctF * (1 + recargo);

  return { sinFactura, facturado };
}

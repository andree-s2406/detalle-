// ============================================================
//  SHEETS API — Métodos REST para Google Sheets con Auto-Renovación
// ============================================================

import { getAccessToken, ensureValidToken } from './google-auth.js';
import { getConfig } from '../config.js';

const SHEETS_BASE_URL = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Obtener ID del Spreadsheet configurado
 */
function getSpreadsheetId() {
  return getConfig('google_spreadsheet_id', '').trim();
}

/**
 * Helper genérico para peticiones a la API de Google Sheets con auto-reintento ante 401
 */
async function sheetsFetch(endpoint, options = {}, isRetry = false) {
  let token = await ensureValidToken(false).catch(() => getAccessToken());
  if (!token) {
    throw new Error('No hay sesión activa de Google. Conectá tu cuenta desde Configuración.');
  }

  const spreadsheetId = getSpreadsheetId();
  if (!spreadsheetId) {
    throw new Error('Falta configurar el ID del Spreadsheet en Configuración.');
  }

  const url = `${SHEETS_BASE_URL}/${spreadsheetId}${endpoint}`;
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const response = await fetch(url, { ...options, headers });
  
  // Si el token expiró (HTTP 401), intentar renovar y reintentar una vez
  if (response.status === 401 && !isRetry) {
    console.warn('[SheetsApi] Token expirado (401). Intentando renovación...');
    try {
      token = await ensureValidToken(false);
      return sheetsFetch(endpoint, options, true);
    } catch (renewErr) {
      throw new Error('La sesión de Google expiró. Por favor hacé clic en "Conectar con Google Drive" en Configuración.');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData.error?.message || `HTTP Error ${response.status} (${response.statusText})`;
    throw new Error(`[Google Sheets API] ${message}`);
  }

  return response.json();
}

let _sheetTitlesCache = null;

/**
 * Obtener lista de títulos de hojas reales de la planilla de Google
 */
async function getSpreadsheetSheets(forceRefresh = false) {
  if (!forceRefresh && _sheetTitlesCache && _sheetTitlesCache.length > 0) {
    return _sheetTitlesCache;
  }
  try {
    const data = await sheetsFetch('');
    _sheetTitlesCache = data.sheets?.map(s => s.properties.title) || [];
    return _sheetTitlesCache;
  } catch (e) {
    return _sheetTitlesCache || [];
  }
}

/**
 * Resolver el nombre exacto de la hoja (insensible a mayúsculas/minúsculas y espacios)
 */
function resolveSheetTitleFromList(requestedName, sheetList) {
  if (!requestedName) return requestedName;
  const cleanReq = requestedName.trim().toLowerCase();
  const match = sheetList.find(s => s.trim().toLowerCase() === cleanReq);
  return match || requestedName.trim();
}

/**
 * Formatear un rango seguro A1 con comillas simples para la API de Google Sheets
 */
async function formatSafeRange(rangeOrSheet, cellRange = '') {
  const sheetList = await getSpreadsheetSheets();
  let sheetName = rangeOrSheet;
  let cells = cellRange;

  if (!cells && rangeOrSheet.includes('!')) {
    const parts = rangeOrSheet.split('!');
    sheetName = parts[0].replace(/^'|'$/g, '');
    cells = parts[1] || '';
  }

  const resolvedName = resolveSheetTitleFromList(sheetName, sheetList);
  const escapedName = resolvedName.replace(/'/g, "''");
  return cells ? `'${escapedName}'!${cells}` : `'${escapedName}'`;
}

export const SheetsApi = {
  /**
   * Verificar acceso a la planilla y estructura de hojas
   */
  async verifySpreadsheet() {
    _sheetTitlesCache = null; // Forzar recarga de metadatos
    const data = await sheetsFetch('');
    const sheets = data.sheets?.map(s => s.properties.title) || [];
    _sheetTitlesCache = sheets;
    return {
      title: data.properties?.title || 'Planilla de Pedidos',
      sheets,
      hasRequiredSheets: ['Descripcion', 'productos', 'Pagos'].every(name =>
        sheets.some(s => s.trim().toLowerCase() === name.trim().toLowerCase())
      )
    };
  },

  /**
   * Obtener filas de una hoja específica
   */
  async getValues(range) {
    const safeRange = await formatSafeRange(range);
    try {
      const data = await sheetsFetch(`/values/${encodeURIComponent(safeRange)}`);
      return data.values || [];
    } catch (err) {
      // Si falló, intentar recargar títulos y reintentar
      if (err.message?.includes('Unable to parse range')) {
        const refreshedList = await getSpreadsheetSheets(true);
        const retryRange = await formatSafeRange(range);
        const retryData = await sheetsFetch(`/values/${encodeURIComponent(retryRange)}`);
        return retryData.values || [];
      }
      throw err;
    }
  },

  /**
   * Agregar filas al final de una hoja (Append)
   */
  async appendValues(sheetName, values) {
    const safeRange = await formatSafeRange(sheetName, 'A1');
    return sheetsFetch(`/values/${encodeURIComponent(safeRange)}:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      body: JSON.stringify({ values })
    });
  },

  /**
   * Actualizar un rango específico de celdas
   */
  async updateValues(range, values) {
    const safeRange = await formatSafeRange(range);
    return sheetsFetch(`/values/${encodeURIComponent(safeRange)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values })
    });
  },

  /**
   * Reemplazar todo el contenido de una hoja
   */
  async clearAndReplace(sheetName, values, startCell = 'A1') {
    const sheetList = await getSpreadsheetSheets();
    const resolvedName = resolveSheetTitleFromList(sheetName, sheetList);
    const escapedName = resolvedName.replace(/'/g, "''");

    // 1. Limpiar hoja con rango seguro
    try {
      const range = `'${escapedName}'!${startCell}:Z5000`;
      await sheetsFetch(`/values/${encodeURIComponent(range)}:clear`, { method: 'POST' });
    } catch (clearErr) {
      console.warn(`[SheetsApi] Reintentando clear simplificado para ${sheetName}:`, clearErr.message);
      try {
        const fallbackRange = `'${escapedName}'!${startCell}:I2000`;
        await sheetsFetch(`/values/${encodeURIComponent(fallbackRange)}:clear`, { method: 'POST' });
      } catch (fallbackErr) {
        console.warn(`[SheetsApi] No se pudo limpiar el rango previo:`, fallbackErr.message);
      }
    }

    // 2. Escribir nuevos valores
    if (values && values.length > 0) {
      const updateRange = `'${escapedName}'!${startCell}`;
      await sheetsFetch(`/values/${encodeURIComponent(updateRange)}?valueInputOption=USER_ENTERED`, {
        method: 'PUT',
        body: JSON.stringify({ values })
      });
    }
  }
};

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

export const SheetsApi = {
  /**
   * Verificar acceso a la planilla y estructura de hojas
   */
  async verifySpreadsheet() {
    const data = await sheetsFetch('');
    const sheets = data.sheets?.map(s => s.properties.title) || [];
    return {
      title: data.properties?.title || 'Planilla de Pedidos',
      sheets,
      hasRequiredSheets: ['Descripcion', 'productos', 'Pagos'].every(name =>
        sheets.some(s => s.toLowerCase() === name.toLowerCase())
      )
    };
  },

  /**
   * Obtener filas de una hoja específica
   */
  async getValues(range) {
    const data = await sheetsFetch(`/values/${encodeURIComponent(range)}`);
    return data.values || [];
  },

  /**
   * Agregar filas al final de una hoja (Append)
   */
  async appendValues(sheetName, values) {
    const range = `${sheetName}!A1`;
    return sheetsFetch(`/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`, {
      method: 'POST',
      body: JSON.stringify({ values })
    });
  },

  /**
   * Actualizar un rango específico de celdas
   */
  async updateValues(range, values) {
    return sheetsFetch(`/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values })
    });
  },

  /**
   * Reemplazar todo el contenido de una hoja
   */
  async clearAndReplace(sheetName, values) {
    const range = `${sheetName}!A1:Z5000`;
    // 1. Limpiar hoja
    await sheetsFetch(`/values/${encodeURIComponent(range)}:clear`, { method: 'POST' });
    // 2. Escribir nuevos valores
    if (values && values.length > 0) {
      await this.updateValues(`${sheetName}!A1`, values);
    }
  }
};

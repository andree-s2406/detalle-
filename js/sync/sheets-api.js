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
 * Resolver el nombre exacto de la hoja (insensible a mayúsculas/minúsculas, espacios y palabras clave)
 */
function resolveSheetTitleFromList(requestedName, sheetList) {
  if (!requestedName) return requestedName;
  const cleanReq = requestedName.trim().toLowerCase();

  // 1. Coincidencia exacta
  let match = sheetList.find(s => s.trim().toLowerCase() === cleanReq);
  if (match) return match;

  // 2. Coincidencia por palabra clave común
  if (cleanReq === 'pagos') {
    match = sheetList.find(s => {
      const low = s.trim().toLowerCase();
      return low.includes('pago') || low.includes('cobro') || low.includes('abono');
    });
  } else if (cleanReq === 'descripcion') {
    match = sheetList.find(s => {
      const low = s.trim().toLowerCase();
      return low.includes('descrip') || low.includes('pedido') || low.includes('envio');
    });
  } else if (cleanReq === 'productos') {
    match = sheetList.find(s => {
      const low = s.trim().toLowerCase();
      return low.includes('prod') || low.includes('artic') || low.includes('catalogo') || low.includes('precio');
    });
  }

  return match || requestedName.trim();
}

/**
 * Crear la pestaña en Google Sheets si no existe
 */
async function ensureSheetExists(sheetTitle) {
  const sheetList = await getSpreadsheetSheets();
  const cleanReq = sheetTitle.trim().toLowerCase();
  const exists = sheetList.some(s => {
    const low = s.trim().toLowerCase();
    return low === cleanReq || (cleanReq === 'pagos' && (low.includes('pago') || low.includes('cobro')));
  });

  if (exists) return resolveSheetTitleFromList(sheetTitle, sheetList);

  try {
    await sheetsFetch(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [
          {
            addSheet: {
              properties: {
                title: sheetTitle
              }
            }
          }
        ]
      })
    });
    _sheetTitlesCache = null;
    const updatedList = await getSpreadsheetSheets(true);
    return resolveSheetTitleFromList(sheetTitle, updatedList);
  } catch (err) {
    console.warn(`[SheetsApi] Nota al crear pestaña "${sheetTitle}":`, err.message);
    return sheetTitle;
  }
}

/**
 * Formatear un rango seguro A1 con comillas simples para la API de Google Sheets
 */
async function formatSafeRange(rangeOrSheet, cellRange = '', autoCreate = false) {
  let sheetName = rangeOrSheet;
  let cells = cellRange;

  if (!cells && rangeOrSheet.includes('!')) {
    const parts = rangeOrSheet.split('!');
    sheetName = parts[0].replace(/^'|'$/g, '');
    cells = parts[1] || '';
  }

  let resolvedName = sheetName;
  if (autoCreate) {
    resolvedName = await ensureSheetExists(sheetName);
  } else {
    const sheetList = await getSpreadsheetSheets();
    resolvedName = resolveSheetTitleFromList(sheetName, sheetList);
  }

  const escapedName = String(resolvedName || sheetName).replace(/'/g, "''");
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
      hasRequiredSheets: ['Descripcion', 'productos', 'Pagos'].every(name => {
        const cleanName = name.trim().toLowerCase();
        return sheets.some(s => {
          const low = s.trim().toLowerCase();
          return low === cleanName || low.includes(cleanName);
        });
      })
    };
  },

  /**
   * Obtener filas de una hoja específica de forma tolerante a fallos
   */
  async getValues(range) {
    try {
      const safeRange = await formatSafeRange(range);
      const data = await sheetsFetch(`/values/${encodeURIComponent(safeRange)}`);
      return data.values || [];
    } catch (err) {
      if (err.message?.includes('Unable to parse range')) {
        console.warn(`[SheetsApi] Rango no encontrado "${range}", reintentando tras asegurar pestaña...`);
        try {
          const parts = range.split('!');
          const sheetName = parts[0].replace(/^'|'$/g, '');
          await ensureSheetExists(sheetName);
          const safeRange = await formatSafeRange(range);
          const data = await sheetsFetch(`/values/${encodeURIComponent(safeRange)}`);
          return data.values || [];
        } catch (retryErr) {
          console.warn(`[SheetsApi] Pestaña vacía o no disponible para "${range}":`, retryErr.message);
          return [];
        }
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
    const resolvedName = await ensureSheetExists(sheetName);
    const escapedName = String(resolvedName || sheetName).replace(/'/g, "''");

    // 1. Limpiar hoja con rango seguro
    try {
      const range = `'${escapedName}'!${startCell}:Z5000`;
      await sheetsFetch(`/values/${encodeURIComponent(range)}:clear`, { method: 'POST' });
    } catch (clearErr) {
      console.warn(`[SheetsApi] Reintentando clear para ${sheetName}:`, clearErr.message);
      try {
        const fallbackRange = `'${escapedName}'!${startCell}:I2000`;
        await sheetsFetch(`/values/${encodeURIComponent(fallbackRange)}:clear`, { method: 'POST' });
      } catch (fallbackErr) {
        console.warn(`[SheetsApi] Clear omitido:`, fallbackErr.message);
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
  },

  /**
   * Aplicar colores dinámicos a TOTAL ABONADO (Amarillo) y PENDIENTE (Rojo),
   * limpiando los colores de las filas anteriores a medida que se mueven hacia abajo.
   */
  async formatPaymentSummaryRows(sheetName, totalRowOffset, pendingRowOffset) {
    try {
      const data = await sheetsFetch('');
      const cleanName = sheetName.trim().toLowerCase();
      const sheetObj = data.sheets?.find(s => {
        const title = s.properties.title.trim().toLowerCase();
        return title === cleanName || title.includes(cleanName);
      });
      const sheetId = sheetObj?.properties?.sheetId;
      if (sheetId === null || sheetId === undefined) return;

      const requests = [
        // 1. Limpiar color de fondo en las columnas E..G desde la fila 3 hasta la fila 250
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 2,
              endRowIndex: 250,
              startColumnIndex: 4,
              endColumnIndex: 7
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1, alpha: 0 }
              }
            },
            fields: 'userEnteredFormat.backgroundColor'
          }
        },
        // 2. Pintar TOTAL ABONADO de AMARILLO (Cols E..G)
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 2 + totalRowOffset,
              endRowIndex: 3 + totalRowOffset,
              startColumnIndex: 4,
              endColumnIndex: 7
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 1.0, green: 0.92, blue: 0.23 },
                textFormat: { bold: true, foregroundColor: { red: 0.1, green: 0.1, blue: 0.1 } }
              }
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat'
          }
        },
        // 3. Pintar PENDIENTE de ROJO (Cols E..G)
        {
          repeatCell: {
            range: {
              sheetId: sheetId,
              startRowIndex: 2 + pendingRowOffset,
              endRowIndex: 3 + pendingRowOffset,
              startColumnIndex: 4,
              endColumnIndex: 7
            },
            cell: {
              userEnteredFormat: {
                backgroundColor: { red: 0.95, green: 0.26, blue: 0.21 },
                textFormat: { bold: true, foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 } }
              }
            },
            fields: 'userEnteredFormat.backgroundColor,userEnteredFormat.textFormat'
          }
        }
      ];

      await sheetsFetch(':batchUpdate', {
        method: 'POST',
        body: JSON.stringify({ requests })
      });
    } catch (err) {
      console.warn('[SheetsApi] No se pudo aplicar formato de colores en Pagos:', err.message);
    }
  }
};

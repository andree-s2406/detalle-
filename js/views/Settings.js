// ============================================================
//  SETTINGS VIEW — Configuración de porcentajes, copias y Drive con SVG
// ============================================================

import { getConfig, setConfig } from '../config.js';
import { Toast } from '../components/Toast.js';
import { exportDatabase, importDatabase } from '../db/database.js';
import { Modal } from '../components/Modal.js';
import { escapeHtml } from '../components/Formatter.js';
import { requestAuth, disconnectAuth, isConnected, initGoogleAuth } from '../sync/google-auth.js';
import { GoogleSheetsSync } from '../sync/google-sheets.js';
import { SheetsApi } from '../sync/sheets-api.js';
import { icon } from '../components/Icons.js';

export function renderSettings() {
  const view = document.getElementById('app-view');

  const pctSF       = (parseFloat(getConfig('pct_sin_factura', '0.70')) * 100).toFixed(0);
  const pctF        = (parseFloat(getConfig('pct_facturado', '0.30')) * 100).toFixed(0);
  const recargo     = (parseFloat(getConfig('recargo_factura', '0.245')) * 100).toFixed(1);
  const clientId    = getConfig('google_client_id', '');
  const spreadsheetId = getConfig('google_spreadsheet_id', '');
  const driveConnected = isConnected();

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Configuración</h1>
        <p class="page-subtitle">Porcentajes de cálculo, respaldo de datos y sincronización con Google Drive</p>
      </div>
    </div>

    <div class="grid grid-2" style="align-items:start;">
      
      <!-- Panel de cálculos -->
      <div class="card mb-md">
        <div class="card-header">
          <span class="card-title">${icon('settings')} Configuración de Cálculos (Lógica del Excel)</span>
        </div>
        <div class="config-item">
          <div class="config-label">Porcentaje Sin Factura (%)</div>
          <div class="config-value">
            <input type="number" class="form-control" id="cfg-pct-sf" value="${pctSF}" min="0" max="100" style="width: 100px; text-align: right;">
            <span>%</span>
          </div>
        </div>
        <div class="config-item">
          <div class="config-label">Porcentaje Facturado (%)</div>
          <div class="config-value">
            <input type="number" class="form-control" id="cfg-pct-f" value="${pctF}" min="0" max="100" style="width: 100px; text-align: right;">
            <span>%</span>
          </div>
        </div>
        <div class="config-item">
          <div class="config-label">Recargo Facturado (IVA / etc) (%)</div>
          <div class="config-value">
            <input type="number" class="form-control" id="cfg-recargo" value="${recargo}" step="0.1" min="0" max="200" style="width: 100px; text-align: right;">
            <span>%</span>
          </div>
        </div>
        <div class="mt-md flex justify-end">
          <button class="btn btn-primary" id="btn-save-config">
            ${icon('save')} Guardar Porcentajes
          </button>
        </div>
      </div>

      <!-- Sincronización con Google Drive / Sheets -->
      <div class="card mb-md">
        <div class="card-header">
          <span class="card-title">${icon('cloud')} Conexión con Google Drive / Sheets</span>
          <span class="chip ${driveConnected ? 'chip-success' : 'chip-muted'}" id="drive-status-badge">
            ${driveConnected ? '● Conectado' : '○ Desconectado'}
          </span>
        </div>
        <p class="text-muted text-sm mb-md">
          Sincronizá tus productos, pedidos y pagos automáticamente con tu planilla de Google Sheets.
          Se aplica estrategia <strong>Local-Primero con Rollback ante fallos</strong>.
        </p>

        <div class="form-group">
          <label class="form-label">Google OAuth Client ID</label>
          <input type="text" class="form-control" id="cfg-google-client-id" value="${escapeHtml(clientId)}"
                 placeholder="Ej: 123456789-abc.apps.googleusercontent.com">
          <div class="text-muted text-sm mt-sm">ID de cliente creado en Google Cloud Console.</div>
        </div>

        <div class="form-group">
          <label class="form-label">ID de la Planilla Google Sheets (Spreadsheet ID)</label>
          <input type="text" class="form-control" id="cfg-google-sheet-id" value="${escapeHtml(spreadsheetId)}"
                 placeholder="Ej: 1BxiMVs0XRnt3kg_IpHB54n56789...">
          <div class="text-muted text-sm mt-sm">El ID que figura en la URL de tu planilla de Google Drive.</div>
        </div>

        <div class="flex gap-md mt-md" style="flex-wrap:wrap;">
          ${driveConnected ? `
            <button class="btn btn-danger" id="btn-drive-disconnect">
              ${icon('unlink')} Desconectar Google Drive
            </button>
            <button class="btn btn-primary" id="btn-drive-sync-now">
              ${icon('refresh')} Exportar Todo a Google Sheets
            </button>
            <button class="btn btn-secondary" id="btn-drive-import-now">
              ${icon('download')} Extraer Datos desde Google Sheets
            </button>
          ` : `
            <button class="btn btn-primary" id="btn-drive-connect">
              ${icon('link')} Conectar con Google Drive
            </button>
          `}
          <button class="btn btn-ghost" id="btn-save-drive-config">
            ${icon('save')} Guardar IDs
          </button>
        </div>
      </div>

      <!-- Copia de seguridad y base de datos -->
      <div class="card" style="grid-column: 1 / -1;">
        <div class="card-header">
          <span class="card-title">${icon('database')} Base de Datos Local (SQLite)</span>
        </div>
        <p class="text-muted text-sm mb-md">
          Tus datos se guardan automáticamente de forma local en tu navegador (IndexedDB). Podés descargar una copia de seguridad para resguardar tu información o para moverla a otra computadora.
        </p>
        <div class="flex gap-md" style="flex-wrap: wrap;">
          <button class="btn btn-secondary" id="btn-db-export">
            ${icon('download')} Exportar Base de Datos (.db)
          </button>
          <label class="btn btn-ghost" style="position:relative; cursor:pointer;">
            ${icon('upload')} Importar Base de Datos (.db)
            <input type="file" id="btn-db-import-file" accept=".db" style="position:absolute; width:1px; height:1px; opacity:0; overflow:hidden;">
          </label>
        </div>
      </div>

    </div>
  `;

  // Event Listeners
  document.getElementById('btn-save-config').addEventListener('click', _saveConfig);
  document.getElementById('btn-db-export').addEventListener('click', exportDatabase);
  document.getElementById('btn-db-import-file').addEventListener('change', _handleImport);

  document.getElementById('btn-save-drive-config').addEventListener('click', () => {
    const cId = document.getElementById('cfg-google-client-id').value.trim();
    const sId = document.getElementById('cfg-google-sheet-id').value.trim();
    setConfig('google_client_id', cId);
    setConfig('google_spreadsheet_id', sId);
    Toast.success('IDs guardados', 'Configuración de Google Drive actualizada');
  });

  const connectBtn = document.getElementById('btn-drive-connect');
  if (connectBtn) {
    connectBtn.addEventListener('click', async () => {
      const cId = document.getElementById('cfg-google-client-id').value.trim();
      const sId = document.getElementById('cfg-google-sheet-id').value.trim();

      if (!cId || !sId) {
        Toast.error('Datos incompletos', 'Ingresá el Client ID y el ID de la planilla antes de conectar.');
        return;
      }
      setConfig('google_client_id', cId);
      setConfig('google_spreadsheet_id', sId);

      await requestAuth();
    });
  }

  const disconnectBtn = document.getElementById('btn-drive-disconnect');
  if (disconnectBtn) {
    disconnectBtn.addEventListener('click', () => {
      disconnectAuth();
      renderSettings();
    });
  }

  const syncNowBtn = document.getElementById('btn-drive-sync-now');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
      try {
        Toast.info('Sincronizando...', 'Enviando catálogo, pedidos y pagos a Google Sheets');
        await GoogleSheetsSync.syncAll();
        Toast.success('Sincronización completada', 'Planilla actualizada correctamente en Google Drive');
      } catch (e) {
        Toast.error('Error de sincronización', e.message);
      }
    });
  }

  const importNowBtn = document.getElementById('btn-drive-import-now');
  if (importNowBtn) {
    importNowBtn.addEventListener('click', async () => {
      const confirmed = await Modal.confirm({
        title: 'Extraer datos de Google Sheets',
        message: `¿Querés leer tu planilla de Google Drive e importar tus productos, pedidos y pagos a la aplicación local?<br><br>
                  Los productos y pedidos leídos se añadirán a tu sistema local.`,
        iconName: 'download',
        confirmText: 'Extraer e Importar',
        confirmClass: 'btn-primary'
      });

      if (!confirmed) return;

      try {
        Toast.info('Extrayendo datos...', 'Leyendo hojas Descripcion, productos y Pagos desde Google Drive');
        const res = await GoogleSheetsSync.importAllFromSheets();
        Toast.success('Importación completada', `Se importaron ${res.productsCount} producto(s), ${res.ordersCount} pedido(s) y ${res.paymentsCount} pago(s).`);
      } catch (e) {
        Toast.error('Error al importar', e.message);
      }
    });
  }

  window._onGoogleAuthChange = () => renderSettings();
}

function _saveConfig() {
  const sfVal  = parseFloat(document.getElementById('cfg-pct-sf').value);
  const fVal   = parseFloat(document.getElementById('cfg-pct-f').value);
  const recVal = parseFloat(document.getElementById('cfg-recargo').value);

  if (isNaN(sfVal) || sfVal < 0 || sfVal > 100) {
    Toast.error('Porcentaje Sin Factura inválido');
    return;
  }
  if (isNaN(fVal) || fVal < 0 || fVal > 100) {
    Toast.error('Porcentaje Facturado inválido');
    return;
  }
  if (isNaN(recVal) || recVal < 0) {
    Toast.error('Recargo Facturado inválido');
    return;
  }

  setConfig('pct_sin_factura', (sfVal / 100).toString());
  setConfig('pct_facturado', (fVal / 100).toString());
  setConfig('recargo_factura', (recVal / 100).toString());

  Toast.success('Configuración guardada', 'Los porcentajes de cálculo fueron actualizados');
}

async function _handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const confirmed = await Modal.confirm({
    title: 'Importar Base de Datos',
    message: `¿Estás seguro de que querés restaurar la base de datos desde el archivo <strong>${file.name}</strong>?<br><br>
              <strong>¡ADVERTENCIA!</strong> Esto reemplazará COMPLETAMENTE todos tus productos, pedidos y pagos actuales.`,
    iconName: 'alertTriangle',
    confirmText: 'Importar y Reemplazar',
    confirmClass: 'btn-danger'
  });

  if (!confirmed) {
    e.target.value = '';
    return;
  }

  try {
    const success = await importDatabase(file);
    if (success) {
      Toast.success('Base de datos importada', 'Los datos se cargaron con éxito. La página se recargará para aplicar los cambios.');
      setTimeout(() => location.reload(), 1500);
    }
  } catch(err) {
    console.error(err);
    Toast.error('Error al importar', 'El archivo no es una base de datos SQLite válida o está dañado');
    e.target.value = '';
  }
}

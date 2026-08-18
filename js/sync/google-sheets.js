// ============================================================
//  GOOGLE SHEETS SYNC ENGINE — Formato 1:1 Espejado con el Excel Original
// ============================================================

import { getDb, persistDatabase, run, transaction, queryOne, queryAll } from '../db/database.js';
import { uuid, nowISO, todayISO } from '../components/Formatter.js';
import { isConnected } from './google-auth.js';
import { SheetsApi } from './sheets-api.js';
import { getAllProducts, getAllColors } from '../models/Product.js';
import { getAllOrders } from '../models/Order.js';
import { getAllPayments } from '../models/Payment.js';

let _lastSyncTimestamp = null;
let _lastSyncStatus = 'idle';

function createLocalSnapshot() {
  const db = getDb();
  if (!db) return null;
  return db.export();
}

export const GoogleSheetsSync = {
  /**
   * Transacción Local Primero + Sync en Drive + Rollback ante error
   */
  async executeWithDriveSync({ localAction, driveSyncAction }) {
    const snapshot = createLocalSnapshot();
    let localResult = null;

    try {
      localResult = await localAction();
    } catch (localError) {
      console.error('[SyncEngine] Error local:', localError);
      throw localError;
    }

    if (isConnected()) {
      try {
        await driveSyncAction(localResult);
        _lastSyncTimestamp = new Date().toISOString();
        _lastSyncStatus = 'success';
      } catch (driveError) {
        console.error('[SyncEngine] Fallo en Drive. Ejecutando Rollback...', driveError);
        _lastSyncStatus = 'error';
        await persistDatabase();

        throw new Error(
          `Sincronización fallida con Google Drive.\n` +
          `No se pudo actualizar la planilla: ${driveError.message}`
        );
      }
    }

    return localResult;
  },

  /**
   * 1. HOJA "productos" — Catálogo de Productos y Precios con Colores:
   * Col A: Descripcion | Col B: precio | Col C: (vacío) | Col D: Color
   */
  async syncCatalogSheet() {
    const products = getAllProducts(true);
    const colors = getAllColors(true);

    const rows = [
      ['Descripcion', 'precio', '', 'Color']
    ];

    const maxRows = Math.max(products.length, colors.length);
    for (let i = 0; i < maxRows; i++) {
      const p = products[i];
      const c = colors[i];
      rows.push([
        p ? p.nombre : '',
        p ? p.precio : '',
        '',
        c ? c.nombre : ''
      ]);
    }

    await SheetsApi.clearAndReplace('productos', rows);
  },

  /**
   * 2. HOJA "Descripcion" — Envíos / Pedidos con membretes y bloques apilados
   */
  async syncOrdersSheet() {
    const orders = getAllOrders({ orderBy: 'o.numero ASC' });
    const rows = [
      ['', 'Pulguitas SRL', '', '', 'Comfypetys', ''],
      ['', 'Cuit: 30-71903709-3', '', '', 'Cuit 30-71792185-9', ''],
      ['', 'Salta 158 monserrat, capital federal', '', '', '', '']
    ];

    const FIXED_SLOTS = 11;

    orders.forEach(o => {
      // Cabecera del pedido (Cyan)
      rows.push(['Fecha', 'Descripcion', 'color', 'Cantidad', 'Valor unitario', 'Valor total']);

      // Cargar los productos reales de este pedido
      const items = queryAll(`
        SELECT * FROM order_items
        WHERE order_id = ?
        ORDER BY sort_order, rowid
      `, [o.id]);

      // Construir lista de líneas a mostrar (productos + saldo anterior)
      const displayRows = items.map(it => ({
        descripcion: it.producto_nombre_historico || '',
        color:       it.color || '',
        cantidad:    it.cantidad || 0,
        precio:      it.precio_unitario_historico || 0,
        subtotal:    it.subtotal || 0,
        isProduct:   true
      }));

      // Agregar líneas de Saldo Anterior si existen
      const sEf = parseFloat(o.saldo_anterior_efectivo || (o.saldo_anterior_tipo === 'efectivo' ? o.saldo_anterior_monto : 0)) || 0;
      const sBl = parseFloat(o.saldo_anterior_blanco   || (o.saldo_anterior_tipo === 'blanco'   ? o.saldo_anterior_monto : 0)) || 0;

      if (sEf > 0) {
        displayRows.push({
          descripcion: 'Saldo Anterior (Efectivo / Sin Factura)',
          color:       '',
          cantidad:    '',
          precio:      sEf,
          subtotal:    sEf,
          isProduct:   false
        });
      }

      if (sBl > 0) {
        displayRows.push({
          descripcion: 'Saldo Anterior (En Blanco / Facturado)',
          color:       '',
          cantidad:    '',
          precio:      sBl,
          subtotal:    sBl,
          isProduct:   false
        });
      }

      let totalCantidad = 0;

      for (let i = 0; i < FIXED_SLOTS; i++) {
        const item = displayRows[i];
        if (item) {
          if (item.isProduct && typeof item.cantidad === 'number') {
            totalCantidad += item.cantidad;
          }
          rows.push([
            i === 0 ? (o.fecha || '') : '',
            item.descripcion || '',
            item.color || '',
            item.cantidad !== '' ? item.cantidad : '',
            item.precio || 0,
            item.subtotal || 0
          ]);
        } else {
          rows.push(['', '', '', '', '', '']);
        }
      }

      // Resumen del pedido (Gris)
      const sinFactura = o.importe_sin_factura ?? (o.total * 0.70);
      const facturado  = o.importe_facturado   ?? (o.total * 0.30 * 1.245);

      rows.push(['TOTAL', '', '', totalCantidad, '', o.total || 0]);
      rows.push(['Sin factura', '', '', '', '', sinFactura]);
      rows.push(['Facturado', '', '', '', '', facturado]);
    });

    await SheetsApi.clearAndReplace('Descripcion', rows);
  },

  /**
   * 3. HOJA "Pagos" — Formato Exacto con 2 tablas paralelas:
   * Col A: Fecha | Col B: Saldo sin Factura | Col C: Saldo Facturado | Col D: (vacío)
   * Col E: Fecha | Col F: Abono Efectivo | Col G: Abono en BLANCO | Col H: echeq | Col I: fecha cobro Echeq
   */
  async syncPaymentsSheet() {
    const orders = getAllOrders({ orderBy: 'o.numero ASC' });
    const payments = getAllPayments();

    const rows = [
      ['Fecha', 'Saldo sin Factura', 'Saldo Facturado', '', 'Fecha', 'Abono Efectivo', 'Abono en BLANCO', 'echeq', 'fecha cobro Echeq']
    ];

    const maxRows = Math.max(orders.length, payments.length);
    for (let i = 0; i < maxRows; i++) {
      const o = orders[i];
      const p = payments[i];

      let colA = '', colB = '', colC = '';
      if (o) {
        colA = o.fecha;
        colB = o.importe_sin_factura;
        colC = o.importe_facturado;
      }

      let colE = '', colF = '', colG = '', colH = '', colI = '';
      if (p) {
        colE = p.fecha;
        colF = p.tipo_pago === 'efectivo' ? p.importe : '';
        colG = p.tipo_pago === 'blanco'   ? p.importe : '';
        colH = p.tipo_pago === 'echeq'    ? p.importe : '';
        colI = p.tipo_pago === 'echeq'    ? (p.fecha_cobro || '') : '';
      }

      rows.push([colA, colB, colC, '', colE, colF, colG, colH, colI]);
    }

    await SheetsApi.clearAndReplace('Pagos', rows);
  },

  /**
   * Exportar todo a Google Sheets
   */
  async syncAll() {
    if (!isConnected()) {
      throw new Error('Google Drive no está conectado. Autorizá el acceso desde Configuración.');
    }

    _lastSyncStatus = 'syncing';
    try {
      await this.syncCatalogSheet();
      await this.syncOrdersSheet();
      await this.syncPaymentsSheet();
      _lastSyncTimestamp = new Date().toISOString();
      _lastSyncStatus = 'success';
      return { success: true, timestamp: _lastSyncTimestamp };
    } catch (e) {
      _lastSyncStatus = 'error';
      throw e;
    }
  },

  /**
   * Importar todo desde Google Sheets siguiendo la estructura exacta de las 3 hojas
   */
  async importAllFromSheets() {
    if (!isConnected()) {
      throw new Error('Google Drive no está conectado. Autorizá el acceso desde Configuración.');
    }

    let importedProducts = 0;
    let importedColors = 0;
    let importedOrders = 0;
    let importedPayments = 0;

    // 1. Importar HOJA "productos" (Catálogo: Productos en A-B, Colores en D)
    try {
      const prodCatalogRows = await SheetsApi.getValues('productos!A1:D1000');
      if (prodCatalogRows && prodCatalogRows.length > 1) {
        for (let i = 1; i < prodCatalogRows.length; i++) {
          const row = prodCatalogRows[i];
          if (!row) continue;

          // Productos (Col A: Descripcion, Col B: precio)
          const prodNombre = String(row[0] || '').trim();
          const prodPrecio = parseFloat(String(row[1] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;

          if (prodNombre && prodNombre.toLowerCase() !== 'descripcion') {
            const existingP = queryOne(`SELECT id FROM products WHERE LOWER(nombre) = LOWER(?)`, [prodNombre]);
            if (!existingP) {
              const now = nowISO();
              run(`INSERT INTO products (id, nombre, precio, activo, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
                [uuid(), prodNombre, prodPrecio, now, now]);
              importedProducts++;
            }
          }

          // Colores (Col D: Color)
          const colorNombre = String(row[3] || '').trim();
          if (colorNombre && colorNombre.toLowerCase() !== 'color') {
            const existingC = queryOne(`SELECT id FROM colors WHERE LOWER(nombre) = LOWER(?)`, [colorNombre]);
            if (!existingC) {
              const now = nowISO();
              run(`INSERT INTO colors (id, nombre, activo, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
                [uuid(), colorNombre, now, now]);
              importedColors++;
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Import] Advertencia en hoja productos (catálogo):', e.message);
    }

    // 2. Importar HOJA "Descripcion" (Envíos / Pedidos apilados)
    try {
      const descOrderRows = await SheetsApi.getValues('Descripcion!A1:F5000');
      if (descOrderRows && descOrderRows.length > 0) {
        let currentOrderItems = [];
        let currentFecha = todayISO();

        for (let i = 0; i < descOrderRows.length; i++) {
          const row = descOrderRows[i];
          if (!row || row.length === 0) continue;

          const colA = String(row[0] || '').trim();
          const colB = String(row[1] || '').trim();

          // Saltear encabezado de membrete o de pedido
          if (colA.toLowerCase() === 'fecha' || colB.toLowerCase() === 'descripcion' || colB.includes('Pulguitas') || colB.includes('Cuit')) {
            if (currentOrderItems.length > 0) {
              _saveImportedOrder(currentFecha, currentOrderItems);
              importedOrders++;
              currentOrderItems = [];
            }
            continue;
          }

          if (colA === 'TOTAL' || colA === 'Sin factura' || colA === 'Facturado') {
            if (colA === 'TOTAL' && currentOrderItems.length > 0) {
              _saveImportedOrder(currentFecha, currentOrderItems);
              importedOrders++;
              currentOrderItems = [];
            }
            continue;
          }

          if (colB && colB.toLowerCase() !== 'descripcion') {
            if (colA && colA.length >= 8) {
              currentFecha = colA;
            }
            const cantidad = parseFloat(String(row[3] || '1').replace(',', '.')) || 1;
            const precio   = parseFloat(String(row[4] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
            const color    = String(row[2] || '').trim();

            currentOrderItems.push({
              producto_nombre_historico: colB,
              color,
              cantidad,
              precio_unitario_historico: precio,
              subtotal: cantidad * precio
            });
          }
        }

        if (currentOrderItems.length > 0) {
          _saveImportedOrder(currentFecha, currentOrderItems);
          importedOrders++;
        }
      }
    } catch (e) {
      console.warn('[Import] Advertencia en hoja Descripcion (pedidos):', e.message);
    }

    // 3. Importar HOJA "Pagos" (Pagos en cols E a I)
    try {
      const pmtRows = await SheetsApi.getValues('Pagos!E1:I1000');
      if (pmtRows && pmtRows.length > 1) {
        for (let i = 1; i < pmtRows.length; i++) {
          const row = pmtRows[i];
          if (!row || row.length === 0) continue;

          const fecha = String(row[0] || '').trim();
          if (!fecha || fecha.toLowerCase() === 'fecha') continue;

          const efectivo = parseFloat(String(row[1] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
          const blanco   = parseFloat(String(row[2] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
          const echeq    = parseFloat(String(row[3] || '0').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0;
          const fechaCobro = String(row[4] || '').trim();

          // Registrar pagos según tipo
          const pmtList = [
            { tipo: 'efectivo', importe: efectivo, cobro: '' },
            { tipo: 'blanco',   importe: blanco,   cobro: '' },
            { tipo: 'echeq',    importe: echeq,    cobro: fechaCobro },
          ];

          for (const item of pmtList) {
            if (item.importe > 0) {
              // Asignar al primer pedido con saldo pendiente
              const openOrder = queryOne(`
                SELECT o.id, o.numero FROM orders o
                WHERE (SELECT COALESCE(SUM(importe), 0) FROM payments WHERE order_id = o.id) < o.total
                ORDER BY o.numero ASC LIMIT 1
              `);

              if (openOrder) {
                run(`INSERT INTO payments (id, order_id, fecha, tipo_pago, importe, fecha_cobro, observaciones, created_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  [uuid(), openOrder.id, fecha, item.tipo, item.importe, item.cobro, 'Importado de Google Sheets', nowISO()]);
                importedPayments++;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn('[Import] Advertencia en hoja Pagos:', e.message);
    }

    await persistDatabase();
    return {
      productsCount: importedProducts,
      colorsCount: importedColors,
      ordersCount: importedOrders,
      paymentsCount: importedPayments
    };
  },

  getLastSync() {
    return {
      timestamp: _lastSyncTimestamp,
      status: _lastSyncStatus
    };
  }
};

function _saveImportedOrder(fecha, items) {
  const row = queryOne(`SELECT MAX(numero) as maxNum FROM orders`);
  const numero = (row?.maxNum ?? 0) + 1;
  const id = uuid();
  const now = nowISO();

  let total = 0;
  items.forEach(item => total += (item.subtotal || 0));

  const sinFactura = total * 0.70;
  const facturado  = total * 0.30 * 1.245;

  transaction(() => {
    run(`
      INSERT INTO orders (id, numero, fecha, estado, total, importe_sin_factura, importe_facturado, notas, created_at, updated_at)
      VALUES (?, ?, ?, 'confirmado', ?, ?, ?, 'Importado desde Google Sheets', ?, ?)
    `, [id, numero, fecha, total, sinFactura, facturado, now, now]);

    items.forEach((item, idx) => {
      const pRow = queryOne(`SELECT id FROM products WHERE LOWER(nombre) = LOWER(?)`, [item.producto_nombre_historico]);
      run(`
        INSERT INTO order_items (id, order_id, product_id, producto_nombre_historico, color, cantidad, precio_unitario_historico, subtotal, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [uuid(), id, pRow?.id || null, item.producto_nombre_historico, item.color, item.cantidad, item.precio_unitario_historico, item.subtotal, idx]);
    });
  });
}

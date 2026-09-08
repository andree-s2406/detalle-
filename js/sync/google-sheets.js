// ============================================================
//  GOOGLE SHEETS SYNC ENGINE — Formato 1:1 Espejado con el Excel Original
// ============================================================

import { getDb, persistDatabase, run, transaction, queryOne, queryAll } from '../db/database.js';
import { uuid, nowISO, todayISO, parseCurrency } from '../components/Formatter.js';
import { isConnected } from './google-auth.js';
import { SheetsApi } from './sheets-api.js';
import { calcularImportes } from '../config.js';
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
    // Antes de cambiar la copia local, se traen automaticamente los cambios
    // hechos en Google Sheets desde cualquier otra computadora.
    if (isConnected()) {
      await this.importAllFromSheets();
    }

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

    // Cada pedido conserva 11 renglones libres como minimo. Si sus productos
    // y saldos ocupan todos esos renglones, se agregan los necesarios antes
    // del resumen para que ningun item quede fuera de la planilla.
    const MIN_ORDER_SLOTS = 11;

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

      const slotCount = Math.max(MIN_ORDER_SLOTS, displayRows.length);
      for (let i = 0; i < slotCount; i++) {
        const item = displayRows[i];
        const rowLabel = i === 0 ? (o.fecha || '') : (i === 1 ? `Pedido #${String(o.numero).padStart(4, '0')}` : '');
        if (item) {
          if (item.isProduct && typeof item.cantidad === 'number') {
            totalCantidad += item.cantidad;
          }
          rows.push([
            rowLabel,
            item.descripcion || '',
            item.color || '',
            item.cantidad !== '' ? item.cantidad : '',
            item.precio || 0,
            item.subtotal || 0
          ]);
        } else {
          rows.push([rowLabel, '', '', '', '', '']);
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
    const MIN_BALANCE_SLOTS = 21;

    // Los encabezados ya estan fijos en la fila 2 de la planilla.
    const rows = [];

    // La tabla de saldos siempre muestra 21 casillas como minimo. El total se
    // coloca inmediatamente despues y baja una fila por cada pedido adicional.
    const balanceSlots = Math.max(MIN_BALANCE_SLOTS, orders.length);
    const orderBalances = orders.map(order => ({
      sinFactura: Number(order.importe_sin_factura ?? (order.total * 0.70)) || 0,
      facturado: Number(order.importe_facturado ?? (order.total * 0.30 * 1.245)) || 0
    }));
    const totalSinFactura = orderBalances.reduce((total, balance) => total + balance.sinFactura, 0);
    const totalFacturado = orderBalances.reduce((total, balance) => total + balance.facturado, 0);
    const totalAbonoEfectivo = payments.reduce((total, payment) =>
      total + (payment.tipo_pago === 'efectivo' ? (Number(payment.importe) || 0) : 0), 0);
    const totalAbonoBlanco = payments.reduce((total, payment) =>
      total + (payment.tipo_pago === 'blanco' ? (Number(payment.importe) || 0) : 0), 0);
    const pendienteEfectivo = Math.max(0, totalSinFactura - totalAbonoEfectivo);
    const pendienteBlanco = Math.max(0, totalFacturado - totalAbonoBlanco);

    // El resumen de abonos se ubica debajo de ambos listados para no tapar
    // un pago cuando haya mas de 21 registros.
    const paymentTotalRow = Math.max(balanceSlots, payments.length);
    const paymentPendingRow = paymentTotalRow + 1;
    const bodyRows = paymentPendingRow + 1;

    for (let i = 0; i < bodyRows; i++) {
      const o = orders[i];
      const p = payments[i];

      let colA = '', colB = '', colC = '';
      if (i < balanceSlots && o) {
        colA = o.fecha;
        colB = orderBalances[i].sinFactura;
        colC = orderBalances[i].facturado;
      }

      if (i === balanceSlots) {
        colA = 'TOTAL SALDOS';
        colB = totalSinFactura;
        colC = totalFacturado;
      }

      let colE = '', colF = '', colG = '', colH = '', colI = '';
      if (p) {
        colE = p.fecha;
        colF = p.tipo_pago === 'efectivo' ? p.importe : '';
        colG = p.tipo_pago === 'blanco'   ? p.importe : '';
        colH = p.tipo_pago === 'echeq'    ? p.importe : '';
        colI = p.tipo_pago === 'echeq'    ? (p.fecha_cobro || '') : '';
      }

      if (i === paymentTotalRow) {
        colE = 'TOTAL ABONADO';
        colF = totalAbonoEfectivo;
        colG = totalAbonoBlanco;
      }

      if (i === paymentPendingRow) {
        colE = 'PENDIENTE';
        colF = pendienteEfectivo;
        colG = pendienteBlanco;
      }

      rows.push([colA, colB, colC, '', colE, colF, colG, colH, colI]);
    }

    // Las filas 1 y 2 contienen los titulos y encabezados fijos de la planilla.
    await SheetsApi.clearAndReplace('Pagos', rows, 'A3');
  },

  /**
   * Exportar todo a Google Sheets
   */
  async syncAll() {
    if (!isConnected()) {
      throw new Error('Google Drive no está conectado. Autorizá el acceso desde Configuración.');
    }

    await this.importAllFromSheets();
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
          const prodPrecio = parseCurrency(row[1]);

          if (prodNombre && prodNombre.toLowerCase() !== 'descripcion') {
            const existingP = queryOne(`SELECT id FROM products WHERE LOWER(nombre) = LOWER(?)`, [prodNombre]);
            if (!existingP) {
              const now = nowISO();
              run(`INSERT INTO products (id, nombre, precio, activo, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
                [uuid(), prodNombre, prodPrecio, now, now]);
              importedProducts++;
            } else {
              run(`UPDATE products SET precio = ?, updated_at = ? WHERE id = ?`, [prodPrecio, nowISO(), existingP.id]);
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
        let currentSaldoEfectivo = 0;
        let currentSaldoBlanco = 0;
        let currentSheetOrderNumber = null;

        const flushCurrentOrder = () => {
          if (_saveImportedOrder(currentFecha, currentOrderItems, currentSaldoEfectivo, currentSaldoBlanco, currentSheetOrderNumber)) {
            importedOrders++;
          }
          currentOrderItems = [];
          currentSaldoEfectivo = 0;
          currentSaldoBlanco = 0;
          currentSheetOrderNumber = null;
        };

        for (let i = 0; i < descOrderRows.length; i++) {
          const row = descOrderRows[i];
          if (!row || row.length === 0) continue;

          const colA = String(row[0] || '').trim();
          const colB = String(row[1] || '').trim();
          const orderNumberMatch = colA.match(/^pedido\s*#?\s*(\d+)$/i);
          if (orderNumberMatch) currentSheetOrderNumber = Number(orderNumberMatch[1]);

          // Saltear encabezado de membrete o de pedido
          if (colA.toLowerCase() === 'fecha' || colB.toLowerCase() === 'descripcion' || colB.includes('Pulguitas') || colB.includes('Cuit')) {
            flushCurrentOrder();
            continue;
          }

          if (colA === 'TOTAL' || colA === 'Sin factura' || colA === 'Facturado') {
            if (colA === 'TOTAL') flushCurrentOrder();
            continue;
          }

          const normalizedDescription = colB.toLowerCase();
          const isPlaceholder = !colB || normalizedDescription === '0' || normalizedDescription === '-' || normalizedDescription === '—';
          if (!isPlaceholder && normalizedDescription !== 'descripcion') {
            if (_isSheetDate(colA)) {
              currentFecha = _normalizeSheetDate(colA);
            }

            // Estas lineas ya son un saldo completo: no son productos y no
            // deben pasar por el calculo del 70%, 30% ni recargo de factura.
            if (normalizedDescription === 'saldo anterior (efectivo / sin factura)') {
              currentSaldoEfectivo += parseCurrency(row[5]) || parseCurrency(row[4]);
              continue;
            }
            if (normalizedDescription === 'saldo anterior (en blanco / facturado)') {
              currentSaldoBlanco += parseCurrency(row[5]) || parseCurrency(row[4]);
              continue;
            }

            const quantityCell = String(row[3] ?? '').trim();
            const cantidad = quantityCell === '' ? 1 : parseCurrency(quantityCell);
            const precio   = parseCurrency(row[4]);
            const color    = String(row[2] || '').trim();

            // Ignorar filas de relleno o incompletas: no son pedidos validos.
            if (cantidad <= 0 || precio <= 0) continue;

            currentOrderItems.push({
              producto_nombre_historico: colB,
              color,
              cantidad,
              precio_unitario_historico: precio,
              subtotal: cantidad * precio
            });
          }
        }

        flushCurrentOrder();
      }
    } catch (e) {
      console.warn('[Import] Advertencia en hoja Descripcion (pedidos):', e.message);
    }

    // 3. Importar HOJA "Pagos" (Detección dinámica y robusta de abonos)
    try {
      const pmtRows = await SheetsApi.getValues('Pagos!A1:Z1000');
      importedPayments += _extractPaymentsFromRows(pmtRows);

      // Si no se encontraron pagos en la hoja "Pagos", buscar en "Descripcion"
      if (importedPayments === 0) {
        const descRows = await SheetsApi.getValues('Descripcion!A1:Z5000');
        importedPayments += _extractPaymentsFromRows(descRows);
      }
    } catch (e) {
      console.warn('[Import] Advertencia en lectura de pagos:', e.message);
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

function _saveImportedOrder(fecha, items, saldoAnteriorEfectivo = 0, saldoAnteriorBlanco = 0, sheetOrderNumber = null) {
  const validItems = items.filter(item =>
    String(item.producto_nombre_historico || '').trim() &&
    Number(item.cantidad) > 0 && Number(item.precio_unitario_historico) > 0
  );
  const subtotalItems = validItems.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  const sEfectivo = Number(saldoAnteriorEfectivo) || 0;
  const sBlanco = Number(saldoAnteriorBlanco) || 0;
  const total = subtotalItems + sEfectivo + sBlanco;

  // Evitar pedidos vacios y reimportaciones del mismo pedido.
  if ((validItems.length === 0 && sEfectivo <= 0 && sBlanco <= 0) || total <= 0) return false;
  const matchingOrder = _findIdenticalOrder(fecha, validItems, sEfectivo, sBlanco, sheetOrderNumber);
  if (matchingOrder) {
    _applySheetOrderNumber(matchingOrder.id, matchingOrder.numero, sheetOrderNumber);
    return false;
  }

  const numberedOrder = _findOrderByNumber(sheetOrderNumber);
  if (numberedOrder) {
    _replaceOrderFromSheet(numberedOrder.id, fecha, validItems, sEfectivo, sBlanco);
    return false;
  }

  const row = queryOne(`SELECT MAX(numero) as maxNum FROM orders`);
  const numero = _isValidOrderNumber(sheetOrderNumber) ? sheetOrderNumber : (row?.maxNum ?? 0) + 1;
  const id = uuid();
  const now = nowISO();

  const { sinFactura: baseSinFactura, facturado: baseFacturado } = calcularImportes(subtotalItems);
  const sinFactura = baseSinFactura + sEfectivo;
  const facturado  = baseFacturado + sBlanco;
  const saldoAnteriorMonto = sEfectivo + sBlanco;
  const saldoAnteriorTipo = sEfectivo > 0 && sBlanco > 0 ? 'mixto' : (sEfectivo > 0 ? 'efectivo' : (sBlanco > 0 ? 'blanco' : ''));

  transaction(() => {
    run(`
      INSERT INTO orders (
        id, numero, fecha, estado, total, importe_sin_factura, importe_facturado,
        saldo_anterior_monto, saldo_anterior_tipo, saldo_anterior_efectivo, saldo_anterior_blanco,
        notas, created_at, updated_at
      ) VALUES (?, ?, ?, 'confirmado', ?, ?, ?, ?, ?, ?, ?, 'Importado desde Google Sheets', ?, ?)
    `, [
      id, numero, fecha, total, sinFactura, facturado,
      saldoAnteriorMonto, saldoAnteriorTipo, sEfectivo, sBlanco,
      now, now
    ]);

    validItems.forEach((item, idx) => {
      const pRow = queryOne(`SELECT id FROM products WHERE LOWER(nombre) = LOWER(?)`, [item.producto_nombre_historico]);
      run(`
        INSERT INTO order_items (id, order_id, product_id, producto_nombre_historico, color, cantidad, precio_unitario_historico, subtotal, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [uuid(), id, pRow?.id || null, item.producto_nombre_historico, item.color, item.cantidad, item.precio_unitario_historico, item.subtotal, idx]);
    });
  });

  return true;
}

function _findIdenticalOrder(fecha, items, saldoAnteriorEfectivo, saldoAnteriorBlanco, sheetOrderNumber) {
  const candidates = queryAll(`
    SELECT id, numero, saldo_anterior_efectivo, saldo_anterior_blanco,
           saldo_anterior_monto, saldo_anterior_tipo
    FROM orders
    WHERE fecha = ?
  `, [fecha]);

  const matches = candidates.filter(candidate => {
    const legacyAmount = Number(candidate.saldo_anterior_monto) || 0;
    const candidateEfectivo = Number(candidate.saldo_anterior_efectivo) ||
      (candidate.saldo_anterior_tipo === 'efectivo' ? legacyAmount : 0);
    const candidateBlanco = Number(candidate.saldo_anterior_blanco) ||
      (candidate.saldo_anterior_tipo === 'blanco' ? legacyAmount : 0);

    if (Math.abs(candidateEfectivo - saldoAnteriorEfectivo) >= 0.005 ||
        Math.abs(candidateBlanco - saldoAnteriorBlanco) >= 0.005) {
      return false;
    }

    const existingItems = queryAll(`
      SELECT producto_nombre_historico, color, cantidad, precio_unitario_historico
      FROM order_items WHERE order_id = ?
      ORDER BY sort_order, rowid
    `, [candidate.id]);

    return existingItems.length === items.length && existingItems.every((existing, index) => {
      const imported = items[index];
      return String(existing.producto_nombre_historico || '').trim().toLowerCase() === String(imported.producto_nombre_historico || '').trim().toLowerCase() &&
        String(existing.color || '').trim().toLowerCase() === String(imported.color || '').trim().toLowerCase() &&
        Math.abs(Number(existing.cantidad) - Number(imported.cantidad)) < 0.005 &&
        Math.abs(Number(existing.precio_unitario_historico) - Number(imported.precio_unitario_historico)) < 0.005;
    });
  });

  // Si ya existe el mismo pedido con el mismo numero de la hoja, es la copia
  // correcta. No se renumera aunque haya otra copia identica con otro numero.
  return matches.find(candidate => Number(candidate.numero) === Number(sheetOrderNumber)) || matches[0] || null;
}

function _findOrderByNumber(number) {
  if (!_isValidOrderNumber(number)) return null;
  return queryOne(`SELECT id FROM orders WHERE numero = ?`, [number]);
}

function _isValidOrderNumber(number) {
  return Number.isInteger(Number(number)) && Number(number) > 0;
}

function _applySheetOrderNumber(orderId, currentNumber, sheetOrderNumber) {
  if (!_isValidOrderNumber(sheetOrderNumber) || Number(currentNumber) === Number(sheetOrderNumber)) return;

  transaction(() => {
    const conflict = queryOne(`SELECT id FROM orders WHERE numero = ? AND id != ?`, [sheetOrderNumber, orderId]);
    if (conflict) {
      const next = queryOne(`SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM orders`);
      run(`UPDATE orders SET numero = ?, updated_at = ? WHERE id = ?`, [next.numero, nowISO(), conflict.id]);
    }
    run(`UPDATE orders SET numero = ?, updated_at = ? WHERE id = ?`, [sheetOrderNumber, nowISO(), orderId]);
  });
}

function _replaceOrderFromSheet(orderId, fecha, items, saldoAnteriorEfectivo, saldoAnteriorBlanco) {
  const subtotalItems = items.reduce((sum, item) => sum + (Number(item.subtotal) || 0), 0);
  const total = subtotalItems + saldoAnteriorEfectivo + saldoAnteriorBlanco;
  const { sinFactura: baseSinFactura, facturado: baseFacturado } = calcularImportes(subtotalItems);
  const saldoAnteriorMonto = saldoAnteriorEfectivo + saldoAnteriorBlanco;
  const saldoAnteriorTipo = saldoAnteriorEfectivo > 0 && saldoAnteriorBlanco > 0 ? 'mixto' :
    (saldoAnteriorEfectivo > 0 ? 'efectivo' : (saldoAnteriorBlanco > 0 ? 'blanco' : ''));

  transaction(() => {
    run(`
      UPDATE orders
      SET fecha = ?, total = ?, importe_sin_factura = ?, importe_facturado = ?,
          saldo_anterior_monto = ?, saldo_anterior_tipo = ?,
          saldo_anterior_efectivo = ?, saldo_anterior_blanco = ?, updated_at = ?
      WHERE id = ?
    `, [
      fecha, total, baseSinFactura + saldoAnteriorEfectivo, baseFacturado + saldoAnteriorBlanco,
      saldoAnteriorMonto, saldoAnteriorTipo, saldoAnteriorEfectivo, saldoAnteriorBlanco,
      nowISO(), orderId
    ]);

    run(`DELETE FROM order_items WHERE order_id = ?`, [orderId]);
    items.forEach((item, index) => {
      const product = queryOne(`SELECT id FROM products WHERE LOWER(nombre) = LOWER(?)`, [item.producto_nombre_historico]);
      run(`
        INSERT INTO order_items (id, order_id, product_id, producto_nombre_historico, color, cantidad, precio_unitario_historico, subtotal, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        uuid(), orderId, product?.id || null, item.producto_nombre_historico, item.color,
        item.cantidad, item.precio_unitario_historico, item.subtotal, index
      ]);
    });
  });
}

function _normalizeSheetDate(value) {
  const date = String(value || '').trim();
  if (!date) return todayISO();

  // Serial Excel (ej. 45543)
  if (/^\d{5}$/.test(date)) {
    const serial = parseInt(date, 10);
    const utcDays = serial - 25569;
    const utcValue = utcDays * 86400;
    const dateInfo = new Date(utcValue * 1000);
    if (!isNaN(dateInfo.getTime())) {
      return dateInfo.toISOString().split('T')[0];
    }
  }

  const iso = date.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const local = date.match(/^(\d{1,2})[/\-\.](\d{1,2})[/\-\.](\d{2,4})/);
  if (local) {
    const day = local[1].padStart(2, '0');
    const month = local[2].padStart(2, '0');
    let year = local[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  return todayISO();
}

function _isSheetDate(value) {
  const date = String(value || '').trim();
  return /^\d{4}-\d{2}-\d{2}/.test(date) || /^\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4}/.test(date) || /^\d{5}$/.test(date);
}

function _extractPaymentsFromRows(rows) {
  if (!rows || rows.length === 0) return 0;

  let importedCount = 0;
  let colFechaIdx = -1;
  let colEfectivoIdx = -1;
  let colBlancoIdx = -1;
  let colEcheqIdx = -1;
  let colFechaCobroIdx = -1;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    let tempEfectivo = -1;
    let tempBlanco = -1;
    let tempEcheq = -1;
    let tempCobro = -1;

    for (let c = 0; c < row.length; c++) {
      const cell = String(row[c] || '').trim().toLowerCase();
      if (cell.includes('fecha cobro') || cell.includes('cobro echeq') || (cell.includes('cobro') && !cell.includes('total'))) {
        tempCobro = c;
      } else if (cell.includes('echeq') || cell.includes('cheque')) {
        tempEcheq = c;
      } else if (cell.includes('abono en blanco') || cell.includes('abono blanco') || (cell.includes('blanco') && !cell.includes('saldo'))) {
        tempBlanco = c;
      } else if (cell.includes('abono efectivo') || cell.includes('abono negro') || (cell.includes('efectivo') && !cell.includes('saldo'))) {
        tempEfectivo = c;
      }
    }

    if (tempEfectivo !== -1 || tempBlanco !== -1 || tempEcheq !== -1) {
      colEfectivoIdx = tempEfectivo;
      colBlancoIdx = tempBlanco;
      colEcheqIdx = tempEcheq;
      colFechaCobroIdx = tempCobro;

      const abonoStart = Math.min(
        tempEfectivo !== -1 ? tempEfectivo : 99,
        tempBlanco !== -1 ? tempBlanco : 99,
        tempEcheq !== -1 ? tempEcheq : 99
      );
      for (let c = abonoStart - 1; c >= 0; c--) {
        const cell = String(row[c] || '').trim().toLowerCase();
        if (cell.includes('fecha')) {
          colFechaIdx = c;
          break;
        }
      }
      if (colFechaIdx === -1 && abonoStart > 0) colFechaIdx = abonoStart - 1;
      continue;
    }

    if (colEfectivoIdx !== -1 || colBlancoIdx !== -1) {
      const rawFecha = colFechaIdx !== -1 ? String(row[colFechaIdx] || '').trim() : '';
      const normFecha = rawFecha.toLowerCase();
      if (
        normFecha === 'fecha' ||
        normFecha.includes('total') ||
        normFecha.includes('pendiente') ||
        normFecha.includes('saldo') ||
        normFecha.includes('pagos') ||
        normFecha.includes('realizados') ||
        normFecha === '-' || normFecha === '—'
      ) {
        continue;
      }

      const efectivo   = colEfectivoIdx !== -1 ? parseCurrency(row[colEfectivoIdx]) : 0;
      const blanco     = colBlancoIdx !== -1 ? parseCurrency(row[colBlancoIdx]) : 0;
      const echeq      = colEcheqIdx !== -1 ? parseCurrency(row[colEcheqIdx]) : 0;
      const fechaCobro = colFechaCobroIdx !== -1 ? String(row[colFechaCobroIdx] || '').trim() : '';

      if (efectivo <= 0 && blanco <= 0 && echeq <= 0) continue;

      const pmtDate = _isSheetDate(rawFecha) ? _normalizeSheetDate(rawFecha) : todayISO();
      const cobroDate = _isSheetDate(fechaCobro) ? _normalizeSheetDate(fechaCobro) : (fechaCobro || '');

      const pmtList = [
        { tipo: 'efectivo', importe: efectivo, cobro: '' },
        { tipo: 'blanco',   importe: blanco,   cobro: '' },
        { tipo: 'echeq',    importe: echeq,    cobro: cobroDate },
      ];

      for (const item of pmtList) {
        if (item.importe > 0) {
          const existingPayment = queryOne(`
            SELECT id FROM payments
            WHERE fecha = ? AND tipo_pago = ? AND ABS(importe - ?) < 0.005
              AND COALESCE(fecha_cobro, '') = ?
            LIMIT 1
          `, [pmtDate, item.tipo, item.importe, item.cobro || '']);

          if (existingPayment) continue;

          const openOrder = queryOne(`
            SELECT o.id, o.numero FROM orders o
            WHERE (SELECT COALESCE(SUM(importe), 0) FROM payments WHERE order_id = o.id) < o.total
              AND o.estado != 'cancelado'
            ORDER BY o.numero ASC LIMIT 1
          `);

          const orderId = openOrder ? openOrder.id : null;

          run(`INSERT INTO payments (id, order_id, fecha, tipo_pago, importe, fecha_cobro, observaciones, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [uuid(), orderId, pmtDate, item.tipo, item.importe, item.cobro || '', 'Importado de Google Sheets', nowISO()]);
          importedCount++;
        }
      }
    }
  }

  return importedCount;
}


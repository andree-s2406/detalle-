// ============================================================
//  ORDER MODEL — CRUD de pedidos con precios históricos y Sync Drive
// ============================================================

import { queryAll, queryOne, run, transaction } from '../db/database.js';
import { uuid, nowISO } from '../components/Formatter.js';
import { calcularImportes } from '../config.js';
import { GoogleSheetsSync } from '../sync/google-sheets.js';

// --------------------------------------------------------
//  PEDIDOS — Lectura
// --------------------------------------------------------

export function getAllOrders(filters = {}) {
  let where = [];
  let params = [];

  if (filters.estado) {
    where.push('o.estado = ?');
    params.push(filters.estado);
  }

  if (filters.search) {
    const q = `%${filters.search}%`;
    where.push(`(o.numero LIKE ? OR o.notas LIKE ?)`);
    params.push(q, q);
  }

  if (filters.fechaDesde) {
    where.push('o.fecha >= ?');
    params.push(filters.fechaDesde);
  }

  if (filters.fechaHasta) {
    where.push('o.fecha <= ?');
    params.push(filters.fechaHasta);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const orderBy = filters.orderBy || 'o.numero DESC';

  return queryAll(`
    SELECT o.*,
           COUNT(DISTINCT oi.id) AS total_items,
           COALESCE(SUM(p.importe), 0) AS total_pagado
    FROM orders o
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN payments p ON p.order_id = o.id
    ${whereClause}
    GROUP BY o.id
    ORDER BY ${orderBy}
  `, params);
}

export function getOrderById(id) {
  const order = queryOne(`SELECT * FROM orders WHERE id = ?`, [id]);
  if (!order) return null;

  order.items = queryAll(`
    SELECT oi.*, p.nombre AS producto_nombre_actual
    FROM order_items oi
    LEFT JOIN products p ON p.id = oi.product_id
    WHERE oi.order_id = ?
    ORDER BY oi.sort_order, oi.rowid
  `, [id]);

  order.payments = queryAll(`
    SELECT * FROM payments WHERE order_id = ? ORDER BY fecha DESC, created_at DESC
  `, [id]);

  order.history = queryAll(`
    SELECT * FROM order_history WHERE order_id = ? ORDER BY created_at DESC
  `, [id]);

  return order;
}

export function getNextOrderNumber() {
  const row = queryOne(`SELECT MAX(numero) as maxNum FROM orders`);
  return (row?.maxNum ?? 0) + 1;
}

// --------------------------------------------------------
//  PEDIDOS — Creación
// --------------------------------------------------------

export function createOrder({ fecha, estado = 'borrador', notas = '', items = [], saldo_anterior_monto = 0, saldo_anterior_tipo = '' }) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const id     = uuid();
      const numero = getNextOrderNumber();
      const now    = nowISO();

      let subtotalItems = 0;
      items.forEach(item => {
        item.subtotal = item.cantidad * item.precio_unitario_historico;
        subtotalItems += item.subtotal;
      });

      const { sinFactura: baseSF, facturado: baseF } = calcularImportes(subtotalItems);

      // Sumar saldo anterior al importe correspondiente
      let sinFactura = baseSF;
      let facturado  = baseF;
      const saldoAnt = parseFloat(saldo_anterior_monto) || 0;

      if (saldoAnt > 0 && saldo_anterior_tipo === 'efectivo') {
        sinFactura += saldoAnt;
      } else if (saldoAnt > 0 && saldo_anterior_tipo === 'blanco') {
        facturado += saldoAnt;
      }

      const total = subtotalItems + saldoAnt;

      transaction(() => {
        run(`
          INSERT INTO orders (id, numero, fecha, estado, total, importe_sin_factura, importe_facturado, saldo_anterior_monto, saldo_anterior_tipo, notas, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [id, numero, fecha, estado, total, sinFactura, facturado, saldoAnt, saldo_anterior_tipo || '', notas, now, now]);

        items.forEach((item, idx) => {
          run(`
            INSERT INTO order_items (id, order_id, product_id, producto_nombre_historico, color, cantidad, precio_unitario_historico, subtotal, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [uuid(), id, item.product_id || null, item.producto_nombre_historico,
              item.color, item.cantidad, item.precio_unitario_historico, item.subtotal, idx]);
        });

        _addHistory(id, 'creacion', '', `Pedido creado con ${items.length} ítem(s)${saldoAnt > 0 ? ` + saldo anterior $${saldoAnt}` : ''}`, now);
      });

      return id;
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncOrdersSheet();
      await GoogleSheetsSync.syncPaymentsSheet();
    }
  });
}

// --------------------------------------------------------
//  PEDIDOS — Edición
// --------------------------------------------------------

export function updateOrder(id, { fecha, estado, notas, saldo_anterior_monto, saldo_anterior_tipo }) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const existing = getOrderById(id);
      if (!existing) return;
      const now = nowISO();

      const saldoAnt = parseFloat(saldo_anterior_monto) || 0;
      const saldoTipo = saldo_anterior_tipo || '';

      // Recalcular totales con saldo anterior
      const subtotalItems = (existing.items || []).reduce((s, i) => s + (i.subtotal || 0), 0);
      const { sinFactura: baseSF, facturado: baseF } = calcularImportes(subtotalItems);

      let sinFactura = baseSF;
      let facturado  = baseF;
      if (saldoAnt > 0 && saldoTipo === 'efectivo') {
        sinFactura += saldoAnt;
      } else if (saldoAnt > 0 && saldoTipo === 'blanco') {
        facturado += saldoAnt;
      }
      const total = subtotalItems + saldoAnt;

      run(`
        UPDATE orders SET fecha = ?, estado = ?, notas = ?, saldo_anterior_monto = ?, saldo_anterior_tipo = ?,
        total = ?, importe_sin_factura = ?, importe_facturado = ?, updated_at = ?
        WHERE id = ?
      `, [fecha, estado, notas, saldoAnt, saldoTipo, total, sinFactura, facturado, now, id]);

      _addHistory(id, 'edicion', JSON.stringify({ fecha: existing.fecha, estado: existing.estado }),
        JSON.stringify({ fecha, estado }), now);
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncOrdersSheet();
      await GoogleSheetsSync.syncPaymentsSheet();
    }
  });
}

export function updateOrderItems(id, newItems = []) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const existing = getOrderById(id);
      if (!existing) return;
      const now = nowISO();

      let subtotalItems = 0;
      newItems.forEach(item => {
        item.subtotal = item.cantidad * item.precio_unitario_historico;
        subtotalItems += item.subtotal;
      });

      const { sinFactura: baseSF, facturado: baseF } = calcularImportes(subtotalItems);

      // Preservar saldo anterior existente
      const saldoAnt  = parseFloat(existing.saldo_anterior_monto) || 0;
      const saldoTipo = existing.saldo_anterior_tipo || '';

      let sinFactura = baseSF;
      let facturado  = baseF;
      if (saldoAnt > 0 && saldoTipo === 'efectivo') {
        sinFactura += saldoAnt;
      } else if (saldoAnt > 0 && saldoTipo === 'blanco') {
        facturado += saldoAnt;
      }
      const total = subtotalItems + saldoAnt;

      transaction(() => {
        run(`DELETE FROM order_items WHERE order_id = ?`, [id]);

        newItems.forEach((item, idx) => {
          run(`
            INSERT INTO order_items (id, order_id, product_id, producto_nombre_historico, color, cantidad, precio_unitario_historico, subtotal, sort_order)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [item.id || uuid(), id, item.product_id || null, item.producto_nombre_historico,
              item.color, item.cantidad, item.precio_unitario_historico, item.subtotal, idx]);
        });

        run(`
          UPDATE orders SET total = ?, importe_sin_factura = ?, importe_facturado = ?, updated_at = ?
          WHERE id = ?
        `, [total, sinFactura, facturado, now, id]);

        _addHistory(id, 'items_actualizados', `Total previo: $${existing.total}`, `Nuevo total: $${total}`, now);
      });
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncOrdersSheet();
      await GoogleSheetsSync.syncPaymentsSheet();
    }
  });
}

export function deleteOrder(id) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      transaction(() => {
        run(`DELETE FROM payments WHERE order_id = ?`, [id]);
        run(`DELETE FROM order_items WHERE order_id = ?`, [id]);
        run(`DELETE FROM order_history WHERE order_id = ?`, [id]);
        run(`DELETE FROM orders WHERE id = ?`, [id]);
      });
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncOrdersSheet();
      await GoogleSheetsSync.syncPaymentsSheet();
    }
  });
}

// --------------------------------------------------------
//  DASHBOARD — Stats
// --------------------------------------------------------

export function getOrderStats() {
  const total = queryOne(`SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as suma FROM orders WHERE estado != 'cancelado'`);
  const pendientes = queryOne(`SELECT COUNT(*) as cnt FROM orders WHERE estado IN ('borrador','confirmado','en_produccion')`);
  const confirmados = queryOne(`SELECT COUNT(*) as cnt FROM orders WHERE estado = 'confirmado'`);
  const totalVendido = queryOne(`SELECT COALESCE(SUM(total),0) as v FROM orders WHERE estado != 'cancelado'`);
  const totalSinFact = queryOne(`SELECT COALESCE(SUM(importe_sin_factura),0) as v FROM orders WHERE estado != 'cancelado'`);
  const totalFact = queryOne(`SELECT COALESCE(SUM(importe_facturado),0) as v FROM orders WHERE estado != 'cancelado'`);
  const totalCobrado = queryOne(`SELECT COALESCE(SUM(importe),0) as v FROM payments`);
  const totalPendiente = queryOne(`
    SELECT COALESCE(SUM(total),0) - COALESCE((SELECT SUM(importe) FROM payments),0) as v
    FROM orders WHERE estado != 'cancelado'
  `);

  return {
    totalPedidos:   total?.cnt ?? 0,
    pedidosPendientes: pendientes?.cnt ?? 0,
    pedidosConfirmados: confirmados?.cnt ?? 0,
    totalVendido:   totalVendido?.v ?? 0,
    totalSinFactura:totalSinFact?.v ?? 0,
    totalFacturado: totalFact?.v ?? 0,
    totalCobrado:   totalCobrado?.v ?? 0,
    totalPendiente: Math.max(0, totalPendiente?.v ?? 0),
  };
}

function _addHistory(orderId, campo, antes, despues, now) {
  run(`
    INSERT INTO order_history (id, order_id, campo, valor_antes, valor_despues, usuario, created_at)
    VALUES (?, ?, ?, ?, ?, 'admin', ?)
  `, [uuid(), orderId, campo, antes, despues, now]);
}

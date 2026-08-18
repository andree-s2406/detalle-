// ============================================================
//  PAYMENT MODEL — CRUD de pagos con Drive Sync & Rollback
// ============================================================

import { queryAll, queryOne, run, transaction } from '../db/database.js';
import { uuid, nowISO } from '../components/Formatter.js';
import { GoogleSheetsSync } from '../sync/google-sheets.js';

export function getAllPayments(filters = {}) {
  let where = [];
  let params = [];

  if (filters.orderId) {
    where.push('p.order_id = ?');
    params.push(filters.orderId);
  }

  if (filters.tipo) {
    where.push('p.tipo_pago = ?');
    params.push(filters.tipo);
  }

  if (filters.fechaDesde) {
    where.push('p.fecha >= ?');
    params.push(filters.fechaDesde);
  }

  if (filters.fechaHasta) {
    where.push('p.fecha <= ?');
    params.push(filters.fechaHasta);
  }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  return queryAll(`
    SELECT p.*, o.numero AS pedido_numero, o.total AS pedido_total
    FROM payments p
    LEFT JOIN orders o ON o.id = p.order_id
    ${whereClause}
    ORDER BY p.fecha DESC, p.created_at DESC
  `, params);
}

export function getPaymentById(id) {
  return queryOne(`SELECT * FROM payments WHERE id = ?`, [id]);
}

export function createPayment({ order_id = null, fecha, tipo_pago, importe, fecha_cobro = '', observaciones = '' }) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const id  = uuid();
      const now = nowISO();

      run(`
        INSERT INTO payments (id, order_id, fecha, tipo_pago, importe, fecha_cobro, observaciones, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [id, order_id || null, fecha, tipo_pago, importe, fecha_cobro, observaciones, now]);

      return id;
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncPaymentsSheet();
    }
  });
}

export function updatePayment(id, { order_id = null, fecha, tipo_pago, importe, fecha_cobro = '', observaciones = '' }) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      run(`
        UPDATE payments
        SET order_id = ?, fecha = ?, tipo_pago = ?, importe = ?, fecha_cobro = ?, observaciones = ?
        WHERE id = ?
      `, [order_id || null, fecha, tipo_pago, importe, fecha_cobro, observaciones, id]);
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncPaymentsSheet();
    }
  });
}

export function deletePayment(id) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      run(`DELETE FROM payments WHERE id = ?`, [id]);
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncPaymentsSheet();
    }
  });
}

export function getOrderBalance(orderId) {
  const order = queryOne(`SELECT total FROM orders WHERE id = ?`, [orderId]);
  if (!order) return { total: 0, cobrado: 0, saldo: 0 };

  const pmt = queryOne(`SELECT COALESCE(SUM(importe), 0) as cobrado FROM payments WHERE order_id = ?`, [orderId]);
  const cobrado = pmt?.cobrado ?? 0;
  const saldo   = order.total - cobrado;

  return {
    total: order.total,
    cobrado,
    saldo,
    estaSaldado: saldo <= 0,
  };
}

export function getGlobalBalance() {
  const ord = queryOne(`SELECT COALESCE(SUM(total), 0) as totalVendido FROM orders WHERE estado != 'cancelado'`);
  const pmt = queryOne(`SELECT COALESCE(SUM(importe), 0) as totalCobrado FROM payments`);
  const totalVendido = ord?.totalVendido ?? 0;
  const totalCobrado = pmt?.totalCobrado ?? 0;
  const saldoPendiente = Math.max(0, totalVendido - totalCobrado);

  return {
    totalVendido,
    totalCobrado,
    saldoPendiente
  };
}

export function getPaymentStats() {
  return queryAll(`
    SELECT tipo_pago, COUNT(*) as cantidad, COALESCE(SUM(importe), 0) as total
    FROM payments
    GROUP BY tipo_pago
  `);
}

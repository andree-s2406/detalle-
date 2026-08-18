// ============================================================
//  ORDER DETAIL VIEW — Vista completa del pedido + pagos con SVG
// ============================================================

import { getOrderById } from '../models/Order.js';
import { createPayment, updatePayment, deletePayment, getOrderBalance } from '../models/Payment.js';
import { Modal }  from '../components/Modal.js';
import { Toast }  from '../components/Toast.js';
import { Router } from '../router.js';
import {
  formatCurrency, formatDate, formatOrderNumber, formatDateTime,
  stateBadge, paymentBadge, escapeHtml, todayISO, colorDot
} from '../components/Formatter.js';
import { calcularImportes } from '../config.js';
import { PAYMENT_TYPES } from '../db/schema.js';
import { icon } from '../components/Icons.js';

export function renderOrderDetail(params = {}) {
  const { id } = params;
  if (!id) { Router.navigate('orders'); return; }

  _renderDetail(id);
}

function _renderDetail(orderId) {
  const order = getOrderById(orderId);
  if (!order) {
    Toast.error('Pedido no encontrado');
    Router.navigate('orders');
    return;
  }

  const view = document.getElementById('app-view');
  const totalPagado  = order.payments.reduce((s, p) => s + p.importe, 0);
  const saldoPend    = order.total - totalPagado;
  const { sinFactura, facturado } = calcularImportes(order.total);

  const itemsRows = (order.items || []).map(item => `
    <tr>
      <td>
        <strong>${escapeHtml(item.producto_nombre_historico)}</strong>
        ${item.producto_nombre_historico !== item.producto_nombre_actual && item.producto_nombre_actual
          ? `<br><span class="text-muted text-sm">Actual: ${escapeHtml(item.producto_nombre_actual)}</span>`
          : ''}
      </td>
      <td>
        ${item.color
          ? `<span class="chip chip-color">${colorDot(item.color)}<span>${escapeHtml(item.color)}</span></span>`
          : '<span class="text-muted">—</span>'}
      </td>
      <td class="td-center">${item.cantidad}</td>
      <td class="td-right td-mono">
        ${formatCurrency(item.precio_unitario_historico)}
        <br><span class="text-muted" style="font-size:10px;">📌 Histórico</span>
      </td>
      <td class="td-right td-mono"><strong>${formatCurrency(item.subtotal)}</strong></td>
    </tr>
  `).join('');

  const paymentsRows = order.payments.length
    ? order.payments.map(p => `
        <div class="payment-item">
          <div>
            ${paymentBadge(p.tipo_pago)}
            <div class="text-sm text-muted mt-sm">${formatDate(p.fecha)}</div>
            ${p.fecha_cobro ? `<div class="text-sm" style="color:var(--c-warning);">Cobro: ${formatDate(p.fecha_cobro)}</div>` : ''}
            ${p.observaciones ? `<div class="text-sm text-muted">${escapeHtml(p.observaciones)}</div>` : ''}
          </div>
          <div class="payment-amount">${formatCurrency(p.importe)}</div>
          <div class="flex gap-sm" style="margin-left:var(--sp-sm);">
            <button class="btn btn-ghost btn-icon btn-sm" title="Editar pago" onclick="window._editPayment('${p.id}','${orderId}')">
              ${icon('edit', '', 14)}
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar pago" onclick="window._deletePayment('${p.id}','${orderId}')">
              ${icon('trash', '', 14)}
            </button>
          </div>
        </div>
      `).join('')
    : `<div class="text-muted text-sm" style="padding:var(--sp-md);">Sin pagos registrados</div>`;

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${formatOrderNumber(order.numero)}</h1>
        <p class="page-subtitle">${stateBadge(order.estado)} &nbsp;·&nbsp; ${formatDate(order.fecha)}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" onclick="Router.navigate('orders')">← Volver</button>
        <button class="btn btn-secondary" onclick="Router.navigate('order-form',{id:'${order.id}'})">
          ${icon('edit')} Editar pedido
        </button>
        <button class="btn btn-primary" id="btn-add-payment">
          ${icon('payments')} Registrar pago
        </button>
      </div>
    </div>

    <div class="order-detail-layout">

      <!-- Columna principal -->
      <div>
        <!-- Productos -->
        <div class="card mb-md">
          <div class="card-header">
            <span class="card-title">${icon('products')} Productos del pedido</span>
            <span class="text-muted text-sm">${order.items?.length || 0} ítem(s)</span>
          </div>
          <div class="table-wrapper" style="border:none;">
            <table>
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Color</th>
                  <th class="td-center">Cant.</th>
                  <th class="td-right">Precio hist.</th>
                  <th class="td-right">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsRows || '<tr><td colspan="5" class="table-empty">Sin ítems</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>

        <!-- Pagos -->
        <div class="card">
          <div class="card-header">
            <span class="card-title">${icon('payments')} Pagos</span>
            <span class="text-success text-sm text-mono">${formatCurrency(totalPagado)} cobrado</span>
          </div>
          <div id="payments-list">${paymentsRows}</div>
        </div>
      </div>

      <!-- Columna lateral: totales -->
      <div>
        <div class="card mb-md">
          <div class="card-header">
            <span class="card-title">${icon('money')} Resumen</span>
          </div>
          <div class="totals-panel" style="background:transparent;border:none;padding:0;">
            <div class="totals-row">
              <span>Total del pedido</span>
              <span class="amount">${formatCurrency(order.total)}</span>
            </div>
            ${(order.saldo_anterior_monto && order.saldo_anterior_monto > 0) ? `
              <div class="totals-row" style="background:rgba(108,142,245,0.06);border-radius:6px;padding:6px 12px;">
                <span>${icon('money', '', 14)} Saldo anterior (${order.saldo_anterior_tipo === 'efectivo' ? 'Efectivo' : 'En blanco'})</span>
                <span class="amount" style="color:var(--c-accent);font-weight:600;">${formatCurrency(order.saldo_anterior_monto)}</span>
              </div>
            ` : ''}
            <div class="totals-row">
              <span>Sin factura</span>
              <span class="amount sin-factura">${formatCurrency(order.importe_sin_factura)}</span>
            </div>
            <div class="totals-row">
              <span>Facturado</span>
              <span class="amount facturado">${formatCurrency(order.importe_facturado)}</span>
            </div>
            <div class="divider"></div>
            <div class="totals-row">
              <span>Total cobrado</span>
              <span class="amount text-success">${formatCurrency(totalPagado)}</span>
            </div>
            <div class="totals-row total-final">
              <span>Saldo pendiente</span>
              <span class="saldo-pendiente ${saldoPend > 0 ? 'positivo' : 'cero'}">
                ${formatCurrency(Math.abs(saldoPend))}
                ${saldoPend <= 0 ? ' ✓' : ''}
              </span>
            </div>
          </div>
        </div>

        ${order.notas ? `
          <div class="card mb-md">
            <div class="card-header"><span class="card-title">${icon('invoice')} Notas</span></div>
            <p class="text-muted">${escapeHtml(order.notas)}</p>
          </div>
        ` : ''}

        <div class="card">
          <div class="card-header"><span class="card-title">${icon('clock')} Historial</span></div>
          <div class="text-sm text-muted">
            <div>Creado: ${formatDateTime(order.created_at)}</div>
            <div class="mt-sm">Modificado: ${formatDateTime(order.updated_at)}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Exponer Router al onclick
  window.Router = Router;

  document.getElementById('btn-add-payment')?.addEventListener('click', () => {
    openPaymentForm(null, orderId, () => _renderDetail(orderId));
  });
}

// --------------------------------------------------------
//  Formulario de pago
// --------------------------------------------------------
export function openPaymentForm(paymentId, orderId, onSave) {
  const isEdit = !!paymentId;

  // Buscar pago existente si es edición
  let existing = null;
  if (isEdit) {
    const order = getOrderById(orderId);
    existing = order?.payments?.find(p => p.id === paymentId);
  }

  const tipoOptions = PAYMENT_TYPES.map(t =>
    `<option value="${t.value}" ${existing?.tipo_pago === t.value ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  Modal.show({
    title: isEdit ? 'Editar pago' : 'Registrar pago',
    size: 'modal-md',
    content: `
      <form id="payment-form">
        <div class="form-row">
          <div class="form-group" style="margin:0;">
            <label class="form-label required">Fecha</label>
            <input type="date" class="form-control" id="pmt-fecha" value="${existing?.fecha ?? todayISO()}" required>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label required">Tipo de pago</label>
            <select class="form-control" id="pmt-tipo">${tipoOptions}</select>
          </div>
        </div>
        <div class="form-row mt-md">
          <div class="form-group" style="margin:0;">
            <label class="form-label required">Importe</label>
            <input type="number" class="form-control" id="pmt-importe" value="${existing?.importe ?? ''}"
                   placeholder="0.00" step="0.01" min="0" required>
          </div>
          <div class="form-group" id="echeq-fecha-group" style="margin:0;display:${existing?.tipo_pago === 'echeq' ? 'flex' : 'none'};flex-direction:column;gap:6px;">
            <label class="form-label">Fecha de cobro (E-cheq)</label>
            <input type="date" class="form-control" id="pmt-fecha-cobro" value="${existing?.fecha_cobro ?? ''}">
          </div>
        </div>
        <div class="form-group mt-md">
          <label class="form-label">Observaciones</label>
          <input type="text" class="form-control" id="pmt-obs" value="${escapeHtml(existing?.observaciones ?? '')}"
                 placeholder="Opcional...">
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
      <button class="btn btn-primary" id="pmt-save">${isEdit ? `${icon('save')} Guardar` : `${icon('payments')} Registrar pago`}</button>
    `,
  });

  window.Modal = Modal;

  // Mostrar/ocultar fecha cobro para e-cheq
  document.getElementById('pmt-tipo').addEventListener('change', e => {
    const echeqGroup = document.getElementById('echeq-fecha-group');
    if (echeqGroup) echeqGroup.style.display = e.target.value === 'echeq' ? 'flex' : 'none';
  });

  document.getElementById('pmt-save').addEventListener('click', async () => {
    const fecha     = document.getElementById('pmt-fecha').value;
    const tipo      = document.getElementById('pmt-tipo').value;
    const importe   = parseFloat(document.getElementById('pmt-importe').value);
    const fechaCobro= document.getElementById('pmt-fecha-cobro')?.value ?? '';
    const obs       = document.getElementById('pmt-obs')?.value ?? '';

    if (!fecha)            { Toast.error('Fecha requerida'); return; }
    if (!tipo)             { Toast.error('Tipo de pago requerido'); return; }
    if (isNaN(importe) || importe <= 0) { Toast.error('Importe inválido', 'Ingresá un monto mayor a 0'); return; }

    try {
      if (isEdit) {
        await updatePayment(paymentId, { fecha, tipo_pago: tipo, importe, fecha_cobro: fechaCobro, observaciones: obs });
        Toast.success('Pago actualizado');
      } else {
        await createPayment({ order_id: orderId, fecha, tipo_pago: tipo, importe, fecha_cobro: fechaCobro, observaciones: obs });
        Toast.success('Pago registrado', formatCurrency(importe));
      }
      Modal.close();
      if (onSave) onSave();
    } catch(e) {
      Toast.error('Error al guardar el pago', e.message);
    }
  });
}

// ---- Handlers globales ----
window._editPayment = function(paymentId, orderId) {
  openPaymentForm(paymentId, orderId, () => _renderDetail(orderId));
};

window._deletePayment = async function(paymentId, orderId) {
  const confirmed = await Modal.confirm({
    title: 'Eliminar pago',
    message: '¿Eliminás este pago? El saldo pendiente se actualizará automáticamente.',
    iconName: 'trash',
    confirmText: 'Eliminar',
    confirmClass: 'btn-danger',
  });
  if (!confirmed) return;
  await deletePayment(paymentId);
  Toast.success('Pago eliminado');
  _renderDetail(orderId);
};

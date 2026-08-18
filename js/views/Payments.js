// ============================================================
//  PAYMENTS VIEW — Vista global de pagos independientes y saldos con SVG
// ============================================================

import {
  getAllPayments, getPaymentStats, getGlobalBalance,
  createPayment, updatePayment, deletePayment, getPaymentById
} from '../models/Payment.js';
import { getAllOrders } from '../models/Order.js';
import { Router } from '../router.js';
import { Modal } from '../components/Modal.js';
import { Toast } from '../components/Toast.js';
import {
  formatCurrency, formatDate, paymentBadge, formatOrderNumber,
  escapeHtml, todayISO
} from '../components/Formatter.js';
import { PAYMENT_TYPES } from '../db/schema.js';
import { icon } from '../components/Icons.js';

let _filters = { tipo: '', fechaDesde: '', fechaHasta: '' };

export function renderPayments() {
  const view = document.getElementById('app-view');
  const stats = getPaymentStats();
  const balance = getGlobalBalance();

  const tipoOptions = [
    { value: '', label: 'Todos los tipos' },
    ...PAYMENT_TYPES
  ].map(t =>
    `<option value="${t.value}" ${_filters.tipo === t.value ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  // Totales por tipo
  const statMap = {};
  stats.forEach(s => { statMap[s.tipo_pago] = s; });
  const totalEfectivo = statMap['efectivo']?.total ?? 0;
  const totalBlanco   = statMap['blanco']?.total ?? 0;
  const totalEcheq    = statMap['echeq']?.total ?? 0;
  const totalGeneral  = totalEfectivo + totalBlanco + totalEcheq;

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Pagos y Cobranzas</h1>
        <p class="page-subtitle">Historial de cobros y control de saldo general</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-new-payment">
          ${icon('plus')} Registrar Pago
        </button>
      </div>
    </div>

    <!-- Banner de Saldo General -->
    <div class="grid grid-4 mb-md">
      <div class="stat-card">
        <div class="stat-icon success">${icon('money', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Cobrado</div>
          <div class="stat-value text-success">${formatCurrency(balance.totalCobrado)}</div>
          <div class="stat-sub">Pagos registrados</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon danger">${icon('clock', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Saldo Pendiente</div>
          <div class="stat-value ${balance.saldoPendiente > 0 ? 'text-danger' : 'text-success'}">
            ${formatCurrency(balance.saldoPendiente)}
          </div>
          <div class="stat-sub">Faltante por cobrar</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon accent">${icon('box', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Ventas</div>
          <div class="stat-value">${formatCurrency(balance.totalVendido)}</div>
          <div class="stat-sub">Pedidos activos</div>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon warning">${icon('checkDoc', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">E-cheqs</div>
          <div class="stat-value">${formatCurrency(totalEcheq)}</div>
          <div class="stat-sub">${statMap['echeq']?.cantidad ?? 0} pago(s)</div>
        </div>
      </div>
    </div>

    <!-- Filtros -->
    <div class="search-bar">
      <div class="filter-group">
        <select class="form-control" id="filter-tipo" style="min-width:180px;">${tipoOptions}</select>
        <input type="date" class="form-control" id="filter-desde" value="${_filters.fechaDesde}" title="Desde">
        <input type="date" class="form-control" id="filter-hasta" value="${_filters.fechaHasta}" title="Hasta">
        <button class="btn btn-ghost btn-sm" id="btn-clear-pmt">✕ Limpiar</button>
      </div>
    </div>

    <div id="payments-table-container"></div>
  `;

  _renderTable();

  document.getElementById('btn-new-payment').addEventListener('click', () => openPaymentModal(null));

  document.getElementById('filter-tipo').addEventListener('change', e => {
    _filters.tipo = e.target.value;
    _renderTable();
  });

  document.getElementById('filter-desde').addEventListener('change', e => {
    _filters.fechaDesde = e.target.value;
    _renderTable();
  });

  document.getElementById('filter-hasta').addEventListener('change', e => {
    _filters.fechaHasta = e.target.value;
    _renderTable();
  });

  document.getElementById('btn-clear-pmt').addEventListener('click', () => {
    _filters = { tipo: '', fechaDesde: '', fechaHasta: '' };
    renderPayments();
  });
}

function _renderTable() {
  const payments = getAllPayments(_filters);
  const container = document.getElementById('payments-table-container');
  if (!container) return;

  if (payments.length === 0) {
    container.innerHTML = `
      <div class="table-wrapper">
        <div class="table-empty">
          <div class="empty-icon">${icon('payments', '', 36)}</div>
          <div class="empty-text">No hay pagos registrados</div>
          <div class="empty-sub">Hacé clic en "+ Registrar Pago" para ingresar un cobro</div>
        </div>
      </div>`;
    return;
  }

  const rows = payments.map(p => {
    const pedidoCol = p.pedido_numero
      ? `<strong style="color:var(--c-accent);font-family:var(--font-mono);cursor:pointer;"
                onclick="Router.navigate('order-detail',{id:'${p.order_id}'})">
           ${formatOrderNumber(p.pedido_numero)}
         </strong>`
      : `<span class="chip chip-muted" style="font-size:11px;">Pago General</span>`;

    return `
      <tr>
        <td>${pedidoCol}</td>
        <td>${formatDate(p.fecha)}</td>
        <td>${paymentBadge(p.tipo_pago)}</td>
        <td class="td-right td-mono text-success"><strong>${formatCurrency(p.importe)}</strong></td>
        <td>${p.fecha_cobro ? formatDate(p.fecha_cobro) : '<span class="text-muted">—</span>'}</td>
        <td class="text-muted text-sm">${p.observaciones ? escapeHtml(p.observaciones) : '—'}</td>
        <td class="td-actions">
          <div class="flex gap-sm">
            <button class="btn btn-ghost btn-icon btn-sm" title="Editar pago" onclick="window._editDirectPayment('${p.id}')">
              ${icon('edit', '', 14)}
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar pago" onclick="window._deleteDirectPayment('${p.id}')">
              ${icon('trash', '', 14)}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const totalFiltrado = payments.reduce((s, p) => s + p.importe, 0);

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Origen / Pedido</th>
            <th>Fecha pago</th>
            <th>Tipo</th>
            <th class="td-right">Importe</th>
            <th>Fecha cobro (E-cheq)</th>
            <th>Observaciones</th>
            <th class="td-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:var(--sp-sm);font-size:var(--fs-sm);color:var(--c-text-3);display:flex;justify-content:space-between;">
      <span>${payments.length} pago(s)</span>
      <span>Total filtrado: <strong style="color:var(--c-success);">${formatCurrency(totalFiltrado)}</strong></span>
    </div>
  `;
}

// --------------------------------------------------------
//  Modal de Pago General o Específico
// --------------------------------------------------------
export function openPaymentModal(paymentId = null) {
  const isEdit = !!paymentId;
  const existing = isEdit ? getPaymentById(paymentId) : null;
  const balance = getGlobalBalance();
  const orders = getAllOrders();

  const orderOptions = [
    `<option value="">— Pago General (Sin vincular a pedido) —</option>`,
    ...orders.map(o => {
      const saldo = o.total - (o.total_pagado || 0);
      const isSelected = existing?.order_id === o.id;
      const saldoStr = saldo > 0 ? `(Saldo pendiente: ${formatCurrency(saldo)})` : `(Saldado)`;
      return `<option value="${o.id}" data-saldo="${saldo}" ${isSelected ? 'selected' : ''}>
        Pedido #${formatOrderNumber(o.numero)} — Total: ${formatCurrency(o.total)} ${saldoStr}
      </option>`;
    })
  ].join('');

  const tipoOptions = PAYMENT_TYPES.map(t =>
    `<option value="${t.value}" ${existing?.tipo_pago === t.value ? 'selected' : ''}>${t.label}</option>`
  ).join('');

  Modal.show({
    title: isEdit ? 'Editar Pago' : 'Registrar Pago / Cobranza',
    size: 'modal-md',
    content: `
      <!-- Resumen de saldo -->
      <div style="background:var(--c-bg-3);border:1px solid var(--c-border);border-radius:var(--r-md);padding:14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:12px;color:var(--c-text-3);">Saldo Total Pendiente / Faltante</div>
          <div style="font-size:20px;font-weight:700;color:${balance.saldoPendiente > 0 ? 'var(--c-danger)' : 'var(--c-success)'};">
            ${formatCurrency(balance.saldoPendiente)}
          </div>
        </div>
        <div style="text-align:right;font-size:12px;color:var(--c-text-3);line-height:1.5;">
          <div>Total Ventas: <strong>${formatCurrency(balance.totalVendido)}</strong></div>
          <div>Total Cobrado: <strong style="color:var(--c-success);">${formatCurrency(balance.totalCobrado)}</strong></div>
        </div>
      </div>

      <form id="global-payment-form">
        <div class="form-row">
          <div class="form-group" style="margin:0;">
            <label class="form-label required">Fecha de cobro</label>
            <input type="date" class="form-control" id="gpmt-fecha" value="${existing?.fecha ?? todayISO()}" required>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label required">Tipo de pago</label>
            <select class="form-control" id="gpmt-tipo">${tipoOptions}</select>
          </div>
        </div>

        <div class="form-row mt-md">
          <div class="form-group" style="margin:0;">
            <label class="form-label required">Importe ($)</label>
            <input type="number" class="form-control" id="gpmt-importe"
                   value="${existing?.importe ?? ''}" placeholder="0.00" step="0.01" min="0.01" required autofocus>
          </div>
          <div class="form-group" id="gpmt-echeq-group" style="margin:0;display:${existing?.tipo_pago === 'echeq' ? 'flex' : 'none'};flex-direction:column;">
            <label class="form-label">Fecha de cobro (E-cheq)</label>
            <input type="date" class="form-control" id="gpmt-fecha-cobro" value="${existing?.fecha_cobro ?? ''}">
          </div>
        </div>

        <div class="form-group mt-md">
          <label class="form-label">Vincular a un pedido específico (Opcional)</label>
          <select class="form-control" id="gpmt-order">
            ${orderOptions}
          </select>
          <div class="text-muted text-sm mt-sm">Podés dejarlo como "Pago General" para abonar parte o el total de la cuenta.</div>
        </div>

        <div class="form-group mt-md">
          <label class="form-label">Observaciones / Notas</label>
          <input type="text" class="form-control" id="gpmt-obs" value="${escapeHtml(existing?.observaciones ?? '')}"
                 placeholder="Ej: Transferencia bancaria, depósito en efectivo, etc.">
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
      <button class="btn btn-primary" id="gpmt-save">
        ${isEdit ? `${icon('save')} Guardar cambios` : `${icon('payments')} Registrar Pago`}
      </button>
    `
  });

  window.Modal = Modal;

  // Toggle fecha de echeq
  const tipoSelect = document.getElementById('gpmt-tipo');
  const echeqGroup = document.getElementById('gpmt-echeq-group');
  tipoSelect?.addEventListener('change', (e) => {
    if (echeqGroup) echeqGroup.style.display = e.target.value === 'echeq' ? 'flex' : 'none';
  });

  // Si selecciona un pedido específico, sugerir el saldo de ese pedido
  const orderSelect = document.getElementById('gpmt-order');
  const importeInput = document.getElementById('gpmt-importe');
  orderSelect?.addEventListener('change', () => {
    const selected = orderSelect.options[orderSelect.selectedIndex];
    const saldo = parseFloat(selected?.dataset?.saldo || 0);
    if (saldo > 0 && !importeInput.value) {
      importeInput.value = saldo.toFixed(2);
    }
  });

  document.getElementById('gpmt-save').addEventListener('click', async () => {
    const fecha     = document.getElementById('gpmt-fecha').value;
    const tipo      = document.getElementById('gpmt-tipo').value;
    const importe   = parseFloat(document.getElementById('gpmt-importe').value);
    const orderId   = document.getElementById('gpmt-order').value || null;
    const fechaCobro= document.getElementById('gpmt-fecha-cobro')?.value ?? '';
    const obs       = document.getElementById('gpmt-obs')?.value ?? '';

    if (!fecha) { Toast.error('Fecha requerida'); return; }
    if (!tipo)  { Toast.error('Tipo de pago requerido'); return; }
    if (isNaN(importe) || importe <= 0) { Toast.error('Importe inválido', 'Ingresá un monto mayor a 0'); return; }

    try {
      if (isEdit) {
        await updatePayment(paymentId, { order_id: orderId, fecha, tipo_pago: tipo, importe, fecha_cobro: fechaCobro, observaciones: obs });
        Toast.success('Pago actualizado');
      } else {
        await createPayment({ order_id: orderId, fecha, tipo_pago: tipo, importe, fecha_cobro: fechaCobro, observaciones: obs });
        Toast.success('Pago registrado', formatCurrency(importe));
      }
      Modal.close();
      renderPayments();
    } catch(e) {
      Toast.error('Error al guardar pago', e.message);
    }
  });
}

// ---- Handlers globales ----
window._editDirectPayment = function(id) {
  openPaymentModal(id);
};

window._deleteDirectPayment = async function(id) {
  const confirmed = await Modal.confirm({
    title: 'Eliminar pago',
    message: '¿Eliminás este pago? El saldo y la hoja de Pagos en Drive se actualizarán automáticamente.',
    iconName: 'trash',
    confirmText: 'Eliminar',
    confirmClass: 'btn-danger',
  });

  if (!confirmed) return;

  try {
    await deletePayment(id);
    Toast.success('Pago eliminado');
    renderPayments();
  } catch (e) {
    Toast.error('Error al eliminar', e.message);
  }
};

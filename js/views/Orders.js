// ============================================================
//  ORDERS VIEW — Lista de pedidos con filtros y SVG
// ============================================================

import { getAllOrders, deleteOrder } from '../models/Order.js';
import { Modal }  from '../components/Modal.js';
import { Toast }  from '../components/Toast.js';
import { Router } from '../router.js';
import {
  formatCurrency, formatDate, stateBadge, formatOrderNumber,
  escapeHtml, debounce
} from '../components/Formatter.js';
import { ORDER_STATES } from '../db/schema.js';
import { icon } from '../components/Icons.js';

let _filters = {
  search: '',
  estado: '',
  fechaDesde: '',
  fechaHasta: '',
  orderBy: 'o.numero DESC',
};

export function renderOrders() {
  const view = document.getElementById('app-view');

  const estadoOptions = [
    { value: '', label: 'Todos los estados' },
    ...ORDER_STATES
  ].map(s => `<option value="${s.value}" ${_filters.estado === s.value ? 'selected' : ''}>${s.label}</option>`).join('');

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Pedidos</h1>
        <p class="page-subtitle">Gestión y seguimiento de todos los pedidos</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-new-order">
          ${icon('plus')} Nuevo Pedido
        </button>
      </div>
    </div>

    <!-- Filtros -->
    <div class="search-bar">
      <div class="search-input-wrapper">
        <span class="search-icon">${icon('search', '', 16)}</span>
        <input type="text" class="form-control" id="order-search"
               placeholder="Buscar por número o notas..." value="${escapeHtml(_filters.search)}">
      </div>
      <div class="filter-group">
        <select class="form-control" id="filter-estado" style="min-width:160px;">${estadoOptions}</select>
        <input type="date" class="form-control" id="filter-desde" value="${_filters.fechaDesde}" title="Desde">
        <input type="date" class="form-control" id="filter-hasta" value="${_filters.fechaHasta}" title="Hasta">
        <button class="btn btn-ghost btn-sm" id="btn-clear-filters">✕ Limpiar</button>
      </div>
    </div>

    <div id="orders-table-container"></div>
  `;

  _renderOrdersTable();

  document.getElementById('btn-new-order').addEventListener('click', () => Router.navigate('order-form'));

  document.getElementById('order-search').addEventListener('input', debounce(e => {
    _filters.search = e.target.value;
    _renderOrdersTable();
  }, 250));

  document.getElementById('filter-estado').addEventListener('change', e => {
    _filters.estado = e.target.value;
    _renderOrdersTable();
  });

  document.getElementById('filter-desde').addEventListener('change', e => {
    _filters.fechaDesde = e.target.value;
    _renderOrdersTable();
  });

  document.getElementById('filter-hasta').addEventListener('change', e => {
    _filters.fechaHasta = e.target.value;
    _renderOrdersTable();
  });

  document.getElementById('btn-clear-filters').addEventListener('click', () => {
    _filters = { search: '', estado: '', fechaDesde: '', fechaHasta: '', orderBy: 'o.numero DESC' };
    renderOrders();
  });
}

function _renderOrdersTable() {
  const orders = getAllOrders(_filters);
  const container = document.getElementById('orders-table-container');
  if (!container) return;

  if (orders.length === 0) {
    container.innerHTML = `
      <div class="table-wrapper">
        <div class="table-empty">
          <div class="empty-icon">${icon('orders', '', 36)}</div>
          <div class="empty-text">No se encontraron pedidos</div>
          <div class="empty-sub">${Object.values(_filters).some(v=>v) ? 'Probá con otros filtros' : 'Creá el primer pedido'}</div>
        </div>
      </div>`;
    return;
  }

  const rows = orders.map(o => {
    const saldo = o.total - (o.total_pagado || 0);
    const saldoClass = saldo > 0 ? 'text-danger' : 'text-success';

    return `
      <tr style="cursor:pointer;" onclick="window._viewOrder('${o.id}')">
        <td><strong style="color:var(--c-accent);font-family:var(--font-mono);">${formatOrderNumber(o.numero)}</strong></td>
        <td>${formatDate(o.fecha)}</td>
        <td>${stateBadge(o.estado)}</td>
        <td class="td-right td-mono">${formatCurrency(o.total)}</td>
        <td class="td-right td-mono" style="color:var(--c-warning);">${formatCurrency(o.importe_sin_factura)}</td>
        <td class="td-right td-mono" style="color:var(--c-info);">${formatCurrency(o.importe_facturado)}</td>
        <td class="td-right td-mono text-success">${formatCurrency(o.total_pagado || 0)}</td>
        <td class="td-right td-mono ${saldoClass}">${formatCurrency(Math.abs(saldo))}</td>
        <td class="text-muted text-sm text-center">
          ${o.total_items || 0} ítem(s)
          ${o.saldo_anterior_monto > 0 ? `<div style="font-size:10px;color:var(--c-accent);margin-top:2px;">💰 Saldo ant. (${o.saldo_anterior_tipo === 'efectivo' ? 'Efectivo' : 'Blanco'})</div>` : ''}
        </td>
        <td class="td-actions" onclick="event.stopPropagation()">
          <div class="flex gap-sm">
            <button class="btn btn-ghost btn-icon btn-sm" title="Ver" onclick="window._viewOrder('${o.id}')">
              ${icon('eye', '', 14)}
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick="window._editOrder('${o.id}')">
              ${icon('edit', '', 14)}
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar" onclick="window._deleteOrder('${o.id}')">
              ${icon('trash', '', 14)}
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr>
            <th>Pedido</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th class="td-right">Total</th>
            <th class="td-right">Sin Fact.</th>
            <th class="td-right">Facturado</th>
            <th class="td-right">Cobrado</th>
            <th class="td-right">Saldo</th>
            <th class="td-center">Ítems</th>
            <th class="td-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:var(--sp-sm);font-size:var(--fs-sm);color:var(--c-text-3);">${orders.length} pedido(s)</div>
  `;
}

window._viewOrder = function(id) {
  Router.navigate('order-detail', { id });
};

window._editOrder = function(id) {
  Router.navigate('order-form', { id });
};

window._deleteOrder = async function(id) {
  const orders = getAllOrders();
  const o = orders.find(x => x.id === id);
  const numStr = o ? formatOrderNumber(o.numero) : '';

  const confirmed = await Modal.confirm({
    title: 'Eliminar pedido',
    message: `¿Eliminar definitivamente el pedido <strong>${numStr}</strong>?<br><br>
      Esta acción no se puede deshacer. Se eliminarán también todos los pagos asociados.`,
    iconName: 'trash',
    confirmText: 'Eliminar',
    confirmClass: 'btn-danger',
  });

  if (!confirmed) return;

  await deleteOrder(id);
  Toast.success('Pedido eliminado', numStr);
  _renderOrdersTable();
};

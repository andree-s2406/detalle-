// ============================================================
//  DASHBOARD VIEW — Con Iconos SVG
// ============================================================

import { getOrderStats } from '../models/Order.js';
import { formatCurrency } from '../components/Formatter.js';
import { Router } from '../router.js';
import { icon } from '../components/Icons.js';

export function renderDashboard() {
  const stats = getOrderStats();
  const view  = document.getElementById('app-view');

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Resumen general del sistema — ${new Date().toLocaleDateString('es-AR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="dash-new-order">
          ${icon('plus')} Nuevo Pedido
        </button>
      </div>
    </div>

    <!-- Métricas principales -->
    <div class="grid grid-4 mb-md">
      <div class="stat-card">
        <div class="stat-icon accent">${icon('box', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Pedidos</div>
          <div class="stat-value">${stats.totalPedidos}</div>
          <div class="stat-sub">${stats.pedidosPendientes} pendiente(s)</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon success">${icon('money', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Vendido</div>
          <div class="stat-value">${formatCurrency(stats.totalVendido)}</div>
          <div class="stat-sub">Pedidos activos</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon warning">${icon('invoice', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Sin Factura</div>
          <div class="stat-value">${formatCurrency(stats.totalSinFactura)}</div>
          <div class="stat-sub">70% del total</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon info">${icon('checkDoc', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Facturado</div>
          <div class="stat-value">${formatCurrency(stats.totalFacturado)}</div>
          <div class="stat-sub">30% + 24,5% recargo</div>
        </div>
      </div>
    </div>

    <div class="grid grid-4 mb-md">
      <div class="stat-card">
        <div class="stat-icon success">${icon('check', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Cobrado</div>
          <div class="stat-value text-success">${formatCurrency(stats.totalCobrado)}</div>
          <div class="stat-sub">Pagos registrados</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon danger">${icon('clock', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Saldo Pendiente</div>
          <div class="stat-value text-danger">${formatCurrency(stats.totalPendiente)}</div>
          <div class="stat-sub">Por cobrar</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon accent">${icon('checkDoc', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">Confirmados</div>
          <div class="stat-value">${stats.pedidosConfirmados}</div>
          <div class="stat-sub">Pedidos confirmados</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon warning">${icon('refresh', '', 24)}</div>
        <div class="stat-content">
          <div class="stat-label">En Proceso</div>
          <div class="stat-value">${stats.pedidosPendientes}</div>
          <div class="stat-sub">Activos sin entregar</div>
        </div>
      </div>
    </div>

    <!-- Acciones rápidas -->
    <div class="card mt-md">
      <div class="card-header">
        <span class="card-title">Acciones rápidas</span>
      </div>
      <div class="grid grid-4">
        <button class="btn btn-secondary btn-lg" id="dash-go-orders" style="flex-direction:column;gap:12px;padding:24px 16px;height:auto;">
          ${icon('orders', '', 28)}
          <span>Ver Pedidos</span>
        </button>
        <button class="btn btn-secondary btn-lg" id="dash-go-products" style="flex-direction:column;gap:12px;padding:24px 16px;height:auto;">
          ${icon('products', '', 28)}
          <span>Productos</span>
        </button>
        <button class="btn btn-secondary btn-lg" id="dash-go-payments" style="flex-direction:column;gap:12px;padding:24px 16px;height:auto;">
          ${icon('payments', '', 28)}
          <span>Pagos</span>
        </button>
        <button class="btn btn-secondary btn-lg" id="dash-go-colors" style="flex-direction:column;gap:12px;padding:24px 16px;height:auto;">
          ${icon('colors', '', 28)}
          <span>Colores</span>
        </button>
      </div>
    </div>
  `;

  document.getElementById('dash-new-order')?.addEventListener('click', () => Router.navigate('order-form'));
  document.getElementById('dash-go-orders')?.addEventListener('click', () => Router.navigate('orders'));
  document.getElementById('dash-go-products')?.addEventListener('click', () => Router.navigate('products'));
  document.getElementById('dash-go-payments')?.addEventListener('click', () => Router.navigate('payments'));
  document.getElementById('dash-go-colors')?.addEventListener('click', () => Router.navigate('colors'));
}

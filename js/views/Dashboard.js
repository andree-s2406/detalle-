// ============================================================
//  DASHBOARD VIEW — Impeccable Standards
// ============================================================

import { getOrderStats } from '../models/Order.js';
import { formatCurrency } from '../components/Formatter.js';
import { Router } from '../router.js';
import { icon } from '../components/Icons.js';

export function renderDashboard() {
  const stats = getOrderStats();
  const view  = document.getElementById('app-view');

  const fechaHoy = new Date().toLocaleDateString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
  const fechaCapitalizada = fechaHoy.charAt(0).toUpperCase() + fechaHoy.slice(1);

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">Resumen general del sistema — ${fechaCapitalizada}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="dash-new-order">
          ${icon('plus')} Nuevo Pedido
        </button>
      </div>
    </div>

    <!-- Métricas principales -->
    <div class="grid grid-4 mb-lg">
      <div class="stat-card">
        <div class="stat-icon accent">${icon('box', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Pedidos</div>
          <div class="stat-value">${stats.totalPedidos}</div>
          <div class="stat-sub">${stats.pedidosPendientes} pedido(s) pendientes</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon success">${icon('money', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Facturado/Vendido</div>
          <div class="stat-value">${formatCurrency(stats.totalVendido)}</div>
          <div class="stat-sub">Pedidos activos</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon warning">${icon('invoice', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">Sin Factura (70%)</div>
          <div class="stat-value">${formatCurrency(stats.totalSinFactura)}</div>
          <div class="stat-sub">Base imponible estimada</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon info">${icon('checkDoc', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">Facturado (30% + Rec.)</div>
          <div class="stat-value">${formatCurrency(stats.totalFacturado)}</div>
          <div class="stat-sub">30% base + 24,5% recargo</div>
        </div>
      </div>
    </div>

    <!-- Métricas de Cobro y Operación -->
    <div class="grid grid-4 mb-lg">
      <div class="stat-card">
        <div class="stat-icon success">${icon('check', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">Total Cobrado</div>
          <div class="stat-value text-success">${formatCurrency(stats.totalCobrado)}</div>
          <div class="stat-sub">Pagos registrados</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon danger">${icon('clock', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">Saldo Pendiente</div>
          <div class="stat-value text-danger">${formatCurrency(stats.totalPendiente)}</div>
          <div class="stat-sub">Por recaudar</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon accent">${icon('checkDoc', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">Confirmados</div>
          <div class="stat-value">${stats.pedidosConfirmados}</div>
          <div class="stat-sub">Listos para procesar</div>
        </div>
      </div>

      <div class="stat-card">
        <div class="stat-icon warning">${icon('refresh', '', 22)}</div>
        <div class="stat-content">
          <div class="stat-label">En Producción</div>
          <div class="stat-value">${stats.pedidosPendientes}</div>
          <div class="stat-sub">En taller / sin entregar</div>
        </div>
      </div>
    </div>

    <!-- Acciones Rápidas con Action Tiles -->
    <div class="card mt-md">
      <div class="card-header">
        <span class="card-title">${icon('dashboard')} Acceso rápido al catálogo y operaciones</span>
      </div>
      <div class="grid grid-4">
        <div class="action-tile" id="dash-go-orders">
          <div class="action-tile-icon">${icon('orders', '', 22)}</div>
          <span>Ver Pedidos</span>
        </div>
        <div class="action-tile" id="dash-go-products">
          <div class="action-tile-icon">${icon('products', '', 22)}</div>
          <span>Catálogo Productos</span>
        </div>
        <div class="action-tile" id="dash-go-payments">
          <div class="action-tile-icon">${icon('payments', '', 22)}</div>
          <span>Historial de Pagos</span>
        </div>
        <div class="action-tile" id="dash-go-colors">
          <div class="action-tile-icon">${icon('colors', '', 22)}</div>
          <span>Paleta de Colores</span>
        </div>
      </div>
    </div>
  `;

  document.getElementById('dash-new-order')?.addEventListener('click', () => Router.navigate('order-form'));
  document.getElementById('dash-go-orders')?.addEventListener('click', () => Router.navigate('orders'));
  document.getElementById('dash-go-products')?.addEventListener('click', () => Router.navigate('products'));
  document.getElementById('dash-go-payments')?.addEventListener('click', () => Router.navigate('payments'));
  document.getElementById('dash-go-colors')?.addEventListener('click', () => Router.navigate('colors'));
}

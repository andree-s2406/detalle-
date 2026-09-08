// ============================================================
//  APP MAIN — Inicialización de la aplicación y orquestación
// ============================================================

import { initDatabase } from './db/database.js';
import { Router }          from './router.js';
import { renderDashboard } from './views/Dashboard.js';
import { renderProducts }  from './views/Products.js';
import { renderColors }    from './views/Colors.js';
import { renderOrders }    from './views/Orders.js';
import { renderOrderForm } from './views/OrderForm.js';
import { renderOrderDetail } from './views/OrderDetail.js';
import { renderPayments }  from './views/Payments.js';
import { renderSettings }  from './views/Settings.js';
import { initGoogleAuth, isConnected }  from './sync/google-auth.js';
import { GoogleSheetsSync } from './sync/google-sheets.js';

// ── Inicialización al cargar la ventana ──────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    _showSplashLoader('Iniciando base de datos...');

    await initDatabase();

    // Auto-reconectar Google Drive y sincronizar cambios en segundo plano
    initGoogleAuth(true)
      .then(async connected => {
        if (connected) {
          try {
            await GoogleSheetsSync.importAllFromSheets();
            Router.resolveHash();
          } catch (syncErr) {
            console.warn('[APP] Auto-sync inicial:', syncErr.message);
          }
        }
      })
      .catch(e => console.log('[APP] Google Auth init:', e.message));

    _setupRouter();
    _setupGlobalUI();

    _hideSplashLoader();
    Router.resolveHash();

    // Marcar que la app arrancó bien (para el diagnóstico)
    window.__app_initialized__ = true;

  } catch (error) {
    console.error('[APP] Error fatal de inicialización:', error);
    _showFatalError(error);
  }
});

// ── Router ────────────────────────────────────────────────────
function _setupRouter() {
  Router
    .on('dashboard',     renderDashboard)
    .on('orders',        renderOrders)
    .on('order-form',    renderOrderForm)
    .on('order-detail',  renderOrderDetail)
    .on('payments',      renderPayments)
    .on('products',      renderProducts)
    .on('colors',        renderColors)
    .on('settings',      renderSettings)
    .onNavigate((routeName, params) => {
      _updateActiveSidebarItem(routeName);
      _updateBreadcrumbs(routeName, params);
      // Cerrar sidebar en móviles
      document.getElementById('app-sidebar')?.classList.remove('open');
      document.getElementById('sidebar-overlay')?.classList.remove('visible');
    });

  window.addEventListener('popstate', () => Router.resolveHash());

  // Exponer Router globalmente para los onclick inline de las vistas
  window.Router = Router;
}

// ── UI global ─────────────────────────────────────────────────
function _setupGlobalUI() {
  // Clicks del sidebar
  document.querySelectorAll('.nav-item[data-route]').forEach(item => {
    item.addEventListener('click', () => {
      const route = item.getAttribute('data-route');
      if (route) Router.navigate(route);
    });
  });

  // Botón hamburguesa (móvil)
  const menuBtn = document.getElementById('mobile-menu-toggle');
  const sidebar  = document.getElementById('app-sidebar');
  const overlay  = document.getElementById('sidebar-overlay');

  if (menuBtn && sidebar && overlay) {
    const toggle = () => {
      sidebar.classList.toggle('open');
      overlay.classList.toggle('visible');
    };
    menuBtn.addEventListener('click', toggle);
    overlay.addEventListener('click', toggle);
  }
}

// ── Sidebar activo + breadcrumb ───────────────────────────────
function _updateActiveSidebarItem(routeName) {
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
  const mapRoute = {
    'dashboard': 'dashboard',
    'orders': 'orders',
    'order-form': 'orders',
    'order-detail': 'orders',
    'payments': 'payments',
    'products': 'products',
    'colors': 'colors',
    'settings': 'settings',
  };
  const key = mapRoute[routeName] || routeName;
  document.querySelector(`.nav-item[data-route="${key}"]`)?.classList.add('active');
}

function _updateBreadcrumbs(routeName, params) {
  const titles = {
    'dashboard':    'Dashboard',
    'orders':       'Pedidos',
    'order-form':   params?.id ? 'Editar Pedido' : 'Nuevo Pedido',
    'order-detail': 'Detalle de Pedido',
    'payments':     'Pagos',
    'products':     'Productos',
    'colors':       'Colores',
    'settings':     'Configuración',
  };
  const el = document.getElementById('breadcrumb-current');
  if (el) el.textContent = titles[routeName] || routeName;
}

// ── Splash loader ─────────────────────────────────────────────
function _showSplashLoader(msg = 'Cargando...') {
  document.getElementById('splash-loader')?.remove();

  const loader = document.createElement('div');
  loader.id = 'splash-loader';
  loader.className = 'loading-overlay';
  loader.innerHTML = `
    <div class="app-loading-spinner"></div>
    <div class="app-loading-msg">${msg}</div>
  `;
  document.body.appendChild(loader);
}

function _hideSplashLoader() {
  const el = document.getElementById('splash-loader');
  if (!el) return;
  el.style.transition = 'opacity .25s';
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 260);
}

// ── Error fatal ───────────────────────────────────────────────
function _showFatalError(error) {
  _hideSplashLoader();
  const view = document.getElementById('app-view');
  if (!view) return;

  const msg = String(error?.message || error || 'Error desconocido')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  view.innerHTML = `
    <div class="app-diagnostic-card">
      <div class="app-diagnostic-icon">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      </div>
      <h2 class="app-diagnostic-title">Error al inicializar la aplicación</h2>
      <p class="app-diagnostic-text">
        Ocurrió un error inesperado al arrancar. Revisá la consola del navegador (F12) para el detalle exacto.
      </p>
      <pre class="app-diagnostic-box text-mono text-xs">${msg}</pre>
      <button onclick="location.reload()" class="btn btn-primary btn-lg mt-md">
        Reintentar
      </button>
    </div>
  `;
}

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
import { initGoogleAuth }  from './sync/google-auth.js';

// ── Inicialización al cargar la ventana ──────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    _showSplashLoader('Iniciando base de datos...');

    await initDatabase();

    // Auto-reconectar Google Drive en segundo plano si estaba configurado
    initGoogleAuth(true).catch(e => console.log('[APP] Google Auth init:', e.message));

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
  // Quitar si ya existe
  document.getElementById('splash-loader')?.remove();

  const loader = document.createElement('div');
  loader.id = 'splash-loader';
  loader.style.cssText = `
    position:fixed;inset:0;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:16px;
    background:var(--c-bg-page,#0d1117);z-index:9999;
    color:var(--c-text-1,#e8edf8);font-family:sans-serif;
  `;
  loader.innerHTML = `
    <div style="width:40px;height:40px;border:3px solid rgba(108,142,245,.2);
                border-top-color:#6c8ef5;border-radius:50%;
                animation:spin .8s linear infinite;"></div>
    <div style="font-weight:500;font-size:15px;">${msg}</div>
    <style>@keyframes spin{to{transform:rotate(360deg)}}</style>
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

  // Convertir el error a string de forma segura (sin escapeHtml)
  const msg = String(error?.message || error || 'Error desconocido')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  view.innerHTML = `
    <div style="max-width:560px;margin:60px auto;padding:32px;
                background:#1a1a2e;border:2px solid #f55b5b;border-radius:12px;
                color:#e8edf8;font-family:sans-serif;text-align:center;line-height:1.7;">
      <div style="font-size:44px;margin-bottom:12px;">❌</div>
      <h2 style="color:#f55b5b;font-size:20px;margin-bottom:8px;">Error al inicializar la aplicación</h2>
      <p style="color:#9aadcc;font-size:13px;margin-bottom:16px;">
        Ocurrió un error inesperado al arrancar. Revisá la consola del navegador (F12) para el detalle exacto.
      </p>
      <pre style="background:rgba(0,0,0,.3);padding:12px;border-radius:8px;
                  font-size:12px;text-align:left;overflow:auto;max-height:200px;
                  border:1px solid #2e3a52;">${msg}</pre>
      <button onclick="location.reload()"
              style="margin-top:20px;padding:10px 28px;background:#6c8ef5;
                     color:#fff;border:none;border-radius:8px;font-size:14px;
                     cursor:pointer;font-weight:600;">
        🔄 Reintentar
      </button>
    </div>
  `;
}

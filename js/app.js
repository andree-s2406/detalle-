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
    background:var(--c-bg,#080c14);z-index:9999;
    color:var(--c-text,#f8fafc);font-family:var(--font-sans,sans-serif);
  `;
  loader.innerHTML = `
    <div style="width:40px;height:40px;border:3px solid rgba(56,117,246,.2);
                border-top-color:#3875f6;border-radius:50%;
                animation:spin .8s linear infinite;"></div>
    <div style="font-weight:500;font-size:15px;color:var(--c-text-2,#cbd5e1);">${msg}</div>
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
                background:var(--c-bg-2,#0d1322);border:1px solid rgba(239,68,68,0.3);border-radius:16px;
                color:var(--c-text,#f8fafc);font-family:var(--font-sans,sans-serif);text-align:center;line-height:1.7;box-shadow:0 24px 48px rgba(0,0,0,0.65);">
      <div style="font-size:44px;margin-bottom:12px;">❌</div>
      <h2 style="color:var(--c-danger,#ef4444);font-size:20px;margin-bottom:8px;font-weight:700;">Error al inicializar la aplicación</h2>
      <p style="color:var(--c-text-3,#8295b5);font-size:13px;margin-bottom:16px;">
        Ocurrió un error inesperado al arrancar. Revisá la consola del navegador (F12) para el detalle exacto.
      </p>
      <pre style="background:rgba(0,0,0,.4);padding:12px;border-radius:8px;
                  font-size:12px;text-align:left;overflow:auto;max-height:200px;
                  border:1px solid var(--c-border);font-family:var(--font-mono,monospace);">${msg}</pre>
      <button onclick="location.reload()"
              style="margin-top:20px;padding:10px 28px;background:var(--c-accent,#3875f6);
                     color:#fff;border:none;border-radius:8px;font-size:14px;
                     cursor:pointer;font-weight:600;box-shadow:0 4px 14px rgba(56,117,246,0.4);">
        Reintentar
      </button>
    </div>
  `;
}

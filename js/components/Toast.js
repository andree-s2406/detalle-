// ============================================================
//  TOAST — Notificaciones temporales con Iconos SVG
// ============================================================

import { icon } from './Icons.js';

let _container = null;

function getContainer() {
  if (!_container) {
    _container = document.getElementById('toast-container');
    if (!_container) {
      _container = document.createElement('div');
      _container.id = 'toast-container';
      document.body.appendChild(_container);
    }
  }
  return _container;
}

export const Toast = {
  show({ type = 'info', title, message, duration = 4000 } = {}) {
    const iconNames = {
      success: 'check',
      error: 'close',
      warning: 'alertTriangle',
      info: 'info'
    };
    const iconSvg = icon(iconNames[type] || 'info', '', 18);
    const container = getContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon" style="display:inline-flex;align-items:center;">${iconSvg}</span>
      <div class="toast-content">
        ${title ? `<div class="toast-title">${title}</div>` : ''}
        ${message ? `<div class="toast-message">${message}</div>` : ''}
      </div>
    `;

    container.appendChild(toast);

    const remove = () => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    };

    toast.addEventListener('click', remove);
    setTimeout(remove, duration);
  },

  success(title, message)  { this.show({ type: 'success', title, message }); },
  error(title, message)    { this.show({ type: 'error',   title, message }); },
  warning(title, message)  { this.show({ type: 'warning', title, message }); },
  info(title, message)     { this.show({ type: 'info',    title, message }); },
};

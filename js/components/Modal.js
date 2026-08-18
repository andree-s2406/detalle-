// ============================================================
//  MODAL — Modal reutilizable con soporte de confirmación y SVG
// ============================================================

import { icon } from './Icons.js';

let _activeModal = null;

export const Modal = {
  // --------------------------------------------------------
  // Mostrar modal genérico
  // --------------------------------------------------------
  show({ title, content, size = 'modal-md', footer = '', onClose } = {}) {
    this.close();

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    backdrop.id = 'modal-backdrop';

    backdrop.innerHTML = `
      <div class="modal ${size}" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal-header">
          <h3 class="modal-title">${title}</h3>
          <button class="modal-close" id="modal-close-btn" aria-label="Cerrar">
            ${icon('close', '', 18)}
          </button>
        </div>
        <div class="modal-body" id="modal-body">
          ${content}
        </div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    document.body.appendChild(backdrop);
    _activeModal = { backdrop, onClose };

    // Cerrar con botón
    document.getElementById('modal-close-btn').addEventListener('click', () => this.close());

    // Cerrar con click fuera
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    // Cerrar con ESC
    document.addEventListener('keydown', _handleEsc);

    // Focus trap
    setTimeout(() => {
      const firstFocusable = backdrop.querySelector('input, select, textarea, button:not(#modal-close-btn)');
      if (firstFocusable) firstFocusable.focus();
    }, 50);

    return backdrop;
  },

  // --------------------------------------------------------
  // Modal de confirmación
  // --------------------------------------------------------
  confirm({
    title = '¿Estás seguro?',
    message,
    iconName = 'alertTriangle',
    confirmText = 'Confirmar',
    confirmClass = 'btn-danger',
    cancelText = 'Cancelar'
  } = {}) {
    return new Promise((resolve) => {
      let resolved = false;
      const doResolve = (val) => {
        if (!resolved) {
          resolved = true;
          resolve(val);
        }
      };

      const footer = `
        <button class="btn btn-ghost" id="modal-cancel">${cancelText}</button>
        <button class="btn ${confirmClass}" id="modal-confirm">${confirmText}</button>
      `;

      const iconSvg = icon(iconName, '', 36) || icon('alertTriangle', '', 36);

      this.show({
        title,
        size: 'modal-sm',
        content: `
          <div class="confirm-icon" style="color:var(--c-accent);display:flex;justify-content:center;margin-bottom:12px;">${iconSvg}</div>
          <p class="confirm-message">${message}</p>
        `,
        footer,
        onClose: () => doResolve(false),
      });

      document.getElementById('modal-confirm').addEventListener('click', () => {
        doResolve(true);
        this.close();
      });

      document.getElementById('modal-cancel').addEventListener('click', () => {
        doResolve(false);
        this.close();
      });
    });
  },

  // --------------------------------------------------------
  // Cerrar modal activo
  // --------------------------------------------------------
  close() {
    if (_activeModal) {
      const { backdrop, onClose } = _activeModal;
      backdrop.style.animation = 'fadeIn 0.15s ease reverse';
      setTimeout(() => backdrop.remove(), 150);
      _activeModal = null;
      document.removeEventListener('keydown', _handleEsc);
      if (onClose) onClose();
    }
  },

  // --------------------------------------------------------
  // Acceder al body del modal actual
  // --------------------------------------------------------
  getBody() {
    return document.getElementById('modal-body');
  },
};

function _handleEsc(e) {
  if (e.key === 'Escape') Modal.close();
}

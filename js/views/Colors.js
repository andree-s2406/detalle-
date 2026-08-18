// ============================================================
//  COLORS VIEW — Gestión de colores globales con SVG
// ============================================================

import {
  getAllColors, createColor, updateColor,
  toggleColorActive, deleteOrDeactivateColor
} from '../models/Product.js';
import { Modal }  from '../components/Modal.js';
import { Toast }  from '../components/Toast.js';
import { escapeHtml, colorDot, COLOR_PALETTE } from '../components/Formatter.js';
import { icon } from '../components/Icons.js';

export function renderColors() {
  const view = document.getElementById('app-view');
  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Colores</h1>
        <p class="page-subtitle">Administración de colores disponibles para productos</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-primary" id="btn-new-color">
          ${icon('plus')} Nuevo Color
        </button>
      </div>
    </div>
    <div id="colors-container"></div>
  `;

  _renderColorsGrid();
  document.getElementById('btn-new-color').addEventListener('click', () => openColorForm(null));
}

function _renderColorsGrid() {
  const container = document.getElementById('colors-container');
  if (!container) return;

  const allColors = getAllColors(true);

  if (allColors.length === 0) {
    container.innerHTML = `
      <div class="card">
        <div class="table-empty">
          <div class="empty-icon">${icon('colors', '', 36)}</div>
          <div class="empty-text">No hay colores registrados</div>
          <div class="empty-sub">Creá el primer color</div>
        </div>
      </div>`;
    return;
  }

  const cards = allColors.map(c => `
    <div class="card" style="display:flex;align-items:center;gap:var(--sp-md);padding:var(--sp-md);">
      <div style="width:36px;height:36px;border-radius:var(--r-md);background:${COLOR_PALETTE[c.nombre] || '#6b7fa0'};border:2px solid rgba(255,255,255,0.12);flex-shrink:0;"></div>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:var(--fs-md);">${escapeHtml(c.nombre)}</div>
        <div style="font-size:var(--fs-xs);color:var(--c-text-3);">${c.activo ? 'Activo' : 'Inactivo'}</div>
      </div>
      <div class="flex gap-sm">
        <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick="window._editColor('${c.id}')">
          ${icon('edit', '', 14)}
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" title="${c.activo ? 'Desactivar' : 'Activar'}" onclick="window._toggleColor('${c.id}')">
          <span style="color:${c.activo ? 'var(--c-danger)' : 'var(--c-success)'};display:inline-flex;">
            ${icon('power', '', 14)}
          </span>
        </button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar" onclick="window._deleteColor('${c.id}')">
          ${icon('trash', '', 14)}
        </button>
      </div>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="grid grid-3">${cards}</div>
    <div style="margin-top:var(--sp-sm);font-size:var(--fs-sm);color:var(--c-text-3);">${allColors.length} color(es) registrado(s)</div>
  `;
}

export function openColorForm(id, nombre = '') {
  const isEdit = !!id;

  Modal.show({
    title: isEdit ? 'Editar color' : 'Nuevo color',
    size: 'modal-sm',
    content: `
      <form id="color-form">
        <div class="form-group">
          <label class="form-label required">Nombre del color</label>
          <input type="text" class="form-control" id="cf-nombre" value="${escapeHtml(nombre)}"
                 placeholder="Ej: Gris, Beige, Vision..." required autofocus>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
      <button class="btn btn-primary" id="cf-save">
        ${isEdit ? `${icon('save')} Guardar` : `${icon('plus')} Crear`}
      </button>
    `,
  });

  window.Modal = Modal;

  document.getElementById('cf-save').addEventListener('click', async () => {
    const nombreVal = document.getElementById('cf-nombre').value.trim();
    if (!nombreVal) {
      Toast.error('Campo requerido', 'Ingresá el nombre del color');
      return;
    }

    try {
      if (isEdit) {
        await updateColor(id, nombreVal);
        Toast.success('Color actualizado', nombreVal);
      } else {
        await createColor(nombreVal);
        Toast.success('Color creado', nombreVal);
      }
      Modal.close();
      _renderColorsGrid();
    } catch(e) {
      Toast.error('Error', e.message || 'No se pudo guardar el color');
    }
  });

  // Permitir Enter
  document.getElementById('cf-nombre').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('cf-save').click();
  });
}

window._editColor = function(id) {
  const allColors = getAllColors(true);
  const c = allColors.find(x => x.id === id);
  if (c) openColorForm(id, c.nombre);
};

window._toggleColor = async function(id) {
  await toggleColorActive(id);
  Toast.info('Estado cambiado');
  _renderColorsGrid();
};

window._deleteColor = async function(id) {
  const allColors = getAllColors(true);
  const c = allColors.find(x => x.id === id);
  if (!c) return;

  const confirmed = await Modal.confirm({
    title: 'Eliminar color',
    message: `¿Eliminar el color <strong>${escapeHtml(c.nombre)}</strong>?<br><br>
      Si está en uso, se desactivará en lugar de eliminarse.`,
    iconName: 'colors',
    confirmText: 'Eliminar',
    confirmClass: 'btn-danger',
  });

  if (!confirmed) return;

  const result = await deleteOrDeactivateColor(id);
  if (result === 'deleted') {
    Toast.success('Color eliminado', c.nombre);
  } else {
    Toast.warning('Color desactivado', `${c.nombre} está en uso y fue desactivado`);
  }
  _renderColorsGrid();
};

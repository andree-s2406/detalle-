// ============================================================
//  PRODUCTS VIEW — CRUD completo de productos con colores y SVG
// ============================================================

import {
  getAllProducts, getProductById, createProduct, updateProduct,
  toggleProductActive, deleteOrDeactivateProduct,
  getAllColors, getProductColors
} from '../models/Product.js';
import { Modal }  from '../components/Modal.js';
import { Toast }  from '../components/Toast.js';
import {
  formatCurrency, formatDate, activeBadge, colorDot,
  debounce, escapeHtml, COLOR_PALETTE
} from '../components/Formatter.js';
import { icon } from '../components/Icons.js';

let _searchQuery = '';
let _showInactive = false;

export function renderProducts() {
  const view = document.getElementById('app-view');
  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Productos</h1>
        <p class="page-subtitle">Administración del catálogo de productos y precios</p>
      </div>
      <div class="page-actions">
        <label class="toggle-wrapper" style="font-size:13px;color:var(--c-text-3);">
          <span>Ver inactivos</span>
          <label class="toggle">
            <input type="checkbox" id="toggle-inactive" ${_showInactive ? 'checked' : ''}>
            <span class="toggle-slider"></span>
          </label>
        </label>
        <button class="btn btn-primary" id="btn-new-product">
          ${icon('plus')} Nuevo Producto
        </button>
      </div>
    </div>

    <div class="search-bar">
      <div class="search-input-wrapper">
        <span class="search-icon">${icon('search', '', 16)}</span>
        <input type="text" class="form-control" id="product-search" placeholder="Buscar productos..." value="${escapeHtml(_searchQuery)}">
      </div>
    </div>

    <div id="products-table-container"></div>
  `;

  _renderProductTable();

  document.getElementById('btn-new-product').addEventListener('click', () => openProductForm(null));

  document.getElementById('product-search').addEventListener('input', debounce(e => {
    _searchQuery = e.target.value;
    _renderProductTable();
  }, 250));

  document.getElementById('toggle-inactive').addEventListener('change', e => {
    _showInactive = e.target.checked;
    _renderProductTable();
  });
}

function _renderProductTable() {
  const products = getAllProducts(_showInactive).filter(p =>
    !_searchQuery || p.nombre.toLowerCase().includes(_searchQuery.toLowerCase())
  );

  const container = document.getElementById('products-table-container');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div class="table-wrapper">
        <div class="table-empty">
          <div class="empty-icon">${icon('box', '', 36)}</div>
          <div class="empty-text">No se encontraron productos</div>
          <div class="empty-sub">${_searchQuery ? 'Probá con otra búsqueda' : 'Creá el primer producto'}</div>
        </div>
      </div>`;
    return;
  }

  const rows = products.map(p => {
    const coloresNombres = p.colores_nombres ? p.colores_nombres.split('|') : [];
    const coloresHtml = coloresNombres.slice(0, 6).map(c =>
      `<span class="chip chip-color">${colorDot(c)}<span>${escapeHtml(c)}</span></span>`
    ).join(' ');
    const masColores = coloresNombres.length > 6
      ? `<span class="chip">+${coloresNombres.length - 6}</span>` : '';

    return `
      <tr data-id="${p.id}">
        <td><strong>${escapeHtml(p.nombre)}</strong></td>
        <td class="td-mono td-right"><strong>${formatCurrency(p.precio)}</strong></td>
        <td style="flex-wrap:wrap;gap:4px;">${coloresHtml}${masColores}</td>
        <td>${activeBadge(p.activo)}</td>
        <td class="text-muted text-sm">${formatDate(p.updated_at)}</td>
        <td class="td-actions">
          <div class="flex gap-sm">
            <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick="window._editProduct('${p.id}')">
              ${icon('edit', '', 14)}
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" title="${p.activo ? 'Desactivar' : 'Activar'}" onclick="window._toggleProduct('${p.id}')">
              <span style="color:${p.activo ? 'var(--c-danger)' : 'var(--c-success)'};display:inline-flex;">
                ${icon('power', '', 14)}
              </span>
            </button>
            <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar" onclick="window._deleteProduct('${p.id}')">
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
            <th>Nombre</th>
            <th class="td-right">Precio actual</th>
            <th>Colores</th>
            <th>Estado</th>
            <th>Modificado</th>
            <th class="td-actions">Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="margin-top:var(--sp-sm);font-size:var(--fs-sm);color:var(--c-text-3);">
      ${products.length} producto(s) ${_showInactive ? '' : 'activo(s)'}
    </div>
  `;
}

// --------------------------------------------------------
//  Formulario de producto
// --------------------------------------------------------

export function openProductForm(productId) {
  const isEdit = !!productId;
  const product = isEdit ? getProductById(productId) : null;
  const allColors = getAllColors(false);

  const productColors = product?.colores?.map(c => c.id) ?? [];

  const colorsCheckboxes = allColors.map(c => `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;padding:6px 10px;border-radius:var(--r-sm);transition:background var(--t-fast);"
           onmouseover="this.style.background='var(--c-bg-3)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${c.id}" ${productColors.includes(c.id) ? 'checked' : ''}
             style="width:16px;height:16px;accent-color:var(--c-accent);cursor:pointer;">
      ${colorDot(c.nombre)}
      <span style="font-size:var(--fs-base);">${escapeHtml(c.nombre)}</span>
    </label>
  `).join('');

  Modal.show({
    title: isEdit ? `Editar producto` : 'Nuevo producto',
    size: 'modal-md',
    content: `
      <form id="product-form">
        <div class="form-group">
          <label class="form-label required">Nombre del producto</label>
          <input type="text" class="form-control" id="pf-nombre" value="${escapeHtml(product?.nombre ?? '')}" placeholder="Ej: BED XL" required>
        </div>
        <div class="form-group">
          <label class="form-label required">Precio actual</label>
          <input type="number" class="form-control" id="pf-precio" value="${product?.precio ?? ''}" placeholder="0.00" step="0.01" min="0" required>
        </div>
        <div class="form-group">
          <label class="form-label">Colores disponibles</label>
          <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:2px;max-height:220px;overflow-y:auto;background:var(--c-bg-3);border:1px solid var(--c-border);border-radius:var(--r-md);padding:var(--sp-sm);">
            ${colorsCheckboxes || '<span class="text-muted text-sm" style="padding:8px;">No hay colores disponibles. Creá colores primero.</span>'}
          </div>
        </div>
      </form>
    `,
    footer: `
      <button class="btn btn-ghost" onclick="Modal.close()">Cancelar</button>
      <button class="btn btn-primary" id="pf-save">
        ${isEdit ? `${icon('save')} Guardar cambios` : `${icon('plus')} Crear producto`}
      </button>
    `,
  });

  // Importar Modal al scope del onclick
  window.Modal = Modal;

  document.getElementById('pf-save').addEventListener('click', async () => {
    const nombre = document.getElementById('pf-nombre').value.trim();
    const precio = parseFloat(document.getElementById('pf-precio').value);
    const colorChecks = document.querySelectorAll('#modal-body input[type="checkbox"]:checked');
    const colores = Array.from(colorChecks).map(cb => cb.value);

    if (!nombre) {
      Toast.error('Campo requerido', 'Ingresá el nombre del producto');
      return;
    }
    if (isNaN(precio) || precio < 0) {
      Toast.error('Precio inválido', 'Ingresá un precio válido');
      return;
    }

    try {
      if (isEdit) {
        await updateProduct(productId, { nombre, precio, colores });
        Toast.success('Producto actualizado', `${nombre} fue actualizado correctamente`);
      } else {
        await createProduct({ nombre, precio, colores });
        Toast.success('Producto creado', `${nombre} fue creado correctamente`);
      }
      Modal.close();
      _renderProductTable();
    } catch(e) {
      Toast.error('Error', e.message);
    }
  });
}

// ---- Handlers globales (llamados desde onclick en la tabla) ----
window._editProduct = function(id) {
  openProductForm(id);
};

window._toggleProduct = async function(id) {
  const newState = await toggleProductActive(id);
  Toast.info(newState ? 'Producto activado' : 'Producto desactivado');
  _renderProductTable();
};

window._deleteProduct = async function(id) {
  const p = getProductById(id);
  if (!p) return;

  const confirmed = await Modal.confirm({
    title: 'Eliminar producto',
    message: `¿Querés eliminar <strong>${escapeHtml(p.nombre)}</strong>?<br><br>
      Si el producto tiene pedidos históricos, se desactivará en lugar de eliminarse.`,
    iconName: 'trash',
    confirmText: 'Eliminar',
    confirmClass: 'btn-danger',
  });

  if (!confirmed) return;

  const result = await deleteOrDeactivateProduct(id);
  if (result === 'deleted') {
    Toast.success('Producto eliminado', p.nombre);
  } else {
    Toast.warning('Producto desactivado', `${p.nombre} tiene pedidos históricos y fue desactivado en lugar de eliminarse`);
  }
  _renderProductTable();
};

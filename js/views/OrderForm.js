// ============================================================
//  ORDER FORM VIEW — Crear / Editar pedido con líneas dinámicas
//  REGLA CRÍTICA: precio_unitario_historico se congela al agregar la línea
// ============================================================

import { getOrderById, createOrder, updateOrder, updateOrderItems } from '../models/Order.js';
import { getAllProducts, getProductColors } from '../models/Product.js';
import { Router } from '../router.js';
import { Toast }  from '../components/Toast.js';
import { Modal }  from '../components/Modal.js';
import {
  formatCurrency, formatDate, formatOrderNumber, escapeHtml,
  todayISO, uuid, colorDot, COLOR_PALETTE
} from '../components/Formatter.js';
import { calcularImportes, getPctSinFactura, getPctFacturado, getRecargoFactura } from '../config.js';
import { ORDER_STATES } from '../db/schema.js';
import { icon } from '../components/Icons.js';

// Estado local del formulario
let _order = null;        // pedido existente (si es edición)
let _items = [];          // [{ _key, id?, product_id, producto_nombre_historico, color, cantidad, precio_unitario_historico, subtotal, _isNew }]
let _products = [];       // catálogo activo

export function renderOrderForm(params = {}) {
  const { id } = params;
  _products = getAllProducts(false);

  if (id) {
    _order = getOrderById(id);
    if (!_order) {
      Toast.error('Pedido no encontrado');
      Router.navigate('orders');
      return;
    }
    // Mapear items existentes con _key para el DOM
    _items = (_order.items || []).map(item => ({
      ...item,
      _key: uuid(),
      _isNew: false,
    }));
  } else {
    _order = null;
    _items = [];
  }

  const isEdit = !!_order;
  const view = document.getElementById('app-view');

  const estadoOptions = ORDER_STATES.map(s =>
    `<option value="${s.value}" ${(!isEdit && s.value === 'borrador') || (_order?.estado === s.value) ? 'selected' : ''}>${s.label}</option>`
  ).join('');

  view.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">${isEdit ? `Editar ${formatOrderNumber(_order.numero)}` : 'Nuevo Pedido'}</h1>
        <p class="page-subtitle">${isEdit ? 'Modificá los datos del pedido. Los precios históricos existentes se conservan.' : 'Completá los datos del nuevo pedido'}</p>
      </div>
      <div class="page-actions">
        <button class="btn btn-ghost" id="btn-cancel-form">← Volver</button>
        <button class="btn btn-primary" id="btn-save-order">
          ${icon('save')} ${isEdit ? 'Guardar cambios' : 'Crear pedido'}
        </button>
      </div>
    </div>

    <div class="grid grid-2" style="gap:var(--sp-lg);align-items:start;">
      <!-- Columna principal -->
      <div style="grid-column:1/-1;">
        <!-- Datos del pedido -->
        <div class="card mb-md">
          <div class="card-header">
            <span class="card-title">📄 Datos del pedido</span>
          </div>
          <div class="form-row cols-3">
            <div class="form-group" style="margin:0;">
              <label class="form-label required">Fecha</label>
              <input type="date" class="form-control" id="of-fecha" value="${_order?.fecha ?? todayISO()}" required>
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label required">Estado</label>
              <select class="form-control" id="of-estado">${estadoOptions}</select>
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">Notas / Referencia</label>
              <input type="text" class="form-control" id="of-notas" value="${escapeHtml(_order?.notas ?? '')}" placeholder="Cliente, referencia, etc.">
            </div>
          </div>
        </div>

        <!-- Productos del pedido -->
        <div class="card mb-md">
          <div class="card-header">
            <span class="card-title">${icon('products')} Productos</span>
            ${isEdit ? '<span class="badge badge-confirmado" style="font-size:11px;">Los precios existentes NO se modifican</span>' : ''}
          </div>

          <!-- Cabecera de la tabla de ítems -->
          <div class="order-items-container" id="items-container">
            <div class="order-item-row order-item-header">
              <span>Producto</span>
              <span>Color</span>
              <span style="text-align:center;">Cantidad</span>
              <span style="text-align:right;">Precio unit.</span>
              <span style="text-align:right;">Subtotal</span>
              <span></span>
            </div>
            <div id="items-rows"></div>
          </div>

          <button class="btn btn-ghost add-item-btn" id="btn-add-item">
            ${icon('plus')} Agregar producto
          </button>
        </div>

        <!-- Saldo Anterior (Opcional) -->
        <div class="card mb-md">
          <div class="card-header">
            <span class="card-title">${icon('money')} Saldo Anterior</span>
            <span class="text-muted text-sm">Opcional — deuda previa del cliente</span>
          </div>
          <div class="form-row">
            <div class="form-group" style="margin:0;">
              <label class="form-label">Monto ($)</label>
              <input type="number" class="form-control" id="of-saldo-anterior"
                     value="${_order?.saldo_anterior_monto || ''}" placeholder="0.00" step="0.01" min="0">
            </div>
            <div class="form-group" style="margin:0;">
              <label class="form-label">Tipo de saldo</label>
              <select class="form-control" id="of-saldo-anterior-tipo">
                <option value="">— Sin saldo anterior —</option>
                <option value="efectivo" ${(_order?.saldo_anterior_tipo === 'efectivo') ? 'selected' : ''}>En Efectivo (Sin Factura)</option>
                <option value="blanco" ${(_order?.saldo_anterior_tipo === 'blanco') ? 'selected' : ''}>En Blanco (Facturado)</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Panel de totales -->
        <div id="totals-panel-container"></div>
      </div>
    </div>
  `;

  _renderAllItems();
  _renderTotals();

  document.getElementById('btn-add-item').addEventListener('click', _addNewItem);
  document.getElementById('btn-cancel-form').addEventListener('click', () => {
    if (isEdit) Router.navigate('order-detail', { id: _order.id });
    else Router.navigate('orders');
  });

  document.getElementById('btn-save-order').addEventListener('click', _saveOrder);

  // Recalcular totales cuando cambia saldo anterior
  document.getElementById('of-saldo-anterior')?.addEventListener('input', _renderTotals);
  document.getElementById('of-saldo-anterior-tipo')?.addEventListener('change', _renderTotals);
}

// --------------------------------------------------------
//  Renderizar todos los ítems
// --------------------------------------------------------
function _renderAllItems() {
  const container = document.getElementById('items-rows');
  if (!container) return;

  if (_items.length === 0) {
    container.innerHTML = `
      <div class="table-empty" style="padding:var(--sp-xl);">
        <div class="empty-icon">${icon('products', '', 36)}</div>
        <div class="empty-text">Agregá al menos un producto</div>
      </div>`;
    return;
  }

  container.innerHTML = _items.map(item => _renderItemRow(item)).join('');

  // Listeners por cada fila
  _items.forEach(item => _attachItemListeners(item._key));
}

function _renderItemRow(item) {
  const productOptions = _products.map(p =>
    `<option value="${p.id}" data-precio="${p.precio}" data-nombre="${escapeHtml(p.nombre)}"
             ${item.product_id === p.id ? 'selected' : ''}>${escapeHtml(p.nombre)}</option>`
  ).join('');

  // Obtener colores del producto seleccionado
  const colors = item.product_id ? getProductColors(item.product_id) : [];
  const colorOptions = colors.map(c =>
    `<option value="${escapeHtml(c.nombre)}" ${item.color === c.nombre ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`
  ).join('');

  // Indicador de precio histórico vs nuevo
  const precioIndicator = (!item._isNew && _order)
    ? `<div style="font-size:10px;color:var(--c-text-3);margin-top:2px;">📌 Histórico</div>`
    : `<div style="font-size:10px;color:var(--c-accent);margin-top:2px;">⚡ Actual</div>`;

  return `
    <div class="order-item-row" id="item-row-${item._key}" data-key="${item._key}">
      <!-- Producto -->
      <div>
        <select class="form-control form-control-sm" id="item-product-${item._key}">
          <option value="">— Seleccionar —</option>
          ${productOptions}
        </select>
      </div>

      <!-- Color -->
      <div>
        <select class="form-control form-control-sm" id="item-color-${item._key}">
          <option value="">— Color —</option>
          ${colorOptions}
        </select>
      </div>

      <!-- Cantidad -->
      <div>
        <input type="number" class="form-control form-control-sm" id="item-qty-${item._key}"
               value="${item.cantidad}" min="1" step="1" style="text-align:center;">
      </div>

      <!-- Precio unitario -->
      <div>
        <input type="number" class="form-control form-control-sm" id="item-precio-${item._key}"
               value="${item.precio_unitario_historico}" min="0" step="0.01"
               style="text-align:right;"
               ${!item._isNew ? 'style="background:rgba(108,142,245,0.05)"' : ''}>
        ${precioIndicator}
      </div>

      <!-- Subtotal -->
      <div class="item-subtotal" id="item-subtotal-${item._key}">
        ${formatCurrency(item.subtotal)}
      </div>

      <!-- Eliminar -->
      <div style="display:flex;justify-content:center;">
        <button class="btn btn-ghost btn-icon btn-sm" title="Eliminar línea"
                id="item-del-${item._key}" style="color:var(--c-danger);">${icon('trash', '', 14)}</button>
      </div>
    </div>
  `;
}

function _attachItemListeners(key) {
  const item = _items.find(i => i._key === key);
  if (!item) return;

  // Cambio de producto
  const prodSel = document.getElementById(`item-product-${key}`);
  if (prodSel) {
    prodSel.addEventListener('change', () => {
      const opt     = prodSel.options[prodSel.selectedIndex];
      const prodId  = opt.value;
      const nombre  = opt.dataset.nombre || '';
      const precio  = parseFloat(opt.dataset.precio) || 0;

      item.product_id = prodId;
      item.producto_nombre_historico = nombre;

      // REGLA CRÍTICA: solo actualizar precio si es ítem nuevo
      if (item._isNew) {
        item.precio_unitario_historico = precio;
      }

      // Actualizar colores disponibles
      _updateColorSelect(key, prodId, item.color);

      // Actualizar precio en campo si es nuevo
      if (item._isNew) {
        const precioInput = document.getElementById(`item-precio-${key}`);
        if (precioInput) precioInput.value = precio.toFixed(2);
      }

      _recalcItem(key);
    });
  }

  // Cambio de color
  const colorSel = document.getElementById(`item-color-${key}`);
  if (colorSel) {
    colorSel.addEventListener('change', () => {
      item.color = colorSel.value;
    });
  }

  // Cambio de cantidad
  const qtyInput = document.getElementById(`item-qty-${key}`);
  if (qtyInput) {
    qtyInput.addEventListener('input', () => {
      item.cantidad = parseFloat(qtyInput.value) || 0;
      _recalcItem(key);
    });
  }

  // Cambio de precio (manual)
  const precioInput = document.getElementById(`item-precio-${key}`);
  if (precioInput) {
    precioInput.addEventListener('input', () => {
      item.precio_unitario_historico = parseFloat(precioInput.value) || 0;
      _recalcItem(key);
    });
  }

  // Eliminar
  const delBtn = document.getElementById(`item-del-${key}`);
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      if (!item._isNew) {
        const ok = await Modal.confirm({
          title: 'Eliminar línea',
          message: `¿Eliminás la línea de <strong>${escapeHtml(item.producto_nombre_historico)}</strong>?`,
          iconName: 'trash',
          confirmText: 'Eliminar',
          confirmClass: 'btn-danger',
        });
        if (!ok) return;
      }
      _items = _items.filter(i => i._key !== key);
      _renderAllItems();
      _renderTotals();
    });
  }
}

function _updateColorSelect(key, productId, currentColor) {
  const colorSel = document.getElementById(`item-color-${key}`);
  if (!colorSel) return;

  const colors = productId ? getProductColors(productId) : [];
  colorSel.innerHTML = `<option value="">— Color —</option>` +
    colors.map(c =>
      `<option value="${escapeHtml(c.nombre)}" ${c.nombre === currentColor ? 'selected' : ''}>${escapeHtml(c.nombre)}</option>`
    ).join('');
}

function _recalcItem(key) {
  const item = _items.find(i => i._key === key);
  if (!item) return;

  item.subtotal = item.cantidad * item.precio_unitario_historico;

  const el = document.getElementById(`item-subtotal-${key}`);
  if (el) el.textContent = formatCurrency(item.subtotal);

  _renderTotals();
}

// --------------------------------------------------------
//  Agregar nuevo ítem
// --------------------------------------------------------
function _addNewItem() {
  const newItem = {
    _key: uuid(),
    _isNew: true,
    id: null,
    product_id: '',
    producto_nombre_historico: '',
    color: '',
    cantidad: 1,
    precio_unitario_historico: 0,
    subtotal: 0,
  };

  _items.push(newItem);
  _renderAllItems();
  _renderTotals();

  // Scroll al nuevo ítem
  setTimeout(() => {
    const row = document.getElementById(`item-row-${newItem._key}`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 50);
}

// --------------------------------------------------------
//  Panel de totales
// --------------------------------------------------------
function _renderTotals() {
  const container = document.getElementById('totals-panel-container');
  if (!container) return;

  const subtotalItems = _items.reduce((s, i) => s + (i.subtotal || 0), 0);
  const { sinFactura: baseSF, facturado: baseF } = calcularImportes(subtotalItems);

  // Leer saldo anterior del formulario
  const saldoAntMonto = parseFloat(document.getElementById('of-saldo-anterior')?.value || 0) || 0;
  const saldoAntTipo  = document.getElementById('of-saldo-anterior-tipo')?.value || '';

  let sinFactura = baseSF;
  let facturado  = baseF;

  if (saldoAntMonto > 0 && saldoAntTipo === 'efectivo') {
    sinFactura += saldoAntMonto;
  } else if (saldoAntMonto > 0 && saldoAntTipo === 'blanco') {
    facturado += saldoAntMonto;
  }

  const hasSaldo = saldoAntMonto > 0 && saldoAntTipo;
  const total = subtotalItems + (hasSaldo ? saldoAntMonto : 0);

  const pctSF = (getPctSinFactura() * 100).toFixed(0);
  const pctF  = (getPctFacturado() * 100).toFixed(0);
  const rec   = (getRecargoFactura() * 100).toFixed(1);

  container.innerHTML = `
    <div class="totals-panel">
      <div class="totals-row">
        <span class="label">Subtotal ítems</span>
        <span class="amount">${formatCurrency(subtotalItems)}</span>
      </div>
      ${hasSaldo ? `
        <div class="totals-row" style="background:rgba(108,142,245,0.06);border-radius:6px;padding:6px 12px;">
          <span class="label">${icon('money', '', 14)} Saldo anterior (${saldoAntTipo === 'efectivo' ? 'Efectivo' : 'En blanco'})</span>
          <span class="amount" style="color:var(--c-accent);font-weight:600;">${formatCurrency(saldoAntMonto)}</span>
        </div>
      ` : ''}
      <div class="totals-row">
        <span class="label">Sin factura (${pctSF}%)${saldoAntTipo === 'efectivo' && saldoAntMonto > 0 ? ' + saldo ant.' : ''}</span>
        <span class="amount sin-factura">${formatCurrency(sinFactura)}</span>
      </div>
      <div class="totals-row">
        <span class="label">Facturado (${pctF}% × +${rec}%)${saldoAntTipo === 'blanco' && saldoAntMonto > 0 ? ' + saldo ant.' : ''}</span>
        <span class="amount facturado">${formatCurrency(facturado)}</span>
      </div>
      <div class="totals-row total-final">
        <span class="label">TOTAL</span>
        <span class="amount">${formatCurrency(total)}</span>
      </div>
    </div>
  `;
}

// --------------------------------------------------------
//  Guardar pedido
// --------------------------------------------------------
async function _saveOrder() {
  const fecha  = document.getElementById('of-fecha')?.value;
  const estado = document.getElementById('of-estado')?.value;
  const notas  = document.getElementById('of-notas')?.value ?? '';

  // Saldo anterior
  const saldo_anterior_monto = parseFloat(document.getElementById('of-saldo-anterior')?.value || 0) || 0;
  const saldo_anterior_tipo  = document.getElementById('of-saldo-anterior-tipo')?.value || '';

  if (!fecha) {
    Toast.error('Fecha requerida', 'Seleccioná la fecha del pedido');
    return;
  }

  // Permitir guardar si hay items O saldo anterior
  if (_items.length === 0 && saldo_anterior_monto <= 0) {
    Toast.error('Sin productos', 'Agregá al menos un producto o un saldo anterior');
    return;
  }

  // Validar que si hay saldo anterior, tenga tipo seleccionado
  if (saldo_anterior_monto > 0 && !saldo_anterior_tipo) {
    Toast.error('Tipo de saldo requerido', 'Seleccioná si el saldo anterior es en efectivo o en blanco');
    return;
  }

  // Validar ítems
  for (const item of _items) {
    if (!item.product_id && !item.producto_nombre_historico) {
      Toast.error('Producto requerido', 'Seleccioná un producto en todas las líneas');
      return;
    }
    if (!item.cantidad || item.cantidad <= 0) {
      Toast.error('Cantidad inválida', `La cantidad de ${item.producto_nombre_historico || 'un producto'} debe ser mayor a 0`);
      return;
    }
    if (item.precio_unitario_historico < 0) {
      Toast.error('Precio inválido', `El precio de ${item.producto_nombre_historico || 'un producto'} no puede ser negativo`);
      return;
    }
  }

  try {
    if (_order) {
      // Edición: actualizar datos + items
      await updateOrder(_order.id, { fecha, estado, notas, saldo_anterior_monto, saldo_anterior_tipo });
      await updateOrderItems(_order.id, _items.map(item => ({
        id:                        item._isNew ? null : item.id,
        product_id:                item.product_id || null,
        producto_nombre_historico: item.producto_nombre_historico,
        color:                     item.color || '',
        cantidad:                  parseFloat(item.cantidad) || 0,
        precio_unitario_historico: parseFloat(item.precio_unitario_historico) || 0,
      })));
      Toast.success('Pedido actualizado', formatOrderNumber(_order.numero));
      Router.navigate('order-detail', { id: _order.id });
    } else {
      // Creación nueva
      const newId = await createOrder({
        fecha,
        estado,
        notas,
        saldo_anterior_monto,
        saldo_anterior_tipo,
        items: _items.map(item => ({
          product_id:                item.product_id || null,
          producto_nombre_historico: item.producto_nombre_historico,
          color:                     item.color || '',
          cantidad:                  parseFloat(item.cantidad) || 0,
          precio_unitario_historico: parseFloat(item.precio_unitario_historico) || 0,
        })),
      });
      Toast.success('Pedido creado', 'El pedido fue guardado correctamente');
      Router.navigate('order-detail', { id: newId });
    }
  } catch(e) {
    Toast.error('Error al guardar', e.message || 'Ocurrió un error inesperado');
    console.error(e);
  }
}

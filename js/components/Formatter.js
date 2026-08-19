// ============================================================
//  FORMATTER — Utilidades de formateo y helpers globales
// ============================================================

// --- UUID simple (RFC4122 v4) ---
export function uuid() {
  return ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

// --- Fecha/hora ISO ---
export function nowISO() {
  return new Date().toISOString();
}

// --- Formatear fecha para mostrar (dd/mm/yyyy) ---
export function formatDate(isoStr) {
  if (!isoStr) return '—';
  const value = String(isoStr).trim();

  // Las fechas de pedidos son YYYY-MM-DD y no incluyen hora. Crear un Date
  // para ellas las interpreta como UTC y, en Argentina, las muestra un dia antes.
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;

  const d = new Date(value.replace('T', ' ').split('.')[0]);
  if (isNaN(d)) return isoStr;
  return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

// --- Formatear fecha con hora ---
export function formatDateTime(isoStr) {
  if (!isoStr) return '—';
  const d = new Date(isoStr.replace('T', ' ').split('.')[0]);
  if (isNaN(d)) return isoStr;
  return d.toLocaleString('es-AR', {
    day:'2-digit', month:'2-digit', year:'numeric',
    hour:'2-digit', minute:'2-digit'
  });
}

// --- Formatear moneda argentina ---
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$0,00';
  return '$' + Number(amount).toLocaleString('es-AR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// --- Formatear porcentaje ---
export function formatPercent(decimal) {
  return (decimal * 100).toFixed(1) + '%';
}

// --- Parsear moneda a número ---
export function parseCurrency(str) {
  if (typeof str === 'number') return Number.isFinite(str) ? str : 0;

  // Acepta formatos de Google Sheets tanto internacionales (1,330,000.00)
  // como argentinos (1.330.000,00), con o sin simbolo de moneda.
  let value = String(str ?? '').trim().replace(/[^0-9,.-]/g, '');
  if (!value) return 0;

  const comma = value.lastIndexOf(',');
  const dot = value.lastIndexOf('.');

  if (comma !== -1 && dot !== -1) {
    const decimal = comma > dot ? ',' : '.';
    const thousand = decimal === ',' ? /\./g : /,/g;
    value = value.replace(thousand, '').replace(decimal, '.');
  } else {
    const separator = comma !== -1 ? ',' : (dot !== -1 ? '.' : '');
    if (separator) {
      const parts = value.split(separator);
      const decimalDigits = parts.at(-1).replace('-', '').length;
      const isThousands = decimalDigits === 3;

      if (isThousands) {
        value = parts.join('');
      } else {
        value = `${parts.slice(0, -1).join('')}.${parts.at(-1)}`;
      }
    }
  }

  return Number.parseFloat(value) || 0;
}

// --- Fecha de hoy en formato ISO (yyyy-mm-dd) ---
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// --- Escapeado HTML básico ---
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Número de pedido formateado ---
export function formatOrderNumber(num) {
  return '#' + String(num).padStart(4, '0');
}

// --- Badge HTML para estado de pedido ---
export function stateBadge(estado) {
  const map = {
    borrador:      'Borrador',
    confirmado:    'Confirmado',
    en_produccion: 'En Producción',
    listo:         'Listo',
    entregado:     'Entregado',
    cancelado:     'Cancelado',
  };
  const label = map[estado] || estado;
  return `<span class="badge badge-${estado}">${label}</span>`;
}

// --- Badge para tipo de pago ---
export function paymentBadge(tipo) {
  const map = {
    efectivo: 'Efectivo',
    blanco:   'En blanco',
    echeq:    'E-cheq',
  };
  const label = map[tipo] || tipo;
  return `<span class="badge badge-${tipo}">${label}</span>`;
}

// --- Badge activo/inactivo ---
export function activeBadge(activo) {
  return activo
    ? `<span class="badge badge-active">Activo</span>`
    : `<span class="badge badge-inactive">Inactivo</span>`;
}

// --- Debounce ---
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// --- Color dot HTML ---
export const COLOR_PALETTE = {
  'Gris':    '#8b9ab8',
  'Beige':   '#c8b49a',
  'Vision':  '#d4c4a0',
  'Negro':   '#2a2a2a',
  'Rojo':    '#e05555',
  'Blanco':  '#e8edf8',
  'Azul':    '#5b9af5',
  'Verde':   '#34c97d',
  'Natural': '#b8956a',
  'Topo':    '#9a8472',
};

export function colorDot(colorName) {
  const bg = COLOR_PALETTE[colorName] || '#6b7fa0';
  return `<span class="color-dot" style="background:${bg};border:1px solid rgba(255,255,255,0.15);" title="${escapeHtml(colorName)}"></span>`;
}

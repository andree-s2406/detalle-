// ============================================================
//  PRODUCT MODEL — CRUD de productos y colores con Sync & Rollback
// ============================================================

import { queryAll, queryOne, run, transaction } from '../db/database.js';
import { uuid, nowISO } from '../components/Formatter.js';
import { GoogleSheetsSync } from '../sync/google-sheets.js';

// --------------------------------------------------------
//  PRODUCTOS
// --------------------------------------------------------

export function getAllProducts(includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE p.activo = 1';
  return queryAll(`
    SELECT p.*,
           GROUP_CONCAT(c.nombre, '|') AS colores_nombres,
           GROUP_CONCAT(c.id, '|')     AS colores_ids
    FROM products p
    LEFT JOIN product_colors pc ON pc.product_id = p.id
    LEFT JOIN colors c ON c.id = pc.color_id AND c.activo = 1
    ${where}
    GROUP BY p.id
    ORDER BY p.nombre COLLATE NOCASE
  `);
}

export function getProductById(id) {
  const product = queryOne(`SELECT * FROM products WHERE id = ?`, [id]);
  if (!product) return null;
  product.colores = getProductColors(id);
  return product;
}

export function createProduct({ nombre, precio, colores = [] }) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const id  = uuid();
      const now = nowISO();

      transaction(() => {
        run(
          `INSERT INTO products (id, nombre, precio, activo, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`,
          [id, nombre.trim(), precio, now, now]
        );
        _setProductColors(id, colores);
      });

      return id;
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

export function updateProduct(id, { nombre, precio, colores = [] }) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const now = nowISO();
      transaction(() => {
        run(
          `UPDATE products SET nombre = ?, precio = ?, updated_at = ? WHERE id = ?`,
          [nombre.trim(), precio, now, id]
        );
        _setProductColors(id, colores);
      });
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

export function toggleProductActive(id) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const product = queryOne(`SELECT activo FROM products WHERE id = ?`, [id]);
      if (!product) return;
      const newState = product.activo ? 0 : 1;
      run(`UPDATE products SET activo = ?, updated_at = ? WHERE id = ?`, [newState, nowISO(), id]);
      return newState;
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

export function deleteOrDeactivateProduct(id) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const usedInOrders = queryOne(
        `SELECT COUNT(*) as cnt FROM order_items WHERE product_id = ?`, [id]
      );
      if (usedInOrders?.cnt > 0) {
        run(`UPDATE products SET activo = 0, updated_at = ? WHERE id = ?`, [nowISO(), id]);
        return 'deactivated';
      } else {
        transaction(() => {
          run(`DELETE FROM product_colors WHERE product_id = ?`, [id]);
          run(`DELETE FROM products WHERE id = ?`, [id]);
        });
        return 'deleted';
      }
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

function _setProductColors(productId, colorIds) {
  run(`DELETE FROM product_colors WHERE product_id = ?`, [productId]);
  for (const colorId of colorIds) {
    run(
      `INSERT OR IGNORE INTO product_colors (product_id, color_id) VALUES (?, ?)`,
      [productId, colorId]
    );
  }
}

export function getProductColors(productId) {
  return queryAll(`
    SELECT c.id, c.nombre FROM colors c
    JOIN product_colors pc ON pc.color_id = c.id
    WHERE pc.product_id = ? AND c.activo = 1
    ORDER BY c.nombre
  `, [productId]);
}

// --------------------------------------------------------
//  COLORES GLOBALES
// --------------------------------------------------------

export function getAllColors(includeInactive = false) {
  const where = includeInactive ? '' : 'WHERE activo = 1';
  return queryAll(`SELECT * FROM colors ${where} ORDER BY nombre COLLATE NOCASE`);
}

export function getColorById(id) {
  return queryOne(`SELECT * FROM colors WHERE id = ?`, [id]);
}

export function createColor(nombre) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const id  = uuid();
      const now = nowISO();
      run(
        `INSERT INTO colors (id, nombre, activo, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
        [id, nombre.trim(), now, now]
      );
      return id;
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

export function updateColor(id, nombre) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      run(
        `UPDATE colors SET nombre = ?, updated_at = ? WHERE id = ?`,
        [nombre.trim(), nowISO(), id]
      );
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

export function toggleColorActive(id) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const color = queryOne(`SELECT activo FROM colors WHERE id = ?`, [id]);
      if (!color) return;
      const newState = color.activo ? 0 : 1;
      run(`UPDATE colors SET activo = ?, updated_at = ? WHERE id = ?`, [newState, nowISO(), id]);
      return newState;
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

export function deleteOrDeactivateColor(id) {
  return GoogleSheetsSync.executeWithDriveSync({
    localAction: () => {
      const usedInItems = queryOne(
        `SELECT COUNT(*) as cnt FROM order_items WHERE color = (SELECT nombre FROM colors WHERE id = ?)`, [id]
      );

      if (usedInItems?.cnt > 0) {
        run(`UPDATE colors SET activo = 0, updated_at = ? WHERE id = ?`, [nowISO(), id]);
        return 'deactivated';
      } else {
        transaction(() => {
          run(`DELETE FROM product_colors WHERE color_id = ?`, [id]);
          run(`DELETE FROM colors WHERE id = ?`, [id]);
        });
        return 'deleted';
      }
    },
    driveSyncAction: async () => {
      await GoogleSheetsSync.syncCatalogSheet();
    }
  });
}

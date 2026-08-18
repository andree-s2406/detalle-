// ============================================================
//  ROUTER — Navegación SPA sin recarga de página
// ============================================================

const _routes = {};
let _currentRoute = null;
let _onNavigate = null;

export const Router = {
  // Registrar una ruta: Router.on('dashboard', fn)
  on(name, handler) {
    _routes[name] = handler;
    return this;
  },

  // Registrar callback de navegación (para actualizar sidebar, breadcrumb)
  onNavigate(fn) {
    _onNavigate = fn;
    return this;
  },

  // Navegar a una ruta con parámetros opcionales
  navigate(name, params = {}) {
    if (!_routes[name]) {
      console.warn(`Route not found: ${name}`);
      return;
    }
    _currentRoute = { name, params };
    _routes[name](params);
    if (_onNavigate) _onNavigate(name, params);

    // Actualizar hash sin scroll
    history.replaceState({ route: name, params }, '', `#${name}`);
  },

  // Ruta actual
  current() {
    return _currentRoute;
  },

  // Resolver ruta desde hash
  resolveHash() {
    const hash = location.hash.slice(1);
    if (hash && _routes[hash]) {
      this.navigate(hash);
    } else {
      this.navigate('dashboard');
    }
  },
};

// ============================================================
//  GOOGLE AUTH — Manejo de autenticación OAuth2 con Sesión Persistente y Auto-Renovación
// ============================================================

import { getConfig, setConfig } from '../config.js';
import { Toast } from '../components/Toast.js';

let _tokenClient = null;
let _accessToken = null;
let _tokenExpiresAt = 0;
let _pendingAuthPromise = null;

// Cargar token previo de localStorage al importar el módulo
_restoreStoredSession();

function _restoreStoredSession() {
  try {
    const token = localStorage.getItem('detalle_g_token');
    const expires = parseInt(localStorage.getItem('detalle_g_expires') || '0', 10);

    if (token) {
      _accessToken = token;
      _tokenExpiresAt = expires;
    }
  } catch (e) {
    console.warn('[GoogleAuth] Error al restaurar sesión:', e);
  }
}

function _saveSession(token, expiresInSeconds) {
  _accessToken = token;
  _tokenExpiresAt = Date.now() + (parseInt(expiresInSeconds, 10) || 3600) * 1000;

  try {
    localStorage.setItem('detalle_g_token', _accessToken);
    localStorage.setItem('detalle_g_expires', _tokenExpiresAt.toString());
  } catch (e) {
    console.warn('[GoogleAuth] Error al persistir token:', e);
  }
}

function _clearStoredSession() {
  _accessToken = null;
  _tokenExpiresAt = 0;
  try {
    localStorage.removeItem('detalle_g_token');
    localStorage.removeItem('detalle_g_expires');
  } catch (e) {}
}

/**
 * Cargar SDK de Google Identity Services dinámicamente
 */
export function loadGoogleSdk() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve(true);
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(true);
    script.onerror = () => reject(new Error('Error al cargar SDK de Google Identity Services'));
    document.head.appendChild(script);
  });
}

/**
 * Inicializar cliente de token con el Client ID configurado
 */
export async function initGoogleAuth(silent = true) {
  await loadGoogleSdk();
  const clientId = getConfig('google_client_id', '');
  if (!clientId) return false;

  _tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
    callback: (response) => {
      if (response.error) {
        console.warn('[GoogleAuth] Advertencia de autorización:', response);
        if (!silent) Toast.error('Error de autenticación', response.error_description || response.error);
        return;
      }

      _saveSession(response.access_token, response.expires_in);
      setConfig('google_connected', 'true');
      if (!silent) Toast.success('Conectado con Google Drive', 'Sesión autorizada correctamente');

      if (window._onGoogleAuthChange) window._onGoogleAuthChange(true);
    },
    error_callback: (err) => {
      console.warn('[GoogleAuth] Error callback:', err);
    }
  });

  // Si estaba configurado como conectado y el token ya expiró o está próximo a expirar, renovar en segundo plano
  const wasConnected = getConfig('google_connected', 'false') === 'true';
  if (wasConnected && (!isTokenFresh() || !_accessToken)) {
    try {
      _tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      console.log('[GoogleAuth] Re-autenticación en segundo plano...');
    }
  }

  return true;
}

/**
 * Verificar si el token actual está dentro de su ventana de validez
 */
export function isTokenFresh() {
  return !!_accessToken && Date.now() < (_tokenExpiresAt - 60000);
}

/**
 * Asegurar que tenemos un token válido antes de hacer una llamada a la API
 */
export async function ensureValidToken(forcePrompt = false) {
  if (!forcePrompt && isTokenFresh()) {
    return _accessToken;
  }

  // Si ya hay una petición de token en curso, reutilizar la promesa
  if (_pendingAuthPromise) {
    return _pendingAuthPromise;
  }

  const clientId = getConfig('google_client_id', '');
  if (!clientId) {
    throw new Error('Configuración requerida: Ingresá el Google Client ID en Configuración.');
  }

  await loadGoogleSdk();

  _pendingAuthPromise = new Promise((resolve, reject) => {
    let resolved = false;

    _tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file',
      callback: (response) => {
        _pendingAuthPromise = null;
        if (response.error) {
          console.warn('[GoogleAuth] Error al obtener token:', response);
          // Si falló el silencioso, devolvemos el token que teníamos en cache si existe
          if (_accessToken) {
            resolve(_accessToken);
          } else {
            reject(new Error(response.error_description || response.error || 'No se pudo renovar la sesión de Google.'));
          }
          return;
        }

        resolved = true;
        _saveSession(response.access_token, response.expires_in);
        setConfig('google_connected', 'true');
        if (window._onGoogleAuthChange) window._onGoogleAuthChange(true);
        resolve(response.access_token);
      },
      error_callback: (err) => {
        _pendingAuthPromise = null;
        if (_accessToken) resolve(_accessToken);
        else reject(new Error('Error de conexión con Google Identity Services'));
      }
    });

    try {
      _tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
    } catch (e) {
      _pendingAuthPromise = null;
      if (_accessToken) resolve(_accessToken);
      else reject(e);
    }
  });

  return _pendingAuthPromise;
}

/**
 * Solicitar token de acceso al usuario manualmente (abre ventana popup)
 */
export async function requestAuth() {
  try {
    await ensureValidToken(true);
    Toast.success('Conectado con Google Drive', 'Sesión autorizada correctamente');
    return true;
  } catch (e) {
    Toast.error('Error de autenticación', e.message);
    return false;
  }
}

/**
 * Desconectar cuenta de Google y limpiar sesión permanente
 */
export function disconnectAuth() {
  if (_accessToken && window.google?.accounts?.oauth2) {
    try {
      google.accounts.oauth2.revoke(_accessToken, () => {
        console.log('[GoogleAuth] Token revocado');
      });
    } catch (e) {}
  }

  _clearStoredSession();
  setConfig('google_connected', 'false');
  Toast.info('Desconectado', 'Se cerró la sesión de Google Drive');
  if (window._onGoogleAuthChange) window._onGoogleAuthChange(false);
}

/**
 * Obtener token de acceso (en memoria o localStorage)
 */
export function getAccessToken() {
  if (_accessToken) return _accessToken;
  const stored = localStorage.getItem('detalle_g_token');
  if (stored) {
    _accessToken = stored;
    return _accessToken;
  }
  return null;
}

/**
 * Verificar si está configurado y conectado con Google Drive
 */
export function isConnected() {
  const connected = getConfig('google_connected', 'false') === 'true';
  const hasClientId = !!getConfig('google_client_id', '');
  const hasSheetId = !!getConfig('google_spreadsheet_id', '');
  const hasToken = !!_accessToken || !!localStorage.getItem('detalle_g_token');

  return connected && hasClientId && hasSheetId && hasToken;
}

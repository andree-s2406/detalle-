"""
Servidor HTTP simple para desarrollo local con reutilización de socket.
"""
import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        ext = os.path.splitext(self.path)[1].lower()
        if ext in ('.js', '.html', '.css', '.mjs', '.wasm'):
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        super().end_headers()

    def log_message(self, format, *args):
        print(f"  {self.address_string()} -> {args[0]} {args[1]}")

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True

if __name__ == '__main__':
    os.chdir(DIRECTORY)
    try:
        with ReusableTCPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
            print(f"\n  ============================================================")
            print(f"  SISTEMA DE GESTION DE PEDIDOS - Servidor Iniciado")
            print(f"  ============================================================")
            print(f"  ✓ URL:   http://127.0.0.1:{PORT}")
            print(f"  ✓ Cache: DESHABILITADO")
            print(f"  ✓ Salir: Cerrá esta ventana o presiona Ctrl+C\n")
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Servidor detenido.")
    except Exception as e:
        print(f"\n[ERROR EN SERVIDOR]: {e}")
        input("\nPresiona Enter para cerrar...")

# ============================================================
#  SERVIDOR LOCAL ZERO-INSTALL (PowerShell HttpListener)
#  Permite ejecutar la app en CUALQUIER Windows sin instalar nada
# ============================================================

$port = 8000
$root = $PSScriptRoot
if (-not $root) { $root = Get-Location }

$mimeTypes = @{
    ".html" = "text/html; charset=utf-8"
    ".htm"  = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".mjs"  = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".gif"  = "image/gif"
    ".svg"  = "image/svg+xml"
    ".ico"  = "image/x-icon"
    ".wasm" = "application/wasm"
    ".db"   = "application/octet-stream"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://127.0.0.1:$port/")

try {
    $listener.Start()
} catch {
    Write-Host ""
    Write-Host "[ERROR] No se pudo iniciar en el puerto $port : $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "Intentando puerto alternativo 8080..." -ForegroundColor Yellow
    $port = 8080
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://127.0.0.1:$port/")
    try {
        $listener.Start()
        Start-Process "http://127.0.0.1:$port"
    } catch {
        Write-Host "[ERROR FATAL] No se pudo abrir ningun puerto: $($_.Exception.Message)" -ForegroundColor Red
        Read-Host "Presiona Enter para salir"
        exit 1
    }
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  SISTEMA DE GESTION DE PEDIDOS - Servidor Windows Listo" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  URL:     http://127.0.0.1:$port" -ForegroundColor Yellow
Write-Host "  Carpeta: $root" -ForegroundColor Gray
Write-Host "  Estado:  Activo (Zero-install)" -ForegroundColor Green
Write-Host "  Para salir: Cerra esta ventana o presiona Ctrl+C" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response

        $path = $request.Url.LocalPath
        if ($path -eq "/" -or $path -eq "") {
            $path = "/index.html"
        }

        $cleanPath = $path.TrimStart("/").Replace("/", "\")
        $filePath = Join-Path $root $cleanPath

        $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
        $response.Headers.Add("Pragma", "no-cache")
        $response.Headers.Add("Expires", "0")
        $response.Headers.Add("Access-Control-Allow-Origin", "*")

        if (Test-Path -Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = $mimeTypes[$ext]
            if (-not $mime) { $mime = "application/octet-stream" }
            $response.ContentType = $mime

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - Archivo no encontrado: $path")
            $response.ContentLength64 = $msg.Length
            $response.OutputStream.Write($msg, 0, $msg.Length)
        }

        $response.OutputStream.Close()
    } catch {
        # Conexiones canceladas por el navegador
    }
}

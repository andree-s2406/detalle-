# ============================================================
#  ACTUALIZADOR AUTOMATICO — Sin instalar nada
#  Descarga la version mas reciente desde GitHub
#  y reemplaza los archivos locales automaticamente.
# ============================================================

$REPO_ZIP  = "https://github.com/andree-s2406/detalle-/archive/refs/heads/main.zip"
$REPO_SHA  = "https://raw.githubusercontent.com/andree-s2406/detalle-/main/version.txt"
$APP_DIR   = $PSScriptRoot
$TEMP_ZIP  = Join-Path $env:TEMP "detalle_update.zip"
$TEMP_DIR  = Join-Path $env:TEMP "detalle_update"
$VER_FILE  = Join-Path $APP_DIR "version.txt"

# Archivos/carpetas que NUNCA se deben sobreescribir (datos del usuario).
# Los pedidos, productos y pagos se almacenan en IndexedDB del navegador, fuera
# de esta carpeta. Estas exclusiones protegen tambien futuras copias locales.
$EXCLUDE = @(
    '.git\\',
    'datos\\',
    'data\\',
    'backups\\',
    'respaldo\\',
    'respaldos\\'
)

function Write-Status($msg, $color = "Cyan") {
    Write-Host ""
    Write-Host "  $msg" -ForegroundColor $color
}

function Compare-AppVersion($left, $right) {
    # Las versiones se esperan como 2026-08-19.1. Devuelve 1 si $left es mayor,
    # 0 si son iguales y -1 si es menor.
    $leftParts = [regex]::Matches($left, '\\d+') | ForEach-Object { [int]$_.Value }
    $rightParts = [regex]::Matches($right, '\\d+') | ForEach-Object { [int]$_.Value }
    $length = [Math]::Max($leftParts.Count, $rightParts.Count)

    for ($i = 0; $i -lt $length; $i++) {
        $leftValue = if ($i -lt $leftParts.Count) { $leftParts[$i] } else { 0 }
        $rightValue = if ($i -lt $rightParts.Count) { $rightParts[$i] } else { 0 }
        if ($leftValue -gt $rightValue) { return 1 }
        if ($leftValue -lt $rightValue) { return -1 }
    }
    return 0
}

# ── Verificar conectividad ─────────────────────────────────
Write-Status "[ACTUALIZACION] Verificando conexion a GitHub..." "Cyan"

try {
    $webClient = New-Object System.Net.WebClient
    $webClient.Headers.Add("User-Agent", "DetalleSGP-Updater/1.0")

    # Obtener version remota
    $remoteVersion = $null
    try {
        $remoteVersion = $webClient.DownloadString($REPO_SHA).Trim()
    } catch {
        # Si no existe version.txt remoto, actualizamos igual
        $remoteVersion = "unknown"
    }

    # Obtener version local
    $localVersion = ""
    if (Test-Path $VER_FILE) {
        $localVersion = (Get-Content $VER_FILE -Raw).Trim()
    }

    if ($remoteVersion -ne "unknown") {
        $versionComparison = Compare-AppVersion $remoteVersion $localVersion
        if ($versionComparison -eq 0) {
            Write-Status "[ACTUALIZACION] Ya estas en la ultima version ($localVersion). Sin cambios." "Green"
            exit 0
        }
        if ($versionComparison -lt 0) {
            Write-Status "[ACTUALIZACION] La version local ($localVersion) es mas nueva. No se reemplazara." "Yellow"
            exit 0
        }
    }

    Write-Status "[ACTUALIZACION] Nueva version disponible. Descargando actualizacion..." "Yellow"

    # ── Limpiar temp ──────────────────────────────────────
    if (Test-Path $TEMP_DIR) { Remove-Item $TEMP_DIR -Recurse -Force }
    if (Test-Path $TEMP_ZIP) { Remove-Item $TEMP_ZIP -Force }

    # ── Descargar ZIP ─────────────────────────────────────
    $webClient.DownloadFile($REPO_ZIP, $TEMP_ZIP)

    # ── Extraer ZIP ───────────────────────────────────────
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($TEMP_ZIP, $TEMP_DIR)

    # El ZIP de GitHub extrae en una subcarpeta como "detalle--main"
    $extracted = Get-ChildItem $TEMP_DIR -Directory | Select-Object -First 1
    if (-not $extracted) {
        Write-Status "[ACTUALIZACION] Error: no se pudo extraer el ZIP." "Red"
        exit 1
    }

    # ── Copiar archivos ───────────────────────────────────
    # Solo se agregan o reemplazan archivos de la nueva version: no se borra
    # ningun archivo local, incluso si ya no existe en GitHub.
    $items = Get-ChildItem $extracted.FullName -Recurse
    $total = $items.Count
    $count = 0

    foreach ($item in $items) {
        $count++
        $relPath = $item.FullName.Substring($extracted.FullName.Length).TrimStart('\','/')

        # Saltar archivos excluidos
        $skip = $false
        foreach ($ex in $EXCLUDE) {
            if ($relPath -like "$ex*") { $skip = $true; break }
        }
        if ($skip) { continue }

        $destPath = Join-Path $APP_DIR $relPath

        if ($item.PSIsContainer) {
            if (-not (Test-Path $destPath)) {
                New-Item -ItemType Directory -Path $destPath -Force | Out-Null
            }
        } else {
            $destDir = Split-Path $destPath -Parent
            if (-not (Test-Path $destDir)) {
                New-Item -ItemType Directory -Path $destDir -Force | Out-Null
            }
            Copy-Item -Path $item.FullName -Destination $destPath -Force
        }
    }

    # ── Limpiar temp ──────────────────────────────────────
    Remove-Item $TEMP_DIR -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item $TEMP_ZIP -Force -ErrorAction SilentlyContinue

    Write-Status "[ACTUALIZACION] Actualizacion completada correctamente." "Green"

} catch {
    Write-Status "[ACTUALIZACION] Sin conexion o error de red. Usando version local." "DarkYellow"
}

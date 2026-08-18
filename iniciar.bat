@echo off
title Sistema de Gestion de Pedidos - Detalle
color 0A

:: Ir al directorio actual
cd /d "%~dp0"

echo ============================================================
echo      SISTEMA DE GESTION DE PEDIDOS ^| Iniciando...
echo ============================================================
echo.

:: ── 1. ACTUALIZACION AUTOMATICA DESDE GITHUB ──────────────
where git >nul 2>&1
if %errorlevel% equ 0 (
    if exist "%~dp0.git" (
        echo [ACTUALIZACION] Verificando nuevas actualizaciones en GitHub...
        git pull origin main --quiet >nul 2>&1
        if %errorlevel% equ 0 (
            echo [ACTUALIZACION] Sistema al dia.
        ) else (
            echo [ACTUALIZACION] Modo sin conexion o al dia.
        )
        echo.
    )
)

:: ── 2. LIBERAR PUERTO 8000 SI ESTABA ABIERTO ──────────────
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":8000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)

:: ── 3. ABRIR NAVEGADOR EN 1.5 SEGUNDOS ─────────────────────
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://127.0.0.1:8000"

:: Iniciar servidor PowerShell (Nativo de Windows, 100%% garantizado sin instalar nada)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"

echo.
echo El servidor se ha detenido.
pause

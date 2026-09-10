@echo off
chcp 65001 >nul
setlocal EnableExtensions EnableDelayedExpansion

title Savor Web Quick Start
cd /d "%~dp0"

echo.
echo ==========================================
echo   Savor Web Quick Start
echo ==========================================
echo.

set "PROJECT_DIR="

if exist "%~dp0package.json" (
    set "PROJECT_DIR=%~dp0"
)

if not defined PROJECT_DIR (
    echo [1/4] Searching for Web project...
    for /r "%~dp0" %%F in (package.json) do (
        echo %%~fF | findstr /i /c:"\node_modules\" >nul
        if errorlevel 1 (
            if not defined PROJECT_DIR (
                set "PROJECT_DIR=%%~dpF"
            )
        )
    )
)

if not defined PROJECT_DIR (
    echo.
    echo [ERROR] package.json was not found.
    echo Put this CMD in the extracted project folder and try again.
    echo.
    pause
    exit /b 1
)

echo [OK] Project:
echo      !PROJECT_DIR!
echo.

cd /d "!PROJECT_DIR!"

echo [2/4] Checking Node.js and npm...
where node >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Node.js is not installed or not in PATH.
    echo Recommended: Node.js 22 LTS
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] npm is not available.
    echo Reinstall Node.js 22 LTS and try again.
    echo.
    pause
    exit /b 1
)

for /f "delims=" %%V in ('node -v') do set "NODE_VER=%%V"
echo      Node !NODE_VER!

echo.
echo [3/4] Checking dependencies...
if not exist "node_modules\.bin\vite.cmd" (
    echo      Vite not found. Installing dependencies...
    call npm install --include=dev
    if errorlevel 1 (
        echo.
        echo [ERROR] npm install failed.
        echo Check the error message above.
        echo.
        pause
        exit /b 1
    )
) else (
    echo      Dependencies are ready.
)

echo.
echo [4/4] Starting Web interface...
echo      The browser will open automatically.
echo      Keep this window open while using the app.
echo.
call npm run dev -- --open

echo.
echo The development server has stopped.
pause

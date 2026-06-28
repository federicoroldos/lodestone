@echo off
REM ============================================================
REM  Lodestone - DEVELOPMENT launcher (Windows)
REM  Runs the backend + the Vite dev server with hot reload.
REM  Edit anything under src/ and the browser updates instantly,
REM  no rebuild and no panel restart needed.
REM
REM  For normal use (built bundle, single port) use start-panel.bat.
REM ============================================================

REM Move to the folder where this .bat lives (handles spaces and "N").
cd /d "%~dp0"

title Lodestone Dev

REM --- Check Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install it from https://nodejs.org/ ^(LTS, version 18 or newer^) and try again.
  echo.
  pause
  exit /b 1
)

REM --- Install dependencies the first time (if node_modules is missing) ---
if not exist "node_modules" (
  echo First run: installing dependencies with npm...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your internet connection.
    pause
    exit /b 1
  )
)

REM --- Seed config.json from the template on first run (never overwrite an existing one) ---
if not exist "config.json" (
  if exist "config.example.json" (
    echo First run: creating config.json from config.example.json...
    copy /y "config.example.json" "config.json" >nul
    if errorlevel 1 (
      echo [ERROR] Failed to create config.json. Check folder permissions.
      pause
      exit /b 1
    )
    echo Edit config.json to change the password, port, etc., then restart.
    echo.
  ) else (
    echo [ERROR] Neither config.json nor config.example.json were found.
    echo Re-download the panel files or restore config.example.json next to this script.
    pause
    exit /b 1
  )
)

REM --- Kill any previous backend instance still holding the port ---
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "0.0.0.0:2121 " 2^>nul') do (
  echo Stopping previous backend instance ^(PID %%p^)...
  taskkill /f /pid %%p >nul 2>nul
)

echo.
echo Starting Lodestone backend ^(port 2121^) in a separate window...
start "Lodestone Backend" cmd /k node server.js

echo Starting Vite dev server with hot reload...
echo Open http://localhost:5173 in your browser ^(it should open automatically^).
echo Frontend changes under src/ reload instantly. Close this window to stop Vite;
echo close the "Lodestone Backend" window to stop the backend.
echo.

call npm run dev -- --open

echo.
echo The Vite dev server stopped. Press a key to close this window.
pause >nul

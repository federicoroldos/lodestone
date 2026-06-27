@echo off
REM ============================================================
REM  Lodestone - Minecraft server panel launcher (Windows)
REM  Double-click this file to start the web panel.
REM ============================================================

REM Move to the folder where this .bat lives (handles spaces and "N").
cd /d "%~dp0"

title Lodestone Panel

REM --- Check Node.js is installed ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found in PATH.
  echo Install it from https://nodejs.org/ (LTS, version 18 or newer^) and try again.
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
    echo Edit config.json to change the password, port, etc., then restart the panel.
    echo.
  ) else (
    echo [ERROR] Neither config.json nor config.example.json were found.
    echo Re-download the panel files or restore config.example.json next to start-panel.bat.
    pause
    exit /b 1
  )
)

echo.
echo Starting Lodestone panel...
echo Open http://localhost:2121 in your browser (default port^).
echo Press Ctrl+C in this window to stop the panel.
echo.

node server.js

echo.
echo The panel stopped. Press a key to close this window.
pause >nul

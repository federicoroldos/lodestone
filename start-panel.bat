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

echo.
echo Starting Lodestone panel...
echo Open http://localhost:2121 in your browser (default port^).
echo Press Ctrl+C in this window to stop the panel.
echo.

node server.js

echo.
echo The panel stopped. Press a key to close this window.
pause >nul

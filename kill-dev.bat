@echo off
REM Stop the Vite development server listening on its default port.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5173 " 2^>nul') do (
  taskkill /f /pid %%p >nul 2>nul
  echo Dev server stopped.
  exit /b 0
)
echo Nothing running on port 5173.

@echo off
REM Stop the Lodestone panel process listening on its default port.
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":2121 " 2^>nul') do (
  taskkill /f /pid %%p >nul 2>nul
  echo Panel stopped.
  exit /b 0
)
echo Nothing running on port 2121.

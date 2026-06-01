@echo off
setlocal
cd /d "%~dp0"

set "BUNDLED_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

echo Starting PressureFlow...
echo.

if exist "%BUNDLED_NODE%" (
  start "" "http://localhost:3000"
  "%BUNDLED_NODE%" server.js
) else (
  start "" "http://localhost:3000"
  node server.js
)

pause


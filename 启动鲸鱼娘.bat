@echo off
setlocal
rem Whale Girl desktop pet - Electron edition (one-click launcher)
rem 1) DSH injects ELECTRON_RUN_AS_NODE=1; Electron would run as plain Node and show nothing.
set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ATTACH_CONSOLE=1
pushd "%~dp0"

rem 2) Local model runtime: start ollama if port 11434 is not listening (chat needs it).
set OLLAMA_EXE=%LOCALAPPDATA%\Programs\Ollama\ollama.exe
if exist "%OLLAMA_EXE%" (
  powershell -NoProfile -WindowStyle Hidden -Command "if (-not (Test-NetConnection -ComputerName 127.0.0.1 -Port 11434 -InformationLevel Quiet -WarningAction SilentlyContinue)) { Start-Process '%OLLAMA_EXE%' -ArgumentList 'serve' -WindowStyle Hidden }"
)

set ELECTRON=node_modules\electron\dist\electron.exe
if not exist "%ELECTRON%" (
  echo [ERROR] %ELECTRON% not found. Run: npm i electron@33.4.11
  pause
  popd
  exit /b 1
)
if not exist "data\userdata" mkdir "data\userdata"

rem 3) Chromium sandbox crashes on this machine (0x80000003), so skip it.
rem 4) The default %APPDATA% profile cannot start here; point it inside the project.
start "" "%ELECTRON%" "%~dp0." --no-sandbox --user-data-dir="%~dp0data\userdata"
popd
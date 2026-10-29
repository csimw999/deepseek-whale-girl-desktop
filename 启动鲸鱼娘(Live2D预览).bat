@echo off
setlocal
rem Whale Girl Live2D preview (Cubism 3+ model, pixi-live2d-display)
set ELECTRON_RUN_AS_NODE=
pushd "%~dp0"
set ELECTRON=node_modules\electron\dist\electron.exe
if not exist "%ELECTRON%" (
  echo [ERROR] %ELECTRON% not found. Run: npm i electron@33.4.11
  pause
  popd
  exit /b 1
)
if not exist "data\userdata" mkdir "data\userdata"
start "" "%ELECTRON%" "%~dp0." --no-sandbox --live2d --user-data-dir="%~dp0data\userdata"
popd
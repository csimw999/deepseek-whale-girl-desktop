@echo off
setlocal
rem Foreground diagnostic: shows Electron errors in this window
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
echo === running electron in foreground ===
"%ELECTRON%" "%~dp0." --no-sandbox --user-data-dir="%~dp0data\userdata" --enable-logging
echo.
echo === exit code: %ERRORLEVEL% ===
if exist "data\boot.log" (
  echo --- data\boot.log ---
  type "data\boot.log"
)
pause
popd
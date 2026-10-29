@echo off
setlocal
rem Yexi desktop pet launcher (native WinForms layered window; no Chromium involved).
pushd "%~dp0"
if not exist "native\PetDesktop.exe" (
  echo [ERROR] native\PetDesktop.exe not found. Run rebuild.bat first.
  pause
  popd
  exit /b 1
)
start "" "native\PetDesktop.exe"
popd
exit /b 0
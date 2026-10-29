@echo off
setlocal
rem Self-check without GUI interaction: dump frames, synthetic drag, phase probe, feature probe.
pushd "%~dp0"
if not exist "native\PetDesktop.exe" (
  echo [ERROR] native\PetDesktop.exe not found. Run rebuild.bat first.
  pause
  popd
  exit /b 1
)

echo === 1/4 dump frames ===
"native\PetDesktop.exe" --dump
timeout /t 2 /nobreak >nul
for /f %%C in ('dir /b "shots\idle-*.png" 2^>nul ^| find /c /v ""') do set COUNT=%%C
echo idle frames exported: %COUNT%

echo === 2/4 drag test ===
"native\PetDesktop.exe" --dragtest
timeout /t 3 /nobreak >nul
type "data\native-drag.txt" 2>nul

echo === 3/4 phase probe ===
"native\PetDesktop.exe" --probe
timeout /t 3 /nobreak >nul
type "data\native-probe.txt" 2>nul

echo === 4/4 feature probe (bubble / panel / affinity) ===
"native\PetDesktop.exe" --features
timeout /t 4 /nobreak >nul
type "data\features.txt" 2>nul

echo.
echo artifacts: shots\*.png   logs: data\native.log
pause
popd
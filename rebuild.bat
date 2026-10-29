@echo off
setlocal
rem Rebuild native\PetDesktop.exe (pure .NET Framework, no SDK needed).
pushd "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo [ERROR] csc.exe not found at %CSC%
  pause
  exit /b 1
)
"%CSC%" /nologo /target:winexe /out:"%~dp0native\PetDesktop.exe" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll "%~dp0native\PetDesktop.cs" "%~dp0native\PetExtra.cs"
if errorlevel 1 (
  echo.
  echo [ERROR] compile failed
) else (
  echo.
  echo OK: native\PetDesktop.exe rebuilt
)
pause
popd
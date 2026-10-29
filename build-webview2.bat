@echo off
setlocal
rem Build the WebView2 host (net8.0-windows). Requires .NET SDK 8 + the staged SDK in webview2\lib2849.
pushd "%~dp0"
dotnet build webview2\YexiWeb.csproj -c Release --nologo
if errorlevel 1 (
  echo.
  echo [ERROR] build failed
) else (
  echo.
  echo OK: webview2\bin\Release\net8.0-windows\YexiWeb.exe
)
pause
popd
@echo off
setlocal
rem 鲸鱼娘 · 插件原件版（WebView2 宿主）：跑 app\ 里那份 dsh-pet 插件原版界面
pushd "%~dp0"
set EXE=webview2\bin\Release\net8.0-windows\YexiWeb.exe
if not exist "%EXE%" (
  echo [ERROR] %EXE% not found.
  echo Run build-webview2.bat first.
  pause
  popd
  exit /b 1
)
start "" "%EXE%"
popd
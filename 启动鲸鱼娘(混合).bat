@echo off
setlocal
rem 鲸鱼娘 · 混合版：WebView2 离屏渲染插件原件界面，抓帧画进原生分层窗口（真透明 + 逐像素命中）
pushd "%~dp0"
set EXE=webview2\build\YexiWeb.exe
if not exist "%EXE%" (
  echo [ERROR] %EXE% not found. Run build-webview2.bat first.
  pause
  popd
  exit /b 1
)
start "" "%EXE%" --hybrid
popd
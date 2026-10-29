@echo off
setlocal
rem Whale Girl desktop pet - Electron edition
rem 1) DSH 会注入 ELECTRON_RUN_AS_NODE=1；带着它 Electron 只当 Node 跑，什么都不显示。
set ELECTRON_RUN_AS_NODE=
set ELECTRON_NO_ATTACH_CONSOLE=1
pushd "%~dp0"
set ELECTRON=node_modules\electron\dist\electron.exe
if not exist "%ELECTRON%" (
  echo [ERROR] %ELECTRON% not found. Run: npm i electron@33.4.11
  pause
  popd
  exit /b 1
)
if not exist "data\userdata" mkdir "data\userdata"
rem 2) Chromium 沙箱在本机会 CHECK 崩溃（0x80000003），跳过沙箱。
rem 3) 默认的 %%APPDATA%%\<产品名> 配置目录在本机起不来，显式指到项目内。
start "" "%ELECTRON%" "%~dp0." --no-sandbox --user-data-dir="%~dp0data\userdata"
popd
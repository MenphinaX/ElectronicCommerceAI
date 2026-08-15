@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem 国内网络加速：electron 二进制 + better-sqlite3 预编译走 npmmirror 镜像
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
set npm_config_better_sqlite3_binary_host_mirror=https://npmmirror.com/mirrors/better-sqlite3
echo [1/3] Installing dependencies...
call npm install
if errorlevel 1 goto :err
echo [2/3] Building...
call npm run build
if errorlevel 1 goto :err
echo [3/3] Packaging installer...
call npm run dist:win
if errorlevel 1 goto :err
echo.
echo Done! Installer: release\EC-AI-Setup-*.exe
pause
exit /b 0
:err
echo Build failed. See messages above.
pause
exit /b 1
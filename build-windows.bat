@echo off
chcp 65001 >nul
title 识点·Pin Pro — Windows 一键编译
color 0A

echo ════════════════════════════════════════════════════════
echo   识点·Pin Pro — Windows 一键编译脚本
echo   会自动安装依赖 + 编译出 .msi / .exe 安装包
echo ════════════════════════════════════════════════════════
echo.

:: ---- 0. 检查环境 ----
echo [0/5] 检查环境...

where node >nul 2>nul
if errorlevel 1 (
    echo   ✗ 未检测到 Node.js，请先安装 Node 18+ : https://nodejs.org
    pause
    exit /b 1
)
echo   ✓ Node.js 已安装

where rustc >nul 2>nul
if errorlevel 1 (
    echo   ✗ 未检测到 Rust，正在安装...
    echo   请打开 https://rustup.rs 下载并安装 rustup，安装完后重新运行本脚本
    pause
    exit /b 1
)
echo   ✓ Rust 已安装

:: ---- 1. 安装前端依赖 ----
echo.
echo [1/5] 安装前端依赖...
call npm install
if errorlevel 1 (
    echo   ✗ npm install 失败
    pause
    exit /b 1
)
echo   ✓ 前端依赖安装完成

:: ---- 2. 编译前端 ----
echo.
echo [2/5] 编译前端（Vue + TypeScript）...
call npm run build
if errorlevel 1 (
    echo   ✗ 前端编译失败
    pause
    exit /b 1
)
echo   ✓ 前端编译完成

:: ---- 3. Tauri 打包 ----
echo.
echo [3/5] Tauri 打包（Rust 编译 + 生成 .msi/.exe）...
echo   这步会下载 Rust 依赖，首次约需 5-10 分钟，请耐心等待...
call npm run tauri:build
if errorlevel 1 (
    echo   ✗ Tauri 打包失败
    echo   常见原因：
    echo     1. 没装 Visual Studio C++ Build Tools - 下载: https://visualstudio.microsoft.com/visual-cpp-build-tools/
    echo     2. 没装 WebView2 Runtime - 下载: https://developer.microsoft.com/microsoft-edge/webview2/
    pause
    exit /b 1
)
echo   ✓ Tauri 打包完成

:: ---- 4. 收集产物 ----
echo.
echo [4/5] 收集安装包...
set "OUTDIR=%~dp0release-windows"
if not exist "%OUTDIR%" mkdir "%OUTDIR%"

:: Tauri v2 Windows 产物路径
set "BUNDLE=%~dp0src-tauri\target\release\bundle"

if exist "%BUNDLE%\msi\*.msi" (
    copy /Y "%BUNDLE%\msi\*.msi" "%OUTDIR%\" >nul
    echo   ✓ 已复制 MSI 安装包
)
if exist "%BUNDLE%\nsis\*.exe" (
    copy /Y "%BUNDLE%\nsis\*.exe" "%OUTDIR%\" >nul
    echo   ✓ 已复制 NSIS EXE 安装包
)
:: 裸 exe（可选）
if exist "%~dp0src-tauri\target\release\knowledge-pin-pro.exe" (
    copy /Y "%~dp0src-tauri\target\release\knowledge-pin-pro.exe" "%OUTDIR%\ShidianPin.exe" >nul
    echo   ✓ 已复制可执行文件
)

:: ---- 5. 完成 ----
echo.
echo [5/5] 编译全部完成！
echo ════════════════════════════════════════════════════════
echo   安装包在: %OUTDIR%
echo.
echo   双击 .msi 或 .exe 即可安装运行
echo ════════════════════════════════════════════════════════
echo.

explorer "%OUTDIR%"
pause

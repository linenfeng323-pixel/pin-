#!/usr/bin/env bash
# =====================================================
# 识点·Pin Pro - 一键构建脚本（Linux/macOS/WSL 可运行）
# Windows 请在 PowerShell 中按步骤手动执行：
#   npm ci
#   npm run build
#   cd overlay ; cargo build --release ; cd ..
#   npm run tauri build
# =====================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

echo "▌ 识点·Pin Pro — 构建流程"
echo "▌ 1/5 安装前端依赖 …"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund || npm install --no-audit --no-fund
fi

echo "▌ 2/5 构建前端静态资源（Vue3 + Vite）…"
npm run build

echo "▌ 3/5 编译 Overlay 独立进程（Rust）…"
if command -v cargo >/dev/null 2>&1; then
  (cd overlay && cargo build --release)
  mkdir -p src-tauri/binaries
  # 复制 sidecar 二进制（按 Tauri 要求命名：{target-triple}）
  # 注：按实际 triple 重命名；这里先复制一份，tauri.conf.json 里可以用 glob 或写死
  if [ -f overlay/target/release/overlay ]; then
    TRIPLE="$(rustc -Vv 2>/dev/null | grep host | awk '{print $2}')"
    TRIPLE="${TRIPLE:-x86_64-unknown-linux-gnu}"
    cp -f overlay/target/release/overlay "src-tauri/binaries/overlay-${TRIPLE}"
    echo "  → sidecar 已复制：overlay-${TRIPLE}"
  fi
  if [ -f overlay/target/release/overlay.exe ]; then
    TRIPLE="${TRIPLE:-x86_64-pc-windows-msvc}"
    cp -f overlay/target/release/overlay.exe "src-tauri/binaries/overlay-${TRIPLE}.exe"
    echo "  → sidecar 已复制：overlay-${TRIPLE}.exe"
  fi
else
  echo "  ⚠ 未找到 Rust/Cargo，跳过 Overlay 编译。Overlay 功能将不可用。"
fi

echo "▌ 4/5 Tauri 打包桌面程序 …"
if command -v cargo >/dev/null 2>&1; then
  npm run tauri:build 2>&1 | tail -n 60 || {
    echo "  ⚠ Tauri 打包失败，请查看上方日志。常见原因："
    echo "     - Windows：需安装 WebView2（Win10+ 默认自带）"
    echo "     - macOS：需安装 Xcode CLT（xcode-select --install）"
    echo "     - Linux：需 libwebkit2gtk-4.1-dev 等（README 有安装命令）"
  }
fi

echo "▌ 5/5 构建完成，产物目录："
find "$ROOT/src-tauri/target/release/bundle" -maxdepth 3 -type f \( -name "*.msi" -o -name "*.exe" -o -name "*.dmg" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.rpm" -o -name "*.app.tar.gz" \) 2>/dev/null || true
echo ""
echo "▌ 完成。签名 & 自动更新："
echo "  • 使用 $ tauri signer generate 生成密钥"
echo "  • 在 GitHub Actions Secrets 中配置 TAURI_SIGNING_PRIVATE_KEY / TAURI_PRIVATE_KEY_PASSWORD"
echo "  • 推送 tag vX.Y.Z → 自动产出 Release + update.json 签名"

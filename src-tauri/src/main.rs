// =====================================================
// Tauri v2 main.rs
// 主程序入口：加载插件 + 注册命令 + 创建窗口 + （可选）启动 overlay sidecar
// =====================================================

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::Manager;

struct AppState {
    #[allow(dead_code)]
    // 预留：主窗口控制状态（Overlay 开关、激活卡片 ID 等），实际走 plugin-store 持久化
    _placeholder: Mutex<()>,
}

#[derive(Serialize, Deserialize, Clone)]
struct Greeting {
    msg: String,
}

/// 暴露给前端的命令：健康检查（防止 Tauri 命令模块为空编译出错）
#[tauri::command]
fn greet(name: &str) -> Greeting {
    Greeting {
        msg: format!("Hello, {name}! 识点·Pin Pro 后端已就绪"),
    }
}

/// 暴露给前端：重启应用（更新完成后调用）
#[tauri::command]
fn restart_app(app: tauri::AppHandle) -> Result<(), String> {
    app.restart();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            app.manage(AppState {
                _placeholder: Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, restart_app])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(not(mobile))]
fn main() { run(); }

// 避免 restart_app 里 app.restart() 后面的 Ok(()) 报 unreachable
#[allow(unreachable_code)]
fn _unused() {}

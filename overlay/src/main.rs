//! Overlay 独立进程入口
//! 功能：
//!   - 创建全屏、置顶、透明、鼠标穿透的窗口
//!   - 监听 stdin 接收主程序发来的 UPDATE_CARDS / TOGGLE_* 等 JSON 命令
//!   - Direct2D 渲染：
//!       • 卡片栏 + 三合一迷你卡（站位/瞄准/落点）
//!       • N 个瞄点圆圈 + 最近瞄点自动高亮 + 扔法关键词显示
//!   - 全程 WS_EX_TRANSPARENT + WS_EX_NOACTIVATE，鼠标键盘 100% 不抢游戏输入

#![windows_subsystem = "windows"]

use std::io::{self, BufRead, Write};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::Win32::System::Threading::*;

mod render;
mod state;
mod ipc;

use crate::state::OverlayState;
use crate::ipc::OverlayCommand;

const OVERLAY_WINDOW_CLASS: PCWSTR = w!("KnowledgePinPro.Overlay");
const WIDTH: i32 = 1920;
const HEIGHT: i32 = 1080;

fn main() -> anyhow::Result<()> {
    env_logger::Builder::from_default_env()
        .filter_level(log::LevelFilter::Info)
        .init();

    // 初始化全局状态（线程安全，因为窗口过程和 stdin 读线程都会写）
    let state = Arc::new(Mutex::new(OverlayState::default()));

    // 启动 stdin 监听线程（主程序通过 sidecar stdin 发命令）
    let state_clone = state.clone();
    thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            let Ok(line) = line else { continue };
            if let Some(json) = line.strip_prefix("KPP_REQ:") {
                match serde_json::from_str::<OverlayCommand>(json) {
                    Ok(cmd) => state_clone.lock().apply_command(cmd),
                    Err(e)  => log::warn!("解析命令失败: {e} -> {json}"),
                }
            }
        }
    });

    // 注册窗口类
    let instance = unsafe { GetModuleHandleW(None) }?;
    let wc = WNDCLASSEXW {
        cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
        style: CS_HREDRAW | CS_VREDRAW,
        lpfnWndProc: Some(wnd_proc),
        hInstance: instance.into(),
        lpszClassName: OVERLAY_WINDOW_CLASS,
        hCursor: unsafe { LoadCursorW(None, IDC_ARROW) }?,
        hbrBackground: HBRUSH(0), // 不画背景，自己透明画
        ..Default::default()
    };
    unsafe { RegisterClassExW(&wc) };

    // 取主显示器尺寸
    let screen_w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
    let screen_h = unsafe { GetSystemMetrics(SM_CYSCREEN) };

    // 创建无边框全屏分层窗口，置顶 + 透明 + 穿透 + 不激活
    let ex_style = WS_EX_LAYERED
        | WS_EX_TRANSPARENT
        | WS_EX_TOPMOST
        | WS_EX_NOACTIVATE
        | WS_EX_TOOLWINDOW; // 任务栏不显示

    let hwnd = unsafe {
        CreateWindowExW(
            ex_style,
            OVERLAY_WINDOW_CLASS,
            w!("KPP Overlay"),
            WS_POPUP | WS_VISIBLE,
            0, 0, screen_w, screen_h,
            HWND(0),
            HMENU(0),
            instance,
            Some(Box::into_raw(Box::new(state.clone())) as _),
        )
    }?;

    // 颜色键透明：纯黑透明（画面不会有黑块）
    unsafe {
        SetLayeredWindowAttributes(hwnd, COLORREF(0), 255, LWA_COLORKEY | LWA_ALPHA)?;
    }

    // 告诉 DWM 不要最小化效果，并允许输入穿透（双重保险）
    unsafe {
        let allow: BOOL = FALSE.0 as _;
        let _ = windows::Win32::Graphics::Dwm::DwmSetWindowAttribute(
            hwnd,
            windows::Win32::Graphics::Dwm::DWMWINDOWATTRIBUTE(14), // DWMWA_EXCLUDED_FROM_PEEK
            &allow as *const _ as _,
            std::mem::size_of::<BOOL>() as u32,
        );
    }

    unsafe {
        UpdateWindow(hwnd);
    }

    // 向主程序发送 READY
    println_stdin_ready();

    // 消息循环 + 30FPS 渲染
    let mut msg = MSG::default();
    let mut last_redraw = Instant::now();
    let frame_interval = Duration::from_millis(33); // ~30FPS，省资源

    loop {
        let has_msg = unsafe { PeekMessageW(&mut msg, HWND(0), 0, 0, PM_REMOVE) }.as_bool();
        if has_msg {
            if msg.message == WM_QUIT { break; }
            unsafe {
                TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
        } else {
            if last_redraw.elapsed() >= frame_interval {
                state.lock().update_hover(); // 计算最近瞄点
                unsafe {
                    let hdc = GetDC(hwnd);
                    render::paint_frame(hwnd, hdc, screen_w, screen_h, &state.lock());
                    ReleaseDC(hwnd, hdc);
                }
                last_redraw = Instant::now();
            } else {
                thread::sleep(Duration::from_millis(1));
            }
        }
    }

    Ok(())
}

fn println_stdin_ready() {
    // KPP_EVT:{"type":"READY","pid":1234}
    let json = serde_json::json!({
        "type": "READY",
        "pid": std::process::id(),
    });
    let _ = writeln!(io::stdout(), "KPP_EVT:{}", json);
    let _ = io::stdout().flush();
}

/// 窗口过程（只处理基本消息，所有操作保持透明穿透）
pub extern "system" fn wnd_proc(
    hwnd: HWND,
    msg: u32,
    wparam: WPARAM,
    lparam: LPARAM,
) -> LRESULT {
    // 从创建时的 userdata 拿 state
    let state_ptr = unsafe {
        if msg == WM_CREATE {
            let cs = lparam.0 as *const CREATESTRUCTW;
            let ptr = (*cs).lpCreateParams as *mut Arc<Mutex<OverlayState>>;
            SetWindowLongPtrW(hwnd, GWLP_USERDATA, ptr as _);
            ptr
        } else {
            GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut Arc<Mutex<OverlayState>>
        }
    };

    match msg {
        WM_ERASEBKGND => {
            return LRESULT(1); // 不擦背景，避免闪烁
        }
        WM_PAINT => {
            if !state_ptr.is_null() {
                unsafe {
                    let state = &*(state_ptr);
                    let mut ps = PAINTSTRUCT::default();
                    let hdc = BeginPaint(hwnd, &mut ps);
                    let w = unsafe { GetSystemMetrics(SM_CXSCREEN) };
                    let h = unsafe { GetSystemMetrics(SM_CYSCREEN) };
                    render::paint_frame(hwnd, hdc, w, h, &state.lock());
                    EndPaint(hwnd, &ps);
                }
            }
            return LRESULT(0);
        }
        WM_DESTROY => {
            unsafe { PostQuitMessage(0) };
            return LRESULT(0);
        }
        // WM_MOUSEMOVE / 所有鼠标消息：默认 DefWindowProc 处理
        // 因为设置了 WS_EX_TRANSPARENT，Windows 会把这些消息直接传给下层窗口（游戏）
        _ => {}
    }

    unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) }
}

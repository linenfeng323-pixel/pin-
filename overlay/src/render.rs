//! Direct2D/GDI 渲染实现（Win32）
//! 三层结构：
//!   1. 卡片栏（底部/右侧 1-9 缩略卡）
//!   2. 三合一迷你卡（当前选中卡片的三张图）
//!   3. 瞄点圆圈层（最近瞄点自动高亮 + 关键词显示）
//!
//! 全程 100% 透明（任何不画东西的地方=纯黑→颜色键透明），不抢任何输入

use windows::Win32::Foundation::*;
use windows::Win32::Graphics::Gdi::*;
use windows::core::PWSTR;

use crate::state::{OverlayState, AimPointLite, TriadCardLite};

pub fn paint_frame(
    _hwnd: HWND,
    hdc: HDC,
    w: i32, h: i32,
    state: &OverlayState,
) {
    // 先整个刷成纯黑（颜色键会把黑色全透明）
    unsafe {
        let black = GetStockObject(BLACK_BRUSH);
        let mut rect = RECT { left: 0, top: 0, right: w, bottom: h };
        FillRect(hdc, &mut rect, HBRUSH(black.0));
    }

    if state.show_card_panel {
        if let Some(card) = state.current_card() {
            draw_triad_minicard(hdc, state, card);
        }
        draw_card_thumbnail_bar(hdc, state);
    }
    if state.show_aim_layer {
        draw_aim_layer(hdc, state);
    }
    draw_status_banner(hdc, state);
}

// =============================================================
// 绘图帮助函数（GDI，简单稳定，CPU 占用极低）
// =============================================================

fn rgb(r: u8, g: u8, b: u8) -> COLORREF { COLORREF((r as u32) | ((g as u32) << 8) | ((b as u32) << 16)) }

fn draw_line(hdc: HDC, x1: i32, y1: i32, x2: i32, y2: i32, color: COLORREF, w: i32) {
    unsafe {
        let pen = CreatePen(PS_SOLID, w, color);
        let old_pen = SelectObject(hdc, pen);
        MoveToEx(hdc, x1, y1, None);
        LineTo(hdc, x2, y2);
        SelectObject(hdc, old_pen);
        DeleteObject(pen);
    }
}

fn draw_rect_outline(hdc: HDC, x: i32, y: i32, w: i32, h: i32, color: COLORREF, lw: i32) {
    // 4 条线，避免填充
    draw_line(hdc, x, y, x + w, y, color, lw);
    draw_line(hdc, x + w, y, x + w, y + h, color, lw);
    draw_line(hdc, x + w, y + h, x, y + h, color, lw);
    draw_line(hdc, x, y + h, x, y, color, lw);
}

fn draw_rect_fill(hdc: HDC, x: i32, y: i32, w: i32, h: i32, color: COLORREF) {
    unsafe {
        let brush = CreateSolidBrush(color);
        let mut rect = RECT { left: x, top: y, right: x + w, bottom: y + h };
        FillRect(hdc, &mut rect, brush);
        DeleteObject(brush);
    }
}

fn draw_circle_outline(hdc: HDC, cx: i32, cy: i32, r: i32, color: COLORREF, lw: i32) {
    unsafe {
        let pen = CreatePen(PS_SOLID, lw, color);
        let old_pen = SelectObject(hdc, pen);
        let old_brush = SelectObject(hdc, GetStockObject(NULL_BRUSH));
        Ellipse(hdc, cx - r, cy - r, cx + r, cy + r);
        SelectObject(hdc, old_brush);
        SelectObject(hdc, old_pen);
        DeleteObject(pen);
    }
}

fn draw_circle_fill(hdc: HDC, cx: i32, cy: i32, r: i32, color: COLORREF) {
    unsafe {
        let brush = CreateSolidBrush(color);
        let old_brush = SelectObject(hdc, brush);
        let old_pen = SelectObject(hdc, GetStockObject(NULL_PEN));
        Ellipse(hdc, cx - r, cy - r, cx + r, cy + r);
        SelectObject(hdc, old_pen);
        SelectObject(hdc, old_brush);
        DeleteObject(brush);
    }
}

fn draw_text(hdc: HDC, text: &str, x: i32, y: i32, color: COLORREF, height: i32, bold: bool) {
    unsafe {
        let ws: Vec<u16> = text.encode_utf16().collect();
        let old_color = SetTextColor(hdc, color);
        let old_bk = SetBkMode(hdc, TRANSPARENT);
        let weight = if bold { FW_BOLD } else { FW_NORMAL };
        let hfont = CreateFontW(
            -height, 0, 0, 0,
            weight.0 as i32, 0, 0, 0,
            DEFAULT_CHARSET.0 as u32,
            OUT_DEFAULT_PRECIS.0 as u32,
            CLIP_DEFAULT_PRECIS.0 as u32,
            DEFAULT_QUALITY.0 as u32,
            (DEFAULT_PITCH | FF_DONTCARE).0 as u32,
            PWSTR::null(),
        );
        let old_font = SelectObject(hdc, hfont);
        let mut rect = RECT { left: x, top: y, right: x + 4000, bottom: y + height + 40 };
        DrawTextW(hdc, &ws, &mut rect, DT_LEFT | DT_TOP | DT_NOCLIP);
        SelectObject(hdc, old_font);
        DeleteObject(hfont);
        SetBkMode(hdc, old_bk);
        SetTextColor(hdc, old_color);
    }
}

fn measure_text_w(hdc: HDC, text: &str, height: i32) -> i32 {
    unsafe {
        let ws: Vec<u16> = text.encode_utf16().collect();
        let hfont = CreateFontW(-height, 0,0,0, FW_NORMAL.0 as i32,0,0,0,
            DEFAULT_CHARSET.0 as u32, OUT_DEFAULT_PRECIS.0 as u32,
            CLIP_DEFAULT_PRECIS.0 as u32, DEFAULT_QUALITY.0 as u32,
            (DEFAULT_PITCH | FF_DONTCARE).0 as u32, PWSTR::null());
        let old = SelectObject(hdc, hfont);
        let mut rect = RECT::default();
        DrawTextW(hdc, &ws, &mut rect, DT_CALCRECT | DT_LEFT | DT_TOP);
        SelectObject(hdc, old);
        DeleteObject(hfont);
        rect.right - rect.left
    }
}

// =============================================================
// 1. 三合一迷你卡（当前选中卡片的三图缩略）
// =============================================================
fn draw_triad_minicard(hdc: HDC, state: &OverlayState, card: &TriadCardLite) {
    let screen_w = state.screen_w;
    let w = state.minicard_width;
    let h = (w as f32 * 1.35) as i32;
    let x = screen_w - w - 24;
    let y = 96;

    // 半透明背景（深灰 + 圆角效果用双层矩形近似）
    draw_rect_fill(hdc, x, y, w, h, rgb(20, 20, 24));
    draw_rect_fill(hdc, x, y, w, 40, rgb(40, 40, 48));
    draw_rect_outline(hdc, x, y, w, h, rgb(80, 80, 96), 1);

    // 标题栏
    draw_text(hdc, &format!("📍 {}", card.stand_name), x + 12, y + 10, rgb(255, 255, 255), 16, true);

    // 三张图占位（实际实现要加载图片，这里画颜色块示意）
    let img_w = w - 24;
    let img_h = ((w - 24) as f32 * 9.0 / 16.0) as i32;
    let mut iy = y + 54;
    draw_triple_image_placeholder(hdc, x + 12, iy, img_w, img_h, "① 站位", rgb(40, 120, 180));
    iy += img_h + 8;
    if card.img_aim.is_some() {
        draw_triple_image_placeholder(hdc, x + 12, iy, img_w, img_h, "② 瞄准", rgb(180, 140, 40));
        iy += img_h + 8;
    }
    if card.img_land.is_some() {
        draw_triple_image_placeholder(hdc, x + 12, iy, img_w, img_h, "③ 落点", rgb(140, 40, 180));
    }

    // 瞄点数量提示
    let footer_text = format!("🎯 瞄点：{} 个 | 按 Ctrl+B 显示/隐藏圆圈", card.aim_points.len());
    draw_text(hdc, &footer_text, x + 12, y + h - 24, rgb(180, 180, 200), 13, false);
}

fn draw_triple_image_placeholder(hdc: HDC, x: i32, y: i32, w: i32, h: i32, label: &str, border: COLORREF) {
    draw_rect_fill(hdc, x, y, w, h, rgb(10, 10, 14));
    draw_rect_outline(hdc, x, y, w, h, border, 1);
    let tw = measure_text_w(hdc, label, 15);
    draw_text(hdc, label, x + (w - tw) / 2, y + (h - 30) / 2, rgb(220, 220, 230), 15, true);
    draw_text(hdc, "(实际显示截图)", x + (w - 120) / 2, y + (h + 8) / 2, rgb(140, 140, 160), 11, false);
}

// =============================================================
// 2. 底部卡片缩略条（1~9 切卡）
// =============================================================
fn draw_card_thumbnail_bar(hdc: HDC, state: &OverlayState) {
    if state.cards.is_empty() { return; }
    let screen_w = state.screen_w;
    let screen_h = state.screen_h;
    let thumb_w = 150;
    let thumb_h = 90;
    let gap = 12;
    let total = state.cards.len().min(9) as i32;
    let total_w = total * thumb_w + (total - 1) * gap;
    let mut x = (screen_w - total_w) / 2;
    let y = screen_h - thumb_h - 30;

    for (i, card) in state.cards.iter().take(9).enumerate() {
        let sel = i == state.selected_index;
        let bg = if sel { rgb(60, 60, 80) } else { rgb(24, 24, 32) };
        let border = if sel { rgb(0, 122, 255) } else { rgb(70, 70, 90) };
        draw_rect_fill(hdc, x, y, thumb_w, thumb_h, bg);
        draw_rect_outline(hdc, x, y, thumb_w, thumb_h, border, if sel { 3 } else { 1 });
        // 编号
        draw_text(hdc, &format!("[{}]", i + 1), x + 8, y + 6, if sel { rgb(255,255,255) } else { rgb(170,170,190) }, 12, true);
        // 站位名
        let mut text = card.stand_name.clone();
        if text.chars().count() > 8 { text = text.chars().take(8).collect::<String>() + "…"; }
        draw_text(hdc, &text, x + 10, y + thumb_h - 44, rgb(255, 255, 255), 13, false);
        // 瞄点数
        draw_text(hdc, &format!("🎯{}", card.aim_points.len()), x + thumb_w - 40, y + thumb_h - 26, rgb(255, 200, 80), 12, false);
        x += thumb_w + gap;
    }
}

// =============================================================
// 3. 瞄点圆圈层（最近瞄点自动高亮）
// =============================================================
fn draw_aim_layer(hdc: HDC, state: &OverlayState) {
    let Some(card) = state.current_card() else { return; };
    let cx = state.screen_w / 2;
    let cy = state.screen_h / 2;

    let selected_aim_i = state.nearest_aim.and_then(|(_c, ai)| Some(ai));

    for (i, ap) in card.aim_points.iter().enumerate() {
        let (ax, ay) = state.aim_with_adjust(&card.id, ap);
        let nearest = Some(i) == selected_aim_i;
        let category_color = category_to_color(&ap.category);

        if nearest {
            // 最近的：大圆圈（半径 46）+ 粗线 + 高亮
            draw_circle_outline(hdc, ax, ay, 50, rgb(255, 255, 255), 1);
            draw_circle_outline(hdc, ax, ay, 40, category_color, 4);
            draw_circle_fill(hdc, ax, ay, 5, category_color);
            // 瞄准十字（最近的特别画）
            let cs = 80;
            draw_line(hdc, ax - cs, ay, ax - 15, ay, category_color, 2);
            draw_line(hdc, ax + 15, ay, ax + cs, ay, category_color, 2);
            draw_line(hdc, ax, ay - cs, ax, ay - 15, category_color, 2);
            draw_line(hdc, ax, ay + 15, ax, ay + cs, category_color, 2);
            // 关键词大字 + 背景框
            let kw = ap.keyword.clone();
            let text_h = 20;
            let tw = measure_text_w(hdc, &kw, text_h) + 24;
            let tx = ax - tw / 2;
            let ty = ay + 60;
            draw_rect_fill(hdc, tx - 2, ty - 4, tw, text_h + 12, rgb(0, 0, 0));
            draw_rect_outline(hdc, tx - 2, ty - 4, tw, text_h + 12, category_color, 2);
            draw_text(hdc, &kw, tx + 10, ty, rgb(255, 255, 255), text_h, true);
            // 名称
            let label = format!("{}.{}", ap.index, ap.name);
            draw_text(hdc, &label, ax - 50, ay - 70, rgb(255, 255, 255), 16, true);
            // 蓄力格数
            if let Some(cb) = ap.charge_bars {
                if cb > 0 { draw_charge_bar(hdc, ax - 60, ay + 100, 120, cb); }
            }
            // 方向+距离提示
            let dx = ax - cx;
            let dy = ay - cy;
            let (dir, dist) = dir_and_dist(dx, dy);
            let hint = format!("方向 {} 距离 {}px", dir, dist);
            draw_text(hdc, &hint, ax - 90, ay + ty + text_h + 10, category_color, 13, false);
        } else {
            // 未选中的：小圆圈 26px + 编号
            draw_circle_outline(hdc, ax, ay, 28, rgb(200,200,210), 2);
            draw_circle_fill(hdc, ax, ay, 3, rgb(255,255,255));
            // 编号小标签（左上角）
            draw_rect_fill(hdc, ax - 40, ay - 42, 28, 22, category_color);
            draw_text(hdc, &ap.index.to_string(), ax - 33, ay - 38, rgb(255,255,255), 14, true);
            // 关键词小字（灰色）
            draw_text(hdc, &ap.name, ax - 30, ay + 36, rgb(210,210,220), 12, false);
        }
    }
}

fn draw_charge_bar(hdc: HDC, x: i32, y: i32, w: i32, bars: u8) {
    let slot = bars.max(1).min(4);
    let cell_w = w / 4;
    draw_rect_outline(hdc, x, y, w, 14, rgb(150,150,170), 1);
    for i in 0..4 {
        let filled = (i as u8) < slot;
        let color = if filled { rgb(255, 180, 40) } else { rgb(40, 40, 50) };
        draw_rect_fill(hdc, x + 2 + i * cell_w, y + 2, cell_w - 4, 10, color);
    }
    draw_text(hdc, &format!("蓄力 {} 格", slot), x, y + 18, rgb(255,180,40), 12, true);
}

fn category_to_color(cat: &str) -> COLORREF {
    match cat {
        "smoke"   => rgb(52, 199, 89),   // 绿
        "flash"   => rgb(255, 214, 10),  // 黄
        "molotov" => rgb(255, 149, 0),   // 橙
        "grenade" => rgb(255, 59, 48),   // 红
        "ability" => rgb(0, 122, 255),   // 蓝
        _         => rgb(180, 180, 200),
    }
}

fn dir_and_dist(dx: i32, dy: i32) -> (String, i32) {
    use std::f64::consts::PI;
    let dist = ((dx*dx + dy*dy) as f64).sqrt() as i32;
    if dist < 5 { return ("⭕ 正中央".to_string(), dist); }
    let ang = (dy as f64).atan2(dx as f64) * 180.0 / PI; // -180 ~ 180, 0 = 右
    let s = match ang {
        a if a >= -22.5 && a < 22.5   => "→",
        a if a >= 22.5  && a < 67.5   => "↘",
        a if a >= 67.5  && a < 112.5  => "↓",
        a if a >= 112.5 && a < 157.5  => "↙",
        a if a >= 157.5 || a < -157.5 => "←",
        a if a >= -157.5 && a < -112.5=> "↖",
        a if a >= -112.5 && a < -67.5 => "↑",
        _ => "↗",
    };
    (s.to_string(), dist)
}

// =============================================================
// 4. 顶部会话 Banner（当前地图/阵营/英雄）+ 底部提示
// =============================================================
fn draw_status_banner(hdc: HDC, state: &OverlayState) {
    let w = state.screen_w;
    // 顶部：只在卡片层或瞄点层打开时显示
    if state.show_card_panel || state.show_aim_layer {
        let parts: Vec<String> = vec![
            state.map_id.clone().unwrap_or_default(),
            state.side.clone().unwrap_or_default(),
            state.hero_id.clone().unwrap_or_default(),
        ].into_iter().filter(|s|!s.is_empty()).collect();
        if !parts.is_empty() {
            let text = format!("🎮 {}", parts.join("  ·  "));
            let tw = measure_text_w(hdc, &text, 14) + 32;
            let bx = (w - tw) / 2;
            draw_rect_fill(hdc, bx, 24, tw, 32, rgb(0, 0, 0));
            draw_rect_outline(hdc, bx, 24, tw, 32, rgb(0, 122, 255), 1);
            draw_text(hdc, &text, bx + 16, 30, rgb(255, 255, 255), 14, true);
        }
    }
}

//! Overlay 状态机：卡片列表 + 当前选中 + 瞄点高亮计算
//! 线程安全（外部加锁）

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::ipc::OverlayCommand;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AimPointLite {
    pub index: u8,
    pub name: String,
    pub x: i32,
    pub y: i32,
    pub keyword: String,
    pub keyword_color: Option<String>,
    pub charge_bars: Option<u8>,
    pub category: String, // smoke/flash/molotov/grenade/ability
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriadCardLite {
    pub id: String,
    pub stand_name: String,
    pub img_stand: String,
    pub img_aim: Option<String>,
    pub img_land: Option<String>,
    pub aim_points: Vec<AimPointLite>,
}

pub struct OverlayState {
    // 会话信息
    pub game: Option<String>,
    pub map_id: Option<String>,
    pub side: Option<String>,
    pub hero_id: Option<String>,

    // 当前已加载卡片 + 选中
    pub cards: Vec<TriadCardLite>,
    pub selected_index: usize,

    // 显示状态
    pub show_card_panel: bool,
    pub show_aim_layer: bool,

    // UI 参数
    pub opacity: f32,     // 0-1
    pub minicard_width: i32,

    // 瞄点坐标微调：key=cardId:idx value=(dx, dy)
    pub adjusts: HashMap<String, (i32, i32)>,

    // 运行时缓存
    pub nearest_aim: Option<(usize, usize)>, // (card_idx, aim_idx)
    pub screen_w: i32,
    pub screen_h: i32,

    // 自动淡出计时
    pub opened_at: Option<std::time::Instant>,
    pub auto_fade_secs: u64,
}

impl Default for OverlayState {
    fn default() -> Self {
        Self {
            game: None, map_id: None, side: None, hero_id: None,
            cards: vec![], selected_index: 0,
            show_card_panel: false,
            show_aim_layer: false,
            opacity: 0.9,
            minicard_width: 380,
            adjusts: HashMap::new(),
            nearest_aim: None,
            screen_w: 1920, screen_h: 1080,
            opened_at: None,
            auto_fade_secs: 15,
        }
    }
}

impl OverlayState {
    pub fn apply_command(&mut self, cmd: OverlayCommand) {
        match cmd {
            OverlayCommand::UpdateSession { game, map_id, side, hero_id } => {
                self.game = game;
                self.map_id = map_id;
                self.side = side;
                self.hero_id = hero_id;
            }
            OverlayCommand::UpdateCards { mut cards, selected_index, ocr_matches: _ } => {
                // 过滤数据字段名适配：JSON 是 snake_case/camelCase
                self.cards.clear();
                for c in cards.drain(..) {
                    self.cards.push(c);
                }
                self.selected_index = selected_index.min(self.cards.len().saturating_sub(1));
                self.show_card_panel = true;
                self.opened_at = Some(std::time::Instant::now());
            }
            OverlayCommand::ToggleCardPanel { show } => {
                self.show_card_panel = show;
                self.opened_at = if show { Some(std::time::Instant::now()) } else { None };
            }
            OverlayCommand::ToggleAimLayer { show } => {
                self.show_aim_layer = show;
                self.opened_at = if show || self.show_card_panel {
                    Some(std::time::Instant::now())
                } else { None };
            }
            OverlayCommand::SelectCardIndex { index } => {
                self.selected_index = index.min(self.cards.len().saturating_sub(1));
            }
            OverlayCommand::NudgeAim { dx, dy } => {
                if let Some(card) = self.cards.get(self.selected_index) {
                    if let Some(aim) = card.aim_points.first() {
                        let key = format!("{}:{}", card.id, aim.index);
                        let cur = self.adjusts.entry(key).or_insert((0, 0));
                        cur.0 += dx;
                        cur.1 += dy;
                    }
                }
            }
            OverlayCommand::SetOpacity { opacity } => {
                self.opacity = opacity.clamp(0.0, 1.0);
            }
            OverlayCommand::SetMinicardSize { width } => {
                self.minicard_width = width.max(240).min(720);
            }
            OverlayCommand::TtsSpeak { text: _ } => {
                // TODO: 调 SAPI，非核心
            }
            OverlayCommand::Shutdown => {
                self.cards.clear();
                self.show_card_panel = false;
                self.show_aim_layer = false;
            }
        }
    }

    /// 每帧计算：当前屏幕中心（准星）距离哪个瞄点最近 → 高亮它
    pub fn update_hover(&mut self) {
        if !self.show_aim_layer { self.nearest_aim = None; return; }
        let Some(card) = self.cards.get(self.selected_index) else {
            self.nearest_aim = None; return;
        };
        if card.aim_points.is_empty() { self.nearest_aim = None; return; }

        let cx = self.screen_w / 2;
        let cy = self.screen_h / 2;
        let mut best = (0, i64::MAX);

        for (i, ap) in card.aim_points.iter().enumerate() {
            let adj = self.adjusts.get(&format!("{}:{}", card.id, ap.index)).copied().unwrap_or((0, 0));
            let ax = ap.x + adj.0;
            let ay = ap.y + adj.1;
            let dx = (ax - cx) as i64;
            let dy = (ay - cy) as i64;
            let d = dx*dx + dy*dy;
            if d < best.1 { best = (i, d); }
        }
        self.nearest_aim = Some((self.selected_index, best.0));

        // 自动淡出
        if let Some(t) = self.opened_at {
            if t.elapsed().as_secs() > self.auto_fade_secs {
                self.show_card_panel = false;
                self.show_aim_layer = false;
                self.opened_at = None;
            }
        }
    }

    pub fn current_card(&self) -> Option<&TriadCardLite> {
        self.cards.get(self.selected_index)
    }

    pub fn aim_with_adjust(&self, card_id: &str, ap: &AimPointLite) -> (i32, i32) {
        let adj = self.adjusts.get(&format!("{card_id}:{}", ap.index)).copied().unwrap_or((0, 0));
        (ap.x + adj.0, ap.y + adj.1)
    }
}

//! IPC 协议：Overlay ↔ 主程序（sidecar stdin/stdout JSON 行协议）

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OverlayCommand {
    UpdateSession {
        game: Option<String>,
        map_id: Option<String>,
        side: Option<String>,
        hero_id: Option<String>,
    },
    UpdateCards {
        cards: Vec<crate::state::TriadCardLite>,
        selected_index: usize,
        #[serde(default)]
        ocr_matches: Vec<serde_json::Value>,
    },
    ToggleCardPanel { show: bool },
    ToggleAimLayer { show: bool },
    SelectCardIndex { index: usize },
    NudgeAim { dx: i32, dy: i32 },
    SetOpacity { opacity: f32 },
    SetMinicardSize { width: i32 },
    TtsSpeak { text: String },
    #[serde(other)]
    Shutdown,
}

#[derive(Debug, Serialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum OverlayEvent {
    Ready { pid: u32 },
    CardPanelToggled { show: bool },
    AimLayerToggled { show: bool },
    CardSelected { index: usize, card_id: String },
    NearestAimpointChanged {
        card_id: String,
        aim_index: u8,
        aim_name: String,
    },
    Error { message: String },
}

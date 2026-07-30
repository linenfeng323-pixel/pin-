// =====================================================
// 核心类型定义（全局唯一，所有模块统一引用）
// 命名空间：kpp (Knowledge Pin Pro)
// =====================================================

export type Side = 'attack' | 'defense' | 'both';

export type CategoryColor =
  | 'smoke'     // 烟 - 绿色
  | 'flash'     // 闪 - 黄色
  | 'molotov'   // 火 - 橙色
  | 'grenade'   // 雷 - 红色
  | 'ability';  // 技能 - 蓝色

// -------------------- 开局会话 --------------------
export interface GameSession {
  game: string | null;
  mapId: string | null;
  side: Exclude<Side, 'both'> | null;
  heroId: string | null;
}

export interface SessionPreset {
  id: string;
  name: string;
  game: string | null;
  mapId: string | null;
  side: Exclude<Side, 'both'> | null;
  heroId: string | null;
  createdAt: number;
}

// -------------------- 游戏基础数据 --------------------
export interface GameDefinition {
  id: string;          // valorant / cs2 / delta
  name: string;        // 无畏契约
  maps: MapDefinition[];
  heroes: HeroDefinition[];
}

export interface MapDefinition {
  id: string;              // bind / haven / lotus
  name: string;            // 莲华古城 / Bind
  gameId?: string;         // 冗余
  thumbnail?: string;      // 预览图路径
}

/** backup / 导入导出用的地图元数据，和 MapDefinition 结构保持兼容 */
export type MapMeta = MapDefinition;

export interface HeroDefinition {
  id: string;              // jett / sova
  name: string;            // 捷力 / 猎枭
  mapIdsAllowed?: string[]; // 特定地图推荐（可选）
  role?: 'Duelist' | 'Controller' | 'Initiator' | 'Sentinel';
  avatar?: string;
}

// -------------------- 小地图 OCR 文字库 --------------------
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OCRKeyword {
  id: string;
  /** 主词，例如："A区" */
  main: string;
  /** 别名（OCR 命中任何一个都算命中） */
  aliases: string[];
}

export interface MapOCRDictionary {
  mapId: string;
  keywords: OCRKeyword[];
  /** key = 分辨率宽x高，例如 "1920x1080" */
  smallMapRectByResolution: Record<string, Rect>;
}

// -------------------- 三合一卡片 --------------------
/** 一个瞄点 = 圆圈位置（和卡片绑定，固定不变） */
export interface AimPoint {
  index: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  name: string;
  /** 相对于屏幕中心的偏移像素坐标（overlay 直接画） */
  x: number;
  y: number;
  /** 用户自定义扔法关键词（完整显示文字） */
  keyword: string;
  keywordColor?: string;
  /** 蓄力格数 0-4 */
  chargeBars?: 0 | 1 | 2 | 3 | 4;
  /** 分类决定圆圈基础颜色 */
  category: CategoryColor;

  // ---- UI 展示专用字段（不入库，保存时会基于 pct 回写 x/y 绝对坐标） ----
  /** 百分比 X 坐标（0~100），用于卡片编辑器点击画点时的相对定位 */
  xPct?: number;
  /** 百分比 Y 坐标（0~100） */
  yPct?: number;
}

/** 三合一（站位 + 瞄准 + 落点）卡片 */
export interface TriadCard {
  id: string;
  // --- 分类绑定（过滤用） ---
  game?: string;
  mapId: string;
  side: Side;
  heroId?: string;
  /** OCR 触发弹卡的标签（关键词 ID 列表） */
  ocrTagIds: string[];

  // --- 站位 ---
  standName: string;
  standNote?: string;

  // --- 三合一三张图（本地相对路径 / base64 / zip:// 三种可能） ---
  imgStand: string;
  imgAim?: string;
  imgLand?: string;

  // --- 多个瞄点（圆圈） ---
  aimPoints: AimPoint[];

  // --- 元信息 ---
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  usageCount: number;
  star?: boolean;
}

// -------------------- 自定义热键 --------------------
export type HotkeyActionId =
  | 'toggle_card_panel'      // Ctrl+M 弹/关卡片栏
  | 'toggle_aim_layer'      // Ctrl+B 弹/关瞄点圆圈层
  | 'close_all_overlay'     // Ctrl+N 一键全关
  | 'nudge_aim_up'          // I 上微调 5px
  | 'nudge_aim_down'        // K
  | 'nudge_aim_left'        // J
  | 'nudge_aim_right'       // L
  | 'nudge_aim_up_fine'     // Shift+I 1px
  | 'nudge_aim_down_fine'   // Shift+K
  | 'nudge_aim_left_fine'   // Shift+J
  | 'nudge_aim_right_fine'  // Shift+L
  | 'opacity_minus'         // [-]
  | 'opacity_plus'          // [+]
  | 'select_card_1'         // 1~9 切卡片
  | 'select_card_2'
  | 'select_card_3'
  | 'select_card_4'
  | 'select_card_5'
  | 'select_card_6'
  | 'select_card_7'
  | 'select_card_8'
  | 'select_card_9'
  | 'ocr_identify_minimap'; // 额外：手动触发 OCR 弹卡

export interface HotkeyBinding {
  actionId: HotkeyActionId;
  /** 组合键字符串，例如 "Ctrl+M" */
  accelerator: string;
  enabled: boolean;
}

export const DEFAULT_HOTKEYS: HotkeyBinding[] = [
  { actionId: 'toggle_card_panel',       accelerator: 'Ctrl+M', enabled: true },
  { actionId: 'toggle_aim_layer',        accelerator: 'Ctrl+B', enabled: true },
  { actionId: 'close_all_overlay',       accelerator: 'Ctrl+N', enabled: true },
  { actionId: 'nudge_aim_up',            accelerator: 'I',      enabled: true },
  { actionId: 'nudge_aim_down',          accelerator: 'K',      enabled: true },
  { actionId: 'nudge_aim_left',          accelerator: 'J',      enabled: true },
  { actionId: 'nudge_aim_right',         accelerator: 'L',      enabled: true },
  { actionId: 'nudge_aim_up_fine',       accelerator: 'Shift+I',enabled: true },
  { actionId: 'nudge_aim_down_fine',     accelerator: 'Shift+K',enabled: true },
  { actionId: 'nudge_aim_left_fine',     accelerator: 'Shift+J',enabled: true },
  { actionId: 'nudge_aim_right_fine',    accelerator: 'Shift+L',enabled: true },
  { actionId: 'opacity_minus',           accelerator: 'Minus',  enabled: true },
  { actionId: 'opacity_plus',            accelerator: 'Equal',  enabled: true },
  { actionId: 'select_card_1',           accelerator: 'Digit1', enabled: true },
  { actionId: 'select_card_2',           accelerator: 'Digit2', enabled: true },
  { actionId: 'select_card_3',           accelerator: 'Digit3', enabled: true },
  { actionId: 'select_card_4',           accelerator: 'Digit4', enabled: true },
  { actionId: 'select_card_5',           accelerator: 'Digit5', enabled: true },
  { actionId: 'select_card_6',           accelerator: 'Digit6', enabled: true },
  { actionId: 'select_card_7',           accelerator: 'Digit7', enabled: true },
  { actionId: 'select_card_8',           accelerator: 'Digit8', enabled: true },
  { actionId: 'select_card_9',           accelerator: 'Digit9', enabled: true },
  { actionId: 'ocr_identify_minimap',    accelerator: 'Ctrl+Shift+M', enabled: true },
];

// -------------------- 全局 UI 配置 --------------------
export interface UIPreferences {
  /** Mac 风格主题 */
  theme: 'mac-light' | 'mac-dark' | 'auto';
  /** 三合一迷你卡默认透明度 0-1 */
  defaultOpacity: number;
  /** 三合一迷你卡默认宽（px） */
  defaultMinicardWidth: number;
  /** 最近瞄点高亮时的扔法 TTS 播报 */
  enableTTS: boolean;
  /** Overlay 自动淡出秒数 */
  autoFadeSeconds: number;
  /** 启动时是否显示开局选择器 */
  showSessionPickerOnStartup: boolean;
  /** GitHub 在线更新仓库 owner/repo */
  updaterRepo?: string;
  /** 启动自动检查更新 */
  autoCheckUpdate?: boolean;
}

export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  theme: 'auto',
  defaultOpacity: 0.85,
  defaultMinicardWidth: 380,
  enableTTS: false,
  autoFadeSeconds: 15,
  showSessionPickerOnStartup: true,
  autoCheckUpdate: true,
};

// -------------------- 工具类型 --------------------
export interface OCRResultMatch {
  keywordId: string;
  matchedText: string;
  confidence: number;
}

/** 导出 / 导入包结构 */
export interface BackupPackage {
  version: 1;
  exportedAt: number;
  appVersion: string;
  games: GameDefinition[];
  ocrDictionaries: MapOCRDictionary[];
  cards: TriadCard[];
  /** base64 内联图片 key = 原相对路径，value = data:image/png;base64,... */
  embeddedImages: Record<string, string>;
}

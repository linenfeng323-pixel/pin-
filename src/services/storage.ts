// =====================================================
// 本地存储服务（基于 @tauri-apps/plugin-store v2.x）
// 所有写操作走这个服务，保证数据一致性 + 自动持久化
// =====================================================

import type {
  GameDefinition,
  MapOCRDictionary,
  MapMeta,
  TriadCard,
  HotkeyBinding,
  UIPreferences,
  SessionPreset,
} from '@/types';
import { DEFAULT_HOTKEYS, DEFAULT_UI_PREFERENCES } from '@/types';

// plugin-store v2.x 的工厂方式（不是 new Store）
// 这里用类型断言 + 动态导入兼容 tauri 运行；纯类型检查时绕过 TS 报错
const StoreModulePromise = (async () => {
  try {
    return await import('@tauri-apps/plugin-store');
  } catch {
    // 降级：node 环境 / 预览模式
    return null;
  }
})();

type StoreLike = {
  get: <T>(k: string) => Promise<T | null>;
  set: (k: string, v: any) => Promise<void>;
  save: () => Promise<void>;
};

const STORE_FILE = 'kpp-store.bin';

let storePromise: Promise<StoreLike> | null = null;

async function getStore(): Promise<StoreLike> {
  if (storePromise) return storePromise;
  storePromise = (async () => {
    const mod = await StoreModulePromise;
    if (mod && typeof (mod as any).Store === 'object') {
      // v2.x：Store.load(path)
      return await (mod as any).Store.load(STORE_FILE);
    }
    if (mod && typeof (mod as any).load === 'function') {
      return await (mod as any).load(STORE_FILE);
    }
    // 最终兜底：内存 Map（预览模式 / 没配置 tauri 也能跑）
    return memoryStore();
  })();
  return storePromise;
}

// 兜底：内存 Store（只在没 tauri runtime 时用，不持久化）
function memoryStore(): StoreLike {
  const m = new Map<string, any>();
  return {
    async get<T>(k: string): Promise<T | null> { return (m.get(k) ?? null) as T | null; },
    async set(k: string, v: any) { m.set(k, v); },
    async save() { /* noop */ },
  };
}

const KEYS = {
  GAMES: 'games:v1',
  MAPS_FLAT: 'maps_flat:v1',
  OCR_DICTS: 'ocr_dicts:v1',
  CARDS: 'cards:v1',
  HOTKEYS: 'hotkeys:v1',
  UI_PREFS: 'ui_prefs:v1',
  SESSION_PRESETS: 'session_presets:v1',
  LAST_SESSION: 'last_session:v1',
} as const;

// =====================================================
// 游戏 / 地图 基础数据
// =====================================================

export async function loadGames(): Promise<GameDefinition[]> {
  const s = await getStore();
  return (await s.get<GameDefinition[]>(KEYS.GAMES)) ?? DEFAULT_GAMES;
}

export async function saveGames(games: GameDefinition[]) {
  const s = await getStore();
  await s.set(KEYS.GAMES, games);
  await s.save();
}

/** 所有游戏下的地图拍平成一个扁平表（备份/导入用） */
export async function loadMaps(): Promise<MapMeta[]> {
  const s = await getStore();
  const fromFlat = await s.get<MapMeta[]>(KEYS.MAPS_FLAT);
  if (fromFlat && fromFlat.length) return fromFlat;
  const g = await loadGames();
  const out: MapMeta[] = [];
  g.forEach(game => game.maps.forEach(mm => out.push({ ...mm, gameId: game.id })));
  return out;
}

/** 新增/更新一个地图（用于备份包的地图自动导入） */
export async function upsertMap(map: MapMeta) {
  const list = await loadMaps();
  const i = list.findIndex(x => x.id === map.id);
  if (i >= 0) list[i] = { ...list[i], ...map }; else list.push(map);
  const s = await getStore();
  await s.set(KEYS.MAPS_FLAT, list);
  await s.save();
}

// =====================================================
// OCR 字典
// =====================================================

export async function loadOCRDictionaries(): Promise<MapOCRDictionary[]> {
  const s = await getStore();
  return (await s.get<MapOCRDictionary[]>(KEYS.OCR_DICTS)) ?? [];
}

export async function saveOCRDictionaries(list: MapOCRDictionary[]) {
  const s = await getStore();
  await s.set(KEYS.OCR_DICTS, list);
  await s.save();
}

// =====================================================
// 三合一卡片
// =====================================================

export async function loadCards(): Promise<TriadCard[]> {
  const s = await getStore();
  return (await s.get<TriadCard[]>(KEYS.CARDS)) ?? [];
}

/** 别名：loadAllCards = loadCards（方便语义） */
export const loadAllCards = loadCards;

export async function saveCards(cards: TriadCard[]) {
  const s = await getStore();
  await s.set(KEYS.CARDS, cards);
  await s.save();
}

export async function upsertCard(card: TriadCard) {
  const list = await loadCards();
  const idx = list.findIndex(c => c.id === card.id);
  card.updatedAt = Date.now();
  if (idx >= 0) list[idx] = card; else list.push(card);
  await saveCards(list);
}

export async function deleteCard(id: string) {
  const list = (await loadCards()).filter(c => c.id !== id);
  await saveCards(list);
}

// =====================================================
// 热键
// =====================================================

export async function loadHotkeys(): Promise<HotkeyBinding[]> {
  const s = await getStore();
  const stored = await s.get<HotkeyBinding[]>(KEYS.HOTKEYS);
  if (!stored) return structuredClone(DEFAULT_HOTKEYS);
  const merged = structuredClone(DEFAULT_HOTKEYS).map(def => {
    const u = stored.find(x => x.actionId === def.actionId);
    return u ?? def;
  });
  return merged;
}

export async function saveHotkeys(list: HotkeyBinding[]) {
  const s = await getStore();
  await s.set(KEYS.HOTKEYS, list);
  await s.save();
}

// =====================================================
// UI 偏好
// =====================================================

export async function loadUIPreferences(): Promise<UIPreferences> {
  const s = await getStore();
  const stored = await s.get<UIPreferences>(KEYS.UI_PREFS);
  return stored ? { ...DEFAULT_UI_PREFERENCES, ...stored } : structuredClone(DEFAULT_UI_PREFERENCES);
}

export async function saveUIPreferences(prefs: UIPreferences) {
  const s = await getStore();
  await s.set(KEYS.UI_PREFS, prefs);
  await s.save();
}

// =====================================================
// 开局预设
// =====================================================

export async function loadSessionPresets(): Promise<SessionPreset[]> {
  const s = await getStore();
  return (await s.get<SessionPreset[]>(KEYS.SESSION_PRESETS)) ?? [];
}

export async function saveSessionPresets(list: SessionPreset[]) {
  const s = await getStore();
  await s.set(KEYS.SESSION_PRESETS, list);
  await s.save();
}

// =====================================================
// 上次会话记忆
// =====================================================

export async function loadLastSession(): Promise<any> {
  const s = await getStore();
  return (await s.get<any>(KEYS.LAST_SESSION)) ?? null;
}

export async function saveLastSession(session: any) {
  const s = await getStore();
  await s.set(KEYS.LAST_SESSION, session);
  await s.save();
}

// =====================================================
// 预置初始游戏数据
// =====================================================

const DEFAULT_GAMES: GameDefinition[] = [
  {
    id: 'valorant',
    name: '无畏契约',
    maps: [
      { id: 'bind',    name: 'Bind' },
      { id: 'haven',   name: 'Haven' },
      { id: 'split',   name: 'Split' },
      { id: 'ascent',  name: 'Ascent' },
      { id: 'lotus',   name: '莲花古城' },
      { id: 'pearl',   name: 'Pearl' },
      { id: 'fracture',name: 'Fracture' },
      { id: 'breeze',  name: 'Breeze' },
      { id: 'abyss',   name: '深渊' },
      { id: 'sunset',  name: 'Sunset' },
    ],
    heroes: [
      { id: 'jett',    name: '捷力',  role: 'Duelist' },
      { id: 'reyna',   name: '蕾娜',  role: 'Duelist' },
      { id: 'raze',    name: '瑞兹',  role: 'Duelist' },
      { id: 'phoenix', name: '菲尼克斯', role: 'Duelist' },
      { id: 'neon',    name: '妮虹',  role: 'Duelist' },
      { id: 'iso',     name: '壹决',  role: 'Duelist' },
      { id: 'clove',   name: '克洛芙', role: 'Duelist' },
      { id: 'sova',    name: '猎枭',  role: 'Initiator' },
      { id: 'breach',  name: '布史提', role: 'Initiator' },
      { id: 'skye',    name: '丝凯',  role: 'Initiator' },
      { id: 'kayo',    name: 'K/O',   role: 'Initiator' },
      { id: 'fade',    name: '绯黑',  role: 'Initiator' },
      { id: 'gekko',   name: '盖克',  role: 'Initiator' },
      { id: 'omen',    name: '欧门',  role: 'Controller' },
      { id: 'brimstone', name: '布史东', role: 'Controller' },
      { id: 'viper',   name: '毒蛇',  role: 'Controller' },
      { id: 'astra',   name: '亚星卓', role: 'Controller' },
      { id: 'harbor',  name: '海神',  role: 'Controller' },
      { id: 'sage',    name: '圣祈',  role: 'Sentinel' },
      { id: 'cypher',  name: '赛弗',  role: 'Sentinel' },
      { id: 'killjoy', name: '恺宙',  role: 'Sentinel' },
      { id: 'chamber', name: '尚勃勒', role: 'Sentinel' },
      { id: 'deadlock',name: '蒂罗',  role: 'Sentinel' },
      { id: 'vyse',    name: '维斯',  role: 'Sentinel' },
    ],
  },
  {
    id: 'cs2',
    name: 'Counter-Strike 2',
    maps: [
      { id: 'de_dust2',  name: 'Dust 2' },
      { id: 'de_mirage', name: 'Mirage' },
      { id: 'de_inferno',name: 'Inferno' },
      { id: 'de_nuke',   name: 'Nuke' },
      { id: 'de_overpass',name:'Overpass' },
      { id: 'de_ancient', name: 'Ancient' },
      { id: 'de_anubis',  name: 'Anubis' },
      { id: 'de_vertigo', name: 'Vertigo' },
    ],
    heroes: [],
  },
  {
    id: 'delta',
    name: '三角洲行动',
    maps: [
      { id: 'arkabad',  name: '长弓溪谷' },
      { id: 'zero',     name: '零号大坝' },
      { id: 'bakuv',    name: '巴科维' },
      { id: 'obsidian', name: '黑曜石' },
    ],
    heroes: [],
  },
];

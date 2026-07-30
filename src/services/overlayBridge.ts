// =====================================================
// Overlay IPC 桥（Tauri 主程序 ↔ Overlay 独立进程 / 事件总线）
// 两种通道并存：
//   A) 主进程内事件总线（kpp://overlay-cmd / kpp://overlay-event）
//      —— 当 overlay 作为 tauri 的另一 label 窗口时使用（推荐，最简单）
//   B) 外部 sidecar 子进程 stdin/stdout JSON 行协议（KPP_REQ: / KPP_EVT:）
//      —— 当 overlay 是独立 Rust 进程时使用（WS_EX_TRANSPARENT 全屏画）
// =====================================================

import type { Child } from '@tauri-apps/plugin-shell';
import type { TriadCard, OCRResultMatch, AimPoint } from '@/types';

export const OVERLAY_EVENT_CHANNEL = 'kpp://overlay-event';
export const OVERLAY_CMD_CHANNEL = 'kpp://overlay-cmd';

// -------------------- 消息类型 --------------------
export type OverlayToCmd =
  | { type: 'UPDATE_SESSION'; payload: { game: string | null; mapId: string | null; side: string | null; heroId: string | null } }
  | { type: 'UPDATE_CARDS'; payload: { cards: TriadCard[]; selectedIndex: number; ocrMatches: OCRResultMatch[] } }
  | { type: 'TOGGLE_CARD_PANEL'; payload: { show: boolean } }
  | { type: 'TOGGLE_AIM_LAYER'; payload: { show: boolean } }
  | { type: 'SELECT_CARD_INDEX'; payload: { index: number } }
  | { type: 'NUDGE_AIM'; payload: { dx: number; dy: number } }
  | { type: 'SET_OPACITY'; payload: { opacity: number } }
  | { type: 'SET_MINICARD_SIZE'; payload: { width: number } }
  | { type: 'TTS_SPEAK'; payload: { text: string } }
  | { type: 'SHUTDOWN' };

export type OverlayToEvt =
  | { type: 'READY'; pid: number }
  | { type: 'CARD_PANEL_TOGGLED'; show: boolean }
  | { type: 'AIM_LAYER_TOGGLED'; show: boolean }
  | { type: 'CARD_SELECTED'; index: number; cardId: string }
  | { type: 'NEAREST_AIMPOINT_CHANGED'; cardId: string; aimIndex: number; aimPoint: AimPoint }
  | { type: 'HOTKEY_TRIGGERED'; actionId: string; nativeEvent?: any }
  | { type: 'ERROR'; message: string };

// 全局 sidecar 句柄（可选）
let child: Child | null = null;
const listeners = new Map<string, ((evt: any) => void)[]>();

/** 启动 overlay sidecar（如果有二进制）；失败也不报错，降级为事件总线模式 */
export async function startOverlayProcess(): Promise<Child | null> {
  if (child) return child;
  try {
    const shellMod = await import('@tauri-apps/plugin-shell');
    const cmd = shellMod.Command.sidecar('binaries/overlay');
    cmd.on('close', () => { child = null; });
    child = (await cmd.spawn()) as Child;
  } catch (e) {
    console.info('[Overlay] sidecar 未启用，使用事件总线模式（overlay 作为 Tauri label 窗口）', e);
    child = null;
  }
  try {
    const eventMod = await import('@tauri-apps/api/event');
    await eventMod.listen(OVERLAY_EVENT_CHANNEL, (event: any) => {
      const evt: OverlayToEvt = event.payload;
      const handlers = listeners.get(evt.type) ?? [];
      handlers.forEach(h => h(evt));
    });
  } catch {}
  return child;
}

/** 向 overlay 发送命令 */
export async function sendOverlayCmd(cmd: OverlayToCmd) {
  // ① 事件通道（主程序内）
  try {
    const eventMod = await import('@tauri-apps/api/event');
    await eventMod.emit(OVERLAY_CMD_CHANNEL, cmd);
  } catch {}
  // ② sidecar stdin
  if (child && typeof (child as any).write === 'function') {
    try {
      const line = 'KPP_REQ:' + JSON.stringify(cmd) + '\n';
      await (child as any).write(line);
    } catch {}
  }
  // ③ overlay 作为 Tauri label 窗口（推荐模式：tauri.conf.json 里配置 label=overlay）
  try {
    const webviewMod = await import('@tauri-apps/api/webviewWindow');
    const getFn = (webviewMod as any).WebviewWindow?.getByLabel ?? (webviewMod as any).getByLabel;
    if (typeof getFn === 'function') {
      const w: any = await getFn('overlay');
      if (w && typeof w.emit === 'function') {
        try { await w.emit(OVERLAY_CMD_CHANNEL, cmd); } catch {}
      }
    }
  } catch {}
}

/** 监听 overlay 事件 */
export function onOverlayEvent<T extends OverlayToEvt['type']>(
  type: T,
  handler: (evt: Extract<OverlayToEvt, { type: T }>) => void,
): () => void {
  if (!listeners.has(type)) listeners.set(type, []);
  const arr = listeners.get(type)!;
  arr.push(handler as any);
  return () => {
    const idx = arr.indexOf(handler as any);
    if (idx >= 0) arr.splice(idx, 1);
  };
}

// -------------------- 业务层便捷调用 --------------------
import { useGameSessionStore } from '@/stores/gameSession';
import { touchCardUsage } from '@/services/cards';

export async function actionToggleCardPanel(options: { skipOCR?: boolean } = {}) {
  const store = useGameSessionStore();
  if (!store.isValidSession) {
    throw new Error('请先选择「游戏 / 地图 / 阵营」（开局选择器）');
  }
  const ocrMatches = options.skipOCR ? [] : store.lastOCRMatches;
  const cards = await store.filterCards(ocrMatches);
  cards.slice(0, 9).forEach(async (c) => { try { await touchCardUsage(c.id); } catch {} });
  await sendOverlayCmd({
    type: 'UPDATE_CARDS',
    payload: {
      cards: cards.slice(0, 9),
      selectedIndex: 0,
      ocrMatches: ocrMatches,
    },
  });
}

export async function actionToggleAimLayer(show?: boolean): Promise<boolean> {
  const cur = (window as any).__AIM_LAYER_SHOW__ === true;
  const next = show ?? !cur;
  (window as any).__AIM_LAYER_SHOW__ = next;
  await sendOverlayCmd({ type: 'TOGGLE_AIM_LAYER', payload: { show: next } });
  return next;
}

export async function actionCloseAllOverlay() {
  (window as any).__AIM_LAYER_SHOW__ = false;
  await sendOverlayCmd({ type: 'TOGGLE_CARD_PANEL', payload: { show: false } });
  await sendOverlayCmd({ type: 'TOGGLE_AIM_LAYER', payload: { show: false } });
}

export async function actionSelectCardByNumber(num: 1|2|3|4|5|6|7|8|9) {
  await sendOverlayCmd({ type: 'SELECT_CARD_INDEX', payload: { index: num - 1 } });
}

export async function actionNudgeAim(dx: number, dy: number) {
  await sendOverlayCmd({ type: 'NUDGE_AIM', payload: { dx, dy } });
}

/** 热键 -> 实际动作 统一挂接表（由主入口 App.vue 调用） */
export async function bindHotkeyActionsToManager(
  manager: { on: (id: any, handler: (e: any) => void) => void },
  opts: { prefs: { defaultOpacity: number; defaultMinicardWidth: number } },
) {
  let curOpacity = opts.prefs.defaultOpacity;
  manager.on('toggle_card_panel', async () => { try { await actionToggleCardPanel(); } catch (e: any) { flashToast(e.message); } });
  manager.on('toggle_aim_layer',  async () => { try { await actionToggleAimLayer(); } catch (e: any) { flashToast(e.message); } });
  manager.on('close_all_overlay', () => { actionCloseAllOverlay(); });

  manager.on('select_card_1', () => actionSelectCardByNumber(1));
  manager.on('select_card_2', () => actionSelectCardByNumber(2));
  manager.on('select_card_3', () => actionSelectCardByNumber(3));
  manager.on('select_card_4', () => actionSelectCardByNumber(4));
  manager.on('select_card_5', () => actionSelectCardByNumber(5));
  manager.on('select_card_6', () => actionSelectCardByNumber(6));
  manager.on('select_card_7', () => actionSelectCardByNumber(7));
  manager.on('select_card_8', () => actionSelectCardByNumber(8));
  manager.on('select_card_9', () => actionSelectCardByNumber(9));

  manager.on('nudge_aim_up',          () => actionNudgeAim(0, -5));
  manager.on('nudge_aim_down',        () => actionNudgeAim(0, +5));
  manager.on('nudge_aim_left',        () => actionNudgeAim(-5, 0));
  manager.on('nudge_aim_right',       () => actionNudgeAim(+5, 0));
  manager.on('nudge_aim_up_fine',     () => actionNudgeAim(0, -1));
  manager.on('nudge_aim_down_fine',   () => actionNudgeAim(0, +1));
  manager.on('nudge_aim_left_fine',   () => actionNudgeAim(-1, 0));
  manager.on('nudge_aim_right_fine',  () => actionNudgeAim(+1, 0));

  manager.on('opacity_minus', async () => {
    curOpacity = Math.max(0.2, +(curOpacity - 0.1).toFixed(2));
    await sendOverlayCmd({ type: 'SET_OPACITY', payload: { opacity: curOpacity } });
  });
  manager.on('opacity_plus', async () => {
    curOpacity = Math.min(1.0, +(curOpacity + 0.1).toFixed(2));
    await sendOverlayCmd({ type: 'SET_OPACITY', payload: { opacity: curOpacity } });
  });

  manager.on('ocr_identify_minimap', async () => {
    try {
      // 由 ocr.ts 提供（延迟 import，避免循环引用）
      const { runMinimapOCRFromClipboardOrSelection } = await import('@/services/ocr');
      const store = useGameSessionStore();
      if (!store.currentMapId) return;
      const res = await runMinimapOCRFromClipboardOrSelection(store.currentMapId);
      store.setOCRMatches(res.matches);
      await actionToggleCardPanel({ skipOCR: false });
    } catch (e: any) { flashToast(e?.message ?? 'OCR 失败'); }
  });
}

function flashToast(msg: string) {
  // 组件层会监听事件，这里只打 log 兜底
  console.warn('[KPP]', msg);
  try {
    (window as any).__kpp_toast_queue?.push(msg);
  } catch {}
}

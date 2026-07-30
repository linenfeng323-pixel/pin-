// =====================================================
// 全局热键服务
// 基于 @tauri-apps/plugin-global-shortcut v2.x（动态导入兜底）
// =====================================================

import type { HotkeyActionId, HotkeyBinding } from '@/types';
import { loadHotkeys, saveHotkeys } from '@/services/storage';
import { DEFAULT_HOTKEYS } from '@/types';

type ShortcutEventLike = { id: string; shortcut: string; state: 'Pressed' | 'Released' };
type ActionHandler = (event: ShortcutEventLike) => void;

type ShortcutMod = {
  register: (accel: string, handler: (event: ShortcutEventLike) => void) => Promise<void>;
  unregister: (accel: string) => Promise<void>;
  unregisterAll: () => Promise<void>;
  isRegistered: (accel: string) => Promise<boolean>;
};

async function getMod(): Promise<ShortcutMod | null> {
  try {
    const mod = await import('@tauri-apps/plugin-global-shortcut');
    return mod as unknown as ShortcutMod;
  } catch (e) {
    console.warn('[Hotkey] 全局热键插件不可用（预览/开发模式下不注册）', e);
    return null;
  }
}

const ACTION_LABELS: Record<HotkeyActionId, string> = {
  toggle_card_panel:     '开关卡片栏（三合一图）',
  toggle_aim_layer:      '开关瞄点圆圈层',
  close_all_overlay:     '一键关闭全部 Overlay',
  nudge_aim_up:          '瞄点微调 上 5px',
  nudge_aim_down:        '瞄点微调 下 5px',
  nudge_aim_left:        '瞄点微调 左 5px',
  nudge_aim_right:       '瞄点微调 右 5px',
  nudge_aim_up_fine:     '瞄点精修 上 1px',
  nudge_aim_down_fine:   '瞄点精修 下 1px',
  nudge_aim_left_fine:   '瞄点精修 左 1px',
  nudge_aim_right_fine:  '瞄点精修 右 1px',
  opacity_minus:         '透明度降低',
  opacity_plus:          '透明度提高',
  select_card_1:         '切到第 1 张卡',
  select_card_2:         '切到第 2 张卡',
  select_card_3:         '切到第 3 张卡',
  select_card_4:         '切到第 4 张卡',
  select_card_5:         '切到第 5 张卡',
  select_card_6:         '切到第 6 张卡',
  select_card_7:         '切到第 7 张卡',
  select_card_8:         '切到第 8 张卡',
  select_card_9:         '切到第 9 张卡',
  ocr_identify_minimap:  'OCR 识别小地图并弹卡',
};
export const HOTKEY_ACTION_LABELS = ACTION_LABELS;

class HotkeyManager {
  private bindings: HotkeyBinding[] = [];
  private handlers = new Map<HotkeyActionId, ActionHandler>();
  private registered = new Set<string>();
  private inited = false;

  async init(): Promise<HotkeyBinding[]> {
    if (this.inited) return this.bindings;
    this.bindings = await loadHotkeys();
    const mod = await getMod();
    for (const b of this.bindings) {
      if (!b.enabled || !b.accelerator || !mod) continue;
      try {
        await mod.register(b.accelerator, (event) => {
          if (event.state !== 'Pressed') return;
          const h = this.handlers.get(b.actionId);
          if (h) h(event);
        });
        this.registered.add(b.accelerator);
      } catch (e) {
        console.warn(`[Hotkey] 注册失败 ${b.accelerator} (${b.actionId})`, e);
      }
    }
    this.inited = true;
    return this.bindings;
  }

  allBindings(): HotkeyBinding[] {
    return this.bindings;
  }

  labelFor(id: HotkeyActionId): string {
    return ACTION_LABELS[id] ?? id;
  }

  on(action: HotkeyActionId, handler: ActionHandler) {
    this.handlers.set(action, handler);
  }

  findConflict(newAccel: string, ignoreAction?: HotkeyActionId): HotkeyBinding | null {
    return this.bindings.find(b =>
      b.enabled &&
      b.accelerator.toLowerCase() === newAccel.toLowerCase() &&
      b.actionId !== ignoreAction
    ) ?? null;
  }

  async updateBinding(actionId: HotkeyActionId, newAccelerator: string, enabled = true): Promise<void> {
    const conf = this.findConflict(newAccelerator, actionId);
    if (conf) throw new Error(`该快捷键已被「${this.labelFor(conf.actionId)}」占用`);
    const idx = this.bindings.findIndex(b => b.actionId === actionId);
    if (idx < 0) throw new Error('未知动作');

    const mod = await getMod();
    const old = this.bindings[idx];

    if (old.accelerator && this.registered.has(old.accelerator) && mod) {
      try { await mod.unregister(old.accelerator); } catch {}
      this.registered.delete(old.accelerator);
    }
    this.bindings[idx] = { actionId, accelerator: newAccelerator, enabled };
    await saveHotkeys(this.bindings);

    if (enabled && newAccelerator && mod) {
      try {
        await mod.register(newAccelerator, (event) => {
          if (event.state !== 'Pressed') return;
          const h = this.handlers.get(actionId);
          if (h) h(event);
        });
        this.registered.add(newAccelerator);
      } catch (e) {
        throw new Error(`注册失败：${String(e)}`);
      }
    }
  }

  async setEnabled(actionId: HotkeyActionId, enabled: boolean) {
    const idx = this.bindings.findIndex(b => b.actionId === actionId);
    if (idx < 0) return;
    const b = this.bindings[idx];
    const mod = await getMod();
    if (b.accelerator && mod) {
      if (enabled && !this.registered.has(b.accelerator)) {
        try {
          await mod.register(b.accelerator, (event) => {
            if (event.state !== 'Pressed') return;
            const h = this.handlers.get(actionId);
            if (h) h(event);
          });
          this.registered.add(b.accelerator);
        } catch (e) {
          console.warn(e);
        }
      } else if (!enabled && this.registered.has(b.accelerator)) {
        try { await mod.unregister(b.accelerator); } catch {}
        this.registered.delete(b.accelerator);
      }
    }
    this.bindings[idx].enabled = enabled;
    await saveHotkeys(this.bindings);
  }

  async resetDefaults(): Promise<HotkeyBinding[]> {
    const mod = await getMod();
    for (const b of this.bindings) {
      if (b.accelerator && this.registered.has(b.accelerator) && mod) {
        try { await mod.unregister(b.accelerator); } catch {}
      }
    }
    this.registered.clear();
    this.bindings = structuredClone(DEFAULT_HOTKEYS);
    await saveHotkeys(this.bindings);
    for (const b of this.bindings) {
      if (!b.enabled || !b.accelerator || !mod) continue;
      try {
        await mod.register(b.accelerator, (event) => {
          if (event.state !== 'Pressed') return;
          const h = this.handlers.get(b.actionId);
          if (h) h(event);
        });
        this.registered.add(b.accelerator);
      } catch {}
    }
    return this.bindings;
  }

  async destroy() {
    const mod = await getMod();
    if (mod) try { await mod.unregisterAll(); } catch {}
    this.registered.clear();
    this.inited = false;
  }
}

export const hotkeyManager = new HotkeyManager();

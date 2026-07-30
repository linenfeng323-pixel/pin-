<!-- 按键设置（可自定义 + 冲突检测 + 恢复默认） -->
<template>
  <div class="slide-up max-w-5xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
      <h2 class="text-2xl font-semibold tracking-tight">⌨️ 按键设置</h2>
      <div class="text-sm" style="color: var(--mac-text-secondary)">
        全部快捷键都可自定义，修改即存盘，冲突自动提示
      </div>
      <div class="ml-auto flex gap-2">
        <el-button class="mac-btn" @click="resetDefaults">↺ 恢复默认</el-button>
      </div>
    </div>

    <div class="mac-card p-5">
      <div v-for="group in groups" :key="group.label" class="mb-8 last:mb-0">
        <div class="text-xs font-semibold uppercase tracking-wider mb-3" style="color: var(--mac-text-tertiary)">
          {{ group.label }}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div v-for="b in group.items" :key="b.actionId"
               class="flex items-center gap-3 rounded-xl p-3"
               style="border:1px solid var(--mac-border); background: var(--mac-card-bg)">
            <el-switch
              :model-value="b.enabled"
              @update:model-value="(v: string | number | boolean | undefined) => setEnabled(b, v)"
              inline-prompt size="small" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-medium">{{ hotkeyManager.labelFor(b.actionId) }}</div>
            </div>
            <el-tooltip v-if="b._conflict" content="按键冲突！" placement="top">
              <HotkeyCapture
                :model-value="b.accelerator"
                extra-class="!border-red-400"
                @update:model-value="(v: string) => updateBinding(b, v)" />
            </el-tooltip>
            <HotkeyCapture v-else
              :model-value="b.accelerator"
              @update:model-value="(v: string) => updateBinding(b, v)" />
          </div>
        </div>
      </div>
    </div>

    <div class="mac-card p-5">
      <div class="text-sm font-semibold mb-2">💡 提示</div>
      <ul class="list-disc pl-5 space-y-1 text-sm" style="color: var(--mac-text-secondary)">
        <li>点击「按键输入框」后按下想要的组合键即可（支持 Ctrl/Shift/Alt/Win/Meta + 任意字母数字/方向键/F键）</li>
        <li>修改同一按键两次会自动解除旧绑定，且会自动检测并提示「已被 X 动作占用」</li>
        <li>I J K L 为瞄点微调（5px），Shift+IJKL 为精修（1px）；- / + 调整卡片栏透明度</li>
        <li>1~9 切换卡片；因为在 overlay 上，键盘也能按；不会和游戏内说话键冲突（游戏键一般是 Ctrl / 空格 / WASD 组合）</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { hotkeyManager } from '@/services/hotkeys';
import { ElMessage, confirmYes } from '@/global';
import HotkeyCapture from '@/components/HotkeyCapture.vue';
import type { HotkeyBinding, HotkeyActionId } from '@/types';

const bindings = ref<Array<HotkeyBinding & { _conflict?: boolean }>>([]);

onMounted(async () => {
  await hotkeyManager.init();
  refresh();
});

function refresh() {
  bindings.value = hotkeyManager.allBindings().map(b => ({ ...b }));
  const acc = new Map<string, number>();
  for (const b of bindings.value) {
    if (!b.enabled || !b.accelerator) continue;
    const key = b.accelerator.toLowerCase();
    acc.set(key, (acc.get(key) ?? 0) + 1);
  }
  for (const b of bindings.value) {
    b._conflict = b.enabled && b.accelerator ? (acc.get(b.accelerator.toLowerCase()) ?? 0) > 1 : false;
  }
}

const MAIN: HotkeyActionId[] = ['toggle_card_panel', 'toggle_aim_layer', 'close_all_overlay', 'ocr_identify_minimap'];
const SELECT: HotkeyActionId[] = ['select_card_1','select_card_2','select_card_3','select_card_4','select_card_5','select_card_6','select_card_7','select_card_8','select_card_9'];
const NUDGE: HotkeyActionId[] = ['nudge_aim_up','nudge_aim_down','nudge_aim_left','nudge_aim_right','nudge_aim_up_fine','nudge_aim_down_fine','nudge_aim_left_fine','nudge_aim_right_fine','opacity_minus','opacity_plus'];

const groups = computed(() => [
  { label: '① 主功能', items: bindings.value.filter(b => MAIN.includes(b.actionId)) },
  { label: '② 卡片切换（数字键 1~9）', items: bindings.value.filter(b => SELECT.includes(b.actionId)) },
  { label: '③ 瞄点微调 & 透明度', items: bindings.value.filter(b => NUDGE.includes(b.actionId)) },
]);

async function updateBinding(b: HotkeyBinding, newAccel: string) {
  try {
    await hotkeyManager.updateBinding(b.actionId, newAccel, b.enabled);
    ElMessage.success('✓ 已更新');
    refresh();
  } catch (e: any) {
    ElMessage.error(e.message || '冲突');
    refresh();
  }
}

async function setEnabled(b: HotkeyBinding, v: string | number | boolean | undefined) {
  await hotkeyManager.setEnabled(b.actionId, !!v);
  refresh();
}

async function resetDefaults() {
  const ok = await confirmYes('确定恢复全部默认快捷键？你自定义的按键会被覆盖', '恢复默认');
  if (!ok) return;
  await hotkeyManager.resetDefaults();
  ElMessage.success('✓ 已恢复默认');
  refresh();
}
</script>

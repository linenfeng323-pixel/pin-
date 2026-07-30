<!-- =====================================================
     识点·Pin Pro 主界面（Mac 风格单页布局）
     左侧 Sidebar：导航（开局选择 / 卡片库 / 小地图文字库 / 按键设置 / 备份恢复 / 在线更新）
     右侧 Content：当前选中的视图 + Mac 风格毛玻璃工具栏
     =====================================================  -->
<template>
  <div class="w-screen h-screen flex overflow-hidden" style="background: var(--mac-window-bg)">
    <!-- 顶栏（Mac 交通灯 + 标题 + 会话状态） -->
    <div class="absolute top-0 left-0 right-0 h-11 flex items-center z-20 drag-region select-none border-b"
         style="border-color: var(--mac-border); background: var(--mac-sidebar-bg);">
      <div class="mac-traffic">
        <div class="c-close" title="关闭"></div>
        <div class="c-minimize" title="最小化"></div>
        <div class="c-maximize" title="最大化"></div>
      </div>
      <div class="flex-1 text-center text-sm font-semibold tracking-wide" style="color: var(--mac-text)">
        🎯 识点 · Pin Pro
      </div>
      <div class="pr-4 flex items-center gap-2 text-xs no-drag">
        <el-tag v-if="store.currentGame" type="info" effect="plain" size="small">{{ store.currentGame?.name }}</el-tag>
        <el-tag v-if="store.currentMap" type="primary" effect="dark" size="small">{{ store.currentMap?.name }}</el-tag>
        <el-tag v-if="store.currentSide" type="warning" effect="light" size="small">
          {{ store.currentSide === 'attack' ? '🟢 进攻' : store.currentSide === 'defense' ? '🔵 防守' : '' }}
        </el-tag>
        <el-tag v-if="store.currentHero" effect="plain" size="small">{{ store.currentHero?.name }}</el-tag>
      </div>
    </div>

    <!-- 侧边栏 -->
    <aside class="mac-sidebar w-60 pt-14 pb-4 flex flex-col overflow-y-auto">
      <div class="mac-nav-group">导航</div>
      <div
        v-for="item in nav"
        :key="item.id"
        class="mac-nav-item"
        :class="{ active: activeNav === item.id }"
        @click="activeNav = item.id"
      >
        <span style="width:18px;display:inline-block;text-align:center">{{ item.icon }}</span>
        <span>{{ item.label }}</span>
        <span class="badge" v-if="item.id === 'cards'">{{ cardCount }}</span>
      </div>

      <div class="mac-nav-group">热键提示</div>
      <div class="px-4 py-2 text-[11.5px] leading-6" style="color: var(--mac-text-secondary)">
        <div><span class="kbd">Ctrl</span><span class="kbd">M</span> 卡片栏</div>
        <div><span class="kbd">Ctrl</span><span class="kbd">B</span> 瞄点圆圈</div>
        <div><span class="kbd">Ctrl</span><span class="kbd">N</span> 一键全关</div>
        <div><span class="kbd">1</span>~<span class="kbd">9</span> 切换卡片</div>
        <div><span class="kbd">I</span><span class="kbd">J</span><span class="kbd">K</span><span class="kbd">L</span> 微调瞄点</div>
        <div><span class="kbd">-</span>/<span class="kbd">+</span> 调整透明度</div>
      </div>
    </aside>

    <!-- 内容区 -->
    <main class="flex-1 pt-11 overflow-hidden relative">
      <div class="absolute inset-0 overflow-y-auto p-6">
        <SessionPicker v-if="activeNav === 'session'" />
        <CardLibrary v-else-if="activeNav === 'cards'" />
        <OCRLibrary v-else-if="activeNav === 'ocr'" />
        <HotkeySettings v-else-if="activeNav === 'hotkeys'" />
        <BackupView v-else-if="activeNav === 'backup'" />
        <UpdaterView v-else-if="activeNav === 'updater'" />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { useGameSessionStore } from '@/stores/gameSession';
import { hotkeyManager } from '@/services/hotkeys';
import { bindHotkeyActionsToManager, startOverlayProcess } from '@/services/overlayBridge';
import { loadUIPreferences } from '@/services/storage';
import { loadCards } from '@/services/storage';

import SessionPicker from '@/views/SessionPicker.vue';
import CardLibrary from '@/views/CardLibrary.vue';
import OCRLibrary from '@/views/OCRLibrary.vue';
import HotkeySettings from '@/views/HotkeySettings.vue';
import BackupView from '@/views/BackupView.vue';
import UpdaterView from '@/views/UpdaterView.vue';

type NavId = 'session' | 'cards' | 'ocr' | 'hotkeys' | 'backup' | 'updater';

const nav: { id: NavId; icon: string; label: string }[] = [
  { id: 'session', icon: '🎮', label: '开局选择' },
  { id: 'cards',   icon: '🃏', label: '卡片库' },
  { id: 'ocr',     icon: '🔠', label: '小地图文字库' },
  { id: 'hotkeys', icon: '⌨️', label: '按键设置' },
  { id: 'backup',  icon: '💾', label: '备份 / 恢复' },
  { id: 'updater', icon: '🚀', label: '在线更新' },
];
const activeNav = ref<NavId>('session');

const store = useGameSessionStore();
const cardCount = ref(0);

async function refreshCardCount() {
  cardCount.value = (await loadCards()).length;
}

onMounted(async () => {
  await store.init();
  await refreshCardCount();

  // 启动 overlay（优先 sidecar；失败走事件总线 + Tauri label 窗口模式）
  try { await startOverlayProcess(); } catch (e) { console.warn(e); }

  // 加载偏好 + 绑定全部热键动作
  const prefs = await loadUIPreferences();
  await hotkeyManager.init();
  await bindHotkeyActionsToManager(hotkeyManager as any, { prefs });

  // 自动暗色模式（跟随系统）
  if (prefs.theme === 'mac-dark' || (prefs.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('is-dark');
  }

  // 设置 toast 队列桥
  (window as any).__kpp_toast_queue = (window as any).__kpp_toast_queue ?? [];
});

onBeforeUnmount(() => {
  hotkeyManager.destroy().catch(() => {});
});

defineExpose({ store });
</script>

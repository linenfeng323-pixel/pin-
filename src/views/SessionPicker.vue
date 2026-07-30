<!-- 开局选择器（游戏/地图/阵营/英雄/预设保存/进入战斗） -->
<template>
  <div class="slide-up max-w-5xl mx-auto space-y-6">
    <div class="flex items-center gap-3">
      <h2 class="text-2xl font-semibold tracking-tight">🎮 开局选择</h2>
      <div class="ml-auto flex gap-2">
        <el-button class="mac-btn" @click="store.exitBattle()" v-if="store.ready">
          <span>🛑 退出战斗</span>
        </el-button>
        <el-button class="mac-btn mac-btn-primary" @click="enterBattle()" :disabled="!store.isValidSession">
          <span>🟢 进入战斗</span>
        </el-button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <!-- 左侧：选择面板 -->
      <div class="mac-card p-5 space-y-5">
        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">① 选择游戏</div>
          <el-radio-group
            :model-value="store.currentGameId ?? ''"
            @update:model-value="(v: string | number | boolean | undefined) => store.setGame(String(v ?? ''))"
            class="w-full">
            <div class="grid grid-cols-3 gap-3">
              <div v-for="g in store.games" :key="g.id"
                   class="cursor-pointer rounded-lg border text-center py-3 transition-all"
                   :class="store.currentGameId === g.id
                     ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 shadow-sm'
                     : 'hover:bg-white/40 border-[var(--mac-border)]'">
                <el-radio
                  :model-value="store.currentGameId === g.id"
                  @update:model-value="(v: any) => { if (!!v) store.setGame(g.id); }"
                  class="!hidden"
                  :label="g.id"
                  :value="g.id" />
                <div @click="store.setGame(g.id)" class="font-medium text-sm">{{ g.name }}</div>
                <div @click="store.setGame(g.id)" class="text-[11px]" style="color: var(--mac-text-tertiary)">{{ g.maps.length }} 张地图</div>
              </div>
            </div>
          </el-radio-group>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">② 选择地图</div>
          <el-select v-model="store.currentMapId" placeholder="选择地图" size="large" class="w-full">
            <el-option v-for="m in store.mapsInGame" :key="m.id" :label="m.name" :value="m.id">
              <span>{{ m.name }}</span>
            </el-option>
          </el-select>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">③ 选择阵营</div>
          <div class="grid grid-cols-2 gap-3">
            <button class="mac-btn"
                    :class="store.currentSide==='attack'?'!bg-green-500 !border-green-500 !text-white':''"
                    @click="store.setSide('attack')">🟢 进攻方</button>
            <button class="mac-btn"
                    :class="store.currentSide==='defense'?'!bg-blue-500 !border-blue-500 !text-white':''"
                    @click="store.setSide('defense')">🔵 防守方</button>
          </div>
        </div>

        <div v-if="store.heroesInGame.length">
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">④ 选择英雄（可选）</div>
          <el-select v-model="heroModel" size="large" class="w-full" clearable placeholder="不绑定英雄则对全英雄可用" @change="onHeroChange">
            <el-option-group
              v-for="grp in heroGroups" :key="grp[0]" :label="grp[0] || '全部'">
              <el-option v-for="h in grp[1]" :key="h.id" :label="h.name + (h.role ? `（${h.role}）` : '')" :value="h.id">
                <span class="font-medium">{{ h.name }}</span>
                <span class="text-xs opacity-60 ml-2">{{ h.role }}</span>
              </el-option>
            </el-option-group>
          </el-select>
        </div>
      </div>

      <!-- 右侧：预设保存/会话状态  -->
      <div class="space-y-6">
        <div class="mac-card p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="text-sm font-semibold">💾 保存当前为预设</div>
            <el-input v-model="presetName" size="small" placeholder="预设名" class="w-40" />
            <el-button size="small" class="mac-btn mac-btn-primary" :disabled="!store.isValidSession || !presetName.trim()" @click="savePreset()">保存</el-button>
          </div>
          <el-empty v-if="!store.sessionPresets.length" description="暂无预设" :image-size="80" />
          <div v-else class="grid grid-cols-1 gap-2">
            <div v-for="p in store.sessionPresets" :key="p.id"
                 class="flex items-center gap-2 rounded-xl p-3"
                 style="background: var(--mac-card-bg); border:1px solid var(--mac-border)">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-sm truncate">{{ p.name }}</div>
                <div class="text-[11.5px] mt-0.5 truncate" style="color: var(--mac-text-tertiary)">
                  {{ labelForGame(p.game) }} · {{ labelForMap(p.mapId) }} · {{ p.side==='attack'?'🟢攻':p.side==='defense'?'🔵守':'' }}
                  <template v-if="p.heroId">· {{ labelForHero(p.heroId) }}</template>
                  · {{ new Date(p.createdAt).toLocaleDateString() }}
                </div>
              </div>
              <el-button size="small" class="mac-btn" @click="store.applyPreset(p)">应用</el-button>
              <el-button size="small" class="mac-btn mac-btn-danger" @click="store.deletePreset(p.id)">删除</el-button>
            </div>
          </div>
        </div>

        <div class="mac-card p-5">
          <div class="text-sm font-semibold mb-3">📖 快速操作指引</div>
          <ol class="list-decimal pl-5 space-y-1.5 text-sm" style="color: var(--mac-text-secondary)">
            <li>选好「游戏/地图/阵营」后点「进入战斗」</li>
            <li>游戏中 <span class="kbd">Ctrl</span><span class="kbd">Shift</span><span class="kbd">M</span> OCR 识别小地图 → 自动弹对应卡片</li>
            <li>或直接按 <span class="kbd">Ctrl</span><span class="kbd">M</span> 弹出当前地图全部卡片</li>
            <li>按 <span class="kbd">1</span>~<span class="kbd">9</span> 切换卡片，<span class="kbd">Ctrl</span><span class="kbd">B</span> 打开圆圈层</li>
            <li>最近瞄点会自动高亮 + 显示「直接扔/跳投/蓄力几格」</li>
          </ol>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useGameSessionStore } from '@/stores/gameSession';
import { ElMessage } from '@/global';
import type { HeroDefinition } from '@/types';
const store = useGameSessionStore();
const presetName = ref('');
const heroModel = ref<string | null>(store.currentHeroId);

const heroGroups = computed<[string, HeroDefinition[]][]>(() => {
  const g = store.currentGame;
  if (!g) return [];
  const map = new Map<string, HeroDefinition[]>();
  for (const h of g.heroes) {
    const key = h.role ?? '其他';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(h);
  }
  return Array.from(map.entries());
});

function onHeroChange(v: string | null) {
  store.setHero(v ?? null);
}

function enterBattle() {
  if (!store.isValidSession) return;
  store.enterBattle();
  ElMessage.success({ message: '✓ 已进入战斗状态，全局热键生效', type: 'success' });
}

function savePreset() {
  if (!presetName.value.trim()) return;
  store.savePreset(presetName.value.trim());
  ElMessage.success('✓ 预设已保存');
  presetName.value = '';
}

function labelForGame(id: string | null) {
  return store.games.find(g => g.id === id)?.name ?? '未选游戏';
}
function labelForMap(id: string | null) {
  return store.mapsInGame.find(m => m.id === id)?.name ?? '未选地图';
}
function labelForHero(id: string | null) {
  return store.heroesInGame.find(h => h.id === id)?.name ?? '';
}
</script>

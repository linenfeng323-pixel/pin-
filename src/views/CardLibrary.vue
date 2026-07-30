<!-- 三合一卡片库（列表 / 新建 / 编辑 / 删除 / 导出） -->
<template>
  <div class="slide-up max-w-7xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
      <h2 class="text-2xl font-semibold tracking-tight">🃏 卡片库</h2>
      <div class="ml-auto flex gap-2 flex-wrap">
        <el-select v-if="store.currentGameId" v-model="filterMapId" size="default" placeholder="全部地图" clearable class="!w-40">
          <el-option v-for="m in store.mapsInGame" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
        <el-select v-model="filterSide" size="default" placeholder="全部阵营" clearable class="!w-32">
          <el-option label="🟢 进攻方" value="attack" />
          <el-option label="🔵 防守方" value="defense" />
        </el-select>
        <el-button class="mac-btn" @click="openNewCard">＋ 新建卡片</el-button>
        <el-button class="mac-btn mac-btn-primary" :disabled="!selectedIds.length" @click="() => exportSelected(false)">📦 导出选中</el-button>
        <el-button class="mac-btn mac-btn-primary" :disabled="!selectedIds.length" @click="() => exportSelected(true)">🎯 仅导出圆圈</el-button>
      </div>
    </div>

    <div class="mac-card p-5">
      <div v-if="!cards.length" class="empty-state">
        <div class="icon">🃏</div>
        <div class="title">还没有卡片</div>
        <div class="desc">点「新建卡片」开始：Ctrl+1 拍站位图 → 在图上点击画瞄点圆圈 → Ctrl+2/Ctrl+3 拍瞄准、落点图</div>
        <div class="mt-4">
          <el-button class="mac-btn mac-btn-primary" @click="openNewCard">立即创建第一张卡片</el-button>
        </div>
      </div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div v-for="card in cards" :key="card.id"
             class="rounded-xl overflow-hidden transition-all"
             style="border:1px solid var(--mac-border); background: var(--mac-card-bg)">
          <div class="flex items-center gap-2 p-3">
            <el-checkbox
              :model-value="selectedIds.includes(card.id)"
              @update:model-value="(v: string | number | boolean | undefined) => {
                const on = !!v;
                if (on) { if (!selectedIds.includes(card.id)) selectedIds.push(card.id); }
                else { selectedIds = selectedIds.filter(x => x !== card.id); }
              }" />
            <div class="flex-1 min-w-0">
              <div class="text-sm font-semibold truncate">{{ card.standName }}</div>
              <div class="text-[11px] mt-0.5" style="color: var(--mac-text-tertiary)">
                {{ card.side === 'attack' ? '🟢攻' : card.side === 'defense' ? '🔵守' : '⬜通用' }} ·
                🎯 {{ card.aimPoints.length }}
              </div>
            </div>
          </div>
          <div class="aspect-video bg-black/5 relative overflow-hidden">
            <img v-if="card.imgStand" :src="card.imgStand" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center text-[12px]" style="color:var(--mac-text-tertiary)">
              未上传站位图
            </div>
            <!-- 瞄点位置可视化 -->
            <div v-for="ap in card.aimPoints" :key="ap.index"
                 class="absolute rounded-full border-2 border-white flex items-center justify-center text-[10px] text-white font-bold shadow-md"
                 :style="{ left: `calc(${ap.xPct ?? 50}% - 10px)`, top: `calc(${ap.yPct ?? 50}% - 10px)`, width: '20px', height: '20px', background: apColor(ap.category) }">
              {{ ap.index }}
            </div>
          </div>
          <div class="p-3 flex gap-2">
            <el-button size="small" class="mac-btn flex-1" @click="editCard(card)">✎ 编辑</el-button>
            <el-button size="small" class="mac-btn mac-btn-danger" @click="remove(card)">🗑</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑抽屉 -->
    <el-drawer v-model="drawerOpen" size="640px" :title="editing ? '✎ 编辑卡片' : '＋ 新建卡片'" destroy-on-close>
      <template #default>
        <div v-if="editing" class="space-y-4 pr-2">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <div class="text-xs font-semibold mb-1">站位名</div>
              <el-input v-model="editing.standName" placeholder="例如：A包点角落" />
            </div>
            <div>
              <div class="text-xs font-semibold mb-1">绑定阵营</div>
              <el-select v-model="editing.side" class="!w-full">
                <el-option label="🟢 进攻方" value="attack" />
                <el-option label="🔵 防守方" value="defense" />
                <el-option label="⬜ 通用" value="both" />
              </el-select>
            </div>
            <div>
              <div class="text-xs font-semibold mb-1">绑定英雄（可选）</div>
              <el-select v-model="editing.heroId" class="!w-full" clearable placeholder="不绑定=全英雄">
                <el-option v-for="h in store.heroesInGame" :key="h.id" :label="h.name" :value="h.id" />
              </el-select>
            </div>
            <div>
              <div class="text-xs font-semibold mb-1">关联地图</div>
              <el-select v-model="editing.mapId" class="!w-full">
                <el-option v-for="m in store.mapsInGame" :key="m.id" :label="m.name" :value="m.id" />
              </el-select>
            </div>
          </div>

          <div>
            <div class="text-xs font-semibold mb-1 flex items-center gap-2">
              ① 站位图
              <span class="text-[11px]" style="color: var(--mac-text-tertiary)">点击图上任意位置添加瞄点</span>
              <el-button size="small" class="ml-auto mac-btn" @click="pasteStandFromClipboard()">📋 粘贴剪贴板</el-button>
              <el-button size="small" class="mac-btn" @click="uploadStand()">📁 选择文件</el-button>
              <input ref="fStand" type="file" accept="image/*" class="hidden" @change="onStandFile" />
            </div>
            <div class="relative rounded-lg overflow-hidden border" style="border-color: var(--mac-border)" @click="addAimPointAt">
              <img v-if="editing.imgStand" :src="editing.imgStand" class="w-full block select-none" />
              <div v-else class="aspect-video flex items-center justify-center text-sm" style="color: var(--mac-text-tertiary)">
                请先粘贴/上传站位参考图
              </div>
              <!-- 瞄点 -->
              <div v-for="(ap, idx) in editing.aimPoints" :key="ap.index"
                   class="absolute rounded-full border-2 border-white flex items-center justify-center text-xs font-bold text-white cursor-move shadow-md select-none"
                   :style="{ left: `calc(${ap.xPct ?? 50}% - 14px)`, top: `calc(${ap.yPct ?? 50}% - 14px)`, width: '28px', height: '28px', background: apColor(ap.category) }"
                   @click.stop="currentAimIdx = idx">
                {{ ap.index }}
              </div>
            </div>
          </div>

          <div v-if="editing.aimPoints.length" class="mac-card p-4">
            <div class="text-xs font-semibold mb-2">🎯 瞄点列表（按分类上色 + 自定义扔法关键词）</div>
            <div class="space-y-2">
              <div v-for="(ap, idx) in editing.aimPoints" :key="ap.index"
                   class="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 items-center p-2 rounded-lg"
                   :class="currentAimIdx===idx ? 'bg-blue-50/80 dark:bg-blue-500/10':'bg-black/[0.02]'">
                <span class="w-7 h-7 flex items-center justify-center rounded-full text-xs text-white font-bold"
                      :style="{ background: apColor(ap.category) }">{{ ap.index }}</span>
                <el-input v-model="ap.name" size="small" placeholder="瞄点名（如：烟 CT 口）" />
                <el-select v-model="ap.category" size="small">
                  <el-option label="烟（绿）" value="smoke" />
                  <el-option label="闪（黄）" value="flash" />
                  <el-option label="火（橙）" value="molotov" />
                  <el-option label="雷（红）" value="grenade" />
                  <el-option label="技能（蓝）" value="ability" />
                </el-select>
                <el-input v-model="ap.keyword" size="small" placeholder="扔法关键词：如 跳投 / 直接 / 蓄力2格" />
                <el-button size="small" class="mac-btn mac-btn-danger" @click="removeAim(idx)">删</el-button>
              </div>
            </div>
          </div>

          <div>
            <div class="text-xs font-semibold mb-1 flex items-center gap-2">
              ② 瞄准参考图（可选）
              <el-button size="small" class="ml-auto mac-btn" @click="uploadAim()">📁 选择</el-button>
              <input ref="fAim" type="file" accept="image/*" class="hidden" @change="onAimFile" />
            </div>
            <img v-if="editing.imgAim" :src="editing.imgAim" class="w-full rounded-lg border" style="border-color: var(--mac-border)" />
            <div v-else class="aspect-video border rounded-lg flex items-center justify-center text-sm"
                 style="border-color: var(--mac-border); color: var(--mac-text-tertiary)">未上传</div>
          </div>

          <div>
            <div class="text-xs font-semibold mb-1 flex items-center gap-2">
              ③ 落点参考图（可选）
              <el-button size="small" class="ml-auto mac-btn" @click="uploadLand()">📁 选择</el-button>
              <input ref="fLand" type="file" accept="image/*" class="hidden" @change="onLandFile" />
            </div>
            <img v-if="editing.imgLand" :src="editing.imgLand" class="w-full rounded-lg border" style="border-color: var(--mac-border)" />
            <div v-else class="aspect-video border rounded-lg flex items-center justify-center text-sm"
                 style="border-color: var(--mac-border); color: var(--mac-text-tertiary)">未上传</div>
          </div>

          <div class="pt-2 flex gap-3">
            <el-button class="mac-btn" @click="drawerOpen = false">取消</el-button>
            <el-button class="mac-btn mac-btn-primary" @click="save">💾 保存卡片</el-button>
          </div>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useGameSessionStore } from '@/stores/gameSession';
import { loadCards, saveCards } from '@/services/storage';
import { createEmptyCard, createEmptyAimPoint, validateCard, saveCard, removeCard } from '@/services/cards';
import { exportCardsZip, pickBackupSavePath, writeZipToPath, BACKUP_VERSION } from '@/services/backup';
import type { TriadCard, AimPoint, CategoryColor } from '@/types';
import { ElMessage, ElMessageBox, confirmYes } from '@/global';

const store = useGameSessionStore();
const allCards = ref<TriadCard[]>([]);
const filterMapId = ref<string | null>(null);
const filterSide = ref<string | null>(null);
const selectedIds = ref<string[]>([]);
const drawerOpen = ref(false);
const editing = ref<TriadCard | null>(null);
const currentAimIdx = ref<number | null>(null);

const fStand = ref<HTMLInputElement | null>(null);
const fAim = ref<HTMLInputElement | null>(null);
const fLand = ref<HTMLInputElement | null>(null);

const cards = computed(() => {
  return allCards.value.filter(c => {
    if (filterMapId.value && c.mapId !== filterMapId.value) return false;
    if (filterSide.value && c.side !== filterSide.value) return false;
    return true;
  });
});

async function refresh() {
  allCards.value = await loadCards();
}
onMounted(refresh);

function openNewCard() {
  if (!store.currentMapId) {
    ElMessage.warning('请先在「开局选择」里选一个地图');
    return;
  }
  editing.value = createEmptyCard({
    game: store.currentGameId ?? undefined,
    mapId: store.currentMapId,
    side: store.currentSide ?? 'both',
    heroId: store.currentHeroId ?? undefined,
  });
  currentAimIdx.value = null;
  drawerOpen.value = true;
}

function editCard(c: TriadCard) {
  editing.value = JSON.parse(JSON.stringify(c));
  // 补上 xPct / yPct 预览字段（不入库）
  if (editing.value) ensureAimPercentages(editing.value);
  drawerOpen.value = true;
}

function ensureAimPercentages(card: TriadCard) {
  // 兼容：卡片里存的是绝对像素，展示成相对百分比
  // 这里统一把 AimPoint 扩展出 xPct / yPct（通过 defineComponent extend 的方式：直接挂属性）
  card.aimPoints.forEach(ap => {
    const any: any = ap;
    if (typeof any.xPct !== 'number') any.xPct = clamp01(ap.x / 1920) * 100;
    if (typeof any.yPct !== 'number') any.yPct = clamp01(ap.y / 1080) * 100;
  });
}

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function uploadStand() { fStand.value?.click(); }
function uploadAim()   { fAim.value?.click(); }
function uploadLand()  { fLand.value?.click(); }

async function fileToDataURL(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result ?? ''));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(f);
  });
}

function onStandFile(e: Event) { setImgFromFile('imgStand', e); }
function onAimFile(e: Event)   { setImgFromFile('imgAim', e); }
function onLandFile(e: Event)  { setImgFromFile('imgLand', e); }
async function setImgFromFile(field: 'imgStand'|'imgAim'|'imgLand', e: Event) {
  const t = e.target as HTMLInputElement;
  const f = t.files?.[0];
  if (!f || !editing.value) return;
  const data = await fileToDataURL(f);
  (editing.value as any)[field] = data;
}

async function pasteStandFromClipboard() {
  try {
    const items = (await navigator.clipboard.read() as any[]);
    for (const item of items) {
      for (const t of item.types) {
        if (t.startsWith('image/')) {
          const blob: Blob = await item.getType(t);
          const data = await fileToDataURL(new File([blob], 'clip.png'));
          if (editing.value) editing.value.imgStand = data;
          return;
        }
      }
    }
  } catch {
    ElMessage.warning('读取剪贴板失败，请直接选择文件或 Ctrl+V 到输入框');
  }
}

function addAimPointAt(e: MouseEvent) {
  if (!editing.value || !editing.value.imgStand) return;
  const target = e.currentTarget as HTMLElement;
  const r = target.getBoundingClientRect();
  const xPct = ((e.clientX - r.left) / r.width) * 100;
  const yPct = ((e.clientY - r.top) / r.height) * 100;
  const maxIdx = editing.value.aimPoints.reduce((m, a) => Math.max(m, a.index), 0);
  const idx = Math.min(9, Math.max(1, maxIdx + 1)) as AimPoint['index'];
  if (editing.value.aimPoints.length >= 9) {
    ElMessage.warning('最多 9 个瞄点（正好对应 1-9 键）');
    return;
  }
  const ap: any = createEmptyAimPoint(idx, Math.round(xPct / 100 * 1920), Math.round(yPct / 100 * 1080));
  ap.xPct = xPct;
  ap.yPct = yPct;
  editing.value.aimPoints.push(ap);
  editing.value.aimPoints.sort((a, b) => a.index - b.index);
}

function removeAim(idx: number) {
  if (!editing.value) return;
  editing.value.aimPoints.splice(idx, 1);
  // 重新编 index 保证紧凑
  editing.value.aimPoints.forEach((ap, i) => { (ap as any).index = (i + 1) as AimPoint['index']; });
}

async function save() {
  if (!editing.value) return;
  // xPct / yPct → 绝对像素回写
  editing.value.aimPoints.forEach(ap => {
    const any: any = ap;
    if (typeof any.xPct === 'number') ap.x = Math.round(any.xPct / 100 * 1920);
    if (typeof any.yPct === 'number') ap.y = Math.round(any.yPct / 100 * 1080);
  });
  try {
    await saveCard(editing.value);
    ElMessage.success('✓ 卡片已保存');
    await refresh();
    drawerOpen.value = false;
  } catch (e: any) {
    ElMessage.error('保存失败：' + e.message);
  }
}

async function remove(c: TriadCard) {
  try {
    const ok = await confirmYes(`确认删除「${c.standName}」？此操作不可恢复`, '删除卡片');
    if (!ok) return;
    await removeCard(c.id);
    await refresh();
    ElMessage.success('已删除');
  } catch {}
}

async function exportSelected(onlyAimPoints = false) {
  if (!selectedIds.value.length) return;
  try {
    const blob = await exportCardsZip(selectedIds.value, { onlyAimPoints });
    const path = await pickBackupSavePath(
      onlyAimPoints ? `kpp-aimpoints-${Date.now()}.zip` : `kpp-cards-v${BACKUP_VERSION}-${Date.now()}.zip`
    );
    if (!path) {
      // 浏览器下载兜底
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kpp-cards-${Date.now()}.zip`;
      a.click();
      return;
    }
    await writeZipToPath(blob, path);
    ElMessage.success('✓ 已导出备份：' + path);
  } catch (e: any) {
    ElMessage.error(e.message || '导出失败');
  }
}

function apColor(cat: CategoryColor): string {
  return { smoke: '#34C759', flash: '#FFD60A', molotov: '#FF9500', grenade: '#FF3B30', ability: '#0A84FF' }[cat];
}
</script>

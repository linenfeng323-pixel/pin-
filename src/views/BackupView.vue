<!-- 备份/导入（卡片 & 圆圈） -->
<template>
  <div class="slide-up max-w-6xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
      <h2 class="text-2xl font-semibold tracking-tight">💾 备份 / 恢复</h2>
      <div class="text-sm" style="color: var(--mac-text-secondary)">
        卡片 + 瞄点圆圈可单独打包导出 / 自动归属到指定地图导入
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <!-- 导出 -->
      <div class="mac-card p-5 space-y-4">
        <div class="text-lg font-semibold mb-1">📤 导出备份</div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">① 选择卡片</div>
          <div class="flex gap-2 mb-3">
            <el-button class="mac-btn" size="small" @click="selectAll">全选</el-button>
            <el-button class="mac-btn" size="small" @click="selectNone">全不选</el-button>
            <div class="ml-auto text-xs" style="color: var(--mac-text-tertiary)">
              已选 {{ exportIds.length }} / {{ allCards.length }}
            </div>
          </div>
          <div class="h-44 overflow-y-auto rounded-lg p-1 space-y-1 border" style="border-color: var(--mac-border)">
            <label v-for="c in allCards" :key="c.id"
                   class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-black/5 cursor-pointer text-sm">
              <el-checkbox
                :model-value="exportIds.includes(c.id)"
                @update:model-value="(v: string | number | boolean | undefined) => toggleInList({ value: exportIds }, c.id, !!v)" />
              <span class="truncate">{{ c.standName }}</span>
              <span class="text-[11px] ml-auto" style="color: var(--mac-text-tertiary)">
                🎯{{ c.aimPoints.length }}
              </span>
            </label>
          </div>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">② 可选：强制归到某地图导出（导入时会强制落到该地图）</div>
          <el-select v-model="forceMapId" size="default" class="!w-full" clearable placeholder="留空=跟随卡片内绑定">
            <el-option v-for="m in mapsFlat" :key="m.id" :label="`${m.gameName} · ${m.name}`" :value="m.id" />
          </el-select>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">③ 可选：备注</div>
          <el-input v-model="note" placeholder="例如：A队烟位合集 V2" />
        </div>

        <div class="grid grid-cols-2 gap-2">
          <el-button class="mac-btn mac-btn-primary" size="large" :disabled="!exportIds.length" @click="doExport(false)">
            📦 完整备份（卡片 + 图片 + 瞄点）
          </el-button>
          <el-button class="mac-btn mac-btn-primary" size="large" :disabled="!exportIds.length" @click="doExport(true)">
            🎯 仅导出瞄点圆圈（JSON）
          </el-button>
        </div>
      </div>

      <!-- 导入 -->
      <div class="mac-card p-5 space-y-4">
        <div class="text-lg font-semibold mb-1">📥 导入备份</div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">① 选择 ZIP 文件</div>
          <el-upload
            drag :auto-upload="false" :show-file-list="false" accept=".zip"
            @change="onFileSelected"
            class="kpp-upload"
          >
            <div class="p-8 text-center">
              <el-icon class="text-4xl mb-2" style="color:var(--mac-text-tertiary)"><UploadFilled /></el-icon>
              <div class="text-sm font-medium" v-if="!pickedFile">点击或拖入 .zip 备份文件</div>
              <div class="text-sm font-medium" v-else>已选择：{{ pickedFile.name }}</div>
              <div class="text-[11.5px] mt-1" style="color: var(--mac-text-tertiary)">
                自动识别 KPP-BACKUP v{{ BACKUP_VERSION }} 协议
              </div>
            </div>
          </el-upload>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">② 可选：强制归属地图（优先级最高）</div>
          <el-select v-model="importMapId" size="default" class="!w-full" clearable
                     placeholder="留空=用 ZIP 内 mapId 或卡片自带 mapId">
            <el-option v-for="m in mapsFlat" :key="m.id" :label="`${m.gameName} · ${m.name}`" :value="m.id" />
          </el-select>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">③ 同名 / 同 ID 冲突策略</div>
          <el-radio-group v-model="onConflict" size="default" class="space-x-2">
            <el-radio-button label="skip">跳过</el-radio-button>
            <el-radio-button label="overwrite">覆盖</el-radio-button>
            <el-radio-button label="rename">自动重命名（推荐）</el-radio-button>
          </el-radio-group>
        </div>

        <el-button class="mac-btn mac-btn-primary w-full" size="large" :disabled="!pickedFile" @click="doImport">
          🚀 开始导入
        </el-button>

        <div v-if="report" class="rounded-lg p-4 border space-y-1 text-sm" style="border-color: var(--mac-border); background: rgba(0,0,0,0.02)">
          <div class="font-semibold mb-1">导入结果</div>
          <div>✅ 成功：<b>{{ report.ok }}</b></div>
          <div>⏭ 跳过：<b>{{ report.skipped }}</b></div>
          <div>❌ 失败：<b>{{ report.failed.length }}</b>
            <el-tooltip v-if="report.failed.length" placement="top">
              <template #content>
                <div v-for="f in report.failed" :key="f.id" class="text-xs">
                  · {{ f.id }} — {{ f.reason }}
                </div>
              </template>
              <el-tag size="small" type="warning" class="ml-1 cursor-help">详情</el-tag>
            </el-tooltip>
          </div>
          <div v-if="report.mapsImported">🗺️ 新增地图定义：<b>{{ report.mapsImported }}</b></div>
          <div v-if="report.effectiveMapId" class="text-xs mt-2" style="color:var(--mac-text-tertiary)">
            有效归属地图：{{ labelMap(report.effectiveMapId) }}
          </div>
        </div>
      </div>
    </div>

    <div class="mac-card p-5 text-sm space-y-2">
      <div class="font-semibold">📖 协议说明（KPP-BACKUP-ZIP v{{ BACKUP_VERSION }}）</div>
      <ol class="list-decimal pl-5 space-y-1" style="color: var(--mac-text-secondary)">
        <li><code>/manifest.json</code>：元信息（协议、版本、条目索引、可选目标地图）</li>
        <li><code>/cards/&lt;id&gt;.json</code>：每张卡片单独 JSON，引用 zip:// 图片路径</li>
        <li><code>/cards/&lt;id&gt;/stand.png | aim.png | land.png</code>：三合一截图</li>
        <li><code>/aimpoints/&lt;cardId&gt;_&lt;idx&gt;.json</code>：仅圆圈模式下每个瞄点单独 JSON</li>
        <li>导入优先级：<b>用户强制指定地图 &gt; ZIP 自带 targetMapId &gt; 卡片 mapId &gt; 当前选中地图</b></li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { UploadFilled } from '@element-plus/icons-vue';
import { loadCards, loadMaps, loadGames } from '@/services/storage';
import { exportCardsZip, importBackupZip, pickBackupSavePath, pickBackupOpenPath, writeZipToPath, readZipFromPath, BACKUP_VERSION } from '@/services/backup';
import type { BackupImportReport } from '@/services/backup';
import { useGameSessionStore } from '@/stores/gameSession';
import type { TriadCard, MapMeta, GameDefinition } from '@/types';
import { ElMessage } from '@/global';

const store = useGameSessionStore();
const allCards = ref<TriadCard[]>([]);
const allMaps = ref<MapMeta[]>([]);
const allGames = ref<GameDefinition[]>([]);
const exportIds = ref<string[]>([]);
const forceMapId = ref<string | undefined>(undefined);
const note = ref('');
const pickedFile = ref<File | null>(null);
const importMapId = ref<string | undefined>(undefined);
const onConflict = ref<'skip' | 'overwrite' | 'rename'>('rename');
const report = ref<BackupImportReport | null>(null);

function toggleInList(list: { value: string[] }, id: string, on: boolean) {
  if (on) { if (!list.value.includes(id)) list.value.push(id); }
  else { list.value = list.value.filter(x => x !== id); }
}
function selectAll() { exportIds.value = allCards.value.map(c => c.id); }
function selectNone() { exportIds.value = []; }

const mapsFlat = computed(() => {
  // 带游戏名前缀
  const arr: Array<{ id: string; name: string; gameName: string }> = [];
  for (const g of allGames.value) for (const m of g.maps ?? []) {
    arr.push({ id: m.id, name: m.name, gameName: g.name });
  }
  for (const m of allMaps.value) if (!arr.find(x => x.id === m.id)) {
    arr.push({ id: m.id, name: m.name, gameName: (m as any).gameId ?? '自定义' });
  }
  return arr;
});

function labelMap(id: string) {
  return mapsFlat.value.find(m => m.id === id)?.name ?? id;
}

onMounted(async () => {
  allCards.value = await loadCards();
  allMaps.value = await loadMaps();
  allGames.value = await loadGames();
});

function onFileSelected(uploadFile: any) {
  const f: File = uploadFile.raw || uploadFile.file || uploadFile;
  pickedFile.value = f;
  report.value = null;
}

async function doExport(onlyAimPoints: boolean) {
  if (!exportIds.value.length) return;
  try {
    const blob = await exportCardsZip(exportIds.value, {
      note: note.value || undefined,
      forceMapId: forceMapId.value,
      onlyAimPoints,
    });
    const path = await pickBackupSavePath(
      onlyAimPoints ? `kpp-aimpoints-${Date.now()}.zip` : `kpp-cards-v${BACKUP_VERSION}-${Date.now()}.zip`
    );
    if (path) {
      await writeZipToPath(blob, path);
      ElMessage.success('✓ 备份完成：' + path);
    } else {
      // 浏览器
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = onlyAimPoints ? `kpp-aimpoints-${Date.now()}.zip` : `kpp-cards-${Date.now()}.zip`;
      a.click();
      ElMessage.success('✓ 已触发下载');
    }
  } catch (e: any) {
    ElMessage.error('导出失败：' + (e?.message ?? e));
  }
}

async function doImport() {
  if (!pickedFile.value) return;
  try {
    let blob: Blob;
    const path = await pickBackupOpenPath();
    if (path) blob = await readZipFromPath(path);
    else blob = pickedFile.value;

    const conflictPolicy = onConflict.value;
    report.value = await importBackupZip({
      file: blob,
      forceTargetMapId: importMapId.value || undefined,
      currentMapId: store.currentMapId || undefined,
      onConflict: async (_c, _e) => conflictPolicy,
    });
    // 刷新卡片
    allCards.value = await loadCards();
    ElMessage.success('导入完成');
  } catch (e: any) {
    ElMessage.error('导入失败：' + (e?.message ?? e));
  }
}
</script>

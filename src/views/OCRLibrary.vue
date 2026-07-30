<!-- 小地图文字库配置（OCR 关键词：主词+别名+屏幕坐标矩形） -->
<template>
  <div class="slide-up max-w-6xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
      <h2 class="text-2xl font-semibold tracking-tight">🔠 小地图文字库</h2>
      <div class="text-sm" style="color: var(--mac-text-secondary)">
        配置每个地图专属关键词，识别后自动只弹关联卡片
      </div>
      <div class="ml-auto">
        <el-select v-if="store.currentGameId" v-model="mapId" size="default" class="!w-56">
          <el-option v-for="m in store.mapsInGame" :key="m.id" :label="m.name" :value="m.id" />
        </el-select>
      </div>
    </div>

    <div v-if="!mapId" class="empty-state">
      <div class="icon">🗺️</div>
      <div class="title">请先选择地图</div>
      <div class="desc">文字库按「地图」独立维护，方便 OCR 只匹配当前地图的关键词（A区/B区/包点/莲花古城专属点位名）</div>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-5 gap-5">
      <!-- 左侧：关键词列表 -->
      <div class="lg:col-span-3 mac-card p-5">
        <div class="flex items-center mb-3">
          <div class="text-sm font-semibold">📚 关键词（主词 + 别名）</div>
          <el-button size="small" class="ml-auto mac-btn mac-btn-primary" @click="addKeyword()">＋ 新增</el-button>
        </div>
        <div v-if="!dict.keywords.length" class="empty-state !py-8">
          <div class="icon">🔠</div>
          <div class="title !text-base">还没有关键词</div>
          <div class="desc !text-xs">例：A区、部署区、A小、中路、B长 —— 每个关键词可以绑定到若干卡片，OCR 识别后自动只弹匹配的卡片</div>
        </div>
        <el-table v-else :data="dict.keywords" size="default" class="!mt-2" :row-class-name="() => 'el-table--mac'">
          <el-table-column label="#" type="index" width="48" />
          <el-table-column label="主词" min-width="140">
            <template #default="{ row }">
              <el-input v-model="row.main" size="small" placeholder="如：A区" />
            </template>
          </el-table-column>
          <el-table-column label="别名（逗号分隔）" min-width="260">
            <template #default="{ row }">
              <el-input v-model="row._aliasesText" size="small" placeholder="A bombsite / A site / A包" />
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" align="right">
            <template #default="{ $index }">
              <el-button link type="danger" size="small" @click="removeAt($index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="mt-5 flex gap-3 justify-end">
          <el-button class="mac-btn" @click="reset">放弃修改</el-button>
          <el-button class="mac-btn mac-btn-primary" @click="save()">💾 保存到本地</el-button>
        </div>
      </div>

      <!-- 右侧：小地图区域选择 -->
      <div class="lg:col-span-2 space-y-5">
        <div class="mac-card p-5">
          <div class="text-sm font-semibold mb-3">🖥 「小地图」屏幕区域（OCR 只在这个矩形内识别）</div>
          <div class="text-xs mb-3" style="color: var(--mac-text-tertiary)">
            不同分辨率可以分别配置；默认 1920×1080 对应常见小地图在左下
          </div>
          <el-select v-model="resolution" size="small" class="!w-full mb-2">
            <el-option v-for="r in resolutions" :key="r" :label="r" :value="r" />
          </el-select>
          <div class="grid grid-cols-2 gap-2">
            <el-input-number v-model="rect.x" :min="0" :max="3840" size="small" :controls="false">
              <template #prepend>X</template>
            </el-input-number>
            <el-input-number v-model="rect.y" :min="0" :max="2160" size="small" :controls="false">
              <template #prepend>Y</template>
            </el-input-number>
            <el-input-number v-model="rect.w" :min="0" :max="3840" size="small" :controls="false">
              <template #prepend>宽</template>
            </el-input-number>
            <el-input-number v-model="rect.h" :min="0" :max="2160" size="small" :controls="false">
              <template #prepend>高</template>
            </el-input-number>
          </div>
          <el-button size="small" class="mac-btn mt-3 w-full" @click="pickCommonPreset()">✨ 应用常见预设：小地图在左下 192×192</el-button>
        </div>

        <div class="mac-card p-5">
          <div class="text-sm font-semibold mb-2">🧪 识别测试</div>
          <div class="text-xs mb-3" style="color: var(--mac-text-tertiary)">
            粘贴一段 OCR 识别文字，看看会命中哪些关键词
          </div>
          <el-input v-model="testText" type="textarea" :rows="3" placeholder="A区 部署区 …" />
          <el-button class="mac-btn mac-btn-primary w-full mt-3" :disabled="!testText.trim()" @click="runTest()">
            测试匹配
          </el-button>
          <div v-if="testResult.length" class="mt-3 space-y-1">
            <el-tag v-for="m in testResult" :key="m.keywordId" type="success" effect="dark" class="mr-1.5">
              {{ m.matchedText }} · {{ (m.confidence * 100).toFixed(0) }}%
            </el-tag>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useGameSessionStore } from '@/stores/gameSession';
import { getDictionaryByMap, upsertKeyword, removeKeyword, setSmallMapRect, matchKeywordsToDict } from '@/services/ocr';
import { ElMessage } from '@/global';
import type { MapOCRDictionary, OCRKeyword, OCRResultMatch, Rect } from '@/types';

const store = useGameSessionStore();
const mapId = ref<string | null>(store.currentMapId);
watch(() => store.currentMapId, v => { if (v && !mapId.value) mapId.value = v; });

const resolutions = ['1920x1080', '2560x1440', '3840x2160', '1280x720'];
const resolution = ref<string>('1920x1080');
const rect = ref<Rect>({ x: 40, y: 870, w: 192, h: 192 });

type OCRKeywordUI = OCRKeyword & { _aliasesText?: string };

const dict = ref<MapOCRDictionary & { keywords: OCRKeywordUI[] }>({
  mapId: '', keywords: [], smallMapRectByResolution: {},
});
const testText = ref('');
const testResult = ref<OCRResultMatch[]>([]);

onMounted(async () => {
  if (mapId.value) await loadDict();
});
watch(mapId, (m) => { if (m) loadDict(); });
watch(resolution, (r) => {
  const d = dict.value.smallMapRectByResolution[r];
  if (d) rect.value = { ...d };
}, { immediate: true });

async function loadDict() {
  if (!mapId.value) return;
  const d = await getDictionaryByMap(mapId.value);
  dict.value = {
    mapId: d.mapId,
    smallMapRectByResolution: d.smallMapRectByResolution,
    keywords: (d.keywords as OCRKeywordUI[]).map((k: OCRKeywordUI) => ({ ...k, _aliasesText: k.aliases.join(',') })),
  };
  const preset = dict.value.smallMapRectByResolution[resolution.value];
  if (preset) rect.value = { ...preset };
}

function addKeyword() {
  const id = crypto.randomUUID();
  dict.value.keywords.push({
    id, main: '', aliases: [], _aliasesText: '',
  });
}

function removeAt(i: number) {
  if (!mapId.value) return;
  const k = dict.value.keywords[i];
  if (!k) return;
  dict.value.keywords.splice(i, 1);
  removeKeyword(mapId.value, k.id);
}

async function save() {
  if (!mapId.value) return;
  const kws: OCRKeyword[] = (dict.value.keywords as OCRKeywordUI[]).map((k: OCRKeywordUI) => ({
    id: k.id,
    main: k.main.trim(),
    aliases: (k._aliasesText ?? '').split(/[,，]/).map((s: string) => s.trim()).filter(Boolean),
  })).filter(k => k.main);
  for (const kw of kws) await upsertKeyword(mapId.value, kw);
  await setSmallMapRect(mapId.value, resolution.value, rect.value);
  ElMessage.success('✓ 已保存');
  await loadDict();
}

function reset() { loadDict(); }

function pickCommonPreset() {
  rect.value = { x: 40, y: (resolution.value.endsWith('1080') ? 870 : resolution.value.endsWith('1440') ? 1180 : 1800), w: 192, h: 192 };
}

function runTest() {
  if (!testText.value.trim()) return;
  const plain: MapOCRDictionary = {
    mapId: dict.value.mapId,
    smallMapRectByResolution: dict.value.smallMapRectByResolution,
    keywords: (dict.value.keywords as OCRKeywordUI[]).map((k: OCRKeywordUI) => ({
      id: k.id, main: k.main,
      aliases: (k._aliasesText ?? '').split(/[,，]/).map((s: string) => s.trim()).filter(Boolean),
    })).filter((k: OCRKeyword) => k.main),
  };
  testResult.value = matchKeywordsToDict(testText.value, plain);
}
</script>

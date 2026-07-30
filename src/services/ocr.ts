// =====================================================
// 小地图 OCR 服务（tesseract.js）
// 负责：截小地图区域 → 文字识别 → 匹配关键词库 → 返回命中结果
// =====================================================

import Tesseract from 'tesseract.js';
import type { MapOCRDictionary, OCRKeyword, OCRResultMatch, Rect } from '@/types';
import { loadOCRDictionaries, saveOCRDictionaries } from '@/services/storage';

let worker: Tesseract.Worker | null = null;
let workerReady = false;

/** 延迟初始化 OCR Worker（首次需要时才 load，省启动时间） */
async function getWorker(lang = 'chi_sim+eng'): Promise<Tesseract.Worker> {
  if (worker && workerReady) return worker;
  worker = await Tesseract.createWorker(lang, 1, {
    logger: () => {},
    errorHandler: () => {},
  });
  await worker!.setParameters({
    tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789部署区包通中火烟闪雷',
  });
  workerReady = true;
  return worker;
}

export async function terminateOCR() {
  if (worker) {
    await worker.terminate();
    worker = null;
    workerReady = false;
  }
}

/** Levenshtein 编辑距离 */
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function fuzzyMatch(text: string, kw: OCRKeyword, threshold = 0.75): { matched: boolean; confidence: number; matchedText: string } {
  const textNorm = text.replace(/\s+/g, '').toLowerCase();
  const candidates = [kw.main, ...kw.aliases];
  let bestConf = 0;
  let bestText = '';
  for (const c of candidates) {
    const cNorm = c.replace(/\s+/g, '').toLowerCase();
    if (!cNorm) continue;
    // 子串包含（OCR 会把"A区部署"识别成一串，关键词是子串）
    if (textNorm.includes(cNorm)) {
      const conf = Math.min(1.0, cNorm.length / Math.max(1, textNorm.length) + 0.3);
      if (conf > bestConf) { bestConf = Math.min(1, conf); bestText = c; }
    }
    // 模糊匹配（针对 OCR 识别错 1-2 个字的情况）
    const maxLen = Math.max(textNorm.length, cNorm.length);
    const dist = editDistance(textNorm, cNorm);
    const sim = 1 - dist / Math.max(1, maxLen);
    if (sim >= threshold && sim > bestConf) {
      bestConf = sim;
      bestText = c;
    }
  }
  return { matched: bestConf > 0, confidence: bestConf, matchedText: bestText };
}

/**
 * 对 OCR 识别到的整篇文字做分词，逐个匹配关键词库
 */
export function matchKeywordsToDict(ocrText: string, dict: MapOCRDictionary): OCRResultMatch[] {
  const tokens = ocrText
    .replace(/[\r\n\t，。、]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  // 再加入整段字符串 + 2~4 字滑窗，保证中文连字也能匹配
  const joined = tokens.join('');
  for (let i = 0; i < joined.length; i++) {
    for (let len = 2; len <= Math.min(4, joined.length - i); len++) {
      tokens.push(joined.slice(i, i + len));
    }
  }
  tokens.push(joined);

  const matches: OCRResultMatch[] = [];
  const seen = new Set<string>();

  for (const kw of dict.keywords) {
    for (const tok of tokens) {
      const r = fuzzyMatch(tok, kw);
      if (r.matched && !seen.has(kw.id)) {
        matches.push({
          keywordId: kw.id,
          matchedText: r.matchedText,
          confidence: r.confidence,
        });
        seen.add(kw.id);
        break;
      }
    }
  }
  return matches.sort((a, b) => b.confidence - a.confidence);
}

/**
 * 主入口：根据当前 mapId + 截图/已识别文字，做匹配
 * 如果传了 imageData（Canvas 截图）就跑 OCR；否则直接对已有文字做匹配
 */
export async function runMinimapOCR(opts: {
  mapId: string;
  imageData?: ImageData;       // 可选：Canvas 已截取的小地图图像
  preRecognizedText?: string;  // 可选：已有文字（调试/外部 OCR）
}): Promise<{ rawText: string; matches: OCRResultMatch[] }> {
  const all = await loadOCRDictionaries();
  const dict = all.find(d => d.mapId === opts.mapId);
  if (!dict) return { rawText: opts.preRecognizedText ?? '', matches: [] };

  let text = opts.preRecognizedText ?? '';
  if (opts.imageData) {
    try {
      const w = await getWorker();
      const { data } = await w.recognize(opts.imageData);
      text = data.text;
    } catch (e) {
      console.warn('[OCR] 识别失败，退回空文本', e);
    }
  }
  const matches = matchKeywordsToDict(text, dict);
  return { rawText: text, matches };
}

// -------------------- 关键词库管理 --------------------
export async function getDictionaryByMap(mapId: string): Promise<MapOCRDictionary> {
  const all = await loadOCRDictionaries();
  let found = all.find(d => d.mapId === mapId);
  if (!found) {
    found = { mapId, keywords: [], smallMapRectByResolution: {} };
    all.push(found);
    await saveOCRDictionaries(all);
  }
  return found;
}

export async function upsertKeyword(mapId: string, kw: OCRKeyword) {
  const all = await loadOCRDictionaries();
  const dict = all.find(d => d.mapId === mapId) ?? { mapId, keywords: [], smallMapRectByResolution: {} };
  const idx = dict.keywords.findIndex(k => k.id === kw.id);
  if (idx >= 0) dict.keywords[idx] = kw; else dict.keywords.push(kw);
  if (!all.find(d => d.mapId === mapId)) all.push(dict);
  await saveOCRDictionaries(all);
}

export async function removeKeyword(mapId: string, kwId: string) {
  const all = await loadOCRDictionaries();
  const dict = all.find(d => d.mapId === mapId);
  if (!dict) return;
  dict.keywords = dict.keywords.filter(k => k.id !== kwId);
  await saveOCRDictionaries(all);
}

export async function setSmallMapRect(mapId: string, resolutionKey: string, rect: Rect) {
  const all = await loadOCRDictionaries();
  const dict = all.find(d => d.mapId === mapId) ?? { mapId, keywords: [], smallMapRectByResolution: {} };
  dict.smallMapRectByResolution[resolutionKey] = rect;
  if (!all.find(d => d.mapId === mapId)) all.push(dict);
  await saveOCRDictionaries(all);
}

// -------------------- 从剪贴板/截图触发（用户 Ctrl+Shift+M 的快捷入口） --------------------
/**
 * 快捷触发 OCR：
 *   - 优先读剪贴板图片
 *   - 没图就提示用户先截图小地图
 *   - 然后和当前 map 的关键词库匹配
 */
export async function runMinimapOCRFromClipboardOrSelection(
  mapId: string,
): Promise<{ rawText: string; matches: OCRResultMatch[]; note?: string }> {
  // 尝试用 tauri clipboard 插件（可选）；失败就走空文本
  let imgData: ImageData | undefined;
  let note: string | undefined;
  try {
    // plugin-clipboard-manager 为可选依赖：通过运行时动态字符串拼接绕过静态 TS 解析
    const clipModName = '@tauri-apps/plugin-clipboard-manager' + '';
    const clipMod: any | null = await (new Promise<any | null>((resolve) => {
      (Function('m', `return import(m)`))(clipModName).then(resolve, () => resolve(null));
    }));
    if (clipMod && typeof clipMod.readImage === 'function') {
      const img = await clipMod.readImage();
      if (img && typeof img === 'string') {
        imgData = await imageDataFromDataUrl(img);
      }
    }
  } catch (e) {
    note = '未读取到剪贴板图片，OCR 跳过，将直接按当前地图/阵营过滤卡片';
  }
  const res = await runMinimapOCR({ mapId, imageData: imgData });
  return { ...res, note };
}

async function imageDataFromDataUrl(dataUrl: string): Promise<ImageData | undefined> {
  try {
    const img = new Image();
    const loaded: Promise<void> = new Promise((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
    });
    img.src = dataUrl;
    await loaded;
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return undefined;
  }
}

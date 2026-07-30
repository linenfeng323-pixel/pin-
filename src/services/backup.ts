// =====================================================
// 备份 & 恢复（卡片 + 瞄点圆圈 可独立打包/自动归属地图）
// 协议：KPP-Backup-ZIP v1
//   /manifest.json   → 版本信息 + 每个条目的 mapId/game/side
//   /cards/<cardId>.json
//   /cards/<cardId>/stand.png
//   /cards/<cardId>/aim.png
//   /cards/<cardId>/land.png
//   /aimpoints/<cardId>_<idx>.json（单独圆圈导出时用）
//
// 导入策略（按优先级自动归属到指定地图）：
//   1. 若 ZIP 带 targetMapId 元数据 → 强制覆盖到该地图
//   2. 否则使用卡片内的 mapId 字段
//   3. mapId 为空 且 用户当前选了地图 → 用用户当前选的地图
//   4. 都没有 → 提示用户选择目标地图（UI 层处理）
// =====================================================

import JSZip from 'jszip';
import type { TriadCard, AimPoint, MapMeta } from '@/types';
import { loadAllCards, saveCards, loadMaps, upsertMap } from '@/services/storage';
import { validateCard } from '@/services/cards';

export const BACKUP_PROTOCOL = 'KPP-BACKUP';
export const BACKUP_VERSION = 1;

interface BackupManifest {
  protocol: typeof BACKUP_PROTOCOL;
  version: number;
  createdAt: number;
  note?: string;
  targetMapId?: string;
  targetGameId?: string;
  items: BackupItemMeta[];
  maps?: MapMeta[];
}

interface BackupItemMeta {
  id: string;
  kind: 'card' | 'aimpoints';
  mapId?: string;
  gameId?: string;
  side?: 'attack' | 'defense' | 'both';
  cardTitle: string;
  hasStandImg: boolean;
  hasAimImg: boolean;
  hasLandImg: boolean;
  aimPointCount: number;
}

export interface BackupImportReport {
  ok: number;
  skipped: number;
  failed: Array<{ id: string; reason: string }>;
  mapsImported: number;
  effectiveMapId?: string;
}

// =====================================================
// 导出
// =====================================================

export async function exportCardsZip(cardIds: string[], options: {
  note?: string;
  forceMapId?: string;
  onlyAimPoints?: boolean;
} = {}): Promise<Blob> {
  const all = await loadAllCards();
  const selected = all.filter((c: TriadCard) => cardIds.includes(c.id));
  if (selected.length === 0) throw new Error('没有可导出的卡片');

  const zip = new JSZip();
  const items: BackupItemMeta[] = [];
  const mapsToBundle: MapMeta[] = [];

  const mapSet = new Set<string>();
  selected.forEach((c: TriadCard) => { if (c.mapId) mapSet.add(c.mapId); });
  if (options.forceMapId) mapSet.add(options.forceMapId);
  if (mapSet.size > 0) {
    const allMaps = await loadMaps();
    for (const map of allMaps) if (mapSet.has(map.id)) mapsToBundle.push(map);
  }

  for (const card of selected) {
    const mapId = options.forceMapId ?? card.mapId;
    const itemMeta: BackupItemMeta = {
      id: card.id,
      kind: options.onlyAimPoints ? 'aimpoints' : 'card',
      mapId,
      gameId: card.game,
      side: card.side,
      cardTitle: card.standName,
      hasStandImg: !!card.imgStand && !options.onlyAimPoints,
      hasAimImg: !!card.imgAim && !options.onlyAimPoints,
      hasLandImg: !!card.imgLand && !options.onlyAimPoints,
      aimPointCount: card.aimPoints.length,
    };
    items.push(itemMeta);

    if (!options.onlyAimPoints) {
      const stripped = stripBase64ToSidecar(card, zip);
      zip.file(`cards/${card.id}.json`, JSON.stringify(stripped, null, 2));
    } else {
      card.aimPoints.forEach((ap: AimPoint) => {
        zip.file(
          `aimpoints/${card.id}_${ap.index}.json`,
          JSON.stringify({ cardId: card.id, cardTitle: card.standName, aimPoint: ap, mapId }, null, 2),
        );
      });
    }
  }

  const manifest: BackupManifest = {
    protocol: BACKUP_PROTOCOL,
    version: BACKUP_VERSION,
    createdAt: Date.now(),
    note: options.note,
    targetMapId: options.forceMapId,
    items,
    maps: mapsToBundle.length ? mapsToBundle : undefined,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file('README.txt', `
识点·Pin 备份文件（KPP-BACKUP v${BACKUP_VERSION}）
生成时间：${new Date(manifest.createdAt).toLocaleString()}
卡片数量：${items.filter(i => i.kind === 'card').length}
仅圆圈条目：${items.filter(i => i.kind === 'aimpoints').length}
导入方法：主菜单 → 备份/恢复 → 导入备份
`.trim());

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } });
}

function stripBase64ToSidecar(card: TriadCard, zip: JSZip): TriadCard {
  const out: any = { ...card };
  const writeImg = (field: 'imgStand' | 'imgAim' | 'imgLand', fileName: string) => {
    const v: string | undefined = out[field];
    if (v && v.startsWith('data:')) {
      const commaIdx = v.indexOf(',');
      const head = v.slice(0, commaIdx);
      const body = v.slice(commaIdx + 1);
      const mime = head.match(/data:([^;]+)/)?.[1] ?? 'image/png';
      const ext = mime.split('/')[1] ?? 'png';
      const path = `cards/${card.id}/${fileName}.${ext}`;
      zip.file(path, body, { base64: true });
      out[field] = `zip://${path}`;
    }
  };
  writeImg('imgStand', 'stand');
  writeImg('imgAim', 'aim');
  writeImg('imgLand', 'land');
  return out as TriadCard;
}

// =====================================================
// 导入
// =====================================================

interface ImportOptions {
  file: Blob | File;
  forceTargetMapId?: string;
  currentMapId?: string;
  onConflict?: (card: TriadCard, existing: TriadCard) => Promise<'skip' | 'overwrite' | 'rename'>;
}

export async function importBackupZip(opts: ImportOptions): Promise<BackupImportReport> {
  const zip = await JSZip.loadAsync(opts.file);
  const manifestFile = zip.file('manifest.json');
  if (!manifestFile) throw new Error('不是合法的识点·Pin 备份文件（缺少 manifest.json）');
  const manifest: BackupManifest = JSON.parse(await manifestFile.async('string'));
  if (manifest.protocol !== BACKUP_PROTOCOL) throw new Error('备份协议不匹配');
  if (manifest.version > BACKUP_VERSION) throw new Error(`备份版本过高（v${manifest.version}），请升级识点·Pin`);

  // 1) 地图导入
  const idRemap = new Map<string, string>();
  let mapsImported = 0;
  for (const m of (manifest.maps ?? [])) {
    const existingMaps = await loadMaps();
    const existed = existingMaps.find((x: MapMeta) => (x.gameId === m.gameId || !m.gameId) && x.name === m.name);
    if (existed) {
      idRemap.set(m.id, existed.id);
    } else {
      const imported: MapMeta = { ...m, id: m.id + '_imp_' + Date.now().toString(36) };
      await upsertMap(imported);
      idRemap.set(m.id, imported.id);
      mapsImported++;
    }
  }

  const effMapId =
    opts.forceTargetMapId
    ?? manifest.targetMapId
    ?? opts.currentMapId
    ?? undefined;

  const allCards = await loadAllCards();
  const idMap = new Map(allCards.map((c: TriadCard) => [c.id, c]));
  const titleKey = (c: { mapId?: string; standName: string }) => `${c.mapId ?? ''}::${c.standName}`;
  const titleMap = new Map(allCards.map((c: TriadCard) => [titleKey(c), c]));

  const report: BackupImportReport = {
    ok: 0, skipped: 0, failed: [], mapsImported, effectiveMapId: effMapId,
  };

  // 2) 导入卡片
  const cardFiles = zip.file(/^cards\/[^/]+\.json$/);
  for (const f of cardFiles) {
    try {
      const raw = JSON.parse(await f.async('string'));
      const data: TriadCard = normalizeCardShape(raw);
      const rehydrated = await rehydrateCardImages(data, zip);
      rehydrated.mapId =
        effMapId
        ?? idRemap.get(rehydrated.mapId ?? '')
        ?? rehydrated.mapId
        ?? opts.currentMapId
        ?? '';
      if (!rehydrated.createdAt) rehydrated.createdAt = Date.now();
      if (!rehydrated.updatedAt) rehydrated.updatedAt = Date.now();
      if (typeof rehydrated.usageCount !== 'number') rehydrated.usageCount = 0;
      if (!Array.isArray(rehydrated.ocrTagIds)) rehydrated.ocrTagIds = [];
      if (!Array.isArray(rehydrated.aimPoints)) rehydrated.aimPoints = [];

      let strategy: 'skip' | 'overwrite' | 'rename' = 'rename';
      const existById = idMap.get(rehydrated.id);
      const existByTitle = titleMap.get(titleKey(rehydrated));
      const existing = existById ?? existByTitle;
      if (existing) {
        const sameContent = JSON.stringify(existing) === JSON.stringify(rehydrated);
        if (sameContent) {
          strategy = 'skip';
        } else if (opts.onConflict) {
          strategy = await opts.onConflict(rehydrated, existing as TriadCard);
        }
      }

      if (strategy === 'skip') { report.skipped++; continue; }
      if (strategy === 'rename') {
        rehydrated.id = rehydrated.id + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let i = 1;
        const origName = (existByTitle as TriadCard | undefined)?.standName ?? rehydrated.standName;
        while (titleMap.has(titleKey(rehydrated))) {
          rehydrated.standName = `${origName} (${++i})`;
        }
      }

      const errs = validateCard(rehydrated);
      if (errs.length > 0) {
        report.failed.push({ id: rehydrated.id, reason: errs.join('; ') });
        continue;
      }
      const idx = allCards.findIndex((c: TriadCard) => c.id === rehydrated.id);
      if (idx >= 0) allCards[idx] = rehydrated; else allCards.push(rehydrated);
      report.ok++;
    } catch (e: any) {
      report.failed.push({ id: (f as any).name ?? '?', reason: e?.message ?? '未知错误' });
    }
  }

  // 3) 导入仅圆圈
  const apFiles = zip.file(/^aimpoints\/.+\.json$/);
  for (const f of apFiles) {
    try {
      const pkg = JSON.parse(await f.async('string')) as {
        cardId: string; cardTitle: string; aimPoint: AimPoint; mapId?: string;
      };
      const targetMap = effMapId ?? idRemap.get(pkg.mapId ?? '') ?? pkg.mapId ?? opts.currentMapId ?? '';
      let card = allCards.find((c: TriadCard) => c.id === pkg.cardId && (c.mapId === targetMap || !targetMap));
      if (!card) card = allCards.find((c: TriadCard) => c.standName === pkg.cardTitle && c.mapId === targetMap);
      if (!card) {
        card = {
          id: 'orphan_' + Date.now().toString(36),
          mapId: targetMap,
          side: 'both',
          ocrTagIds: [],
          standName: pkg.cardTitle || '（导入的瞄点）',
          imgStand: '',
          aimPoints: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          usageCount: 0,
        };
        allCards.push(card);
      }
      card.aimPoints = card.aimPoints.filter(a => a.index !== pkg.aimPoint.index);
      card.aimPoints.push(pkg.aimPoint);
      card.aimPoints.sort((a, b) => a.index - b.index);
      report.ok++;
    } catch (e: any) {
      report.failed.push({ id: (f as any).name ?? '?', reason: e?.message ?? '未知错误' });
    }
  }

  await saveCards(allCards);
  return report;
}

function normalizeCardShape(raw: any): TriadCard {
  // 允许 createdAt 写成 created，usageCount 写成 usage 等
  return {
    id: raw.id ?? crypto.randomUUID(),
    game: raw.game ?? raw.gameId ?? undefined,
    mapId: raw.mapId ?? raw.map_id ?? '',
    side: raw.side ?? 'both',
    heroId: raw.heroId ?? raw.hero ?? undefined,
    ocrTagIds: Array.isArray(raw.ocrTagIds) ? raw.ocrTagIds : [],
    standName: raw.standName ?? raw.stand_name ?? '未命名站位',
    standNote: raw.standNote ?? raw.note ?? undefined,
    imgStand: raw.imgStand ?? raw.img_stand ?? '',
    imgAim: raw.imgAim ?? raw.img_aim ?? undefined,
    imgLand: raw.imgLand ?? raw.img_land ?? undefined,
    aimPoints: Array.isArray(raw.aimPoints) ? raw.aimPoints : [],
    createdAt: raw.createdAt ?? raw.created ?? Date.now(),
    updatedAt: raw.updatedAt ?? raw.updated ?? Date.now(),
    lastUsedAt: raw.lastUsedAt ?? raw.last_used_at ?? undefined,
    usageCount: typeof raw.usageCount === 'number' ? raw.usageCount : (raw.usage ?? 0),
    star: typeof raw.star === 'boolean' ? raw.star : undefined,
  };
}

async function rehydrateCardImages(card: TriadCard, zip: JSZip): Promise<TriadCard> {
  const out: any = { ...card };
  const restore = async (field: 'imgStand' | 'imgAim' | 'imgLand') => {
    const v: string | undefined = out[field];
    if (!v) return;
    if (v.startsWith('data:')) return;
    if (!v.startsWith('zip://')) return;
    const path = v.slice(6);
    const f = zip.file(path);
    if (!f) { out[field] = ''; return; }
    const u8 = new Uint8Array(await f.async('arraybuffer'));
    let b64 = '';
    for (let i = 0; i < u8.length; i++) b64 += String.fromCharCode(u8[i]);
    const ext = path.split('.').pop() ?? 'png';
    out[field] = `data:image/${ext};base64,${btoa(b64)}`;
  };
  await restore('imgStand');
  await restore('imgAim');
  await restore('imgLand');
  return out as TriadCard;
}

// =====================================================
// 文件对话框帮助
// =====================================================

export async function pickBackupSavePath(defaultName = `kpp-backup-${Date.now()}.zip`): Promise<string | null> {
  try {
    const mod = await import('@tauri-apps/plugin-dialog');
    const r = await (mod as any).save({
      title: '导出备份',
      defaultPath: defaultName,
      filters: [{ name: '识点·Pin 备份', extensions: ['zip'] }],
    });
    return r ?? null;
  } catch { return null; }
}

export async function pickBackupOpenPath(): Promise<string | null> {
  try {
    const mod = await import('@tauri-apps/plugin-dialog');
    const picked = await (mod as any).open({
      title: '导入备份',
      multiple: false,
      filters: [{ name: '识点·Pin 备份', extensions: ['zip'] }],
    });
    if (Array.isArray(picked)) return picked[0] ?? null;
    return picked as string | null;
  } catch { return null; }
}

export async function writeZipToPath(blob: Blob, path: string) {
  try {
    const mod = await import('@tauri-apps/plugin-fs');
    const fn = (mod as any).writeFile ?? (mod as any).writeBinaryFile ?? (mod as any).writeTextFile;
    const u8 = new Uint8Array(await blob.arrayBuffer());
    await fn(path, u8);
  } catch (e: any) {
    // 兜底：浏览器保存
    const a = document.createElement('a');
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = path.split(/[\\/]/).pop() ?? 'kpp-backup.zip';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (typeof e === 'object' && e) {} // 未使用抑制
  }
}

export async function readZipFromPath(path: string): Promise<Blob> {
  try {
    const mod = await import('@tauri-apps/plugin-fs');
    const fn = (mod as any).readFile ?? (mod as any).readBinaryFile ?? (mod as any).readTextFile;
    const buf = await fn(path);
    return new Blob([buf instanceof Uint8Array ? buf : new Uint8Array(buf)], { type: 'application/zip' });
  } catch {
    // 兜底：如果路径在浏览器里变成 url 直接 fetch
    const r = await fetch(path);
    return r.blob();
  }
}

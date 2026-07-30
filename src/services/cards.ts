// =====================================================
// 卡片服务：创建、校验、更新、删除
// 统一卡片数据生成，防止错误数据入库
// =====================================================

import type { TriadCard, AimPoint, CategoryColor, Side } from '@/types';
import { upsertCard, loadCards, deleteCard } from '@/services/storage';

export function createEmptyCard(opts: {
  game?: string;
  mapId: string;
  side: Side;
  heroId?: string;
  standName?: string;
}): TriadCard {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    game: opts.game,
    mapId: opts.mapId,
    side: opts.side,
    heroId: opts.heroId,
    ocrTagIds: [],
    standName: opts.standName ?? '新站位',
    standNote: '',
    imgStand: '',
    imgAim: '',
    imgLand: '',
    aimPoints: [],
    createdAt: now,
    updatedAt: now,
    usageCount: 0,
  };
}

export function createEmptyAimPoint(index: number, x: number, y: number): AimPoint {
  return {
    index: Math.max(1, Math.min(9, index)) as AimPoint['index'],
    name: `落点 ${index}`,
    x, y,
    keyword: '直接扔',
    category: 'smoke',
    chargeBars: 0,
  };
}

export const CATEGORY_META: Record<CategoryColor, { label: string; color: string; ring: string; fill: string }> = {
  smoke:   { label: '烟雾弹', color: '#34C759', ring: '#34C759', fill: 'rgba(52,199,89,0.12)' },
  flash:   { label: '闪光弹', color: '#FFD60A', ring: '#FFCC00', fill: 'rgba(255,214,10,0.15)' },
  molotov: { label: '燃烧瓶', color: '#FF9500', ring: '#FF9500', fill: 'rgba(255,149,0,0.12)' },
  grenade: { label: '手榴弹', color: '#FF3B30', ring: '#FF3B30', fill: 'rgba(255,59,48,0.10)' },
  ability: { label: '技能',   color: '#007AFF', ring: '#007AFF', fill: 'rgba(0,122,255,0.10)' },
};

export function validateCard(c: TriadCard): string[] {
  const errs: string[] = [];
  if (!c.mapId) errs.push('卡片必须绑定地图');
  if (!c.standName.trim()) errs.push('站位名不能为空');
  if (!c.imgStand) errs.push('必须上传站位参考图（Ctrl+1 截图）');
  c.aimPoints.forEach(ap => {
    if (!ap.name.trim()) errs.push(`瞄点 ${ap.index} 的名称不能为空`);
    if (!ap.keyword.trim()) errs.push(`瞄点 ${ap.index} 必须填写自定义扔法关键词`);
    if (ap.x < 0 || ap.y < 0) errs.push(`瞄点 ${ap.index} 坐标非法，必须在站位图上点击指定`);
  });
  return errs;
}

export async function saveCard(card: TriadCard): Promise<void> {
  const errs = validateCard(card);
  if (errs.length > 0) throw new Error(errs.join('；'));
  await upsertCard(card);
}

export async function getCard(id: string): Promise<TriadCard | undefined> {
  const list = await loadCards();
  return list.find(c => c.id === id);
}

export async function removeCard(id: string): Promise<void> {
  await deleteCard(id);
}

/** 标记一张卡最近用过，更新 usageCount/lastUsedAt */
export async function touchCardUsage(id: string) {
  const list = await loadCards();
  const idx = list.findIndex(c => c.id === id);
  if (idx < 0) return;
  list[idx].usageCount = (list[idx].usageCount ?? 0) + 1;
  list[idx].lastUsedAt = Date.now();
  await upsertCard(list[idx]);
}

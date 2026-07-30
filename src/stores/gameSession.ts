// =====================================================
// 全局 Store (Pinia)：开局会话 + 卡片过滤
// 单一数据源，任何视图/组件/IPC 都从这里取
// =====================================================

import { defineStore } from 'pinia';
import type {
  GameDefinition,
  MapDefinition,
  HeroDefinition,
  Side,
  SessionPreset,
  TriadCard,
  OCRResultMatch,
} from '@/types';
import {
  loadGames,
  loadSessionPresets,
  saveSessionPresets,
  saveLastSession,
  loadLastSession,
  loadCards,
} from '@/services/storage';

export const useGameSessionStore = defineStore('gameSession', {
  state: () => ({
    games: [] as GameDefinition[],
    sessionPresets: [] as SessionPreset[],

    // 当前选择
    currentGameId: null as string | null,
    currentMapId: null as string | null,
    currentSide: null as Exclude<Side, 'both'> | null,
    currentHeroId: null as string | null,

    // 最近一次 OCR 命中（Ctrl+M 得到）
    lastOCRMatches: [] as OCRResultMatch[],

    // 准备进入战斗
    ready: false,
  }),

  getters: {
    currentGame(state): GameDefinition | undefined {
      return state.games.find(g => g.id === state.currentGameId);
    },
    mapsInGame(state): MapDefinition[] {
      return state.games.find(g => g.id === state.currentGameId)?.maps ?? [];
    },
    heroesInGame(state): HeroDefinition[] {
      const game = state.games.find(g => g.id === state.currentGameId);
      if (!game) return [];
      return game.heroes;
    },
    currentMap(): MapDefinition | undefined {
      const g = this.currentGame;
      return g?.maps.find(m => m.id === this.currentMapId);
    },
    currentHero(): HeroDefinition | undefined {
      const g = this.currentGame;
      return g?.heroes.find(h => h.id === this.currentHeroId);
    },
    isValidSession(state): boolean {
      return !!(state.currentGameId && state.currentMapId && state.currentSide);
    },
    sideLabel(): string {
      switch (this.currentSide) {
        case 'attack': return '🟢 进攻方';
        case 'defense': return '🔵 防守方';
        default: return '未选择';
      }
    },
  },

  actions: {
    async init() {
      this.games = await loadGames();
      this.sessionPresets = await loadSessionPresets();
      const last = await loadLastSession();
      if (last) {
        this.currentGameId = last.gameId ?? null;
        this.currentMapId  = last.mapId ?? null;
        this.currentSide   = last.side ?? null;
        this.currentHeroId = last.heroId ?? null;
      }
      // 默认给第一个游戏
      if (!this.currentGameId && this.games[0]) {
        this.currentGameId = this.games[0].id;
      }
    },

    setGame(id: string) {
      this.currentGameId = id;
      this.currentMapId = null;
      this.currentHeroId = null;
      this._persist();
    },
    setMap(id: string) { this.currentMapId = id; this._persist(); },
    setSide(s: Exclude<Side, 'both'>) { this.currentSide = s; this._persist(); },
    setHero(id: string | null) { this.currentHeroId = id; this._persist(); },

    enterBattle() { this.ready = true; },
    exitBattle() { this.ready = false; },

    setOCRMatches(m: OCRResultMatch[]) {
      this.lastOCRMatches = m;
    },

    async savePreset(name: string) {
      const preset: SessionPreset = {
        id: crypto.randomUUID(),
        name,
        game: this.currentGameId,
        mapId: this.currentMapId,
        side: this.currentSide,
        heroId: this.currentHeroId,
        createdAt: Date.now(),
      };
      this.sessionPresets.push(preset);
      await saveSessionPresets(this.sessionPresets);
      return preset;
    },
    async deletePreset(id: string) {
      this.sessionPresets = this.sessionPresets.filter(p => p.id !== id);
      await saveSessionPresets(this.sessionPresets);
    },
    applyPreset(p: SessionPreset) {
      this.currentGameId = p.game;
      this.currentMapId  = p.mapId;
      this.currentSide   = p.side;
      this.currentHeroId = p.heroId;
      this._persist();
    },

    _persist() {
      saveLastSession({
        gameId: this.currentGameId,
        mapId:  this.currentMapId,
        side:   this.currentSide,
        heroId: this.currentHeroId,
      });
    },

    // -------------------- 核心过滤：地图+阵营+英雄 + 可选 OCR 命中词 --------------------
    async filterCards(ocrMatches: OCRResultMatch[] | null = null): Promise<TriadCard[]> {
      const all = await loadCards();
      const hits = ocrMatches ?? this.lastOCRMatches;
      const hitIds = new Set(hits.map(m => m.keywordId));

      return all.filter(c => {
        if (this.currentGameId && c.game && c.game !== this.currentGameId) return false;
        if (c.mapId !== this.currentMapId) return false;
        if (c.side !== 'both' && c.side !== this.currentSide) return false;
        if (c.heroId && this.currentHeroId && c.heroId !== this.currentHeroId) return false;
        // OCR 命中筛选：如果用户传了 OCR 命中，要求卡的 ocrTagIds 交集非空
        if (hitIds.size > 0) {
          const has = c.ocrTagIds.some(id => hitIds.has(id));
          if (!has) return false;
        }
        return true;
      }).sort((a, b) => {
        // OCR 命中数量越多越靠前
        const scoreA = a.ocrTagIds.filter(id => hitIds.has(id)).length;
        const scoreB = b.ocrTagIds.filter(id => hitIds.has(id)).length;
        if (scoreB !== scoreA) return scoreB - scoreA;
        // 然后按最近使用 + 次数
        return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0)
             + (b.usageCount - a.usageCount) * 1000;
      });
    },
  },
});

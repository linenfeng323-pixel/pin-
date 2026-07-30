// =====================================================
// GitHub Release 在线更新（两种通道，任何失败都优雅降级）
//   - 通道 A：Tauri updater 插件（签名包 → 自动静默装）
//   - 通道 B：纯 GitHub REST API（弹窗+手动浏览器下载）
// =====================================================

export const DEFAULT_GITHUB_REPO = 'KnowledgePinPro/knowledge-pin-pro';

export interface UpdateInfo {
  available: boolean;
  currentVersion: string;
  latestVersion?: string;
  body?: string;
  date?: string;
  downloadUrl?: string;
  canAutoInstall?: boolean;
  raw?: any;
}

/** UpdaterView 用的更友好类型（带 notes/publishedAt/version） */
export interface AppUpdateInfo {
  version: string;
  notes: string;
  publishedAt: string;
  platforms?: Record<string, { url: string; signature?: string }>;
}

export interface UpdaterConfig {
  owner: string;
  repo: string;
  channel: 'stable' | 'beta' | 'alpha';
  pubkey?: string;
}

type ProgressCb = (downloadedBytes: number, totalBytes: number) => void;

// 取当前 app version（优先 tauri 环境，降级用 package.json 的）
async function currentVersion(): Promise<string> {
  try {
    const { getVersion } = await import('@tauri-apps/api/app');
    return await getVersion();
  } catch {
    try {
      const v = (import.meta as any).env?.VITE_APP_VERSION;
      if (v) return String(v);
    } catch {}
    return '0.1.0';
  }
}

/**
 * 同步返回当前版本号（UpdaterView 首屏用）。
 * 运行在浏览器/Vite 模式下会返回 0.1.0 或者 VITE_APP_VERSION。
 */
export function loadAppVersion(): string {
  try {
    const v = (import.meta as any).env?.VITE_APP_VERSION;
    if (v) return String(v);
  } catch {}
  // package.json（只有 Node 环境有 require，这里用 import.meta 兜底字符串
  try {
    const pkgP = (import.meta as any).pkg as any;
    if (pkgP && pkgP.version) return String(pkgP.version);
  } catch {}
  // 再兜底
  return '0.1.0';
}

/** 从 owner + repo 拼成 repo 字符串（GitHub Releases 用） */
function repoStr(cfg: { owner: string; repo: string }) {
  return [cfg.owner, cfg.repo].filter(Boolean).join('/') || DEFAULT_GITHUB_REPO;
}

// -------- 配置读写（存 plugin-store，在 storage.ts 里已有的 UI_PREFS 之外单独 key） --------
const STORE_KEY_CFG = 'updater_cfg:v1';
async function getStore() {
  try {
    const M = await import('@tauri-apps/plugin-store');
    const load = (M as any).Store?.load ?? (M as any).load;
    if (typeof load === 'function') return await load('kpp-store.bin');
  } catch {}
  // memory
  const m = new Map<string, any>();
  return {
    async get(k: string) { return m.get(k) ?? null; },
    async set(k: string, v: any) { m.set(k, v); },
    async save() { /* noop */ },
  };
}

export async function loadUpdaterConfig(): Promise<UpdaterConfig> {
  const s = await getStore();
  const stored: UpdaterConfig | null = await s.get(STORE_KEY_CFG);
  if (stored && stored.owner && stored.repo) {
    return stored;
  }
  const [owner = '', repo = ''] = DEFAULT_GITHUB_REPO.split('/');
  return { owner, repo, channel: 'stable' };
}

export async function saveUpdaterConfig(cfg: UpdaterConfig) {
  const s = await getStore();
  await s.set(STORE_KEY_CFG, cfg);
  try { await s.save(); } catch {}
}

/** 检测更新（UpdaterView 专用），返回 AppUpdateInfo | null */
export async function checkAppUpdate(
  arg: string | { owner: string; repo: string; channel: 'stable' | 'beta' | 'alpha'; pubkey?: string }
): Promise<AppUpdateInfo | null> {
  let owner = '', repo = '', channel: UpdaterConfig['channel'] = 'stable';
  if (typeof arg === 'string') {
    const [a = '', b = ''] = (arg || DEFAULT_GITHUB_REPO).split('/');
    owner = a; repo = b;
  } else {
    owner = arg.owner; repo = arg.repo; channel = arg.channel;
  }
  const cur = await currentVersion();
  const repoFull = repoStr({ owner, repo });

  // ① Tauri updater 插件 + latest.json（推荐）
  try {
    const M = await import('@tauri-apps/plugin-updater');
    const fnCheck = (M as any).check ?? (M as any).default;
    if (typeof fnCheck === 'function') {
      const res = await fnCheck();
      if (res && (res.shouldUpdate || res.available)) {
        return {
          version: String(res.version ?? res.latestVersion ?? ''),
          notes: String(res.body ?? ''),
          publishedAt: String(res.date ?? (new Date()).toISOString()),
        };
      }
    }
  } catch {}

  // ② GitHub Release + latest-<channel>.json
  try {
    const latestJsonUrl = `https://github.com/${repoFull}/releases/download/latest-${channel}.json`;
    const r1 = await fetch(latestJsonUrl, { cache: 'no-cache' });
    if (r1.ok) {
      const d = await r1.json() as any;
      const ver = String(d.version ?? '');
      if (ver && !semverGt(cur, ver)) {
        return {
          version: ver, notes: String(d.notes ?? d.body ?? ''),
          publishedAt: String(d.pub_date ?? d.publishedAt ?? (new Date()).toISOString()),
          platforms: d.platforms,
        };
      }
    }

    // ③ GitHub Release /latest
    const r2 = await fetch(`https://api.github.com/repos/${repoFull}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (r2.ok) {
      const d = await r2.json() as any;
      const tag = String(d.tag_name || '').replace(/^v/, '');
      if (tag && semverGt(tag, cur)) {
        return {
          version: tag, notes: String(d.body ?? ''),
          publishedAt: String(d.published_at ?? (new Date()).toISOString()),
        };
      }
      if (tag && tag === cur) {
        // 返回信息让 UI 展示 release notes
        return {
          version: tag, notes: String(d.body ?? ''),
          publishedAt: String(d.published_at ?? (new Date()).toISOString()),
        };
      }
    }
  } catch {}
  return null;
}

/** 下载并安装（UpdaterView 用），失败抛错 */
export async function downloadAppUpdate(
  info: AppUpdateInfo,
  opt: { owner: string; repo: string; onProgress?: ProgressCb }
): Promise<void> {
  // 优先：Tauri 插件自动装
  try {
    const M = await import('@tauri-apps/plugin-updater');
    const fnCheck = (M as any).check ?? (M as any).default;
    if (typeof fnCheck === 'function') {
      const r: any = await fnCheck();
      if (r) {
        if (typeof r.downloadAndInstall === 'function') {
          await r.downloadAndInstall(opt.onProgress);
          try {
            const P = await import('@tauri-apps/plugin-process');
            await (P as any).relaunch?.();
          } catch {}
          return;
        }
        if (typeof (M as any).installUpdate === 'function') {
          await (M as any).installUpdate();
          try {
            const P = await import('@tauri-apps/plugin-process');
            await (P as any).relaunch?.();
          } catch {}
          return;
        }
      }
    }
  } catch {}

  // 兜底：浏览器 shell 打开 Release 页
  openReleaseInBrowser(opt.owner, opt.repo);
  throw new Error('已打开 GitHub Release 页面，请手动下载安装包');
}

/** 打开 Release 页面 */
export function openReleaseInBrowser(owner: string, repo: string) {
  const url = `https://github.com/${repoStr({ owner, repo })}/releases/latest`;
  try {
    // Tauri runtime
    import('@tauri-apps/plugin-shell')
      .then((M: any) => M.shell?.open?.(url))
      .catch(() => window.open(url, '_blank'));
  } catch {
    window.open(url, '_blank');
  }
}

/** 旧版兼容 API（直接用 string repo） */
export async function _checkAppUpdateCompat(repo: string = DEFAULT_GITHUB_REPO): Promise<UpdateInfo> {
  const cur = await currentVersion();
  const info: UpdateInfo = { available: false, currentVersion: cur };
  try {
    const gh = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!gh.ok) return info;
    const data: any = await gh.json();
    const tag = String(data.tag_name || '').replace(/^v/, '');
    info.latestVersion = tag;
    info.date = data.published_at;
    info.body = data.body;
    info.downloadUrl = data.html_url;
    info.available = !!(tag && semverGt(tag, cur));
    info.canAutoInstall = !!(data.assets || []).some((a: any) =>
      /\.(msi|exe|dmg|pkg|AppImage|deb|rpm)$/i.test(a.name || '')
    );
    info.raw = data;
  } catch (e) {
    console.warn('[updater] GitHub Releases 拉取失败：', e);
  }
  return info;
}

export async function applyUpdate(auto: boolean = true): Promise<{ ok: boolean; reason?: string }> {
  if (auto) {
    try {
      const updaterMod = await import('@tauri-apps/plugin-updater');
      const fnCheck = (updaterMod as any).check ?? (updaterMod as any).default;
      if (typeof fnCheck === 'function') {
        const res: any = await fnCheck();
        if (!res || (!res.shouldUpdate && !res.available)) {
          return { ok: false, reason: '没有更新' };
        }
        if (typeof res.downloadAndInstall === 'function') {
          await res.downloadAndInstall();
          try {
            const processMod = await import('@tauri-apps/plugin-process');
            await (processMod as any).relaunch?.();
          } catch {}
          return { ok: true };
        }
        if (typeof (updaterMod as any).installUpdate === 'function') {
          await (updaterMod as any).installUpdate();
          try {
            const processMod = await import('@tauri-apps/plugin-process');
            await (processMod as any).relaunch?.();
          } catch {}
          return { ok: true };
        }
      }
    } catch (e: any) {
      return { ok: false, reason: e?.message ?? '自动更新失败' };
    }
  }
  return { ok: true, reason: 'manual' };
}

// =====================================================
// semver 比较（只比较 X.Y.Z / X.Y.Z-prerelease）
// =====================================================
function semverGt(a: string, b: string): boolean {
  const parse = (s: string) => {
    const [main = '', pre = ''] = s.split('-');
    const nums = main.split('.').map(n => parseInt(n, 10) || 0);
    while (nums.length < 3) nums.push(0);
    return { nums, pre };
  };
  const A = parse(a);
  const B = parse(b);
  for (let i = 0; i < 3; i++) {
    if (A.nums[i] > B.nums[i]) return true;
    if (A.nums[i] < B.nums[i]) return false;
  }
  if (!A.pre && B.pre) return true;
  if (A.pre && !B.pre) return false;
  return A.pre > B.pre;
}

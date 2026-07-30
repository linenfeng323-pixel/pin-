<!-- GitHub Release 在线更新 -->
<template>
  <div class="slide-up max-w-5xl mx-auto space-y-5">
    <div class="flex items-center gap-3">
      <h2 class="text-2xl font-semibold tracking-tight">🚀 在线更新</h2>
      <div class="ml-auto flex items-center gap-2">
        <el-tag effect="plain" size="default">当前版本：v{{ current }}</el-tag>
        <el-tag v-if="channel" effect="dark" type="success" size="default">{{ channel }}</el-tag>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-5">
      <div class="md:col-span-2 mac-card p-5 space-y-4">
        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">① GitHub 仓库（Owner/Repo）</div>
          <div class="flex gap-2">
            <el-input v-model="owner" placeholder="如：your-org" class="!w-40" />
            <el-input v-model="repo" placeholder="如：kpp-pinpoint" />
            <el-button class="mac-btn mac-btn-primary" @click="saveCfg()">💾 保存</el-button>
          </div>
          <div class="text-[11.5px] mt-1" style="color: var(--mac-text-tertiary)">
            发布 Release 时请同步上传 <code>latest.json</code> + <code>*.msi</code>/<code>*.dmg</code>/<code>*.AppImage</code> 以及签名文件
          </div>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">② 更新渠道</div>
          <el-radio-group v-model="channel" size="default">
            <el-radio-button label="stable">stable（稳定）</el-radio-button>
            <el-radio-button label="beta">beta（公测）</el-radio-button>
            <el-radio-button label="alpha">alpha（内测）</el-radio-button>
          </el-radio-group>
        </div>

        <div>
          <div class="text-xs font-semibold mb-2" style="color: var(--mac-text-secondary)">③ 安装包签名公钥（可选，防篡改）</div>
          <el-input v-model="pubkey" type="textarea" :rows="3" placeholder="ed25519 public key / RSA PEM（可选）" />
        </div>

        <div class="flex gap-2">
          <el-button class="mac-btn mac-btn-primary" size="large" @click="doCheck" :loading="checking">
            🔍 检测更新
          </el-button>
          <el-button v-if="latest" class="mac-btn mac-btn-primary" size="large" @click="doDownload" :disabled="!!progress || downloading">
            {{ downloading ? '下载中…' : '⬇️ 下载安装' }}
          </el-button>
          <el-button v-if="latest" class="mac-btn" size="large" @click="openReleasePage">
            打开 Release 页面
          </el-button>
        </div>

        <div v-if="progress && !progress.done" class="h-2 w-full bg-black/10 rounded overflow-hidden">
          <div class="h-full rounded transition-all"
               :style="{ width: progress.percent + '%', background: 'linear-gradient(90deg,#0A84FF,#00C6FF)' }"></div>
        </div>
        <div v-if="progress" class="text-xs" style="color: var(--mac-text-tertiary)">
          {{ progress.done ? '下载完成 ✓' : `已下载 ${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}` }}
        </div>
      </div>

      <div class="mac-card p-5">
        <div class="text-sm font-semibold mb-3">📝 Release 说明</div>
        <el-empty v-if="!latest" :image-size="64" description="暂无更新信息">
          <div class="text-xs" style="color: var(--mac-text-tertiary)">请点「检测更新」从 GitHub 获取最新 Release</div>
        </el-empty>
        <div v-else class="space-y-2">
          <el-tag type="success" effect="dark" v-if="semverGt(latest.version, current)">有新版本</el-tag>
          <el-tag type="info" v-else>已是最新</el-tag>
          <div class="text-lg font-bold">v{{ latest.version }}</div>
          <div class="text-xs" style="color: var(--mac-text-tertiary)">
            {{ new Date(latest.publishedAt).toLocaleString() }}
          </div>
          <div class="mt-3 text-sm whitespace-pre-wrap" style="color: var(--mac-text-secondary)">{{ latest.notes }}</div>
        </div>
      </div>
    </div>

    <div class="mac-card p-5 text-sm space-y-2">
      <div class="font-semibold">📖 发布 Release 规范（推荐遵循 semver：MAJOR.MINOR.PATCH）</div>
      <ol class="list-decimal pl-5 space-y-1" style="color: var(--mac-text-secondary)">
        <li>在 GitHub 仓库创建 tag：如 v1.2.3，Target：main/master</li>
        <li>上传安装包：
          <ul class="list-disc pl-5 mt-1">
            <li>Windows：<code>识点Pin_1.2.3_x64_en-US.msi</code>（以及对应的 <code>.msi.zip</code> + <code>.msi.zip.sig</code>）</li>
            <li>macOS：<code>识点Pin_1.2.3_aarch64.dmg</code>（对应 <code>.tar.gz</code> + <code>.sig</code>）</li>
            <li>Linux：<code>识点Pin_1.2.3_amd64.AppImage</code>（对应 <code>.tar.gz</code> + <code>.sig</code>）</li>
          </ul>
        </li>
        <li>上传 <code>latest-stable.json</code> / <code>latest-beta.json</code> / <code>latest-alpha.json</code> 其中至少一个，格式：
<pre class="text-[11.5px] rounded-md mt-2 p-2 overflow-auto" style="background: rgba(0,0,0,0.04)">{
  "version": "1.2.3",
  "notes": "修复了…",
  "pub_date": "2024-05-20T10:00:00Z",
  "platforms": {
    "windows-x86_64": { "signature": "...", "url": "msi.zip 直链" },
    "darwin-aarch64":  { "signature": "...", "url": "tar.gz 直链" }
  }
}</pre>
        </li>
        <li>应用里把「Owner/Repo」填好，点「检测更新」即按渠道（stable/beta/alpha）拉对应 JSON 检查</li>
      </ol>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import {
  loadUpdaterConfig, saveUpdaterConfig, loadAppVersion,
  checkAppUpdate, downloadAppUpdate, openReleaseInBrowser,
} from '@/services/updater';
import type { AppUpdateInfo } from '@/services/updater';
import { ElMessage } from '@/global';

const current = ref(loadAppVersion());
const owner = ref('');
const repo = ref('');
const channel = ref<'stable' | 'beta' | 'alpha'>('stable');
const pubkey = ref('');
const latest = ref<AppUpdateInfo | null>(null);
const checking = ref(false);
const downloading = ref(false);
const progress = ref<{ percent: number; downloaded: number; total: number; done: boolean } | null>(null);

onMounted(async () => {
  const cfg = await loadUpdaterConfig();
  owner.value = cfg.owner;
  repo.value = cfg.repo;
  channel.value = cfg.channel;
  pubkey.value = cfg.pubkey ?? '';
});

async function saveCfg() {
  await saveUpdaterConfig({ owner: owner.value, repo: repo.value, channel: channel.value, pubkey: pubkey.value || undefined });
  ElMessage.success('✓ 已保存');
}

async function doCheck() {
  await saveCfg();
  checking.value = true;
  try {
    latest.value = await checkAppUpdate({
      owner: owner.value, repo: repo.value, channel: channel.value, pubkey: pubkey.value || undefined,
    });
    if (!latest.value) ElMessage.info('已是最新版本');
  } catch (e: any) {
    ElMessage.error('检测失败：' + (e?.message ?? e));
  } finally {
    checking.value = false;
  }
}

async function doDownload() {
  if (!latest.value) return;
  downloading.value = true;
  progress.value = { percent: 0, downloaded: 0, total: 1, done: false };
  try {
    await downloadAppUpdate(latest.value, {
      owner: owner.value, repo: repo.value,
      onProgress(p: number, total: number) {
        progress.value = {
          percent: total ? Math.round(p / total * 100) : 0,
          downloaded: p, total: total || 1, done: false,
        };
      }
    });
    progress.value = { percent: 100, downloaded: 1, total: 1, done: true };
    ElMessage.success('下载完成，即将重启安装…');
  } catch (e: any) {
    ElMessage.error('下载失败：' + (e?.message ?? e));
  } finally {
    downloading.value = false;
  }
}

function openReleasePage() {
  openReleaseInBrowser(owner.value, repo.value);
}

function formatBytes(n: number): string {
  const u = ['B','KB','MB','GB','TB'];
  let i = 0; while (n >= 1024 && i < u.length-1) { n /= 1024; i++; }
  return n.toFixed(1) + ' ' + u[i];
}

function semverGt(a: string, b: string): boolean {
  const pa = a.replace(/^v/,'').split('.').map(n => parseInt(n)||0);
  const pb = b.replace(/^v/,'').split('.').map(n => parseInt(n)||0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i]||0) > (pb[i]||0)) return true;
    if ((pa[i]||0) < (pb[i]||0)) return false;
  }
  return false;
}
</script>

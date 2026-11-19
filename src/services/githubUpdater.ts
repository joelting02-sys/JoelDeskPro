// GitHub real-time update checker & local client updater for joelting02-sys/JoelDeskPro
import { AppLanguage } from '../i18n';

export const APP_VERSION = '1.2.0';
export const DEFAULT_GITHUB_REPO = 'joelting02-sys/JoelDeskPro';
export const DEFAULT_GITHUB_BRANCH = 'main';

const STORAGE_SYNCED_SHA_KEY = 'joeldeskpro_synced_commit_sha';

export interface GitHubUpdateInfo {
  repo: string;
  branch: string;
  latestSha: string;
  shortSha: string;
  commitMessage: string;
  commitAuthor: string;
  commitDate: string;
  commitUrl: string;
  releaseTag?: string;
  releaseName?: string;
  releaseUrl?: string;
  sourceZipUrl: string;
  checkedAt: string;
  hasUpdate: boolean;
  syncedSha: string | null;
}

export interface LocalUpdateResult {
  ok: boolean;
  message: string;
  updatedSha?: string;
  mode?: 'git' | 'release_exe';
  installerPath?: string;
  log?: string;
}

export function getSyncedCommitSha(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_SYNCED_SHA_KEY);
  } catch {
    return null;
  }
}

export function setSyncedCommitSha(sha: string): void {
  try {
    window.localStorage.setItem(STORAGE_SYNCED_SHA_KEY, sha);
  } catch {
    // Ignore storage quota errors
  }
}

export function formatGitHubTime(iso: string, lang: AppLanguage = 'en'): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return iso;
  }
}

/**
 * Fetches the latest commit & release metadata directly from GitHub REST API.
 * Note: Private repositories return HTTP 404 without auth; local `git pull` still works with private repos.
 */
export async function checkGitHubUpdate(
  repo = DEFAULT_GITHUB_REPO,
  branch = DEFAULT_GITHUB_BRANCH,
  lang: AppLanguage = 'en'
): Promise<GitHubUpdateInfo> {
  const isZh = lang === 'zh';
  const cleanRepo =
    repo
      .trim()
      .replace(/^https?:\/\/github\.com\//i, '')
      .replace(/\.git$/i, '')
      .replace(/^\/+|\/+$/g, '') || DEFAULT_GITHUB_REPO;
  const cleanBranch = branch.trim() || DEFAULT_GITHUB_BRANCH;

  const commitEndpoint = `https://api.github.com/repos/${cleanRepo}/commits/${encodeURIComponent(cleanBranch)}`;
  const releaseEndpoint = `https://api.github.com/repos/${cleanRepo}/releases/latest`;

  const [commitRes, releaseRes] = await Promise.all([
    fetch(commitEndpoint, {
      headers: { Accept: 'application/vnd.github+json' },
    }),
    fetch(releaseEndpoint, {
      headers: { Accept: 'application/vnd.github+json' },
    }).catch(() => null),
  ]);

  if (!commitRes.ok) {
    if (commitRes.status === 404) {
      throw new Error(
        isZh
          ? `仓库 ${cleanRepo} 当前为私有（或分支 ${cleanBranch} 不存在）：可直接使用下方「本机 Git 拉取」（私有仓库可用），或临时将仓库设为 Public 再在线检测。`
          : `Repository ${cleanRepo} is private (or branch ${cleanBranch} not found). You can still pull directly via Local Git below using your PC’s Git login, or temporarily set the repo to Public to check in the browser.`
      );
    }
    if (commitRes.status === 403) {
      throw new Error(
        isZh
          ? 'GitHub API 请求频率达到上限，请稍后再试'
          : 'GitHub API rate limit reached. Please try again shortly.'
      );
    }
    throw new Error(
      isZh ? `检查更新失败（HTTP ${commitRes.status}）` : `Update check failed (HTTP ${commitRes.status})`
    );
  }

  const commitData = (await commitRes.json()) as {
    sha?: string;
    html_url?: string;
    commit?: {
      message?: string;
      author?: { name?: string; date?: string };
      committer?: { name?: string; date?: string };
    };
  };

  let releaseTag: string | undefined;
  let releaseName: string | undefined;
  let releaseUrl: string | undefined;

  if (releaseRes && releaseRes.ok) {
    const rel = (await releaseRes.json()) as {
      tag_name?: string;
      name?: string;
      html_url?: string;
    };
    releaseTag = rel.tag_name;
    releaseName = rel.name;
    releaseUrl = rel.html_url;
  }

  const latestSha = commitData.sha || '';
  const syncedSha = getSyncedCommitSha();
  const hasUpdate = Boolean(latestSha && (!syncedSha || syncedSha !== latestSha));
  const rawMessage = (commitData.commit?.message || (isZh ? '最新代码提交' : 'Latest commit'))
    .split('\n')[0]
    .trim();

  return {
    repo: cleanRepo,
    branch: cleanBranch,
    latestSha,
    shortSha: latestSha.slice(0, 7) || 'unknown',
    commitMessage: rawMessage,
    commitAuthor:
      commitData.commit?.author?.name || commitData.commit?.committer?.name || 'GitHub',
    commitDate:
      commitData.commit?.author?.date || commitData.commit?.committer?.date || new Date().toISOString(),
    commitUrl: commitData.html_url || `https://github.com/${cleanRepo}/commits/${cleanBranch}`,
    releaseTag,
    releaseName,
    releaseUrl,
    sourceZipUrl: `https://github.com/${cleanRepo}/archive/refs/heads/${encodeURIComponent(cleanBranch)}.zip`,
    checkedAt: new Date().toLocaleTimeString(isZh ? 'zh-CN' : 'en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }),
    hasUpdate,
    syncedSha,
  };
}

/**
 * Triggers a REAL local update inside the running Joel Desk Pro engine (git pull + build in dev mode,
 * or latest GitHub Release .exe download & launch in packaged desktop mode).
 * Automatically retries with legacy/omitted loopback tokens if an older local engine rejects the new token with 403.
 */
export async function triggerLocalClientUpdate(
  port: number,
  token: string,
  repo: string,
  branch: string,
  lang: AppLanguage = 'en'
): Promise<LocalUpdateResult> {
  const isZh = lang === 'zh';
  const tokenCandidates = Array.from(
    new Set([token, 'joeldeskpro-local-bridge', 'deskkit-local-bridge', ''])
  );

  let lastError: LocalUpdateResult | null = null;

  for (const candidateToken of tokenCandidates) {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (candidateToken) {
        headers['X-DeskKit-Token'] = candidateToken;
      }

      const res = await fetch(`http://127.0.0.1:${port}/api/update`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ repo, branch }),
      });

      const rawText = await res.text();
      let data: {
        ok?: boolean;
        message?: string;
        error?: string;
        updatedSha?: string;
        mode?: 'git' | 'release_exe';
        installerPath?: string;
        log?: string;
      } = {};
      try {
        data = rawText ? JSON.parse(rawText) : {};
      } catch {
        data = { error: rawText.slice(0, 200) };
      }

      if (res.status === 403 || /invalid token/i.test(String(data.error || ''))) {
        lastError = {
          ok: false,
          message:
            data.error ||
            (isZh ? '本地引擎 Token 不匹配（HTTP 403）' : 'Local engine token mismatch (HTTP 403)'),
          log: data.log,
        };
        continue;
      }

      if (!res.ok || !data.ok) {
        return {
          ok: false,
          message:
            data.error ||
            data.message ||
            (isZh ? `本地更新失败（HTTP ${res.status}）` : `Local update failed (HTTP ${res.status})`),
          log: data.log,
        };
      }

      return {
        ok: true,
        message:
          data.message ||
          (isZh ? '本地客户端已拉取最新代码并完成构建' : 'Local client pulled latest code and rebuilt'),
        updatedSha: data.updatedSha,
        mode: data.mode,
        installerPath: data.installerPath,
        log: data.log,
      };
    } catch {
      return {
        ok: false,
        message: isZh
          ? `未检测到本机更新服务（127.0.0.1:${port}），请先启动 Joel Desk Pro 桌面客户端或使用一键更新脚本`
          : `Local engine not detected on 127.0.0.1:${port}. Launch the Joel Desk Pro desktop client or use the update script below.`,
      };
    }
  }

  return (
    lastError || {
      ok: false,
      message: isZh ? '本地更新鉴权失败' : 'Local update authorization failed',
    }
  );
}

export function getGitPullCommand(repo = DEFAULT_GITHUB_REPO, branch = DEFAULT_GITHUB_BRANCH): string {
  return `git pull origin ${branch} && npm install && npm run build`;
}

export function buildWindowsUpdateScript(
  repo = DEFAULT_GITHUB_REPO,
  branch = DEFAULT_GITHUB_BRANCH
): string {
  const repoUrl = `https://github.com/${repo}.git`;
  return `@echo off
chcp 65001 >nul
title Joel Desk Pro 一键更新 (${repo})
echo ====================================================
echo   Joel Desk Pro 自动拉取 GitHub 最新版本
echo   仓库: ${repo} (分支: ${branch})
echo ====================================================
echo.

if exist ".git" (
  echo [1/3] 检测到本地仓库，正在拉取最新代码...
  git fetch origin ${branch}
  git pull --ff-only origin ${branch}
  if errorlevel 1 (
    echo 尝试重置到远程最新提交 origin/${branch}...
    git reset --hard origin/${branch}
  )
) else (
  if exist "JoelDeskPro\\.git" (
    cd JoelDeskPro
    echo [1/3] 正在进入 JoelDeskPro 目录并拉取最新代码...
    git fetch origin ${branch}
    git pull --ff-only origin ${branch}
  ) else (
    echo [1/3] 首次运行，正在从 GitHub 克隆仓库...
    git clone -b ${branch} ${repoUrl} JoelDeskPro
    if errorlevel 1 (
      echo [错误] git clone 失败，请确认已安装 Git 并可访问 GitHub。
      pause
      exit /b 1
    )
    cd JoelDeskPro
  )
)

echo.
echo [2/3] 正在同步依赖 (npm install)...
call npm install
if errorlevel 1 (
  echo [错误] npm install 失败，请确认已安装 Node.js 18+。
  pause
  exit /b 1
)

echo.
echo [3/3] 正在构建最新版本 (npm run build)...
call npm run build
if errorlevel 1 (
  echo [错误] 构建失败，请查看上方日志。
  pause
  exit /b 1
)

echo.
echo ====================================================
echo   更新完成！正在启动 Joel Desk Pro...
echo ====================================================
call npm run dev
pause
`;
}

export function buildUnixUpdateScript(
  repo = DEFAULT_GITHUB_REPO,
  branch = DEFAULT_GITHUB_BRANCH
): string {
  const repoUrl = `https://github.com/${repo}.git`;
  return `#!/usr/bin/env bash
set -euo pipefail

REPO="${repo}"
BRANCH="${branch}"
REPO_URL="${repoUrl}"

echo "===================================================="
echo "  Joel Desk Pro 自动拉取 GitHub 最新版本"
echo "  仓库: $REPO (分支: $BRANCH)"
echo "===================================================="

if [ -d ".git" ]; then
  echo "[1/3] 正在拉取最新代码..."
  git fetch origin "$BRANCH"
  git pull --ff-only origin "$BRANCH" || git reset --hard "origin/$BRANCH"
elif [ -d "JoelDeskPro/.git" ]; then
  cd JoelDeskPro
  echo "[1/3] 进入 JoelDeskPro 目录并拉取最新代码..."
  git fetch origin "$BRANCH"
  git pull --ff-only origin "$BRANCH" || git reset --hard "origin/$BRANCH"
else
  echo "[1/3] 首次运行，正在从 GitHub 克隆仓库..."
  git clone -b "$BRANCH" "$REPO_URL" JoelDeskPro
  cd JoelDeskPro
fi

echo "[2/3] 同步依赖 (npm install)..."
npm install

echo "[3/3] 构建最新版本 (npm run build)..."
npm run build

echo "更新完成！正在启动 Joel Desk Pro..."
npm run dev
`;
}

import { useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  Lock,
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react';
import {
  APP_VERSION,
  DEFAULT_GITHUB_BRANCH,
  DEFAULT_GITHUB_REPO,
  GitHubUpdateInfo,
  LocalUpdateResult,
  buildUnixUpdateScript,
  buildWindowsUpdateScript,
  formatGitHubTime,
  getGitPullCommand,
  triggerClientFileDownload,
} from '../services/githubUpdater';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface UpdateModalProps {
  lang: AppLanguage;
  open: boolean;
  onClose: () => void;
  repo?: string;
  branch?: string;
  localEngineOnline: boolean;
  localEnginePackaged?: boolean;
  updateInfo: GitHubUpdateInfo | null;
  checking: boolean;
  checkError: string | null;
  updatingLocal: boolean;
  localUpdateResult: LocalUpdateResult | null;
  onCheckNow: () => void;
  onPullLocalUpdate: () => void;
  onMarkSyncedAndReload: () => void;
  onCopyText: (text: string, label: string) => void;
}

export function UpdateModal({
  lang,
  open,
  onClose,
  repo = DEFAULT_GITHUB_REPO,
  branch = DEFAULT_GITHUB_BRANCH,
  localEngineOnline,
  localEnginePackaged = false,
  updateInfo,
  checking,
  checkError,
  updatingLocal,
  localUpdateResult,
  onCheckNow,
  onPullLocalUpdate,
  onMarkSyncedAndReload,
  onCopyText,
}: UpdateModalProps) {
  const t = TRANSLATIONS[lang];
  const isZh = lang === 'zh';
  const [showLog, setShowLog] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  if (!open) return null;

  const pullCmd = getGitPullCommand(repo, branch);

  const handleDownloadWinScript = () => {
    triggerClientFileDownload(
      'update-joeldeskpro.bat',
      buildWindowsUpdateScript(repo, branch),
      'text/plain;charset=utf-8'
    );
  };

  const handleDownloadUnixScript = () => {
    triggerClientFileDownload(
      'update-joeldeskpro.sh',
      buildUnixUpdateScript(repo, branch),
      'text/x-shellscript;charset=utf-8'
    );
  };

  const statusPill = (() => {
    if (checking) {
      return {
        text: t.updateModal.checking,
        cls: 'bg-[#F3F4F6] text-[#475569]',
      };
    }
    if (updateInfo) {
      return updateInfo.hasUpdate
        ? {
            text: t.updateModal.newVersionFound(updateInfo.releaseTag || updateInfo.shortSha),
            cls: 'bg-[#EFF6FF] text-[#1D4ED8]',
          }
        : {
            text: t.updateModal.upToDate(updateInfo.releaseTag || `v${APP_VERSION}`),
            cls: 'bg-[#F0FDF4] text-[#15803D]',
          };
    }
    return null;
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] overflow-hidden rounded-panel border border-[#E5E7EB] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-[#2563EB]" />
            <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.updateModal.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.updateModal.close}
            className="flex h-8 w-8 items-center justify-center rounded-control text-[#64748B] hover:bg-[#F3F4F6] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3.5 p-5">
          {/* Main Version & Action Card */}
          <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[14px] font-semibold text-[#0F172A]">
                  v{APP_VERSION}
                </span>
                {statusPill && (
                  <span
                    className={`inline-flex items-center rounded-inner px-2 py-0.5 text-[11px] font-medium ${statusPill.cls}`}
                  >
                    {statusPill.text}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onCheckNow}
                disabled={checking}
                className="inline-flex items-center gap-1.5 rounded-inner border border-[#E5E7EB] bg-white px-2.5 py-1 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
                {checking ? t.updateModal.checking : isZh ? '刷新检查' : 'Check'}
              </button>
            </div>

            {checkError ? (
              <div className="mt-2.5 flex items-start gap-2 rounded-inner border border-[#FDE68A] bg-[#FFFBEB] px-3 py-2 text-[12px] leading-relaxed text-[#92400E]">
                <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{checkError}</span>
              </div>
            ) : updateInfo ? (
              <div className="mt-2.5 space-y-1 text-[12px]">
                <p className="line-clamp-2 text-[#334155]">{updateInfo.commitMessage}</p>
                <div className="font-mono text-[11px] text-[#64748B]">
                  {formatGitHubTime(updateInfo.commitDate, lang)} · {updateInfo.shortSha}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-[12px] text-[#64748B]">
                {isZh
                  ? '点击「刷新检查」对比 GitHub 最新版本。'
                  : 'Click Check to compare against latest GitHub release.'}
              </p>
            )}

            {/* Single Clean Primary Action Row */}
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E5E7EB] pt-3.5">
              {localEngineOnline ? (
                <button
                  type="button"
                  onClick={onPullLocalUpdate}
                  disabled={updatingLocal}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${updatingLocal ? 'animate-spin' : ''}`} />
                  {updatingLocal
                    ? localEnginePackaged
                      ? isZh
                        ? '正在下载新版安装包…'
                        : 'Downloading installer…'
                      : t.updateModal.pullingLocal
                    : localEnginePackaged
                      ? isZh
                        ? '一键更新客户端 (.exe)'
                        : 'One-Click Update (.exe)'
                      : isZh
                        ? '一键拉取并重构建'
                        : 'Pull & Rebuild'}
                </button>
              ) : (
                <a
                  href={`https://github.com/${repo}/releases/latest`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  {isZh ? '下载 Windows 安装包 (.exe)' : 'Download Windows .exe'}
                </a>
              )}

              <a
                href={`https://github.com/${repo}/releases/latest`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
              >
                Releases
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Local Update Execution Result */}
          {localUpdateResult && (
            <div
              className={`rounded-control border px-3.5 py-2.5 text-[12px] ${
                localUpdateResult.ok
                  ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#166534]'
                  : 'border-[#FDE68A] bg-[#FFFBEB] text-[#92400E]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{localUpdateResult.message}</span>
                {localUpdateResult.log && (
                  <button
                    type="button"
                    onClick={() => setShowLog((prev) => !prev)}
                    className="inline-flex shrink-0 items-center gap-1 text-[11px] underline"
                  >
                    <Terminal className="h-3 w-3" />
                    {showLog ? t.updateModal.hideLog : t.updateModal.viewLog}
                  </button>
                )}
              </div>
              {showLog && localUpdateResult.log && (
                <pre className="mt-2 max-h-36 overflow-auto rounded-inner bg-[#0F172A] p-2.5 font-mono text-[11px] text-[#E2E8F0]">
                  {localUpdateResult.log}
                </pre>
              )}
            </div>
          )}

          {/* Collapsed Developer / Manual Options */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="inline-flex items-center gap-1.5 text-[12px] text-[#64748B] hover:text-[#0F172A]"
            >
              {showAdvanced ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <span>{isZh ? '高级选项 / 开发者工具' : 'Developer & Manual Options'}</span>
            </button>

            {showAdvanced && (
              <div className="mt-2.5 space-y-2.5 rounded-control border border-[#E5E7EB] bg-white p-3.5 text-[12px]">
                <div className="font-mono text-[11px] text-[#64748B]">
                  {repo} ({branch})
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {updateInfo && (
                    <>
                      <a
                        href={updateInfo.commitUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-medium text-[#334155] hover:border-[#2563EB] hover:text-[#2563EB]"
                      >
                        {t.updateModal.viewCommits}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <a
                        href={updateInfo.sourceZipUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-medium text-[#334155] hover:border-[#2563EB] hover:text-[#2563EB]"
                      >
                        {t.updateModal.downloadZip}
                        <Download className="h-3 w-3" />
                      </a>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handleDownloadWinScript}
                    className="inline-flex items-center gap-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-medium text-[#334155] hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <Download className="h-3 w-3" />
                    {t.updateModal.winScriptSecondary}
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadUnixScript}
                    className="inline-flex items-center gap-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-medium text-[#334155] hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <Download className="h-3 w-3" />
                    {t.updateModal.unixScript}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyText(pullCmd, t.toasts.terminalCmdLabel)}
                    className="inline-flex items-center gap-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-medium text-[#334155] hover:border-[#2563EB] hover:text-[#2563EB]"
                  >
                    <Copy className="h-3 w-3" />
                    {t.updateModal.copyPullCmd}
                  </button>
                  {updateInfo?.hasUpdate && (
                    <button
                      type="button"
                      onClick={onMarkSyncedAndReload}
                      className="inline-flex items-center gap-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 py-1 text-[11px] font-medium text-[#334155] hover:border-[#16A34A] hover:text-[#16A34A]"
                    >
                      <Check className="h-3 w-3" />
                      {t.updateModal.reloadWebSync}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

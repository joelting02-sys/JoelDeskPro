import { useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  Lock,
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react';
import { EndpointConfig } from '../types/toolkit';
import {
  APP_VERSION,
  GitHubUpdateInfo,
  LocalUpdateResult,
  buildUnixUpdateScript,
  buildWindowsUpdateScript,
  formatGitHubTime,
  getGitPullCommand,
} from '../services/githubUpdater';
import { triggerClientFileDownload } from '../services/toolkitAdapter';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface UpdateModalProps {
  lang: AppLanguage;
  open: boolean;
  onClose: () => void;
  config: EndpointConfig;
  localEngineOnline: boolean;
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
  config,
  localEngineOnline,
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
  const [showLog, setShowLog] = useState(false);

  if (!open) return null;

  const repo = config.githubRepo || 'joelting02-sys/JoelDeskPro';
  const branch = config.githubBranch || 'main';
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[580px] overflow-hidden rounded-panel border border-[#E5E7EB] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.updateModal.title}</h2>
            <p className="mt-0.5 font-mono text-[12px] text-[#64748B]">
              GitHub · {repo} ({branch})
            </p>
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

        <div className="space-y-4 p-5">
          {/* Private Repo Info Notice */}
          <div className="flex items-start gap-2.5 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#475569]">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#64748B]" />
            <span>{t.updateModal.privateRepoNotice}</span>
          </div>

          {/* Version & Remote Commit Card */}
          <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[13px]">
                <GitBranch className="h-4 w-4 text-[#2563EB]" />
                <span className="font-semibold text-[#0F172A]">
                  {t.updateModal.currentVersion(APP_VERSION)}
                </span>
                {updateInfo?.syncedSha && (
                  <span className="font-mono text-[12px] text-[#64748B]">
                    · {t.updateModal.localCommit(updateInfo.syncedSha.slice(0, 7))}
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={onCheckNow}
                disabled={checking}
                className="inline-flex items-center gap-1.5 rounded-inner border border-[#E5E7EB] bg-white px-3 py-1 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-60 whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? t.updateModal.checking : t.updateModal.checkGitHub}
              </button>
            </div>

            {/* Latest GitHub State */}
            <div className="mt-3 border-t border-[#E5E7EB] pt-3">
              {checkError ? (
                <div className="text-[12px] leading-relaxed text-[#D97706]">{checkError}</div>
              ) : updateInfo ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`text-[13px] font-semibold ${
                        updateInfo.hasUpdate ? 'text-[#2563EB]' : 'text-[#16A34A]'
                      }`}
                    >
                      {updateInfo.hasUpdate
                        ? t.updateModal.newVersionFound(updateInfo.releaseTag || updateInfo.shortSha)
                        : t.updateModal.upToDate(updateInfo.releaseTag || updateInfo.shortSha)}
                    </span>
                    <span className="font-mono text-[11px] text-[#64748B]">
                      {formatGitHubTime(updateInfo.commitDate, lang)} · {updateInfo.commitAuthor}
                    </span>
                  </div>
                  <p className="text-[12px] text-[#334155] line-clamp-2">
                    {t.updateModal.latestCommitPrefix}
                    {updateInfo.commitMessage}
                  </p>
                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                    <a
                      href={updateInfo.commitUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[#2563EB] hover:underline"
                    >
                      {t.updateModal.viewCommits}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href={updateInfo.sourceZipUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-[#475569] hover:text-[#0F172A] hover:underline"
                    >
                      {t.updateModal.downloadZip}
                      <Download className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="text-[12px] text-[#64748B]">
                  {t.updateModal.clickCheckHint(repo)}
                </div>
              )}
            </div>
          </div>

          {/* One-Click Local Git Pull Actions (Works with Private Repo!) */}
          <div className="space-y-3 rounded-control border border-[#E5E7EB] bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[13px] font-semibold text-[#0F172A]">
                  {t.updateModal.pullTitle}
                </div>
                <div className="mt-0.5 text-[12px] text-[#64748B]">
                  {localEngineOnline
                    ? t.updateModal.pullOnlineDesc
                    : t.updateModal.pullOfflineDesc}
                </div>
              </div>
              <span
                className={`font-mono text-[11px] font-medium ${
                  localEngineOnline ? 'text-[#16A34A]' : 'text-[#64748B]'
                }`}
              >
                {localEngineOnline ? t.updateModal.modeLocalOnline : t.updateModal.modeWeb}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {localEngineOnline ? (
                <button
                  type="button"
                  onClick={onPullLocalUpdate}
                  disabled={updatingLocal}
                  className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-2 text-[12px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${updatingLocal ? 'animate-spin' : ''}`} />
                  {updatingLocal ? t.updateModal.pullingLocal : t.updateModal.pullNowBtn}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleDownloadWinScript}
                  className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-2 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.updateModal.winScriptPrimary}
                </button>
              )}

              {localEngineOnline && (
                <button
                  type="button"
                  onClick={handleDownloadWinScript}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.updateModal.winScriptSecondary}
                </button>
              )}

              <button
                type="button"
                onClick={handleDownloadUnixScript}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                {t.updateModal.unixScript}
              </button>

              <button
                type="button"
                onClick={() => onCopyText(pullCmd, t.toasts.terminalCmdLabel)}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
              >
                <Copy className="h-3.5 w-3.5" />
                {t.updateModal.copyPullCmd}
              </button>

              {updateInfo?.hasUpdate && (
                <button
                  type="button"
                  onClick={onMarkSyncedAndReload}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:border-[#16A34A] hover:text-[#16A34A] whitespace-nowrap"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t.updateModal.reloadWebSync}
                </button>
              )}
            </div>

            {/* Local Update Execution Output */}
            {localUpdateResult && (
              <div
                className={`rounded-inner border px-3 py-2.5 text-[12px] ${
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
                      className="inline-flex items-center gap-1 text-[11px] underline"
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
          </div>
        </div>
      </div>
    </div>
  );
}

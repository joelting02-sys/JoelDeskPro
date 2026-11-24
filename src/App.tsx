import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, GitBranch, RefreshCw } from 'lucide-react';
import { BrandLogo } from './components/BrandLogo';
import { TranscribeView } from './components/TranscribeView';
import { UpdateModal } from './components/UpdateModal';
import {
  INITIAL_WHISPER_STATUS,
  WhisperStatus,
  isDesktopWhisperSupported,
} from './services/whisperBridge';
import {
  APP_VERSION,
  DEFAULT_GITHUB_BRANCH,
  DEFAULT_GITHUB_REPO,
  GitHubUpdateInfo,
  LocalUpdateResult,
  checkGitHubUpdate,
  probeLocalEngine,
  setSyncedCommitSha,
  triggerLocalClientUpdate,
} from './services/githubUpdater';
import { AppLanguage, TRANSLATIONS, getInitialLanguage, saveLanguage } from './i18n';

interface ToastNotice {
  id: string;
  message: string;
  tone?: 'neutral' | 'success' | 'warning';
}

const LOCAL_ENGINE_PORT = 17890;
const LOCAL_ENGINE_TOKEN = 'joeldeskpro-local-bridge';

export function App() {
  const [lang, setLang] = useState<AppLanguage>(() => getInitialLanguage());
  const t = TRANSLATIONS[lang];

  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus>(() => ({
    ...INITIAL_WHISPER_STATUS,
    supported: isDesktopWhisperSupported(),
  }));
  const [whisperReloadNonce, setWhisperReloadNonce] = useState(0);

  const [localEngineOnline, setLocalEngineOnline] = useState(false);
  const [localEnginePackaged, setLocalEnginePackaged] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatingLocal, setUpdatingLocal] = useState(false);
  const [localUpdateResult, setLocalUpdateResult] = useState<LocalUpdateResult | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const whisperIframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    document.title = t.documentTitle;
  }, [t.documentTitle]);

  const showToast = useCallback((message: string, tone: ToastNotice['tone'] = 'neutral') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 3200);
  }, []);

  // Subscribe to Cloud Whisper Studio backend status in desktop mode
  useEffect(() => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi || !isDesktopWhisperSupported()) return;

    let mounted = true;
    whisperApi
      .getStatus()
      .then((st) => {
        if (mounted && st) setWhisperStatus(st);
      })
      .catch(() => {});

    const off = whisperApi.onEvent((evt) => {
      if (mounted && evt?.status) {
        setWhisperStatus(evt.status);
      }
    });

    return () => {
      mounted = false;
      off();
    };
  }, []);

  const handleCheckGitHubUpdate = useCallback(
    async (silent = false) => {
      setCheckingUpdate(true);
      if (!silent) setUpdateError(null);
      try {
        const info = await checkGitHubUpdate(DEFAULT_GITHUB_REPO, DEFAULT_GITHUB_BRANCH, lang);
        setUpdateInfo(info);
        setUpdateError(null);
        if (!silent) {
          showToast(
            info.hasUpdate ? t.toasts.updateFound(info.releaseTag || info.shortSha) : t.toasts.upToDate,
            info.hasUpdate ? 'neutral' : 'success'
          );
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!silent) {
          setUpdateError(msg);
          showToast(t.toasts.updateCheckFailed(msg), 'warning');
        }
      } finally {
        setCheckingUpdate(false);
      }
    },
    [lang, showToast, t.toasts]
  );

  // Probe local updater backend and run silent update check on mount
  useEffect(() => {
    let active = true;
    probeLocalEngine(LOCAL_ENGINE_PORT).then((st) => {
      if (!active) return;
      setLocalEngineOnline(st.online);
      setLocalEnginePackaged(Boolean(st.packaged));
    });
    handleCheckGitHubUpdate(true);
    return () => {
      active = false;
    };
  }, [handleCheckGitHubUpdate]);

  const handleStartWhisper = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    const res = await whisperApi.start();
    if (res?.status) setWhisperStatus(res.status);
    if (res?.ok) {
      showToast(t.toasts.whisperStarted, 'success');
    } else if (!res?.needsDir && res?.error) {
      showToast(t.toasts.whisperStartFailed(res.error), 'warning');
    }
  }, [showToast, t.toasts]);

  const handleRestartWhisper = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    const res = await whisperApi.restart();
    if (res?.status) setWhisperStatus(res.status);
    if (res?.ok) {
      setWhisperReloadNonce((n) => n + 1);
      showToast(t.toasts.whisperRestarted, 'success');
    } else if (res?.error) {
      showToast(t.toasts.whisperStartFailed(res.error), 'warning');
    }
  }, [showToast, t.toasts]);

  const handlePickWhisperDir = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    const res = await whisperApi.pickDir();
    if (res?.status) setWhisperStatus(res.status);
    if (res?.ok && res.projectDir) {
      const folderName = res.projectDir.split(/[\\/]/).filter(Boolean).pop() || res.projectDir;
      showToast(t.toasts.whisperDirSaved(folderName), 'success');
    }
  }, [showToast, t.toasts]);

  const handleOpenWhisperStandalone = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    const res = await whisperApi.openStandalone();
    if (res?.ok) {
      showToast(t.toasts.whisperStandaloneOpened, 'neutral');
    }
  }, [showToast, t.toasts]);

  const handleWhisperSnapshotSync = useCallback(
    (snapshot: { compute?: Record<string, unknown>; settings?: Record<string, unknown> }) => {
      const compute = snapshot.compute || {};
      const st = snapshot.settings || {};
      setWhisperStatus((prev) => ({
        ...prev,
        computeStatus: typeof compute.status === 'string' ? compute.status : prev.computeStatus,
        computeProvider:
          typeof compute.provider === 'string' ? compute.provider : prev.computeProvider,
        computeGpu: typeof compute.gpu === 'string' ? compute.gpu : prev.computeGpu,
        whisperRemoteProvider:
          typeof st.provider === 'string' ? st.provider : prev.whisperRemoteProvider,
        whisperRemoteModel:
          typeof st.whisper_model === 'string' ? st.whisper_model : prev.whisperRemoteModel,
        whisperRemoteLanguage:
          typeof st.language === 'string' ? st.language : prev.whisperRemoteLanguage,
      }));
    },
    []
  );

  const handlePullLocalUpdate = useCallback(async () => {
    setUpdatingLocal(true);
    setLocalUpdateResult(null);
    const result = await triggerLocalClientUpdate(
      LOCAL_ENGINE_PORT,
      LOCAL_ENGINE_TOKEN,
      DEFAULT_GITHUB_REPO,
      DEFAULT_GITHUB_BRANCH,
      lang
    );
    setUpdatingLocal(false);
    setLocalUpdateResult(result);
    if (result.ok) {
      if (result.updatedSha) setSyncedCommitSha(result.updatedSha);
      showToast(t.toasts.updatePullSuccess(result.message), 'success');
      handleCheckGitHubUpdate(true);
    } else {
      showToast(t.toasts.updatePullFailed(result.message), 'warning');
    }
  }, [handleCheckGitHubUpdate, lang, showToast, t.toasts]);

  const handleMarkSyncedAndReload = useCallback(() => {
    if (updateInfo?.latestSha) {
      setSyncedCommitSha(updateInfo.latestSha);
    }
    showToast(t.toasts.reloading, 'success');
    window.setTimeout(() => window.location.reload(), 400);
  }, [showToast, t.toasts, updateInfo]);

  const handleCopyText = useCallback(
    async (text: string, label: string) => {
      try {
        if (window.joelDesktop?.whisper) {
          await window.joelDesktop.whisper.copyText(text);
        } else if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(text);
        }
        showToast(t.toasts.copied(label), 'success');
      } catch {
        // Ignore clipboard errors
      }
    },
    [showToast, t.toasts]
  );

  const handleChangeLanguage = (nextLang: AppLanguage) => {
    if (nextLang === lang) return;
    setLang(nextLang);
    saveLanguage(nextLang);
  };

  const gpuOnline = whisperStatus.running && whisperStatus.computeStatus === 'online';
  const statusText = gpuOnline
    ? t.transcribe.statusGpuOnline(whisperStatus.computeGpu || 'GPU')
    : whisperStatus.running
      ? t.transcribe.statusServiceOnline
      : whisperStatus.starting
        ? t.transcribe.statusStarting
        : t.transcribe.statusOffline;
  const statusDot = gpuOnline
    ? 'bg-[#16A34A]'
    : whisperStatus.running
      ? 'bg-[#2563EB]'
      : whisperStatus.starting
        ? 'bg-[#D97706]'
        : 'bg-[#94A3B8]';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#F8F9FA] text-[#0F172A]">
      {/* Minimal Single-View Header */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#E5E7EB] bg-white px-5">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={28} />
          <span className="text-[15px] font-semibold tracking-tight text-[#0F172A] whitespace-nowrap">
            {t.header.appTitle}
          </span>
          <span className="rounded-inner bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[11px] font-medium text-[#64748B]">
            v{APP_VERSION}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-inner bg-[#F3F4F6] px-2.5 py-1 font-mono text-[11px] font-medium text-[#475569]">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {statusText}
          </span>

          {whisperStatus.running && (
            <button
              type="button"
              onClick={() => setWhisperReloadNonce((n) => n + 1)}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap shrink-0"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.transcribe.reloadUiBtn}
            </button>
          )}

          {whisperStatus.supported && (
            <>
              <button
                type="button"
                onClick={handleRestartWhisper}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap shrink-0"
              >
                {t.transcribe.restartServiceBtn}
              </button>
              <button
                type="button"
                onClick={handleOpenWhisperStandalone}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap shrink-0"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {t.transcribe.openStandaloneBtn}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => {
              setUpdateModalOpen(true);
              handleCheckGitHubUpdate(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap shrink-0"
          >
            <GitBranch className="h-3.5 w-3.5" />
            <span>{t.header.updateBtn}</span>
            {updateInfo?.hasUpdate && (
              <span
                title={t.header.updateAvailable}
                className="h-1.5 w-1.5 rounded-full bg-[#2563EB]"
              />
            )}
          </button>

          <div
            role="group"
            aria-label="Language"
            className="inline-flex items-center gap-0.5 rounded-control bg-[#F3F4F6] p-0.5 shrink-0"
          >
            <button
              type="button"
              onClick={() => handleChangeLanguage('en')}
              className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                lang === 'en'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => handleChangeLanguage('zh')}
              className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                lang === 'zh'
                  ? 'bg-white text-[#0F172A] shadow-xs'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              中文
            </button>
          </div>
        </div>
      </header>

      {/* Full-Width Cloud Whisper Studio Viewport */}
      <main className="min-h-0 flex-1">
        <TranscribeView
          lang={lang}
          whisperStatus={whisperStatus}
          isActive={true}
          reloadNonce={whisperReloadNonce}
          iframeRef={whisperIframeRef}
          onStart={handleStartWhisper}
          onRestart={handleRestartWhisper}
          onPickDir={handlePickWhisperDir}
          onOpenStandalone={handleOpenWhisperStandalone}
          onWhisperSnapshotSync={handleWhisperSnapshotSync}
        />
      </main>

      <UpdateModal
        lang={lang}
        open={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        repo={DEFAULT_GITHUB_REPO}
        branch={DEFAULT_GITHUB_BRANCH}
        localEngineOnline={localEngineOnline}
        localEnginePackaged={localEnginePackaged}
        updateInfo={updateInfo}
        checking={checkingUpdate}
        checkError={updateError}
        updatingLocal={updatingLocal}
        localUpdateResult={localUpdateResult}
        onCheckNow={() => handleCheckGitHubUpdate(false)}
        onPullLocalUpdate={handlePullLocalUpdate}
        onMarkSyncedAndReload={handleMarkSyncedAndReload}
        onCopyText={handleCopyText}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-panel border border-[#E5E7EB] bg-[#0F172A] px-4 py-2.5 text-[13px] font-medium text-white shadow-md"
        >
          {toast.tone === 'success' && <Check className="h-4 w-4 text-[#4ADE80]" />}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
export default App;

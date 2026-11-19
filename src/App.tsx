import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Menu, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { AgentView } from './components/AgentView';
import { TranscribeView } from './components/TranscribeView';
import { DownloadView } from './components/DownloadView';
import { ConvertView } from './components/ConvertView';
import { SettingsView } from './components/SettingsView';
import { UpdateModal } from './components/UpdateModal';
import {
  AgentActionPayload,
  AgentMessage,
  AttachedFileItem,
  ConversionTask,
  DocumentFormat,
  EndpointConfig,
  ToastNotice,
  WorkspaceView,
} from './types/toolkit';
import {
  DEFAULT_ENDPOINT_CONFIG,
  detectDocumentFormat,
  nowTimeLabel,
  parseAgentIntent,
} from './services/toolkitAdapter';
import {
  INITIAL_TDM_STATUS,
  TdmBounds,
  TdmStatus,
  isDesktopTdmSupported,
  probeLocalEngine,
} from './services/tdmBridge';
import {
  INITIAL_WHISPER_STATUS,
  WhisperStatus,
  dispatchFileToWhisper,
  isDesktopWhisperSupported,
} from './services/whisperBridge';
import {
  GitHubUpdateInfo,
  LocalUpdateResult,
  checkGitHubUpdate,
  setSyncedCommitSha,
  triggerLocalClientUpdate,
} from './services/githubUpdater';
import { AppLanguage, TRANSLATIONS, getInitialLanguage, saveLanguage } from './i18n';

export default function App() {
  const [lang, setLang] = useState<AppLanguage>(() => getInitialLanguage());
  const [activeView, setActiveView] = useState<WorkspaceView>('agent');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [config, setConfig] = useState<EndpointConfig>(DEFAULT_ENDPOINT_CONFIG);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [conversions, setConversions] = useState<ConversionTask[]>([]);
  const [localEngineOnline, setLocalEngineOnline] = useState(false);
  const [localEnginePackaged, setLocalEnginePackaged] = useState(false);
  const [tdmStatus, setTdmStatus] = useState<TdmStatus>(() => ({
    ...INITIAL_TDM_STATUS,
    supported: isDesktopTdmSupported(),
  }));
  const [tdmHiddenByUser, setTdmHiddenByUser] = useState(false);

  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus>(() => ({
    ...INITIAL_WHISPER_STATUS,
    supported: isDesktopWhisperSupported(),
  }));
  const [whisperVisited, setWhisperVisited] = useState(false);
  const [whisperReloadNonce, setWhisperReloadNonce] = useState(0);

  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatingLocal, setUpdatingLocal] = useState(false);
  const [localUpdateResult, setLocalUpdateResult] = useState<LocalUpdateResult | null>(null);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const langRef = useRef<AppLanguage>(lang);
  langRef.current = lang;
  const activeViewRef = useRef<WorkspaceView>(activeView);
  activeViewRef.current = activeView;
  const lastDownloadBoundsRef = useRef<TdmBounds | undefined>(undefined);
  const whisperIframeRef = useRef<HTMLIFrameElement>(null);

  const t = TRANSLATIONS[lang];

  const handleChangeLanguage = useCallback((nextLang: AppLanguage) => {
    setLang(nextLang);
    saveLanguage(nextLang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = TRANSLATIONS[lang].documentTitle;
  }, [lang]);

  useEffect(() => {
    if (activeView === 'transcribe') {
      setWhisperVisited(true);
    }
  }, [activeView]);

  const showToast = useCallback((message: string, tone: ToastNotice['tone'] = 'neutral') => {
    const id = `${Date.now()}`;
    setToast({ id, message, tone });
    window.setTimeout(() => {
      setToast((curr) => (curr?.id === id ? null : curr));
    }, 2600);
  }, []);

  const handleCopyText = useCallback(
    (text: string, label: string) => {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => undefined);
      }
      showToast(TRANSLATIONS[langRef.current].toasts.copied(label), 'success');
    },
    [showToast]
  );

  // Sync native TDM Fast host status & live events
  useEffect(() => {
    const tdmApi = window.joelDesktop?.tdm;
    if (!tdmApi || !isDesktopTdmSupported()) return;

    let mounted = true;
    tdmApi.getStatus().then((st) => {
      if (!mounted || !st) return;
      setTdmStatus(st);
      if (st.settings) {
        setConfig((prev) => ({
          ...prev,
          tdmExePath: st.settings!.tdm_exe_path ?? prev.tdmExePath,
          tdmAutoLaunch: st.settings!.tdm_auto_launch ?? prev.tdmAutoLaunch,
          tdmCloseOnExit: st.settings!.tdm_close_on_exit ?? prev.tdmCloseOnExit,
          tdmHideOnDrag: st.settings!.tdm_hide_on_drag ?? prev.tdmHideOnDrag,
          tdmCapturePort: st.settings!.tdm_capture_port ?? prev.tdmCapturePort,
        }));
      }
    });

    const off = tdmApi.onEvent((evt) => {
      if (!mounted || !evt) return;
      if (evt.status) setTdmStatus(evt.status);
      if (evt.event === 'tdm-hidden-by-user') {
        setTdmHiddenByUser(true);
      } else if (evt.event === 'tdm-exited') {
        setTdmHiddenByUser(false);
      } else if (evt.event === 'tdm-activated') {
        setTdmHiddenByUser(false);
        if (activeViewRef.current !== 'download') {
          setActiveView('download');
          showToast(TRANSLATIONS[langRef.current].toasts.tdmActivatedFromExt, 'success');
        }
      }
    });

    return () => {
      mounted = false;
      off();
    };
  }, [showToast]);

  // Sync Cloud Whisper Studio backend status & events
  useEffect(() => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi || !isDesktopWhisperSupported()) return;

    let mounted = true;
    const applyWhisperStatus = (st: WhisperStatus) => {
      setWhisperStatus(st);
      if (st.settings) {
        setConfig((prev) => ({
          ...prev,
          whisperProjectDir: st.settings!.whisper_project_dir ?? prev.whisperProjectDir,
          whisperPort: st.settings!.whisper_port ?? prev.whisperPort,
          whisperAutoStart: st.settings!.whisper_auto_start ?? prev.whisperAutoStart,
          whisperCloseOnExit: st.settings!.whisper_close_on_exit ?? prev.whisperCloseOnExit,
        }));
      }
    };

    whisperApi.getStatus().then((st) => {
      if (!mounted || !st) return;
      applyWhisperStatus(st);
    });

    const off = whisperApi.onEvent((evt) => {
      if (!mounted || !evt) return;
      if (evt.status) applyWhisperStatus(evt.status);
    });

    return () => {
      mounted = false;
      off();
    };
  }, []);

  // Ensure TDM hides immediately when navigating away from Downloader or opening overlays
  useEffect(() => {
    const tdmApi = window.joelDesktop?.tdm;
    if (!tdmApi || !isDesktopTdmSupported()) return;
    if (activeView !== 'download' || updateModalOpen || mobileNavOpen) {
      tdmApi.setVisible(false).then((res) => {
        if (res?.status) setTdmStatus(res.status);
      });
    }
  }, [activeView, updateModalOpen, mobileNavOpen]);

  const handlePickTdmExe = useCallback(async () => {
    const tdmApi = window.joelDesktop?.tdm;
    if (!tdmApi) return;
    const res = await tdmApi.pickExe();
    if (res?.status) setTdmStatus(res.status);
    if (res?.ok && res.exePath) {
      setConfig((prev) => ({ ...prev, tdmExePath: res.exePath! }));
      const base = res.exePath.split(/[\\/]/).pop() || res.exePath;
      showToast(TRANSLATIONS[langRef.current].toasts.tdmExeSelected(base), 'success');
    }
  }, [showToast]);

  const handleAttachTdm = useCallback(
    async (bounds?: TdmBounds) => {
      const tdmApi = window.joelDesktop?.tdm;
      if (!tdmApi) return;
      if (bounds) lastDownloadBoundsRef.current = bounds;
      setTdmHiddenByUser(false);
      setTdmStatus((prev) => ({ ...prev, starting: true, lastError: '' }));
      const res = await tdmApi.attach(bounds || lastDownloadBoundsRef.current, {
        autoLaunch: true,
        visible: true,
      });
      if (res?.status) setTdmStatus(res.status);
      if (res && !res.ok && res.error) {
        showToast(res.error, 'warning');
      }
    },
    [showToast]
  );

  const handleUpdateTdmBounds = useCallback((bounds: TdmBounds) => {
    lastDownloadBoundsRef.current = bounds;
    window.joelDesktop?.tdm.updateBounds(bounds).catch(() => {});
  }, []);

  const handleSetTdmVisible = useCallback((visible: boolean, bounds?: TdmBounds) => {
    if (bounds) lastDownloadBoundsRef.current = bounds;
    window.joelDesktop?.tdm.setVisible(visible, bounds).then((res) => {
      if (res?.status) setTdmStatus(res.status);
    });
  }, []);

  const handleDetachTdm = useCallback(async () => {
    const tdmApi = window.joelDesktop?.tdm;
    if (!tdmApi) return;
    setTdmHiddenByUser(false);
    const res = await tdmApi.detach();
    if (res?.status) setTdmStatus(res.status);
    showToast(TRANSLATIONS[langRef.current].toasts.tdmDetached, 'neutral');
  }, [showToast]);

  const handleRelaunchTdm = useCallback(async (bounds?: TdmBounds) => {
    const tdmApi = window.joelDesktop?.tdm;
    if (!tdmApi) return;
    if (bounds) lastDownloadBoundsRef.current = bounds;
    setTdmHiddenByUser(false);
    setTdmStatus((prev) => ({ ...prev, starting: true, lastError: '' }));
    const res = await tdmApi.relaunch(bounds || lastDownloadBoundsRef.current);
    if (res?.status) setTdmStatus(res.status);
  }, []);

  // Cloud Whisper Studio handlers
  const handleStartWhisper = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    setWhisperStatus((prev) => ({ ...prev, starting: true, lastError: '' }));
    const res = await whisperApi.start();
    if (res?.status) setWhisperStatus(res.status);
    if (res && !res.ok && res.error) {
      showToast(res.error, 'warning');
    }
  }, [showToast]);

  const handleRestartWhisper = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    setWhisperStatus((prev) => ({ ...prev, starting: true, lastError: '' }));
    const res = await whisperApi.restart();
    if (res?.status) setWhisperStatus(res.status);
    if (res?.ok) {
      setWhisperReloadNonce((n) => n + 1);
      showToast(TRANSLATIONS[langRef.current].toasts.whisperRestarted, 'success');
    } else if (res?.error) {
      showToast(res.error, 'warning');
    }
  }, [showToast]);

  const handlePickWhisperDir = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    const res = await whisperApi.pickDir();
    if (res?.status) setWhisperStatus(res.status);
    if (res?.ok && res.projectDir) {
      setConfig((prev) => ({ ...prev, whisperProjectDir: res.projectDir! }));
      const base = res.projectDir.split(/[\\/]/).pop() || res.projectDir;
      showToast(TRANSLATIONS[langRef.current].toasts.whisperDirSelected(base), 'success');
    } else if (res && !res.canceled && res.error) {
      showToast(res.error, 'warning');
    }
  }, [showToast]);

  const handleOpenWhisperStandalone = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    const res = await whisperApi.openStandalone();
    if (res?.ok) {
      showToast(TRANSLATIONS[langRef.current].toasts.whisperOpenedStandalone, 'neutral');
    }
  }, [showToast]);

  const handleOpenWhisperOutputs = useCallback(async () => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi) return;
    const res = await whisperApi.openOutputs();
    if (res && !res.ok && res.error) {
      showToast(res.error, 'warning');
    }
  }, [showToast]);

  // Live progress loop for active conversions
  useEffect(() => {
    const timer = window.setInterval(() => {
      setConversions((prev) => {
        const hasActive = prev.some((c) => c.status === 'converting');
        if (!hasActive) return prev;
        return prev.map((task) => {
          if (task.status !== 'converting') return task;
          const nextProgress = Math.min(100, task.progress + 18);
          return {
            ...task,
            progress: nextProgress,
            status: nextProgress >= 100 ? 'completed' : 'converting',
          };
        });
      });
    }, 650);

    return () => window.clearInterval(timer);
  }, []);

  // Poll local updater HTTP engine
  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      const res = await probeLocalEngine(config.chromeBridgePort);
      if (cancelled) return;
      setLocalEngineOnline(res.online);
      setLocalEnginePackaged(Boolean(res.packaged));
    };

    checkHealth();
    const timer = window.setInterval(checkHealth, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [config.chromeBridgePort]);

  const handleCheckGitHubUpdate = useCallback(
    async (silent = false) => {
      setCheckingUpdate(true);
      setUpdateError(null);
      try {
        const info = await checkGitHubUpdate(
          config.githubRepo,
          config.githubBranch,
          langRef.current
        );
        setUpdateInfo(info);
        if (!silent) {
          const currToasts = TRANSLATIONS[langRef.current].toasts;
          showToast(
            info.hasUpdate
              ? currToasts.foundGitHubCommit(info.shortSha)
              : currToasts.alreadyLatest,
            info.hasUpdate ? 'success' : 'neutral'
          );
        }
      } catch (err) {
        const msg =
          err instanceof Error
            ? err.message
            : TRANSLATIONS[langRef.current].toasts.checkUpdateFailed;
        setUpdateError(msg);
        if (!silent) showToast(msg, 'warning');
      } finally {
        setCheckingUpdate(false);
      }
    },
    [config.githubBranch, config.githubRepo, showToast]
  );

  useEffect(() => {
    if (!config.autoCheckUpdate) return;
    handleCheckGitHubUpdate(true);
  }, [config.autoCheckUpdate, handleCheckGitHubUpdate]);

  const handleOpenUpdateModal = useCallback(() => {
    setUpdateModalOpen(true);
    setLocalUpdateResult(null);
    setUpdateError(null);
    probeLocalEngine(config.chromeBridgePort).then((res) => {
      setLocalEngineOnline(res.online);
      setLocalEnginePackaged(Boolean(res.packaged));
    });
    handleCheckGitHubUpdate(true);
  }, [config.chromeBridgePort, handleCheckGitHubUpdate]);

  const handlePullLocalUpdate = useCallback(async () => {
    setUpdatingLocal(true);
    setLocalUpdateResult(null);
    const result = await triggerLocalClientUpdate(
      config.chromeBridgePort,
      config.chromeBridgeToken,
      config.githubRepo,
      config.githubBranch,
      langRef.current
    );
    setUpdatingLocal(false);
    setLocalUpdateResult(result);
    if (result.ok) {
      if (result.updatedSha) {
        setSyncedCommitSha(result.updatedSha);
      }
      setUpdateInfo((prev) =>
        prev
          ? {
              ...prev,
              hasUpdate: false,
              syncedSha: result.updatedSha || prev.latestSha,
            }
          : prev
      );
      showToast(TRANSLATIONS[langRef.current].toasts.localUpdated, 'success');
    } else {
      showToast(result.message, 'warning');
    }
  }, [
    config.chromeBridgePort,
    config.chromeBridgeToken,
    config.githubBranch,
    config.githubRepo,
    showToast,
  ]);

  const handleMarkSyncedAndReload = useCallback(() => {
    if (updateInfo?.latestSha) {
      setSyncedCommitSha(updateInfo.latestSha);
    }
    window.location.reload();
  }, [updateInfo]);

  const createConversionTask = useCallback(
    (params: {
      fileName: string;
      fileSizeBytes: number;
      sourceFormat: DocumentFormat;
      targetFormat: DocumentFormat;
      autoStart?: boolean;
      source: 'agent' | 'manual';
    }) => {
      const task: ConversionTask = {
        id: `cv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        fileName: params.fileName,
        fileSizeBytes: params.fileSizeBytes,
        sourceFormat: params.sourceFormat,
        targetFormat: params.targetFormat,
        progress: params.autoStart ? 12 : 0,
        status: params.autoStart ? 'converting' : 'ready',
        createdAt: nowTimeLabel(),
        source: params.source,
      };
      setConversions((prev) => [task, ...prev]);
      if (params.autoStart) {
        showToast(
          TRANSLATIONS[langRef.current].toasts.convertingTo(params.targetFormat.toUpperCase()),
          'success'
        );
      }
      return task.id;
    },
    [showToast]
  );

  // Agent Handlers
  const handleSendAgentMessage = (text: string, attachments: AttachedFileItem[]) => {
    const userMsg: AgentMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: text,
      attachments,
      timestamp: nowTimeLabel(),
    };
    const parsed = parseAgentIntent(text, attachments, config, lang);
    const assistantMsg: AgentMessage = {
      id: `msg-a-${Date.now() + 1}`,
      role: 'assistant',
      content: parsed.reply,
      action: parsed.action,
      timestamp: nowTimeLabel(),
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
  };

  const handleUpdateAgentAction = (
    messageId: string,
    updater: (action: AgentActionPayload) => AgentActionPayload
  ) => {
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId && msg.action ? { ...msg, action: updater(msg.action) } : msg
      )
    );
  };

  const handleDispatchAgentAction = async (messageId: string, action: AgentActionPayload) => {
    if (action.type === 'download') {
      const tdmApi = window.joelDesktop?.tdm;
      if (!tdmApi || !isDesktopTdmSupported()) {
        showToast(TRANSLATIONS[langRef.current].toasts.tdmMissingExe, 'warning');
        setActiveView('download');
        return;
      }
      const res = await tdmApi.sendUrl({
        url: action.cleanUrl,
        filename: action.fileName,
      });
      const st = await tdmApi.getStatus();
      if (st) setTdmStatus(st);
      if (res.ok) {
        const taskId = `tdm-${Date.now()}`;
        handleUpdateAgentAction(messageId, (prev) => ({
          ...prev,
          dispatchedTaskId: taskId,
        }));
        showToast(TRANSLATIONS[langRef.current].toasts.tdmDispatched, 'success');
        setActiveView('download');
      } else if (res.needsExe) {
        showToast(TRANSLATIONS[langRef.current].toasts.tdmMissingExe, 'warning');
        setActiveView('download');
      } else {
        showToast(res.error || TRANSLATIONS[langRef.current].toasts.tdmDispatchFailed, 'warning');
      }
      return;
    }

    if (action.type === 'transcribe') {
      const whisperApi = window.joelDesktop?.whisper;
      let port = whisperStatus.port || config.whisperPort || 8788;

      if (whisperApi && !whisperStatus.running) {
        const startRes = await whisperApi.start();
        if (startRes?.status) {
          setWhisperStatus(startRes.status);
          port = startRes.status.port || port;
        }
        if (!startRes?.ok) {
          showToast(
            startRes?.error || TRANSLATIONS[langRef.current].toasts.whisperBackendFailed,
            'warning'
          );
          setActiveView('transcribe');
          return;
        }
      }

      if (!action.rawFile) {
        setActiveView('transcribe');
        showToast(TRANSLATIONS[langRef.current].toasts.whisperDropFilePrompt, 'neutral');
        return;
      }

      const mappedProvider = action.provider === 'kaggle-t4' ? 'kaggle' : 'colab';
      const mappedModel =
        action.preset === 'fast'
          ? 'small'
          : action.preset === 'accurate'
            ? 'large-v3'
            : 'large-v3-turbo';

      const uploadRes = await dispatchFileToWhisper(port, action.rawFile, {
        provider: mappedProvider,
        model: mappedModel,
        language: action.language || 'auto',
      });

      if (!uploadRes.ok) {
        showToast(
          uploadRes.error || TRANSLATIONS[langRef.current].toasts.whisperBackendFailed,
          'warning'
        );
        setActiveView('transcribe');
        return;
      }

      handleUpdateAgentAction(messageId, (prev) => ({
        ...prev,
        dispatchedTaskId: `cw-${Date.now()}`,
      }));
      setActiveView('transcribe');
      window.setTimeout(() => {
        try {
          whisperIframeRef.current?.contentWindow?.postMessage(
            { type: 'cw-parent-cmd', cmd: 'refresh', tab: 'queue' },
            '*'
          );
        } catch {}
      }, 250);
      showToast(
        action.needsAudioExtract
          ? TRANSLATIONS[langRef.current].toasts.videoAudioQueued
          : TRANSLATIONS[langRef.current].toasts.cloudTranscribeQueued,
        'success'
      );
      return;
    }

    const taskId = createConversionTask({
      fileName: action.fileName,
      fileSizeBytes: action.fileSizeBytes,
      sourceFormat: action.sourceFormat,
      targetFormat: action.targetFormat,
      autoStart: true,
      source: 'agent',
    });

    handleUpdateAgentAction(messageId, (prev) => ({
      ...prev,
      dispatchedTaskId: taskId,
    }));
  };

  const activeCounts = {
    transcribe: whisperStatus.pendingTasks,
    convert: conversions.filter((item) => item.status === 'converting').length,
  };

  // Single contextual right-side header action per workspace
  const renderTopBarAction = () => {
    if (activeView === 'agent' && messages.length > 0) {
      return (
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            showToast(t.toasts.newChatStarted);
          }}
          className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0F172A] hover:bg-[#F8F9FA] whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          {t.topbar.newChat}
        </button>
      );
    }

    if (activeView === 'transcribe') {
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
        </div>
      );
    }

    if (activeView === 'download' && tdmStatus.supported && tdmStatus.exeExists) {
      const statusText = tdmStatus.detached
        ? t.download.statusDetached
        : tdmStatus.attached && tdmStatus.visible && !tdmHiddenByUser
          ? t.download.statusDocked
          : t.download.statusHidden;
      const statusDot =
        tdmStatus.attached && tdmStatus.visible && !tdmHiddenByUser
          ? 'bg-[#16A34A]'
          : tdmStatus.running
            ? 'bg-[#2563EB]'
            : 'bg-[#94A3B8]';

      return (
        <div className="flex items-center gap-2 shrink-0">
          <span className="inline-flex items-center gap-1.5 rounded-inner bg-[#F3F4F6] px-2.5 py-1 font-mono text-[11px] font-medium text-[#475569]">
            <span className={`h-1.5 w-1.5 rounded-full ${statusDot}`} />
            {statusText}
          </span>
          <button
            type="button"
            onClick={() => handleAttachTdm(lastDownloadBoundsRef.current)}
            className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {tdmStatus.detached ? t.download.reattachBtn : t.download.resyncBtn}
          </button>
          {!tdmStatus.detached && tdmStatus.attached && (
            <button
              type="button"
              onClick={handleDetachTdm}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap shrink-0"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t.download.detachBtn}
            </button>
          )}
        </div>
      );
    }

    if (activeView === 'convert' && conversions.some((c) => c.status === 'completed')) {
      return (
        <button
          type="button"
          onClick={() => {
            setConversions((prev) => prev.filter((c) => c.status !== 'completed'));
            showToast(t.toasts.clearedConversions);
          }}
          className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t.topbar.clearCompleted}
        </button>
      );
    }
    return null;
  };

  const keepTranscribeMounted = whisperVisited || whisperStatus.running;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F9FA] text-[#0F172A]">
      <Sidebar
        lang={lang}
        activeView={activeView}
        onSelectView={setActiveView}
        activeCounts={activeCounts}
        whisperGpuOnline={whisperStatus.computeStatus === 'online'}
        tdmRunning={tdmStatus.running}
        hasUpdate={Boolean(updateInfo?.hasUpdate)}
        onOpenUpdateModal={handleOpenUpdateModal}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Right Main Viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Clean Contextual Top Bar */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-[#E5E7EB] bg-white px-5 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t.sidebar.openSidebar}
              className="flex h-8 w-8 items-center justify-center rounded-control text-[#475569] hover:bg-[#F3F4F6] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="text-[15px] font-semibold tracking-tight text-[#0F172A] whitespace-nowrap">
              {t.views[activeView]}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {renderTopBarAction()}

            {/* Bilingual EN / 中文 Switcher */}
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

        {/* Active Workspace View */}
        <main className="min-h-0 flex-1">
          {activeView === 'agent' && (
            <AgentView
              lang={lang}
              messages={messages}
              onSendMessage={handleSendAgentMessage}
              onUpdateAction={handleUpdateAgentAction}
              onDispatchAction={handleDispatchAgentAction}
              onNavigateView={setActiveView}
              onCopyText={handleCopyText}
            />
          )}

          {keepTranscribeMounted && (
            <div className={activeView === 'transcribe' ? 'h-full' : 'hidden'}>
              <TranscribeView
                lang={lang}
                whisperStatus={whisperStatus}
                isActive={activeView === 'transcribe'}
                reloadNonce={whisperReloadNonce}
                iframeRef={whisperIframeRef}
                onStart={handleStartWhisper}
                onRestart={handleRestartWhisper}
                onPickDir={handlePickWhisperDir}
                onOpenSettings={() => setActiveView('settings')}
                onOpenStandalone={handleOpenWhisperStandalone}
              />
            </div>
          )}

          {activeView === 'download' && (
            <DownloadView
              lang={lang}
              config={config}
              tdmStatus={tdmStatus}
              hiddenByUser={tdmHiddenByUser}
              overlayBlocking={updateModalOpen || mobileNavOpen}
              onPickExe={handlePickTdmExe}
              onAttach={handleAttachTdm}
              onUpdateBounds={handleUpdateTdmBounds}
              onSetVisible={handleSetTdmVisible}
              onDetach={handleDetachTdm}
              onRelaunch={handleRelaunchTdm}
              onOpenSettings={() => setActiveView('settings')}
            />
          )}

          {activeView === 'convert' && (
            <ConvertView
              lang={lang}
              tasks={conversions}
              onAddTask={(params) => createConversionTask({ ...params, source: 'manual' })}
              onUpdateTargetFormat={(id, targetFormat) =>
                setConversions((prev) =>
                  prev.map((item) => (item.id === id ? { ...item, targetFormat } : item))
                )
              }
              onStartTask={(id) =>
                setConversions((prev) =>
                  prev.map((item) =>
                    item.id === id ? { ...item, status: 'converting', progress: 15 } : item
                  )
                )
              }
              onStartAllReady={() => {
                setConversions((prev) =>
                  prev.map((item) =>
                    item.status === 'ready'
                      ? { ...item, status: 'converting', progress: 15 }
                      : item
                  )
                );
                showToast(t.toasts.batchConvertStarted, 'success');
              }}
              onDeleteTask={(id) => setConversions((prev) => prev.filter((item) => item.id !== id))}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              lang={lang}
              config={config}
              tdmStatus={tdmStatus}
              whisperStatus={whisperStatus}
              onPickWhisperDir={handlePickWhisperDir}
              onOpenWhisperDocked={() => setActiveView('transcribe')}
              onRestartWhisper={handleRestartWhisper}
              onOpenWhisperStandalone={handleOpenWhisperStandalone}
              onOpenWhisperOutputs={handleOpenWhisperOutputs}
              onPickTdmExe={handlePickTdmExe}
              onOpenDownloadDocked={() => {
                setTdmHiddenByUser(false);
                setActiveView('download');
              }}
              onDetachTdm={handleDetachTdm}
              onSaveConfig={(next) => {
                setConfig(next);
                if (window.joelDesktop?.tdm && isDesktopTdmSupported()) {
                  window.joelDesktop.tdm
                    .saveSettings({
                      tdm_exe_path: next.tdmExePath.trim(),
                      tdm_auto_launch: next.tdmAutoLaunch,
                      tdm_close_on_exit: next.tdmCloseOnExit,
                      tdm_hide_on_drag: next.tdmHideOnDrag,
                      tdm_capture_port: next.tdmCapturePort,
                    })
                    .then((res) => {
                      if (res?.status) setTdmStatus(res.status);
                    });
                }
                if (window.joelDesktop?.whisper && isDesktopWhisperSupported()) {
                  window.joelDesktop.whisper
                    .saveSettings({
                      whisper_project_dir: next.whisperProjectDir.trim(),
                      whisper_port: next.whisperPort,
                      whisper_auto_start: next.whisperAutoStart,
                      whisper_close_on_exit: next.whisperCloseOnExit,
                    })
                    .then((res) => {
                      if (res?.status) setWhisperStatus(res.status);
                    });
                }
                showToast(t.toasts.configSaved, 'success');
              }}
              onOpenUpdateModal={handleOpenUpdateModal}
              onCopyText={handleCopyText}
            />
          )}
        </main>
      </div>

      <UpdateModal
        lang={lang}
        open={updateModalOpen}
        onClose={() => setUpdateModalOpen(false)}
        config={config}
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

      {/* Subtle Floating Toast */}
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

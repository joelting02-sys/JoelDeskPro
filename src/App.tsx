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
  AgentBackendMode,
  AgentMessage,
  AgentRunnerStatus,
  AgentSettings,
  AgentToolStep,
  AttachedFileItem,
  CliAgentProvider,
  ComputeProvider,
  ConversionTask,
  DocumentFormat,
  EndpointConfig,
  ToastNotice,
  TranscriptLanguage,
  WhisperPresetId,
  WorkspaceView,
} from './types/toolkit';
import {
  INITIAL_AGENT_STATUS,
  isDesktopAgentSupported,
} from './services/agentBridge';
import {
  DEFAULT_ENDPOINT_CONFIG,
  callCustomLlmEndpoint,
  detectDocumentFormat,
  formatBytes,
  loadSavedLlmConfig,
  nowTimeLabel,
  parseAgentIntent,
  saveLlmConfigToStorage,
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

  const [config, setConfig] = useState<EndpointConfig>(() => ({
    ...DEFAULT_ENDPOINT_CONFIG,
    ...loadSavedLlmConfig(),
  }));
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [agentSending, setAgentSending] = useState(false);
  const [conversions, setConversions] = useState<ConversionTask[]>([]);
  const [localEngineOnline, setLocalEngineOnline] = useState(false);
  const [localEnginePackaged, setLocalEnginePackaged] = useState(false);
  const [tdmStatus, setTdmStatus] = useState<TdmStatus>(() => ({
    ...INITIAL_TDM_STATUS,
    supported: isDesktopTdmSupported(),
  }));
  const [tdmHiddenByUser, setTdmHiddenByUser] = useState(false);
  const [tdmDownloading, setTdmDownloading] = useState(false);
  const [tdmDownloadError, setTdmDownloadError] = useState('');

  const [whisperStatus, setWhisperStatus] = useState<WhisperStatus>(() => ({
    ...INITIAL_WHISPER_STATUS,
    supported: isDesktopWhisperSupported(),
  }));
  const [whisperVisited, setWhisperVisited] = useState(false);
  const [whisperReloadNonce, setWhisperReloadNonce] = useState(0);
  const [agentStatus, setAgentStatus] = useState<AgentRunnerStatus>(() => ({
    ...INITIAL_AGENT_STATUS,
    supported: isDesktopAgentSupported(),
  }));
  const [agentSessions, setAgentSessions] = useState<Record<CliAgentProvider, string | null>>({
    claude: null,
    codex: null,
    dsh: null,
  });

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
  const diskLlmSyncedRef = useRef(false);
  const activeRunRef = useRef<{ runId: string; messageId: string; provider: CliAgentProvider } | null>(
    null
  );

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

  // Sync native JoelFast host status & live events
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

  // Sync Cloud Whisper Studio backend status & persisted Home AI settings
  useEffect(() => {
    const whisperApi = window.joelDesktop?.whisper;
    if (!whisperApi || !isDesktopWhisperSupported()) return;

    let mounted = true;
    const applyWhisperStatus = (st: WhisperStatus, isInitialLoad = false) => {
      setWhisperStatus(st);
      if (st.settings) {
        const s = st.settings;
        setConfig((prev) => {
          const next: EndpointConfig = {
            ...prev,
            whisperProjectDir: s.whisper_project_dir ?? prev.whisperProjectDir,
            whisperPort: s.whisper_port ?? prev.whisperPort,
            whisperAutoStart: s.whisper_auto_start ?? prev.whisperAutoStart,
            whisperCloseOnExit: s.whisper_close_on_exit ?? prev.whisperCloseOnExit,
          };
          if (isInitialLoad && !diskLlmSyncedRef.current) {
            diskLlmSyncedRef.current = true;
            const localSaved = loadSavedLlmConfig();
            if (s.llm_runtime_mode === 'mock' || s.llm_runtime_mode === 'custom_endpoint') {
              next.runtimeMode = s.llm_runtime_mode;
            } else if (localSaved.runtimeMode) {
              next.runtimeMode = localSaved.runtimeMode;
            }
            if (s.llm_base_url) next.llmBaseUrl = s.llm_base_url;
            if (s.llm_model) next.llmModel = s.llm_model;
            if (typeof s.llm_api_key === 'string' && s.llm_api_key) {
              next.llmApiKey = s.llm_api_key;
              next.llmApiKeyConfigured = Boolean(s.llm_api_key.trim());
            }
            if (typeof s.llm_system_prompt === 'string' && s.llm_system_prompt) {
              next.llmSystemPrompt = s.llm_system_prompt;
            }
            saveLlmConfigToStorage(next);
          }
          return next;
        });
      }
    };

    whisperApi.getStatus().then((st) => {
      if (!mounted || !st) return;
      applyWhisperStatus(st, true);
    });

    const off = whisperApi.onEvent((evt) => {
      if (!mounted || !evt) return;
      if (evt.status) applyWhisperStatus(evt.status, false);
    });

    return () => {
      mounted = false;
      off();
    };
  }, []);

  // Sync Claudian-style CLI Agent runner status & streaming events
  useEffect(() => {
    const agentApi = window.joelDesktop?.agent;
    if (!agentApi || !isDesktopAgentSupported()) return;

    let mounted = true;
    agentApi.getStatus().then((st) => {
      if (!mounted || !st) return;
      setAgentStatus(st);
    });

    const off = agentApi.onEvent((evt) => {
      if (!mounted || !evt) return;
      if (evt.type === 'status' && evt.status && typeof evt.status === 'object') {
        setAgentStatus(evt.status as AgentRunnerStatus);
        return;
      }

      const currentRun = activeRunRef.current;
      if (!currentRun || (evt.runId && evt.runId !== currentRun.runId)) return;

      if (evt.type === 'session' && evt.sessionId) {
        setAgentSessions((prev) => ({
          ...prev,
          [currentRun.provider]: evt.sessionId!,
        }));
        return;
      }

      if (evt.type === 'text-delta' && typeof evt.text === 'string') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentRun.messageId ? { ...m, content: `${m.content}${evt.text}` } : m
          )
        );
        return;
      }

      if (evt.type === 'text-replace' && typeof evt.text === 'string') {
        setMessages((prev) =>
          prev.map((m) => (m.id === currentRun.messageId ? { ...m, content: evt.text! } : m))
        );
        return;
      }

      if (evt.type === 'thinking-delta' && typeof evt.text === 'string') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentRun.messageId
              ? { ...m, thinking: `${m.thinking || ''}${evt.text}` }
              : m
          )
        );
        return;
      }

      if (evt.type === 'tool-call' && evt.toolId) {
        const nextStepStatus =
          evt.status === 'error' || evt.status === 'done' || evt.status === 'running'
            ? evt.status
            : 'running';
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== currentRun.messageId) return m;
            const steps = [...(m.toolSteps || [])];
            const idx = steps.findIndex((s) => s.id === evt.toolId);
            if (idx >= 0) {
              const prevStep = steps[idx];
              steps[idx] = {
                ...prevStep,
                name: evt.name || prevStep.name,
                input: evt.input ?? prevStep.input,
                output: evt.output ?? prevStep.output,
                status: nextStepStatus,
              };
            } else {
              const newStep: AgentToolStep = {
                id: evt.toolId!,
                name: evt.name || 'tool',
                input: evt.input,
                output: evt.output,
                status: nextStepStatus,
              };
              steps.push(newStep);
            }
            return { ...m, toolSteps: steps };
          })
        );
        return;
      }

      if (evt.type === 'done') {
        if (evt.sessionId) {
          setAgentSessions((prev) => ({
            ...prev,
            [currentRun.provider]: evt.sessionId!,
          }));
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === currentRun.messageId
              ? {
                  ...m,
                  isStreaming: false,
                  error: evt.error || m.error,
                }
              : m
          )
        );
        activeRunRef.current = null;
        setAgentSending(false);
      }
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

  const handleDownloadTdm = useCallback(async () => {
    const tdmApi = window.joelDesktop?.tdm;
    if (!tdmApi) return;
    setTdmDownloading(true);
    setTdmDownloadError('');
    try {
      const res = await tdmApi.downloadInstaller();
      if (res?.status) setTdmStatus(res.status);
      if (res?.ok && res.path) {
        const base = res.path.split(/[\\/]/).pop() || res.path;
        showToast(TRANSLATIONS[langRef.current].toasts.tdmDownloaded(base), 'success');
      } else if (!res?.ok) {
        const msg = res?.error || TRANSLATIONS[langRef.current].toasts.tdmDownloadFailed;
        setTdmDownloadError(msg);
        showToast(msg, 'warning');
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setTdmDownloadError(msg);
      showToast(msg, 'warning');
    } finally {
      setTdmDownloading(false);
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

  // Cloud Whisper Studio handlers & instant live iframe snapshot sync
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

  const handleWhisperSnapshotSync = useCallback(
    (snapshot: { compute?: Record<string, unknown>; settings?: Record<string, unknown> }) => {
      setWhisperStatus((prev) => ({
        ...prev,
        running: true,
        computeStatus: String(snapshot.compute?.status || prev.computeStatus || 'offline'),
        computeProvider: String(snapshot.compute?.provider || prev.computeProvider || 'colab'),
        computeGpu: String(snapshot.compute?.gpu ?? prev.computeGpu ?? ''),
        pendingTasks: Number(snapshot.compute?.pending_tasks_count ?? prev.pendingTasks ?? 0),
        whisperRemoteProvider: snapshot.settings
          ? String(snapshot.settings.provider || prev.whisperRemoteProvider || 'colab')
          : prev.whisperRemoteProvider,
        whisperRemoteModel: snapshot.settings
          ? String(snapshot.settings.whisper_model || prev.whisperRemoteModel || 'large-v3-turbo')
          : prev.whisperRemoteModel,
        whisperRemoteLanguage: snapshot.settings
          ? String(snapshot.settings.language || prev.whisperRemoteLanguage || 'auto')
          : prev.whisperRemoteLanguage,
      }));
    },
    []
  );

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

  // Claudian-style CLI Agent handlers
  const handleChangeAgentProvider = useCallback(async (provider: AgentBackendMode) => {
    const agentApi = window.joelDesktop?.agent;
    if (!agentApi) return;
    const res = await agentApi.saveSettings({ activeProvider: provider });
    if (res?.status) setAgentStatus(res.status);
  }, []);

  const handleToggleAgentPermission = useCallback(async () => {
    const agentApi = window.joelDesktop?.agent;
    if (!agentApi) return;
    const nextMode = agentStatus.settings.permissionMode === 'turbo' ? 'normal' : 'turbo';
    const res = await agentApi.saveSettings({ permissionMode: nextMode });
    if (res?.status) setAgentStatus(res.status);
  }, [agentStatus.settings.permissionMode]);

  const handlePickAgentWorkspace = useCallback(async () => {
    const agentApi = window.joelDesktop?.agent;
    if (!agentApi) return;
    const res = await agentApi.pickWorkspace();
    if (res?.status) setAgentStatus(res.status);
    if (res?.ok && res.workspaceDir) {
      const base = res.workspaceDir.split(/[\\/]/).filter(Boolean).pop() || res.workspaceDir;
      showToast(TRANSLATIONS[langRef.current].toasts.agentWorkspaceUpdated(base), 'success');
    }
  }, [showToast]);

  const handlePickAgentCli = useCallback(async (provider: CliAgentProvider) => {
    const agentApi = window.joelDesktop?.agent;
    if (!agentApi) return;
    const res = await agentApi.pickCli(provider);
    if (res?.status) setAgentStatus(res.status);
  }, []);

  const handleImportClaudian = useCallback(async () => {
    const agentApi = window.joelDesktop?.agent;
    if (!agentApi) {
      return { ok: false, error: TRANSLATIONS[langRef.current].toasts.claudianImportFailed };
    }
    const res = await agentApi.importClaudian();
    if (res?.status) setAgentStatus(res.status);
    if (res?.ok && res.sourcePath) {
      showToast(TRANSLATIONS[langRef.current].toasts.claudianImported(res.sourcePath), 'success');
    } else {
      showToast(res?.error || TRANSLATIONS[langRef.current].toasts.claudianImportFailed, 'warning');
    }
    return { ok: Boolean(res?.ok), sourcePath: res?.sourcePath, error: res?.error };
  }, [showToast]);

  const handleSaveAgentSettings = useCallback(
    async (next: AgentSettings) => {
      const agentApi = window.joelDesktop?.agent;
      if (!agentApi) return;
      const res = await agentApi.saveSettings(next);
      if (res?.status) setAgentStatus(res.status);
      if (res?.ok) {
        showToast(TRANSLATIONS[langRef.current].toasts.agentSettingsSaved, 'success');
      }
    },
    [showToast]
  );

  const handleStopAgentRun = useCallback(async () => {
    const runId = activeRunRef.current?.runId;
    if (!runId) return;
    await window.joelDesktop?.agent?.stop(runId);
    showToast(TRANSLATIONS[langRef.current].toasts.agentStopped, 'neutral');
  }, [showToast]);

  // Agent Handlers
  const handleSendAgentMessage = (text: string, attachments: AttachedFileItem[]) => {
    const userMsg: AgentMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: text,
      attachments,
      timestamp: nowTimeLabel(),
    };

    const syncedProvider: ComputeProvider =
      whisperStatus.whisperRemoteProvider === 'kaggle' ? 'kaggle-t4' : 'colab-t4';
    const syncedPreset: WhisperPresetId =
      whisperStatus.whisperRemoteModel === 'small'
        ? 'fast'
        : whisperStatus.whisperRemoteModel === 'large-v3'
          ? 'accurate'
          : 'balanced';
    const syncedLanguage: TranscriptLanguage =
      whisperStatus.whisperRemoteLanguage === 'zh'
        ? 'zh'
        : whisperStatus.whisperRemoteLanguage === 'en'
          ? 'en'
          : 'auto';

    const parsed = parseAgentIntent(text, attachments, config, lang, {
      provider: syncedProvider,
      preset: syncedPreset,
      language: syncedLanguage,
    });

    const assistantMsgId = `msg-a-${Date.now() + 1}`;
    const agentApi = window.joelDesktop?.agent;
    const activeProvider = agentStatus.settings.activeProvider;
    const useCliAgent = Boolean(
      agentApi && isDesktopAgentSupported() && activeProvider !== 'custom_endpoint'
    );

    if (useCliAgent && activeProvider !== 'custom_endpoint') {
      const cliProvider = activeProvider as CliAgentProvider;
      const runId = `run-${Date.now()}`;
      const configuredModel = agentStatus.settings.providers[cliProvider]?.model || '';

      let effectivePrompt = text.trim();
      if (attachments.length > 0) {
        const filesBlock = attachments
          .map((f) => `- ${f.localPath || f.name} (${f.category}, ${formatBytes(f.size)})`)
          .join('\n');
        effectivePrompt = effectivePrompt
          ? `${effectivePrompt}\n\n[Attached Files]\n${filesBlock}`
          : `Please inspect and help handle these files:\n${filesBlock}`;
      }

      const assistantMsg: AgentMessage = {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        action: parsed.action,
        timestamp: nowTimeLabel(),
        provider: cliProvider,
        model: configuredModel || undefined,
        thinking: '',
        toolSteps: [],
        isStreaming: true,
      };

      activeRunRef.current = { runId, messageId: assistantMsgId, provider: cliProvider };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setAgentSending(true);

      agentApi!
        .send({
          runId,
          provider: cliProvider,
          prompt: effectivePrompt,
          sessionId: agentSessions[cliProvider],
          workspaceDir: agentStatus.settings.workspaceDir,
          permissionMode: agentStatus.settings.permissionMode,
          model: configuredModel,
          systemPrompt: agentStatus.settings.systemPrompt || config.llmSystemPrompt,
        })
        .then((res) => {
          if (!res?.ok) {
            activeRunRef.current = null;
            setAgentSending(false);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsgId
                  ? {
                      ...m,
                      isStreaming: false,
                      error: res?.error || 'Failed to launch CLI Agent',
                    }
                  : m
              )
            );
          }
        })
        .catch((err) => {
          activeRunRef.current = null;
          setAgentSending(false);
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    isStreaming: false,
                    error: err instanceof Error ? err.message : String(err),
                  }
                : m
            )
          );
        });
      return;
    }

    const assistantMsg: AgentMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: parsed.reply,
      action: parsed.action,
      timestamp: nowTimeLabel(),
      provider: 'custom_endpoint',
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);

    if (config.runtimeMode === 'custom_endpoint') {
      setAgentSending(true);
      callCustomLlmEndpoint(config, text, attachments, lang)
        .then((res) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantMsgId) return m;
              if (res.ok && res.content) {
                return { ...m, content: res.content };
              }
              return {
                ...m,
                content: `${parsed.reply}${res.error ? ` (${res.error})` : ''}`,
              };
            })
          );
        })
        .finally(() => {
          setAgentSending(false);
        });
    }
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
            if (activeRunRef.current) {
              window.joelDesktop?.agent?.stop(activeRunRef.current.runId).catch(() => {});
              activeRunRef.current = null;
              setAgentSending(false);
            }
            setMessages([]);
            setAgentSessions({ claude: null, codex: null, dsh: null });
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
              config={config}
              agentStatus={agentStatus}
              activeSessionId={
                agentStatus.settings.activeProvider === 'custom_endpoint'
                  ? null
                  : agentSessions[agentStatus.settings.activeProvider]
              }
              isSending={agentSending}
              messages={messages}
              onSendMessage={handleSendAgentMessage}
              onUpdateAction={handleUpdateAgentAction}
              onDispatchAction={handleDispatchAgentAction}
              onNavigateView={setActiveView}
              onCopyText={handleCopyText}
              onChangeProvider={handleChangeAgentProvider}
              onTogglePermissionMode={handleToggleAgentPermission}
              onPickWorkspace={handlePickAgentWorkspace}
              onStopRun={handleStopAgentRun}
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
                onWhisperSnapshotSync={handleWhisperSnapshotSync}
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
              downloadingTdm={tdmDownloading}
              downloadError={tdmDownloadError}
              onPickExe={handlePickTdmExe}
              onDownloadTdm={handleDownloadTdm}
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
              agentStatus={agentStatus}
              onSaveConfig={(next) => {
                setConfig(next);
                saveLlmConfigToStorage(next);
                if (window.joelDesktop?.whisper && isDesktopWhisperSupported()) {
                  window.joelDesktop.whisper
                    .saveSettings({
                      llm_runtime_mode: next.runtimeMode,
                      llm_base_url: next.llmBaseUrl.trim(),
                      llm_model: next.llmModel.trim(),
                      llm_api_key: next.llmApiKey,
                      llm_system_prompt: next.llmSystemPrompt,
                    })
                    .then((res) => {
                      if (res?.status) setWhisperStatus(res.status);
                    });
                }
                showToast(t.toasts.configSaved, 'success');
              }}
              onSaveAgentSettings={handleSaveAgentSettings}
              onImportClaudian={handleImportClaudian}
              onPickAgentWorkspace={handlePickAgentWorkspace}
              onPickAgentCli={handlePickAgentCli}
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

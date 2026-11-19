import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Menu, Plus, Trash2 } from 'lucide-react';
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
  ColabGpuSpec,
  ComputeProvider,
  ComputeRuntimeState,
  ConversionTask,
  DocumentFormat,
  DownloadEngine,
  DownloadSource,
  DownloadTask,
  EndpointConfig,
  IdleShutdownMinutes,
  MediaKind,
  MediaQuality,
  ThreadCount,
  ToastNotice,
  TranscriptLanguage,
  TranscriptOutputFormat,
  TranscriptionStage,
  TranscriptionTask,
  WhisperPresetId,
  WorkspaceView,
} from './types/toolkit';
import {
  DEFAULT_ENDPOINT_CONFIG,
  detectDocumentFormat,
  detectMediaKind,
  generateSimulatedTranscript,
  nowTimeLabel,
  parseAgentIntent,
} from './services/toolkitAdapter';
import {
  deleteLocalEngineTask,
  dispatchToLocalEngine,
  getChunkCountForThreads,
  pickDesktopFolder,
  probeLocalEngine,
  setDesktopSaveDir,
} from './services/webRangeDownloader';
import {
  GitHubUpdateInfo,
  LocalUpdateResult,
  checkGitHubUpdate,
  setSyncedCommitSha,
  triggerLocalClientUpdate,
} from './services/githubUpdater';
import {
  INITIAL_COMPUTE_STATE,
  fetchLocalComputeState,
  getComputeBrowserAuthUrl,
  openExternalTab,
  refreshLocalCompute,
  startLocalCompute,
  stopLocalCompute,
  syncLocalComputeSettings,
} from './services/computeBridge';
import { AppLanguage, TRANSLATIONS, getInitialLanguage, saveLanguage } from './i18n';

export default function App() {
  const [lang, setLang] = useState<AppLanguage>(() => getInitialLanguage());
  const [activeView, setActiveView] = useState<WorkspaceView>('agent');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [config, setConfig] = useState<EndpointConfig>(DEFAULT_ENDPOINT_CONFIG);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [transcriptions, setTranscriptions] = useState<TranscriptionTask[]>([]);
  const [downloads, setDownloads] = useState<DownloadTask[]>([]);
  const [conversions, setConversions] = useState<ConversionTask[]>([]);
  const [localEngineOnline, setLocalEngineOnline] = useState(false);
  const [chromeDefaultDir, setChromeDefaultDir] = useState('');
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatingLocal, setUpdatingLocal] = useState(false);
  const [localUpdateResult, setLocalUpdateResult] = useState<LocalUpdateResult | null>(null);
  const [computeState, setComputeState] = useState<ComputeRuntimeState>(INITIAL_COMPUTE_STATE);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const langRef = useRef<AppLanguage>(lang);
  langRef.current = lang;

  const t = TRANSLATIONS[lang];

  const handleChangeLanguage = useCallback((nextLang: AppLanguage) => {
    setLang(nextLang);
    saveLanguage(nextLang);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = TRANSLATIONS[lang].documentTitle;
  }, [lang]);

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

  // Live progress loop for active transcriptions, downloads & conversions
  useEffect(() => {
    const timer = window.setInterval(() => {
      // 1. Advance active transcription tasks through cloud stages
      setTranscriptions((prev) => {
        const hasActive = prev.some((item) => item.stage !== 'completed');
        if (!hasActive) return prev;
        return prev.map((task) => {
          if (task.stage === 'completed') return task;
          const nextProgress = Math.min(100, task.progress + 7);
          let nextStage: TranscriptionStage = task.stage;

          if (task.needsAudioExtract) {
            if (nextProgress < 22) nextStage = 'extracting_audio';
            else if (nextProgress < 42) nextStage = 'connecting_gpu';
            else if (nextProgress < 65) nextStage = 'downloading_model';
            else if (nextProgress < 100) nextStage = 'transcribing';
            else nextStage = 'completed';
          } else {
            if (nextProgress < 25) nextStage = 'connecting_gpu';
            else if (nextProgress < 55) nextStage = 'downloading_model';
            else if (nextProgress < 100) nextStage = 'transcribing';
            else nextStage = 'completed';
          }

          return {
            ...task,
            progress: nextProgress,
            stage: nextStage,
            segments:
              nextStage === 'completed'
                ? generateSimulatedTranscript(task.fileName, task.preset, task.language, langRef.current)
                : task.segments,
          };
        });
      });

      // 2. Advance active format conversions
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

  // Create tasks helpers
  const createTranscriptionTask = useCallback(
    (params: {
      fileName: string;
      fileSizeBytes: number;
      mediaKind: MediaKind;
      provider: ComputeProvider;
      preset: WhisperPresetId;
      outputFormat: TranscriptOutputFormat;
      language: TranscriptLanguage;
      source: 'agent' | 'manual';
    }) => {
      const tr = TRANSLATIONS[langRef.current].toasts;
      const needsAudioExtract = params.mediaKind === 'video' && config.ffmpegAutoExtract;
      const task: TranscriptionTask = {
        id: `tr-${Date.now()}`,
        fileName: params.fileName,
        fileSizeBytes: params.fileSizeBytes,
        mediaKind: params.mediaKind,
        needsAudioExtract,
        provider: params.provider,
        preset: params.preset,
        outputFormat: params.outputFormat,
        language: params.language,
        stage: needsAudioExtract ? 'extracting_audio' : 'connecting_gpu',
        progress: 6,
        createdAt: nowTimeLabel(),
        segments: [],
        source: params.source,
      };
      setTranscriptions((prev) => [task, ...prev]);
      showToast(needsAudioExtract ? tr.videoAudioQueued : tr.cloudTranscribeQueued, 'success');
      return task.id;
    },
    [config.ffmpegAutoExtract, showToast]
  );

  const createDownloadTask = useCallback(
    (params: {
      rawInput: string;
      cleanUrl: string;
      fileName: string;
      saveDir?: string;
      engine: DownloadEngine;
      threads: ThreadCount;
      mediaQuality?: MediaQuality;
      source: DownloadSource;
      referer?: string;
      userAgent?: string;
      hasCookies?: boolean;
      autoStart?: boolean;
    }) => {
      const tr = TRANSLATIONS[langRef.current].toasts;
      const chunkCount = getChunkCountForThreads(params.threads);
      const effectiveDir = (params.saveDir ?? config.defaultSaveDir).trim();

      if (!localEngineOnline) {
        showToast(
          langRef.current === 'zh'
            ? '请先启动 Joel Desk Pro 桌面客户端以执行多线程下载'
            : 'Launch the Joel Desk Pro desktop client to start multi-chunk downloads',
          'warning'
        );
        return '';
      }

      const tempId = `pending-${Date.now()}`;
      dispatchToLocalEngine(config.chromeBridgePort, config.chromeBridgeToken, {
        url: params.cleanUrl,
        fileName: params.fileName,
        saveDir: effectiveDir,
        threads: params.threads,
        referer: params.referer,
        kind: params.engine === 'ytdlp' ? 'video-platform' : 'http',
      }).then((res) => {
        if (res.ok && res.task) {
          const lt = res.task;
          setDownloads((prev) => {
            if (prev.some((d) => d.id === lt.id)) return prev;
            const nextTask: DownloadTask = {
              id: lt.id,
              rawInput: params.rawInput,
              cleanUrl: lt.url,
              fileName: lt.fileName,
              saveDir: lt.saveDir,
              engine: lt.engine || params.engine,
              threads: lt.threads as ThreadCount,
              mediaQuality: params.mediaQuality,
              chunks: lt.chunks,
              totalMB: Number(((lt.totalBytes || 0) / (1024 * 1024)).toFixed(2)),
              downloadedMB: Number(((lt.downloadedBytes || 0) / (1024 * 1024)).toFixed(2)),
              speedMBps: lt.speedMBps || 0,
              status: lt.status === 'completed' ? 'completed' : 'downloading',
              createdAt: nowTimeLabel(),
              source: params.source,
              referer: params.referer,
              hasCookies: lt.hasCookies,
              executionMode: 'local_engine',
            };
            return [nextTask, ...prev];
          });
          showToast(tr.localEngineStarted(chunkCount), 'success');
        }
      });

      return tempId;
    },
    [
      config.chromeBridgePort,
      config.chromeBridgeToken,
      config.defaultSaveDir,
      localEngineOnline,
      showToast,
    ]
  );

  const handleCheckClient = useCallback(() => {
    probeLocalEngine(config.chromeBridgePort).then((res) => {
      setLocalEngineOnline(res.online);
      if (res.chromeDefaultDir) setChromeDefaultDir(res.chromeDefaultDir);
      showToast(
        res.online
          ? langRef.current === 'zh'
            ? '桌面客户端连接正常'
            : 'Desktop client connected'
          : langRef.current === 'zh'
            ? '未检测到桌面客户端（端口 ' + config.chromeBridgePort + '）'
            : `Desktop client offline (port ${config.chromeBridgePort})`,
        res.online ? 'success' : 'warning'
      );
    });
  }, [config.chromeBridgePort, showToast]);

  const handlePickFolder = useCallback(async (): Promise<boolean> => {
    const res = await pickDesktopFolder(config.chromeBridgePort);
    if (res.ok && res.dir) {
      setConfig((prev) => ({ ...prev, defaultSaveDir: res.dir! }));
      showToast(TRANSLATIONS[langRef.current].toasts.saveDirSwitched(res.dir), 'success');
      return true;
    }
    if (res.canceled) return true;
    return false;
  }, [config.chromeBridgePort, showToast]);

  const handleChangeSaveDir = useCallback(
    (dir: string) => {
      const cleaned = dir.trim();
      setConfig((prev) => ({ ...prev, defaultSaveDir: cleaned }));
      setDesktopSaveDir(config.chromeBridgePort, cleaned).then((res) => {
        if (res.chromeDefaultDir) setChromeDefaultDir(res.chromeDefaultDir);
      });
      const label =
        cleaned ||
        chromeDefaultDir ||
        TRANSLATIONS[langRef.current].download.chromeDefaultLabel;
      showToast(TRANSLATIONS[langRef.current].toasts.saveDirSwitched(label), 'success');
    },
    [chromeDefaultDir, config.chromeBridgePort, showToast]
  );

  // Continuously poll Desktop Client engine for online status, Chrome default folder & real tasks (including Chrome extension captures!)
  useEffect(() => {
    let cancelled = false;

    const syncEngine = async () => {
      const res = await probeLocalEngine(config.chromeBridgePort);
      if (cancelled) return;
      setLocalEngineOnline(res.online);
      if (res.chromeDefaultDir) setChromeDefaultDir(res.chromeDefaultDir);
      if (typeof res.customSaveDir === 'string') {
        setConfig((prev) =>
          prev.defaultSaveDir === res.customSaveDir
            ? prev
            : { ...prev, defaultSaveDir: res.customSaveDir! }
        );
      }
      if (res.online && Array.isArray(res.tasks)) {
        setDownloads((prev) => {
          const prevMap = new Map(prev.map((item) => [item.id, item]));
          const merged: DownloadTask[] = res.tasks!.map((lt) => {
            const existing = prevMap.get(lt.id);
            const totalMB = Number(((lt.totalBytes || 0) / (1024 * 1024)).toFixed(2));
            const downloadedMB = Number(((lt.downloadedBytes || 0) / (1024 * 1024)).toFixed(2));
            return {
              id: lt.id,
              rawInput: existing?.rawInput || lt.url,
              cleanUrl: lt.url,
              fileName: lt.fileName,
              saveDir: lt.saveDir,
              engine: lt.engine || existing?.engine || 'http_range',
              threads: (lt.threads as ThreadCount) || 16,
              mediaQuality: existing?.mediaQuality,
              chunks: Array.isArray(lt.chunks) && lt.chunks.length > 0 ? lt.chunks : [0],
              totalMB,
              downloadedMB,
              speedMBps: lt.speedMBps || 0,
              status:
                lt.status === 'completed'
                  ? 'completed'
                  : lt.status === 'paused'
                    ? 'paused'
                    : 'downloading',
              createdAt: existing?.createdAt || nowTimeLabel(),
              source: lt.source === 'chrome_extension' ? 'chrome_extension' : existing?.source || 'manual',
              hasCookies: Boolean(lt.hasCookies),
              executionMode: 'local_engine',
            };
          });
          return merged.reverse();
        });
      }
    };

    syncEngine();
    const timer = window.setInterval(syncEngine, 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [config.chromeBridgePort]);

  // Poll real local compute runtime state every 2s when local engine is online
  useEffect(() => {
    if (!localEngineOnline) {
      setComputeState((prev) =>
        prev.status === 'offline' && !prev.errorMessage ? prev : INITIAL_COMPUTE_STATE
      );
      return;
    }

    let cancelled = false;
    const poll = async () => {
      const snap = await fetchLocalComputeState(config.chromeBridgePort);
      if (cancelled || !snap) return;
      setComputeState(snap.compute);
      if (snap.settings) {
        setConfig((prev) => {
          const nextEnabled = snap.settings?.autoShutdownEnabled ?? prev.autoShutdownEnabled;
          const nextMinutes = snap.settings?.autoShutdownMinutes ?? prev.autoShutdownMinutes;
          if (
            nextEnabled === prev.autoShutdownEnabled &&
            nextMinutes === prev.autoShutdownMinutes
          ) {
            return prev;
          }
          return {
            ...prev,
            autoShutdownEnabled: nextEnabled,
            autoShutdownMinutes: nextMinutes,
          };
        });
      }
    };

    poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [localEngineOnline, config.chromeBridgePort]);

  const handleConnectCompute = useCallback(
    async (provider: ComputeProvider, modelName: string) => {
      const ct = TRANSLATIONS[langRef.current].transcribe.compute;
      const gpu = provider === 'kaggle-t4' ? 'T4 x2' : config.colabGpuSpec;

      if (!localEngineOnline) {
        openExternalTab(getComputeBrowserAuthUrl(provider, false, config.chromeBridgePort));
        showToast(
          provider === 'kaggle-t4' ? ct.openedKaggleLogin : ct.openedColabLogin,
          'success'
        );
        return;
      }

      setComputeState((prev) => ({
        ...prev,
        status: 'starting',
        provider,
        gpu,
        model: modelName,
        errorMessage: null,
      }));

      const res = await startLocalCompute(config.chromeBridgePort, config.chromeBridgeToken, {
        provider,
        gpu,
        model: modelName,
      });

      if (res.needsAuth) {
        setComputeState((prev) => ({ ...prev, status: 'offline' }));
        openExternalTab(
          res.authUrl || getComputeBrowserAuthUrl(provider, true, config.chromeBridgePort)
        );
        showToast(
          provider === 'kaggle-t4' ? ct.openedKaggleLogin : ct.openedColabLogin,
          'success'
        );
        return;
      }

      if (res.snapshot) {
        setComputeState(res.snapshot.compute);
        showToast(
          ct.startingComputeToast(provider === 'kaggle-t4' ? 'Kaggle' : 'Colab', gpu),
          'success'
        );
        return;
      }

      // Fallback: open provider login directly in browser
      setComputeState((prev) => ({ ...prev, status: 'offline' }));
      openExternalTab(getComputeBrowserAuthUrl(provider, false, config.chromeBridgePort));
      showToast(
        provider === 'kaggle-t4' ? ct.openedKaggleLogin : ct.openedColabLogin,
        'neutral'
      );
    },
    [
      config.chromeBridgePort,
      config.chromeBridgeToken,
      config.colabGpuSpec,
      localEngineOnline,
      showToast,
    ]
  );

  const handleStopCompute = useCallback(async () => {
    const ct = TRANSLATIONS[langRef.current].transcribe.compute;
    if (!localEngineOnline) {
      setComputeState(INITIAL_COMPUTE_STATE);
      return;
    }
    setComputeState((prev) => ({ ...prev, status: 'stopping' }));
    const snap = await stopLocalCompute(config.chromeBridgePort, config.chromeBridgeToken);
    if (snap) {
      setComputeState(snap.compute);
    } else {
      setComputeState(INITIAL_COMPUTE_STATE);
    }
    showToast(ct.stoppedComputeToast, 'neutral');
  }, [config.chromeBridgePort, config.chromeBridgeToken, localEngineOnline, showToast]);

  const handleRefreshCompute = useCallback(async () => {
    const ct = TRANSLATIONS[langRef.current].transcribe.compute;
    const probe = await probeLocalEngine(config.chromeBridgePort);
    setLocalEngineOnline(probe.online);
    if (probe.online) {
      const snap = await refreshLocalCompute(config.chromeBridgePort, config.chromeBridgeToken);
      if (snap) setComputeState(snap.compute);
    } else {
      setComputeState(INITIAL_COMPUTE_STATE);
    }
    showToast(ct.refreshedComputeToast, 'neutral');
  }, [config.chromeBridgePort, config.chromeBridgeToken, showToast]);

  const handleToggleAutoShutdown = useCallback(
    (enabled: boolean) => {
      setConfig((prev) => ({ ...prev, autoShutdownEnabled: enabled }));
      if (localEngineOnline) {
        syncLocalComputeSettings(config.chromeBridgePort, config.chromeBridgeToken, {
          auto_shutdown_enabled: enabled,
          auto_shutdown_minutes: config.autoShutdownMinutes,
        }).then((snap) => {
          if (snap) setComputeState(snap.compute);
        });
      }
    },
    [
      config.autoShutdownMinutes,
      config.chromeBridgePort,
      config.chromeBridgeToken,
      localEngineOnline,
    ]
  );

  const handleChangeAutoShutdownMinutes = useCallback(
    (minutes: IdleShutdownMinutes) => {
      setConfig((prev) => ({ ...prev, autoShutdownMinutes: minutes }));
      if (localEngineOnline) {
        syncLocalComputeSettings(config.chromeBridgePort, config.chromeBridgeToken, {
          auto_shutdown_enabled: config.autoShutdownEnabled,
          auto_shutdown_minutes: minutes,
        }).then((snap) => {
          if (snap) setComputeState(snap.compute);
        });
      }
    },
    [
      config.autoShutdownEnabled,
      config.chromeBridgePort,
      config.chromeBridgeToken,
      localEngineOnline,
    ]
  );

  const handleSelectColabGpu = useCallback((gpu: ColabGpuSpec) => {
    setConfig((prev) => ({ ...prev, colabGpuSpec: gpu }));
  }, []);

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

  // Only auto-check on startup when user explicitly turns on autoCheckUpdate (off by default for private repos)
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
    });
    if (config.autoCheckUpdate) {
      handleCheckGitHubUpdate(true);
    }
  }, [config.autoCheckUpdate, config.chromeBridgePort, handleCheckGitHubUpdate]);

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

  const handleDispatchAgentAction = (messageId: string, action: AgentActionPayload) => {
    let taskId = '';
    if (action.type === 'download') {
      taskId = createDownloadTask({
        rawInput: action.rawInput,
        cleanUrl: action.cleanUrl,
        fileName: action.fileName,
        engine: action.engine,
        threads: action.threads,
        mediaQuality: action.mediaQuality,
        source: 'agent',
      });
    } else if (action.type === 'transcribe') {
      taskId = createTranscriptionTask({
        fileName: action.fileName,
        fileSizeBytes: action.fileSizeBytes,
        mediaKind: action.mediaKind,
        provider: action.provider,
        preset: action.preset,
        outputFormat: action.outputFormat,
        language: action.language,
        source: 'agent',
      });
    } else {
      taskId = createConversionTask({
        fileName: action.fileName,
        fileSizeBytes: action.fileSizeBytes,
        sourceFormat: action.sourceFormat,
        targetFormat: action.targetFormat,
        autoStart: true,
        source: 'agent',
      });
    }

    handleUpdateAgentAction(messageId, (prev) => ({
      ...prev,
      dispatchedTaskId: taskId,
    }));
  };

  const activeCounts = {
    transcribe: transcriptions.filter((item) => item.stage !== 'completed').length,
    download: downloads.filter((item) => item.status === 'downloading').length,
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
    if (activeView === 'download' && downloads.some((d) => d.status === 'completed')) {
      return (
        <button
          type="button"
          onClick={() => {
            setDownloads((prev) => prev.filter((d) => d.status !== 'completed'));
            showToast(t.toasts.clearedDownloads);
          }}
          className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t.topbar.clearCompleted}
        </button>
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

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F9FA] text-[#0F172A]">
      <Sidebar
        lang={lang}
        activeView={activeView}
        onSelectView={setActiveView}
        activeCounts={activeCounts}
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

          {activeView === 'transcribe' && (
            <TranscribeView
              lang={lang}
              tasks={transcriptions}
              computeState={computeState}
              colabGpuSpec={config.colabGpuSpec}
              autoShutdownEnabled={config.autoShutdownEnabled}
              autoShutdownMinutes={config.autoShutdownMinutes}
              localEngineOnline={localEngineOnline}
              onSelectColabGpu={handleSelectColabGpu}
              onConnectCompute={handleConnectCompute}
              onStopCompute={handleStopCompute}
              onRefreshCompute={handleRefreshCompute}
              onToggleAutoShutdown={handleToggleAutoShutdown}
              onChangeAutoShutdownMinutes={handleChangeAutoShutdownMinutes}
              onCreateTask={(params) => createTranscriptionTask({ ...params, source: 'manual' })}
              onChangeTaskOutputFormat={(id, outputFormat) =>
                setTranscriptions((prev) =>
                  prev.map((item) => (item.id === id ? { ...item, outputFormat } : item))
                )
              }
              onDeleteTask={(id) =>
                setTranscriptions((prev) => prev.filter((item) => item.id !== id))
              }
              onCopyText={handleCopyText}
            />
          )}

          {activeView === 'download' && (
            <DownloadView
              lang={lang}
              tasks={downloads}
              config={config}
              localEngineOnline={localEngineOnline}
              chromeDefaultDir={chromeDefaultDir}
              onCheckClient={handleCheckClient}
              onPickFolder={handlePickFolder}
              onChangeSaveDir={handleChangeSaveDir}
              onCreateDownload={(params) =>
                createDownloadTask({
                  ...params,
                  source: params.source ?? 'manual',
                })
              }
              onSendToTranscribe={(task) => {
                createTranscriptionTask({
                  fileName: task.fileName,
                  fileSizeBytes: Math.round(task.totalMB * 1024 * 1024),
                  mediaKind: detectMediaKind(task.fileName),
                  provider: 'colab-t4',
                  preset: 'balanced',
                  outputFormat: 'md_plain',
                  language: 'auto',
                  source: 'manual',
                });
                setActiveView('transcribe');
              }}
              onSendToConvert={(task, targetFormat) => {
                createConversionTask({
                  fileName: task.fileName,
                  fileSizeBytes: Math.round(task.totalMB * 1024 * 1024),
                  sourceFormat: detectDocumentFormat(task.fileName),
                  targetFormat,
                  autoStart: true,
                  source: 'manual',
                });
                setActiveView('convert');
              }}
              onTogglePause={(id) =>
                setDownloads((prev) =>
                  prev.map((item) => {
                    if (item.id !== id || item.status === 'completed') return item;
                    return {
                      ...item,
                      status: item.status === 'paused' ? 'downloading' : 'paused',
                      speedMBps:
                        item.status === 'paused'
                          ? Math.max(18, item.threads * 1.4)
                          : 0,
                    };
                  })
                )
              }
              onDeleteTask={(id) => {
                deleteLocalEngineTask(config.chromeBridgePort, id);
                setDownloads((prev) => prev.filter((item) => item.id !== id));
              }}
              onCopyText={handleCopyText}
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
              onSaveConfig={(next) => {
                setConfig(next);
                if (localEngineOnline) {
                  setDesktopSaveDir(next.chromeBridgePort, next.defaultSaveDir.trim()).then((res) => {
                    if (res && res.chromeDefaultDir) setChromeDefaultDir(res.chromeDefaultDir);
                  });
                  syncLocalComputeSettings(next.chromeBridgePort, next.chromeBridgeToken, {
                    auto_shutdown_enabled: next.autoShutdownEnabled,
                    auto_shutdown_minutes: next.autoShutdownMinutes,
                  }).then((snap) => {
                    if (snap) setComputeState(snap.compute);
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

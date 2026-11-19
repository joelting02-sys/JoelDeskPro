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
  ChromeExtensionPayload,
  ColabGpuSpec,
  ComputeProvider,
  ComputeRuntimeState,
  ConversionTask,
  DocumentFormat,
  DownloadEngine,
  DownloadExecutionMode,
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
  detectDownloadEngine,
  detectMediaKind,
  extractCleanUrl,
  generateSimulatedTranscript,
  nowTimeLabel,
  parseAgentIntent,
} from './services/toolkitAdapter';
import {
  DirectoryHandleLike,
  dispatchToLocalEngine,
  getChunkCountForThreads,
  isDemoPlaceholderUrl,
  probeLocalEngine,
  runWebMultiChunkDownload,
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
  const [chromeConnected, setChromeConnected] = useState(false);
  const [localEngineOnline, setLocalEngineOnline] = useState(false);
  const [hasRealDirHandle, setHasRealDirHandle] = useState(false);
  const [updateModalOpen, setUpdateModalOpen] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<GitHubUpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updatingLocal, setUpdatingLocal] = useState(false);
  const [localUpdateResult, setLocalUpdateResult] = useState<LocalUpdateResult | null>(null);
  const [computeState, setComputeState] = useState<ComputeRuntimeState>(INITIAL_COMPUTE_STATE);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const localDirHandleRef = useRef<DirectoryHandleLike | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
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

      // 2. Advance local-monitored / fallback multi-chunk downloads (real web_range updates from live bytes)
      setDownloads((prev) => {
        const hasActiveDemo = prev.some(
          (d) =>
            d.status === 'downloading' &&
            (d.executionMode === 'demo' || d.executionMode === 'local_engine' || !d.executionMode)
        );
        if (!hasActiveDemo) return prev;
        return prev.map((task) => {
          if (task.status !== 'downloading') return task;
          if (task.executionMode === 'web_range' || task.executionMode === 'extension_bridge') {
            return task;
          }

          const activeChunks =
            task.chunks.length > 0
              ? task.chunks
              : Array.from({ length: getChunkCountForThreads(task.threads) }, () => 5);
          const threadBoost = task.threads / 16;
          const nextChunks = activeChunks.map((pct) => {
            if (pct >= 100) return 100;
            const step = (4.2 + Math.random() * 5.8) * Math.min(2.2, 0.75 + threadBoost * 0.45);
            return Math.min(100, pct + step);
          });
          const avgPct =
            nextChunks.reduce((sum, item) => sum + item, 0) / nextChunks.length;
          const nextDownloaded = Math.min(task.totalMB, (task.totalMB * avgPct) / 100);
          const done = nextChunks.every((pct) => pct >= 100);
          const deltaMB = Math.max(0, nextDownloaded - task.downloadedMB);
          const speed = done ? 0 : Math.max(8.5, deltaMB / 0.65);

          return {
            ...task,
            chunks: nextChunks,
            downloadedMB: nextDownloaded,
            speedMBps: speed,
            status: done ? 'completed' : 'downloading',
          };
        });
      });

      // 3. Advance active format conversions
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
      handledByLocal?: boolean;
    }) => {
      const tr = TRANSLATIONS[langRef.current].toasts;
      const taskId = `dl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
      const chunkCount = getChunkCountForThreads(params.threads);
      const shouldStart = params.autoStart ?? true;
      const isDemo = isDemoPlaceholderUrl(params.cleanUrl);

      let executionMode: DownloadExecutionMode = 'demo';
      if (params.handledByLocal) {
        executionMode = 'local_engine';
      } else if (!isDemo && localEngineOnline) {
        executionMode = 'local_engine';
      } else if (!isDemo) {
        executionMode = 'web_range';
      }

      const estimatedTotalMB =
        params.engine === 'ytdlp'
          ? 180 + Math.round(Math.random() * 420)
          : 320 + Math.round(Math.random() * 980);

      const initialChunks = Array.from({ length: chunkCount }, () =>
        executionMode === 'web_range' ? 0 : shouldStart ? 4 + Math.round(Math.random() * 8) : 0
      );
      const initialAvg =
        initialChunks.reduce((acc, v) => acc + v, 0) / Math.max(1, initialChunks.length);

      const task: DownloadTask = {
        id: taskId,
        rawInput: params.rawInput,
        cleanUrl: params.cleanUrl,
        fileName: params.fileName,
        saveDir: params.saveDir || config.defaultSaveDir,
        engine: params.engine,
        threads: params.threads,
        mediaQuality: params.mediaQuality,
        chunks: initialChunks,
        totalMB: executionMode === 'web_range' ? 1 : estimatedTotalMB,
        downloadedMB:
          executionMode === 'web_range'
            ? 0
            : Number(((estimatedTotalMB * initialAvg) / 100).toFixed(1)),
        speedMBps: shouldStart
          ? executionMode === 'web_range'
            ? 0
            : Math.max(18, params.threads * 1.4)
          : 0,
        status: shouldStart ? 'downloading' : 'paused',
        createdAt: nowTimeLabel(),
        source: params.source,
        referer: params.referer,
        userAgent: params.userAgent,
        hasCookies: params.hasCookies,
        executionMode,
      };
      setDownloads((prev) => [task, ...prev]);

      // 1) Local Desktop Engine dispatch (when local Node engine is running)
      if (executionMode === 'local_engine' && !params.handledByLocal) {
        dispatchToLocalEngine(config.chromeBridgePort, config.chromeBridgeToken, {
          url: params.cleanUrl,
          fileName: params.fileName,
          saveDir: params.saveDir || config.defaultSaveDir,
          threads: params.threads,
          referer: params.referer,
          kind: params.engine === 'ytdlp' ? 'video-platform' : 'http',
        }).then((res) => {
          if (res.ok) {
            setDownloads((prev) =>
              prev.map((item) =>
                item.id === taskId
                  ? { ...item, savedLocationLabel: TRANSLATIONS[langRef.current].toasts.localEngineDirectLabel }
                  : item
              )
            );
          }
        });
        showToast(tr.localEngineStarted(chunkCount), 'success');
        return taskId;
      }

      if (params.handledByLocal) {
        showToast(tr.pluginLocalDownload(params.fileName), 'success');
        return taskId;
      }

      // 2) Published Web App Direct Multi-Chunk HTTP Range Download
      if (executionMode === 'web_range' && shouldStart) {
        const ac = new AbortController();
        abortControllersRef.current.set(taskId, ac);
        showToast(tr.webRangeStarted(chunkCount), 'success');

        runWebMultiChunkDownload({
          url: params.cleanUrl,
          fileName: params.fileName,
          threads: params.threads,
          dirHandle: localDirHandleRef.current,
          chromeConnected,
          referer: params.referer,
          signal: ac.signal,
          callbacks: {
            onProgress: ({ chunks, downloadedMB, totalMB, speedMBps }) => {
              setDownloads((prev) =>
                prev.map((item) =>
                  item.id === taskId
                    ? { ...item, chunks, downloadedMB, totalMB: Math.max(0.01, totalMB), speedMBps }
                    : item
                )
              );
            },
            onComplete: ({ savedVia, totalMB }) => {
              abortControllersRef.current.delete(taskId);
              const currToasts = TRANSLATIONS[langRef.current].toasts;
              const label =
                savedVia === 'directory_handle'
                  ? currToasts.savedToDir
                  : savedVia === 'extension_download'
                    ? currToasts.savedViaExtension
                    : currToasts.savedToBrowser;
              setDownloads((prev) =>
                prev.map((item) =>
                  item.id === taskId
                    ? {
                        ...item,
                        chunks: item.chunks.map(() => 100),
                        downloadedMB: totalMB > 0 ? totalMB : item.totalMB,
                        totalMB: totalMB > 0 ? totalMB : item.totalMB,
                        speedMBps: 0,
                        status: 'completed',
                        savedLocationLabel: label,
                      }
                    : item
                )
              );
              showToast(`${params.fileName} · ${label}`, 'success');
            },
            onFallback: (reason) => {
              abortControllersRef.current.delete(taskId);
              if (ac.signal.aborted) return;
              const currToasts = TRANSLATIONS[langRef.current].toasts;
              setDownloads((prev) =>
                prev.map((item) =>
                  item.id === taskId
                    ? {
                        ...item,
                        executionMode: 'demo',
                        totalMB: estimatedTotalMB,
                        chunks: Array.from({ length: chunkCount }, () => 8),
                        savedLocationLabel:
                          reason === 'cors_blocked' ? currToasts.corsLimitedLabel : undefined,
                      }
                    : item
                )
              );
              showToast(
                params.engine === 'ytdlp'
                  ? currToasts.corsVideoFallback
                  : currToasts.corsDirectFallback,
                'warning'
              );
            },
          },
        });
        return taskId;
      }

      if (params.source === 'chrome_extension') {
        showToast(tr.pluginReceived(params.fileName), 'success');
      } else {
        showToast(tr.multiThreadStarted(params.threads, chunkCount), 'success');
      }
      return taskId;
    },
    [
      chromeConnected,
      config.chromeBridgePort,
      config.chromeBridgeToken,
      config.defaultSaveDir,
      localEngineOnline,
      showToast,
    ]
  );

  const handleConnectChrome = useCallback(() => {
    window.postMessage(
      {
        type: 'DESKKIT_CONNECT_REQUEST',
        port: config.chromeBridgePort,
        token: config.chromeBridgeToken,
        url: window.location.href,
      },
      '*'
    );
    probeLocalEngine(config.chromeBridgePort).then((res) => {
      setLocalEngineOnline(res.online);
    });
    setConfig((prev) => ({ ...prev, chromeBridgeEnabled: true }));
    showToast(TRANSLATIONS[langRef.current].toasts.handshakeSending, 'neutral');
  }, [config.chromeBridgePort, config.chromeBridgeToken, showToast]);

  const handleChromeExtensionCapture = useCallback(
    (payload: ChromeExtensionPayload) => {
      const extracted = extractCleanUrl(payload.url);
      if (!extracted.cleanUrl) {
        showToast(TRANSLATIONS[langRef.current].toasts.invalidPluginUrl, 'warning');
        return;
      }
      if (!chromeConnected) {
        setChromeConnected(true);
      }
      const engine = payload.engine ?? detectDownloadEngine(extracted.cleanUrl);
      createDownloadTask({
        rawInput: payload.url,
        cleanUrl: extracted.cleanUrl,
        fileName: payload.fileName || extracted.fileName,
        engine,
        threads: payload.threads ?? config.defaultThreads,
        mediaQuality: payload.mediaQuality ?? 'best',
        source: 'chrome_extension',
        referer: payload.referer,
        userAgent: payload.userAgent,
        hasCookies: payload.hasCookies,
        autoStart: config.chromeBridgeAutoStart,
        handledByLocal: payload.handledByLocal,
      });
    },
    [
      chromeConnected,
      config.chromeBridgeAutoStart,
      config.defaultThreads,
      createDownloadTask,
      showToast,
    ]
  );

  // Auto-announce Web App to installed Chrome Extension & probe optional local engine on mount
  useEffect(() => {
    const sayHello = () => {
      window.postMessage(
        {
          type: 'DESKKIT_WEB_HELLO',
          origin: window.location.origin,
          url: window.location.href,
        },
        '*'
      );
    };
    sayHello();
    const retryTimer = window.setTimeout(sayHello, 700);
    probeLocalEngine(config.chromeBridgePort).then((res) => {
      setLocalEngineOnline(res.online);
    });
    return () => window.clearTimeout(retryTimer);
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

  // Listen to real Chrome Extension content-script postMessage events
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'DESKKIT_CONNECT_ACK') {
        setChromeConnected(true);
        if (typeof event.data.localOnline === 'boolean') {
          setLocalEngineOnline(event.data.localOnline);
        }
        const currToasts = TRANSLATIONS[langRef.current].toasts;
        showToast(
          event.data.localOnline ? currToasts.pluginDualConnected : currToasts.pluginWebConnected,
          'success'
        );
        return;
      }
      if (event.data.type !== 'DESKKIT_CHROME_CAPTURE') return;
      const items: ChromeExtensionPayload[] = Array.isArray(event.data.items)
        ? event.data.items
        : event.data.payload
          ? [event.data.payload]
          : [];
      if (items.length > 0) {
        setActiveView('download');
        items.forEach((item) => {
          if (item?.url) handleChromeExtensionCapture(item);
        });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [handleChromeExtensionCapture, showToast]);

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
              chromeConnected={chromeConnected}
              localEngineOnline={localEngineOnline}
              hasRealDirHandle={hasRealDirHandle}
              onConnectChrome={handleConnectChrome}
              onSelectDirectoryHandle={(handle) => {
                localDirHandleRef.current = handle;
                setHasRealDirHandle(Boolean(handle));
                if (handle) {
                  const prefix = lang === 'zh' ? '本地文件夹' : 'Local Folder';
                  setConfig((prev) => ({ ...prev, defaultSaveDir: `${prefix} / ${handle.name}` }));
                  showToast(t.toasts.dirAuthorized(handle.name), 'success');
                }
              }}
              onChangeSaveDir={(dir) => {
                localDirHandleRef.current = null;
                setHasRealDirHandle(false);
                setConfig((prev) => ({ ...prev, defaultSaveDir: dir }));
                showToast(t.toasts.saveDirSwitched(dir), 'success');
              }}
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
                const ac = abortControllersRef.current.get(id);
                if (ac) {
                  ac.abort();
                  abortControllersRef.current.delete(id);
                }
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

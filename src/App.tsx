import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Menu, Plus, Trash2 } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { AgentView } from './components/AgentView';
import { TranscribeView } from './components/TranscribeView';
import { DownloadView } from './components/DownloadView';
import { ConvertView } from './components/ConvertView';
import { SettingsView } from './components/SettingsView';
import {
  AgentActionPayload,
  AgentMessage,
  AttachedFileItem,
  ChromeExtensionPayload,
  ComputeProvider,
  ConversionTask,
  DocumentFormat,
  DownloadEngine,
  DownloadExecutionMode,
  DownloadSource,
  DownloadTask,
  EndpointConfig,
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

const INITIAL_TRANSCRIPTIONS: TranscriptionTask[] = [
  {
    id: 'tr-demo-1',
    fileName: '架构同步会议_录音片段.m4a',
    fileSizeBytes: 24.5 * 1024 * 1024,
    mediaKind: 'audio',
    needsAudioExtract: false,
    provider: 'colab-t4',
    preset: 'accurate',
    outputFormat: 'srt',
    language: 'zh',
    stage: 'completed',
    progress: 100,
    createdAt: '09:42',
    source: 'manual',
    segments: generateSimulatedTranscript('架构同步会议_录音片段.m4a', 'accurate', 'zh'),
  },
];

const INITIAL_DOWNLOADS: DownloadTask[] = [
  {
    id: 'dl-demo-video',
    rawInput: 'https://www.youtube.com/watch?v=deskkit4kdemo',
    cleanUrl: 'https://www.youtube.com/watch?v=deskkit4kdemo',
    fileName: 'AI_桌面工具箱发布会_1080P.mp4',
    saveDir: DEFAULT_ENDPOINT_CONFIG.defaultSaveDir,
    engine: 'http_range',
    threads: 32,
    chunks: [100, 100, 100, 100, 100, 100, 100, 100],
    totalMB: 486,
    downloadedMB: 486,
    speedMBps: 0,
    status: 'completed',
    createdAt: '09:36',
    source: 'chrome_extension',
    hasCookies: true,
  },
  {
    id: 'dl-demo-1',
    rawInput: 'https://cdn.example.com/models/faster-whisper-large-v3-ct2.tar.gz',
    cleanUrl: 'https://cdn.example.com/models/faster-whisper-large-v3-ct2.tar.gz',
    fileName: 'faster-whisper-large-v3-ct2.tar.gz',
    saveDir: DEFAULT_ENDPOINT_CONFIG.defaultSaveDir,
    engine: 'http_range',
    threads: 32,
    chunks: [100, 100, 100, 100, 100, 100, 100, 100],
    totalMB: 1480,
    downloadedMB: 1480,
    speedMBps: 0,
    status: 'completed',
    createdAt: '09:20',
    source: 'manual',
  },
];

const INITIAL_CONVERSIONS: ConversionTask[] = [
  {
    id: 'cv-demo-1',
    fileName: '项目接口规范_v1.pdf',
    fileSizeBytes: 3.1 * 1024 * 1024,
    sourceFormat: 'pdf',
    targetFormat: 'docx',
    progress: 100,
    status: 'completed',
    createdAt: '09:15',
    source: 'manual',
  },
];

const VIEW_TITLES: Record<WorkspaceView, string> = {
  agent: 'AI 助手',
  transcribe: '语音转录',
  download: '高速下载',
  convert: '格式转换',
  settings: '模型与接口',
};

export default function App() {
  const [activeView, setActiveView] = useState<WorkspaceView>('agent');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [config, setConfig] = useState<EndpointConfig>(DEFAULT_ENDPOINT_CONFIG);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [transcriptions, setTranscriptions] = useState<TranscriptionTask[]>(INITIAL_TRANSCRIPTIONS);
  const [downloads, setDownloads] = useState<DownloadTask[]>(INITIAL_DOWNLOADS);
  const [conversions, setConversions] = useState<ConversionTask[]>(INITIAL_CONVERSIONS);
  const [chromeConnected, setChromeConnected] = useState(false);
  const [localEngineOnline, setLocalEngineOnline] = useState(false);
  const [hasRealDirHandle, setHasRealDirHandle] = useState(false);
  const [toast, setToast] = useState<ToastNotice | null>(null);

  const localDirHandleRef = useRef<DirectoryHandleLike | null>(null);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());

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
      showToast(`已复制${label}`, 'success');
    },
    [showToast]
  );

  // Live simulation loop for active transcriptions, downloads & conversions
  useEffect(() => {
    const timer = window.setInterval(() => {
      // 1. Advance active transcription tasks through realistic cloud stages
      setTranscriptions((prev) => {
        const hasActive = prev.some((t) => t.stage !== 'completed');
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
                ? generateSimulatedTranscript(task.fileName, task.preset, task.language)
                : task.segments,
          };
        });
      });

      // 2. Advance demo/local-monitored multi-chunk downloads (real web_range tasks update from live bytes)
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

      // 3. Advance active document conversions
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
      showToast(
        needsAudioExtract ? '已识别视频，开始自动抽离音轨并转录' : '已提交至云端 T4 转录队列',
        'success'
      );
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
                item.id === taskId ? { ...item, savedLocationLabel: '本地分片引擎直写' } : item
              )
            );
          }
        });
        showToast(`已交由本地引擎 ${chunkCount} 分片直写硬盘`, 'success');
        return taskId;
      }

      if (params.handledByLocal) {
        showToast(`已通过插件交由本地引擎下载：${params.fileName}`, 'success');
        return taskId;
      }

      // 2) Published Web App Direct Multi-Chunk HTTP Range Download (no local software needed!)
      if (executionMode === 'web_range' && shouldStart) {
        const ac = new AbortController();
        abortControllersRef.current.set(taskId, ac);
        showToast(`网页端已启动 ${chunkCount} 分片并发拉取`, 'success');

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
              const label =
                savedVia === 'directory_handle'
                  ? '已写入选定本地文件夹'
                  : savedVia === 'extension_download'
                    ? '已通过插件保存到电脑'
                    : '已保存到浏览器下载目录';
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
              showToast(`${params.fileName} ${label}`, 'success');
            },
            onFallback: (reason) => {
              abortControllersRef.current.delete(taskId);
              if (ac.signal.aborted) return;
              // Gracefully keep task interactive if cross-origin or video-platform page needs extension/local engine
              setDownloads((prev) =>
                prev.map((item) =>
                  item.id === taskId
                    ? {
                        ...item,
                        executionMode: 'demo',
                        totalMB: estimatedTotalMB,
                        chunks: Array.from({ length: chunkCount }, () => 8),
                        savedLocationLabel:
                          reason === 'cors_blocked' ? '跨域受限（需插件或本地引擎）' : undefined,
                      }
                    : item
                )
              );
              showToast(
                params.engine === 'ytdlp'
                  ? '视频平台受跨域限制，安装 JoelDeskPro 插件或启动本地引擎即可直存电脑'
                  : '该源站限制浏览器跨域直连，建议安装 JoelDeskPro 插件或启动本地引擎',
                'warning'
              );
            },
          },
        });
        return taskId;
      }

      if (params.source === 'chrome_extension') {
        showToast(`已通过 JoelDeskPro 插件接收：${params.fileName}`, 'success');
      } else {
        showToast(`已启动 ${params.threads} 线程 · ${chunkCount} 分片并发下载`, 'success');
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
    showToast('正在向 JoelDeskPro 插件发送双向握手信号…', 'neutral');
  }, [config.chromeBridgePort, config.chromeBridgeToken, showToast]);

  const handleChromeExtensionCapture = useCallback(
    (payload: ChromeExtensionPayload) => {
      const extracted = extractCleanUrl(payload.url);
      if (!extracted.cleanUrl) {
        showToast('插件推送的链接无效', 'warning');
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

  // Auto-announce DeskKit Web App to installed Chrome Extension & probe optional local engine on mount
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

  // Listen to real Chrome Extension content-script postMessage events (Web + Local dual-bridge)
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.data || typeof event.data !== 'object') return;
      if (event.data.type === 'DESKKIT_CONNECT_ACK') {
        setChromeConnected(true);
        if (typeof event.data.localOnline === 'boolean') {
          setLocalEngineOnline(event.data.localOnline);
        }
        showToast(
          event.data.localOnline
            ? 'JoelDeskPro 插件已连接（网页端 + 本地引擎双通道在线）'
            : 'JoelDeskPro 插件已直连当前网页端，看视频右上角可一键下载',
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
        showToast(`正在转换为 ${params.targetFormat.toUpperCase()}`, 'success');
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
    const parsed = parseAgentIntent(text, attachments, config);
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
    transcribe: transcriptions.filter((t) => t.stage !== 'completed').length,
    download: downloads.filter((d) => d.status === 'downloading').length,
    convert: conversions.filter((c) => c.status === 'converting').length,
  };

  // Dynamic system load derived from real active workloads across modules
  const systemLoad = Math.min(
    96,
    12 +
      activeCounts.transcribe * 26 +
      activeCounts.download * 19 +
      activeCounts.convert * 14
  );

  // Single contextual right-side header action per workspace
  const renderTopBarAction = () => {
    if (activeView === 'agent' && messages.length > 0) {
      return (
        <button
          type="button"
          onClick={() => {
            setMessages([]);
            showToast('已开启新对话');
          }}
          className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0F172A] hover:bg-[#F8F9FA] whitespace-nowrap shrink-0"
        >
          <Plus className="h-3.5 w-3.5" />
          新建对话
        </button>
      );
    }
    if (activeView === 'download' && downloads.some((d) => d.status === 'completed')) {
      return (
        <button
          type="button"
          onClick={() => {
            setDownloads((prev) => prev.filter((d) => d.status !== 'completed'));
            showToast('已清理已完成的下载记录');
          }}
          className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清理已完成
        </button>
      );
    }
    if (activeView === 'convert' && conversions.some((c) => c.status === 'completed')) {
      return (
        <button
          type="button"
          onClick={() => {
            setConversions((prev) => prev.filter((c) => c.status !== 'completed'));
            showToast('已清理已完成的转换记录');
          }}
          className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap shrink-0"
        >
          <Trash2 className="h-3.5 w-3.5" />
          清理已完成
        </button>
      );
    }
    return null;
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F8F9FA] text-[#0F172A]">
      <Sidebar
        activeView={activeView}
        onSelectView={setActiveView}
        activeCounts={activeCounts}
        systemLoad={systemLoad}
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
              aria-label="打开侧边栏"
              className="flex h-8 w-8 items-center justify-center rounded-control text-[#475569] hover:bg-[#F3F4F6] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <h1 className="text-[15px] font-semibold tracking-tight text-[#0F172A] whitespace-nowrap">
              {VIEW_TITLES[activeView]}
            </h1>
          </div>

          <div className="flex items-center gap-2">{renderTopBarAction()}</div>
        </header>

        {/* Active Workspace View */}
        <main className="min-h-0 flex-1">
          {activeView === 'agent' && (
            <AgentView
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
              tasks={transcriptions}
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
                  setConfig((prev) => ({ ...prev, defaultSaveDir: `本地文件夹 / ${handle.name}` }));
                  showToast(`已授权直写本地文件夹：${handle.name}`, 'success');
                }
              }}
              onChangeSaveDir={(dir) => {
                localDirHandleRef.current = null;
                setHasRealDirHandle(false);
                setConfig((prev) => ({ ...prev, defaultSaveDir: dir }));
                showToast(`下载保存路径已切换为 ${dir}`, 'success');
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
                showToast('已开始批量格式转换', 'success');
              }}
              onDeleteTask={(id) => setConversions((prev) => prev.filter((item) => item.id !== id))}
            />
          )}

          {activeView === 'settings' && (
            <SettingsView
              config={config}
              onSaveConfig={(next) => {
                setConfig(next);
                showToast('接口配置已保存', 'success');
              }}
              onCopyText={handleCopyText}
            />
          )}
        </main>
      </div>

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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  AudioWaveform,
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileOutput,
  Folder,
  FolderOpen,
  Globe,
  Link2,
  Pause,
  Play,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import {
  DocumentFormat,
  DownloadEngine,
  DownloadTask,
  EndpointConfig,
  MediaQuality,
  ThreadCount,
} from '../types/toolkit';
import {
  buildDeskKitChromeExtension,
  buildLocalEngineScript,
  detectDownloadEngine,
  detectFileCategory,
  extractCleanUrl,
  getFormatMenuGroups,
  mediaQualityLabel,
  triggerClientBlobDownload,
  triggerClientFileDownload,
} from '../services/toolkitAdapter';
import { DirectoryHandleLike } from '../services/webRangeDownloader';

interface DownloadViewProps {
  tasks: DownloadTask[];
  config: EndpointConfig;
  chromeConnected: boolean;
  localEngineOnline: boolean;
  hasRealDirHandle: boolean;
  onConnectChrome: () => void;
  onSelectDirectoryHandle: (handle: DirectoryHandleLike | null) => void;
  onChangeSaveDir: (dir: string) => void;
  onCreateDownload: (params: {
    rawInput: string;
    cleanUrl: string;
    fileName: string;
    saveDir: string;
    engine: DownloadEngine;
    threads: ThreadCount;
    mediaQuality?: MediaQuality;
    source?: 'manual' | 'chrome_extension';
    referer?: string;
    userAgent?: string;
    hasCookies?: boolean;
  }) => void;
  onSendToTranscribe: (task: DownloadTask) => void;
  onSendToConvert: (task: DownloadTask, targetFormat: DocumentFormat) => void;
  onTogglePause: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onCopyText: (text: string, label: string) => void;
}

type DownloadFilter = 'all' | 'active' | 'completed';

const PRESET_SAVE_DIRS = [
  { label: '默认下载目录', path: 'C:\\Users\\Downloads\\JoelDeskPro' },
  { label: '桌面视频文件夹', path: 'C:\\Users\\Desktop\\Videos' },
  { label: 'D 盘媒体素材库', path: 'D:\\Media\\Downloads' },
  { label: 'macOS 下载目录', path: '~/Downloads/JoelDeskPro' },
];

const DEMO_MESSY_LINK =
  '【内部资源分享】2026最新大模型部署包，高速直链：https://mirror.example.com/releases/faster_whisper_bundle_v3.zip 复制整段即可下载';

export function DownloadView({
  tasks,
  config,
  chromeConnected,
  localEngineOnline,
  hasRealDirHandle,
  onConnectChrome,
  onSelectDirectoryHandle,
  onChangeSaveDir,
  onCreateDownload,
  onSendToTranscribe,
  onSendToConvert,
  onTogglePause,
  onDeleteTask,
  onCopyText,
}: DownloadViewProps) {
  const [rawInput, setRawInput] = useState('');
  const [threads, setThreads] = useState<ThreadCount>(config.defaultThreads);
  const [filter, setFilter] = useState<DownloadFilter>('all');
  const [folderPickerOpen, setFolderPickerOpen] = useState(false);
  const [customDirDraft, setCustomDirDraft] = useState(config.defaultSaveDir);
  const [convertMenuTaskId, setConvertMenuTaskId] = useState<string | null>(null);
  const [pluginModalOpen, setPluginModalOpen] = useState(false);

  const folderPopoverRef = useRef<HTMLDivElement>(null);
  const convertMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCustomDirDraft(config.defaultSaveDir);
  }, [config.defaultSaveDir]);

  // Close popovers cleanly on outside click
  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (folderPopoverRef.current && !folderPopoverRef.current.contains(target)) {
        setFolderPickerOpen(false);
      }
      if (convertMenuRef.current && !convertMenuRef.current.contains(target)) {
        setConvertMenuTaskId(null);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const extracted = useMemo(() => extractCleanUrl(rawInput), [rawInput]);
  const autoEngine = useMemo<DownloadEngine>(
    () => (extracted.cleanUrl ? detectDownloadEngine(extracted.cleanUrl) : 'http_range'),
    [extracted.cleanUrl]
  );

  const currentWebUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '';

  const extensionFiles = useMemo(
    () =>
      buildDeskKitChromeExtension(
        config.chromeBridgePort,
        config.chromeBridgeToken,
        currentWebUrl
      ),
    [config.chromeBridgePort, config.chromeBridgeToken, currentWebUrl]
  );

  const filteredTasks = useMemo(() => {
    if (filter === 'active') return tasks.filter((t) => t.status !== 'completed');
    if (filter === 'completed') return tasks.filter((t) => t.status === 'completed');
    return tasks;
  }, [tasks, filter]);

  const totalSpeed = useMemo(
    () =>
      tasks
        .filter((t) => t.status === 'downloading')
        .reduce((acc, t) => acc + t.speedMBps, 0),
    [tasks]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extracted.cleanUrl) return;
    onCreateDownload({
      rawInput: rawInput.trim(),
      cleanUrl: extracted.cleanUrl,
      fileName: extracted.fileName,
      saveDir: config.defaultSaveDir,
      engine: autoEngine,
      threads,
      mediaQuality: autoEngine === 'ytdlp' ? 'best' : undefined,
      source: 'manual',
    });
    setRawInput('');
  };

  const handlePickNativeDirectory = async () => {
    const win = window as Window & {
      showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike>;
    };
    if (typeof win.showDirectoryPicker === 'function') {
      try {
        const handle = await win.showDirectoryPicker({ mode: 'readwrite' });
        if (handle?.name) {
          onSelectDirectoryHandle(handle);
          setFolderPickerOpen(false);
          return;
        }
      } catch {
        // Sandboxed iframe or user cancelled -> smoothly open local path selector
      }
    }
    setFolderPickerOpen((prev) => !prev);
  };

  const handleJumpToExtension = () => {
    onConnectChrome();
    setPluginModalOpen(true);
  };

  const handleExportExtensionBundle = () => {
    triggerClientBlobDownload('joeldeskpro-chrome-extension.zip', extensionFiles.zipBlob());
  };

  const handleExportLocalEngine = () => {
    const script = buildLocalEngineScript(
      config.chromeBridgePort,
      config.chromeBridgeToken,
      config.defaultSaveDir
    );
    triggerClientFileDownload(
      'joeldeskpro-local-engine.mjs',
      script,
      'application/javascript;charset=utf-8'
    );
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[1040px] space-y-5">
        {/* Top Smart URL & Local Save Folder Bar */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="粘贴直链、抖音 / YouTube 链接或带杂字的分享文案，自动选最快方式分片下载…"
                  className="h-10 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] pl-10 pr-3 text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none transition-colors"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {([8, 16, 32, 64] as ThreadCount[]).map((count) => (
                    <button
                      key={count}
                      type="button"
                      onClick={() => setThreads(count)}
                      className={`rounded-inner px-2.5 py-1.5 font-mono text-[12px] font-medium transition-colors whitespace-nowrap tabular-nums ${
                        threads === count
                          ? 'bg-white text-[#0F172A] shadow-xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {count} 线程
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!extracted.cleanUrl}
                  className="inline-flex h-10 items-center gap-2 rounded-control bg-[#2563EB] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  开始下载
                </button>
              </div>
            </div>

            {/* Real-time Extracted Clean URL Feedback */}
            {rawInput.trim() && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-control bg-[#F8F9FA] px-3.5 py-2.5 text-[12px]">
                {extracted.cleanUrl ? (
                  <>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="shrink-0 font-medium text-[#16A34A]">
                        {extracted.hadNoise ? '已自动过滤杂字' : '有效链接'}
                      </span>
                      <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                      <span className="truncate font-mono text-[#0F172A]">{extracted.cleanUrl}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[#64748B]">{extracted.fileName}</span>
                  </>
                ) : (
                  <span className="text-[#D97706]">
                    未检测到以 http:// 或 https:// 开头的有效下载链接
                  </span>
                )}
              </div>
            )}

            {/* Local Save Directory Row */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-[#F1F5F9] pt-3">
              <div className="relative flex min-w-0 flex-1 items-center gap-2" ref={folderPopoverRef}>
                <Folder className="h-4 w-4 shrink-0 text-[#64748B]" />
                <span className="shrink-0 text-[12px] text-[#64748B]">保存到</span>
                <button
                  type="button"
                  onClick={() => setFolderPickerOpen((prev) => !prev)}
                  className="flex min-w-0 max-w-[380px] items-center gap-1.5 rounded-inner bg-[#F8F9FA] px-2.5 py-1 font-mono text-[12px] text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
                  title="点击切换本地保存目录"
                >
                  <span className="truncate">{config.defaultSaveDir}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                </button>

                <button
                  type="button"
                  onClick={handlePickNativeDirectory}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1 text-[12px] font-medium text-[#0F172A] hover:bg-[#F8F9FA] whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-[#2563EB]" />
                  {hasRealDirHandle ? '已授权直写文件夹' : '选择文件夹'}
                </button>

                {/* Folder Picker Popover */}
                {folderPickerOpen && (
                  <div className="absolute left-0 top-full z-30 mt-2 w-[360px] max-w-[calc(100vw-3rem)] rounded-panel border border-[#E5E7EB] bg-white p-3.5 shadow-lg">
                    <div className="mb-2 text-[12px] font-semibold text-[#0F172A]">
                      选择本地保存文件夹
                    </div>

                    <div className="space-y-1">
                      {PRESET_SAVE_DIRS.map((item) => {
                        const isSelected = config.defaultSaveDir === item.path;
                        return (
                          <button
                            key={item.path}
                            type="button"
                            onClick={() => {
                              onChangeSaveDir(item.path);
                              setFolderPickerOpen(false);
                            }}
                            className={`flex w-full items-center justify-between gap-2 rounded-control px-3 py-2 text-left transition-colors ${
                              isSelected
                                ? 'bg-[#2563EB]/8 text-[#2563EB]'
                                : 'text-[#0F172A] hover:bg-[#F8F9FA]'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-[12px] font-medium">{item.label}</div>
                              <div className="truncate font-mono text-[11px] text-[#64748B]">
                                {item.path}
                              </div>
                            </div>
                            {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-[#2563EB]" />}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-3 border-t border-[#E5E7EB] pt-3">
                      <label className="mb-1.5 block text-[11px] font-medium text-[#64748B]">
                        自定义本机路径
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={customDirDraft}
                          onChange={(e) => setCustomDirDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (customDirDraft.trim()) {
                                onChangeSaveDir(customDirDraft.trim());
                                setFolderPickerOpen(false);
                              }
                            }
                          }}
                          placeholder="例如 D:\Videos\Downloads"
                          className="h-8 flex-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 font-mono text-[12px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (customDirDraft.trim()) {
                              onChangeSaveDir(customDirDraft.trim());
                              setFolderPickerOpen(false);
                            }
                          }}
                          className="h-8 rounded-inner bg-[#2563EB] px-3 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
                        >
                          确定
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {!rawInput && (
                <button
                  type="button"
                  onClick={() => setRawInput(DEMO_MESSY_LINK)}
                  className="text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
                >
                  填入示例链接
                </button>
              )}
            </div>
          </form>
        </section>

        {/* Direct One-Click JoelDeskPro Plugin Bar */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-[#E5E7EB] bg-white px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[#F3F4F6] text-[#2563EB]">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-[#0F172A]">
                  JoelDeskPro 插件
                </span>
                <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                <span
                  className={`text-[12px] font-medium ${
                    chromeConnected || localEngineOnline ? 'text-[#16A34A]' : 'text-[#64748B]'
                  }`}
                >
                  {chromeConnected && localEngineOnline
                    ? '已连接（网页端 + 本地引擎）'
                    : chromeConnected
                      ? '已直连当前网页端'
                      : localEngineOnline
                        ? '本地高速引擎在线'
                        : '网页端可直用 · 安装插件解锁全站嗅探'}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[#64748B]">
                支持网页端与本地客户端双通道，刷 YouTube、抖音、B 站时在视频右上角一键下载
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleJumpToExtension}
              className={`inline-flex items-center gap-1.5 rounded-control px-3.5 py-2 text-[12px] font-medium transition-colors whitespace-nowrap ${
                chromeConnected
                  ? 'bg-[#0F172A] text-white hover:bg-[#1E293B]'
                  : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
              }`}
            >
              {chromeConnected ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#4ADE80]" />
                  <span>打开插件设置</span>
                </>
              ) : (
                <>
                  <span>配置 JoelDeskPro 插件</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </section>

        {/* Task List (no overflow-hidden so the Convert Format dropdown is never clipped) */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-3">
            <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
              {(
                [
                  { id: 'all', label: `全部 (${tasks.length})` },
                  {
                    id: 'active',
                    label: `下载中 (${tasks.filter((t) => t.status !== 'completed').length})`,
                  },
                  {
                    id: 'completed',
                    label: `已完成 (${tasks.filter((t) => t.status === 'completed').length})`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  className={`rounded-inner px-3 py-1 text-[12px] font-medium transition-colors whitespace-nowrap tabular-nums ${
                    filter === tab.id
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {totalSpeed > 0 && (
              <div className="font-mono text-[12px] text-[#475569] tabular-nums">
                总速率{' '}
                <span className="font-semibold text-[#0F172A]">{totalSpeed.toFixed(1)} MB/s</span>
              </div>
            )}
          </div>

          {filteredTasks.length === 0 ? (
            <div className="px-5 py-14 text-center text-[13px] text-[#64748B]">
              当前分类下暂无下载任务
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {filteredTasks.map((task) => {
                const percent = Math.min(100, Math.round((task.downloadedMB / task.totalMB) * 100));
                const isCompleted = task.status === 'completed';
                const isPaused = task.status === 'paused';
                const fileCategory = detectFileCategory(task.fileName);
                const canTranscribe =
                  isCompleted && (fileCategory === 'video' || fileCategory === 'audio');
                const formatGroups = isCompleted ? getFormatMenuGroups(task.fileName) : [];
                const isConvertMenuOpen = convertMenuTaskId === task.id;

                return (
                  <div
                    key={task.id}
                    className="px-5 py-4 first:rounded-t-none last:rounded-b-panel hover:bg-[#F8F9FA]/70 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-[14px] font-medium text-[#0F172A]">
                            {task.fileName}
                          </span>
                          {task.source === 'chrome_extension' && (
                            <span className="text-[12px] font-medium text-[#2563EB]">
                              来自 Chrome 插件
                            </span>
                          )}
                          {task.hasCookies && (
                            <span className="inline-flex items-center gap-1 text-[12px] text-[#64748B]">
                              <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
                              已同步登录态
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[12px] text-[#64748B] tabular-nums">
                          <span>
                            {task.threads} 线程 · {Math.max(1, task.chunks.length)} 分片并发
                            {task.engine === 'ytdlp'
                              ? ` · ${mediaQualityLabel(task.mediaQuality ?? 'best')}`
                              : ''}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {task.downloadedMB.toFixed(1)} MB / {task.totalMB.toFixed(1)} MB
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex max-w-[220px] items-center gap-1 truncate font-mono text-[#64748B]">
                            <Folder className="h-3 w-3 shrink-0 text-[#94A3B8]" />
                            <span className="truncate">{task.saveDir}</span>
                          </span>
                          <span aria-hidden="true">·</span>
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 font-sans font-medium text-[#16A34A]">
                              <Check className="h-3.5 w-3.5" />
                              {task.savedLocationLabel || '已保存到本地'}
                            </span>
                          ) : isPaused ? (
                            <span className="font-sans font-medium text-[#D97706]">已暂停</span>
                          ) : (
                            <span className="font-medium text-[#2563EB]">
                              {task.speedMBps.toFixed(1)} MB/s
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Row Controls */}
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        {canTranscribe && (
                          <button
                            type="button"
                            onClick={() => onSendToTranscribe(task)}
                            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap transition-colors"
                          >
                            <AudioWaveform className="h-3.5 w-3.5" />
                            送去转录
                          </button>
                        )}

                        {isCompleted && (
                          <div
                            className="relative"
                            ref={isConvertMenuOpen ? convertMenuRef : undefined}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setConvertMenuTaskId(isConvertMenuOpen ? null : task.id)
                              }
                              className={`inline-flex h-8 items-center gap-1.5 rounded-control border px-3 text-[12px] font-medium whitespace-nowrap transition-colors ${
                                isConvertMenuOpen
                                  ? 'border-[#2563EB] bg-[#2563EB]/6 text-[#2563EB]'
                                  : 'border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB]'
                              }`}
                            >
                              <FileOutput className="h-3.5 w-3.5" />
                              <span>转换格式</span>
                              <ChevronDown className="h-3 w-3 opacity-70" />
                            </button>

                            {isConvertMenuOpen && (
                              <div className="absolute right-0 top-full z-40 mt-2 w-[300px] rounded-panel border border-[#E5E7EB] bg-white p-3 shadow-xl">
                                <div className="mb-2 px-1 text-[12px] font-semibold text-[#0F172A]">
                                  选择目标格式
                                </div>
                                <div className="space-y-3">
                                  {formatGroups.map((group) => (
                                    <div key={group.groupLabel}>
                                      <div className="mb-1.5 px-1 text-[11px] font-medium text-[#64748B]">
                                        {group.groupLabel}
                                      </div>
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {group.options.map((opt) => (
                                          <button
                                            key={opt.format}
                                            type="button"
                                            onClick={() => {
                                              setConvertMenuTaskId(null);
                                              onSendToConvert(task, opt.format);
                                            }}
                                            className="flex flex-col items-start rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 py-2 text-left transition-colors hover:border-[#2563EB] hover:bg-white"
                                          >
                                            <span className="font-mono text-[12px] font-semibold text-[#0F172A]">
                                              {opt.label}
                                            </span>
                                            <span className="mt-0.5 text-[11px] text-[#64748B]">
                                              {opt.hint}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {!isCompleted && (
                          <button
                            type="button"
                            onClick={() => onTogglePause(task.id)}
                            aria-label={isPaused ? '继续下载' : '暂停下载'}
                            title={isPaused ? '继续下载' : '暂停下载'}
                            className="flex h-8 w-8 items-center justify-center rounded-control border border-[#E5E7EB] bg-white text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A]"
                          >
                            {isPaused ? (
                              <Play className="h-3.5 w-3.5 fill-current" />
                            ) : (
                              <Pause className="h-3.5 w-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onCopyText(task.cleanUrl, '纯下载链接')}
                          aria-label="复制纯链接"
                          title="复制纯净下载链接"
                          className="flex h-8 w-8 items-center justify-center rounded-control border border-[#E5E7EB] bg-white text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A]"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label="删除任务"
                          title="移除任务"
                          className="flex h-8 w-8 items-center justify-center rounded-control border border-[#E5E7EB] bg-white text-[#94A3B8] hover:border-[#FECACA] hover:text-[#DC2626]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Concurrent Chunk Range Progress Bar */}
                    <div className="mt-3 flex items-center gap-3">
                      {task.chunks.length > 0 ? (
                        <div
                          className="grid flex-1 gap-1"
                          style={{
                            gridTemplateColumns: `repeat(${task.chunks.length}, minmax(0, 1fr))`,
                          }}
                          title={`${task.chunks.length} 个分片并发下载进度`}
                        >
                          {task.chunks.map((chunkPct, idx) => (
                            <div
                              key={idx}
                              className="h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]"
                            >
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  isCompleted
                                    ? 'bg-[#16A34A]'
                                    : isPaused
                                      ? 'bg-[#94A3B8]'
                                      : 'bg-[#2563EB]'
                                }`}
                                style={{ width: `${Math.min(100, Math.round(chunkPct))}%` }}
                              />
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#E5E7EB]">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isCompleted
                                ? 'bg-[#16A34A]'
                                : isPaused
                                  ? 'bg-[#94A3B8]'
                                  : 'bg-[#2563EB]'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      )}
                      <span className="w-10 text-right font-mono text-[12px] text-[#64748B] tabular-nums">
                        {percent}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Clean JoelDeskPro Plugin Settings Modal (No mock previews) */}
      {pluginModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onClick={() => setPluginModalOpen(false)}
        >
          <div
            className="w-full max-w-[580px] overflow-hidden rounded-panel border border-[#E5E7EB] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-[#0F172A]">
                  JoelDeskPro 插件设置
                </h2>
                <p className="mt-0.5 text-[12px] text-[#64748B]">
                  支持网页端直接用与本地客户端双通道 · 默认保存至 {config.defaultSaveDir}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPluginModalOpen(false)}
                aria-label="关闭窗口"
                className="flex h-8 w-8 items-center justify-center rounded-control text-[#64748B] hover:bg-[#F3F4F6] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Dual-Channel Status Overview */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-[#0F172A]">网页端通道</span>
                    <span
                      className={`font-medium ${
                        chromeConnected ? 'text-[#16A34A]' : 'text-[#64748B]'
                      }`}
                    >
                      {chromeConnected ? '已直连' : '等待安装'}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-[#64748B]">
                    发布后免装客户端，自动注册当前网址
                  </div>
                </div>

                <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-medium text-[#0F172A]">本地引擎通道</span>
                    <span
                      className={`font-medium ${
                        localEngineOnline ? 'text-[#16A34A]' : 'text-[#64748B]'
                      }`}
                    >
                      {localEngineOnline ? '在线' : '可选未启动'}
                    </span>
                  </div>
                  <div className="mt-1 truncate font-mono text-[11px] text-[#64748B]">
                    127.0.0.1:{config.chromeBridgePort}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportExtensionBundle}
                    className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-2 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载 JoelDeskPro 插件 (.zip)
                  </button>
                  <button
                    type="button"
                    onClick={handleExportLocalEngine}
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
                    title="可选：本机运行 node joeldeskpro-local-engine.mjs 解锁无限硬盘直写与 yt-dlp"
                  >
                    <Download className="h-3.5 w-3.5" />
                    本地引擎 (.mjs · 可选)
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyText('chrome://extensions', 'Chrome 扩展管理地址')}
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    复制 chrome://extensions
                  </button>
                  <button
                    type="button"
                    onClick={onConnectChrome}
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
                  >
                    {chromeConnected ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-[#16A34A]" />
                        重新握手
                      </>
                    ) : (
                      <span>检测连接</span>
                    )}
                  </button>
                </div>

                {/* Concise 3-step install instruction */}
                <div className="grid grid-cols-1 gap-2 border-t border-[#E5E7EB] pt-3 text-[12px] text-[#475569] sm:grid-cols-3">
                  <div>
                    <span className="font-mono font-semibold text-[#0F172A]">1. </span>
                    解压 <span className="font-mono text-[#0F172A]">.zip</span>（首层即含 manifest.json）
                  </div>
                  <div>
                    <span className="font-mono font-semibold text-[#0F172A]">2. </span>
                    扩展页右上角开 <span className="font-medium text-[#0F172A]">开发者模式</span>
                  </div>
                  <div>
                    <span className="font-mono font-semibold text-[#0F172A]">3. </span>
                    点 <span className="font-medium text-[#0F172A]">加载已解压扩展</span> 选中文件夹
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

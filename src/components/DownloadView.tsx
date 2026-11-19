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
  RotateCcw,
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
  detectDownloadEngine,
  detectFileCategory,
  extractCleanUrl,
  getFormatMenuGroups,
  mediaQualityLabel,
  triggerClientBlobDownload,
} from '../services/toolkitAdapter';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface DownloadViewProps {
  lang: AppLanguage;
  tasks: DownloadTask[];
  config: EndpointConfig;
  localEngineOnline: boolean;
  chromeDefaultDir: string;
  onCheckClient: () => void;
  onPickFolder: () => Promise<boolean>;
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

export function DownloadView({
  lang,
  tasks,
  config,
  localEngineOnline,
  chromeDefaultDir,
  onCheckClient,
  onPickFolder,
  onChangeSaveDir,
  onCreateDownload,
  onSendToTranscribe,
  onSendToConvert,
  onTogglePause,
  onDeleteTask,
  onCopyText,
}: DownloadViewProps) {
  const t = TRANSLATIONS[lang];
  const [rawInput, setRawInput] = useState('');
  const [threads, setThreads] = useState<ThreadCount>(config.defaultThreads);
  const [filter, setFilter] = useState<DownloadFilter>('all');
  const [customPathOpen, setCustomPathOpen] = useState(false);
  const [customDirDraft, setCustomDirDraft] = useState(config.defaultSaveDir);
  const [convertMenuTaskId, setConvertMenuTaskId] = useState<string | null>(null);
  const [pluginModalOpen, setPluginModalOpen] = useState(false);

  const folderPopoverRef = useRef<HTMLDivElement>(null);
  const convertMenuRef = useRef<HTMLDivElement>(null);

  const hasCustomDir = Boolean(config.defaultSaveDir.trim());
  const effectiveDisplayDir = hasCustomDir
    ? config.defaultSaveDir.trim()
    : chromeDefaultDir || t.download.chromeDefaultLabel;

  useEffect(() => {
    setCustomDirDraft(config.defaultSaveDir);
  }, [config.defaultSaveDir]);

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (folderPopoverRef.current && !folderPopoverRef.current.contains(target)) {
        setCustomPathOpen(false);
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

  const extensionFiles = useMemo(
    () => buildDeskKitChromeExtension(config.chromeBridgePort, config.chromeBridgeToken, ''),
    [config.chromeBridgePort, config.chromeBridgeToken]
  );

  const filteredTasks = useMemo(() => {
    if (filter === 'active') return tasks.filter((item) => item.status !== 'completed');
    if (filter === 'completed') return tasks.filter((item) => item.status === 'completed');
    return tasks;
  }, [tasks, filter]);

  const totalSpeed = useMemo(
    () =>
      tasks
        .filter((item) => item.status === 'downloading')
        .reduce((acc, item) => acc + item.speedMBps, 0),
    [tasks]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!extracted.cleanUrl) return;
    onCreateDownload({
      rawInput: rawInput.trim(),
      cleanUrl: extracted.cleanUrl,
      fileName: extracted.fileName,
      saveDir: config.defaultSaveDir.trim(),
      engine: autoEngine,
      threads,
      mediaQuality: autoEngine === 'ytdlp' ? 'best' : undefined,
      source: 'manual',
    });
    setRawInput('');
  };

  const handleChooseFolderClick = async () => {
    const pickedNatively = await onPickFolder();
    if (!pickedNatively) {
      setCustomPathOpen((prev) => !prev);
    } else {
      setCustomPathOpen(false);
    }
  };

  const handleExportExtensionBundle = () => {
    triggerClientBlobDownload('joeldeskpro-chrome-extension.zip', extensionFiles.zipBlob());
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[1040px] space-y-5">
        {/* Top Smart URL & Save Folder Bar */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Link2 className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
                <input
                  type="text"
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder={t.download.inputPlaceholder}
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
                      {t.download.threadsUnit(count)}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  disabled={!extracted.cleanUrl}
                  className="inline-flex h-10 items-center gap-2 rounded-control bg-[#2563EB] px-4 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Download className="h-4 w-4" />
                  {t.download.startDownload}
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
                        {extracted.hadNoise ? t.download.filteredNoise : t.download.validLink}
                      </span>
                      <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                      <span className="truncate font-mono text-[#0F172A]">{extracted.cleanUrl}</span>
                    </div>
                    <span className="shrink-0 font-mono text-[#64748B]">{extracted.fileName}</span>
                  </>
                ) : (
                  <span className="text-[#D97706]">{t.download.invalidLink}</span>
                )}
              </div>
            )}

            {/* Minimal Save Directory Row (Defaults to Chrome's Download Folder) */}
            <div className="mt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-[#F1F5F9] pt-3">
              <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-2" ref={folderPopoverRef}>
                <Folder className="h-4 w-4 shrink-0 text-[#64748B]" />
                <span className="shrink-0 text-[12px] text-[#64748B]">{t.download.saveTo}</span>
                <button
                  type="button"
                  onClick={() => setCustomPathOpen((prev) => !prev)}
                  className="flex min-w-0 max-w-[420px] items-center gap-1.5 rounded-inner bg-[#F8F9FA] px-2.5 py-1 font-mono text-[12px] text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
                  title={t.download.switchDirTitle}
                >
                  <span className="truncate">{effectiveDisplayDir}</span>
                </button>

                <button
                  type="button"
                  onClick={handleChooseFolderClick}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1 text-[12px] font-medium text-[#0F172A] hover:bg-[#F8F9FA] whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5 text-[#2563EB]" />
                  {t.download.chooseFolderBtn}
                </button>

                {hasCustomDir && (
                  <button
                    type="button"
                    onClick={() => {
                      onChangeSaveDir('');
                      setCustomPathOpen(false);
                    }}
                    className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-[12px] text-[#64748B] hover:bg-[#F3F4F6] hover:text-[#0F172A] whitespace-nowrap"
                  >
                    <RotateCcw className="h-3 w-3" />
                    {t.download.resetChromeDefault}
                  </button>
                )}

                {/* Minimal Custom Path Input Popover (No fake presets) */}
                {customPathOpen && (
                  <div className="absolute left-0 top-full z-30 mt-2 w-[360px] max-w-[calc(100vw-3rem)] rounded-panel border border-[#E5E7EB] bg-white p-3.5 shadow-lg">
                    <label className="mb-1.5 block text-[11px] font-medium text-[#64748B]">
                      {t.download.customPathLabel}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={customDirDraft}
                        onChange={(e) => setCustomDirDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            onChangeSaveDir(customDirDraft.trim());
                            setCustomPathOpen(false);
                          }
                        }}
                        placeholder={chromeDefaultDir || t.download.customPathPlaceholder}
                        className="h-8 flex-1 rounded-inner border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 font-mono text-[12px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onChangeSaveDir(customDirDraft.trim());
                          setCustomPathOpen(false);
                        }}
                        className="h-8 rounded-inner bg-[#2563EB] px-3 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
                      >
                        {t.download.confirm}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </form>
        </section>

        {/* Direct Desktop Client + Chrome Extension Bar */}
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-panel border border-[#E5E7EB] bg-white px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[#F3F4F6] text-[#2563EB]">
              <Globe className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-[#0F172A]">
                  {t.download.pluginTitle}
                </span>
                <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                <span
                  className={`text-[12px] font-medium ${
                    localEngineOnline ? 'text-[#16A34A]' : 'text-[#64748B]'
                  }`}
                >
                  {localEngineOnline
                    ? t.download.statusClientOnline
                    : t.download.statusClientOffline}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-[#64748B]">{t.download.pluginDesc}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onCheckClient();
                setPluginModalOpen(true);
              }}
              className={`inline-flex items-center gap-1.5 rounded-control px-3.5 py-2 text-[12px] font-medium transition-colors whitespace-nowrap ${
                localEngineOnline
                  ? 'bg-[#0F172A] text-white hover:bg-[#1E293B]'
                  : 'bg-[#2563EB] text-white hover:bg-[#1D4ED8]'
              }`}
            >
              {localEngineOnline ? (
                <>
                  <Check className="h-3.5 w-3.5 text-[#4ADE80]" />
                  <span>{t.download.openPluginSettings}</span>
                </>
              ) : (
                <>
                  <span>{t.download.configurePlugin}</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </section>

        {/* Task List */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E7EB] px-5 py-3">
            <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
              {(
                [
                  { id: 'all', label: t.download.filterAll(tasks.length) },
                  {
                    id: 'active',
                    label: t.download.filterActive(
                      tasks.filter((item) => item.status !== 'completed').length
                    ),
                  },
                  {
                    id: 'completed',
                    label: t.download.filterCompleted(
                      tasks.filter((item) => item.status === 'completed').length
                    ),
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
                {t.download.totalSpeed}{' '}
                <span className="font-semibold text-[#0F172A]">{totalSpeed.toFixed(1)} MB/s</span>
              </div>
            )}
          </div>

          {filteredTasks.length === 0 ? (
            <div className="px-5 py-14 text-center text-[13px] text-[#64748B]">
              {t.download.emptyList}
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {filteredTasks.map((task) => {
                const percent =
                  task.totalMB > 0
                    ? Math.min(100, Math.round((task.downloadedMB / task.totalMB) * 100))
                    : task.status === 'completed'
                      ? 100
                      : 0;
                const isCompleted = task.status === 'completed';
                const isPaused = task.status === 'paused';
                const fileCategory = detectFileCategory(task.fileName);
                const canTranscribe =
                  isCompleted && (fileCategory === 'video' || fileCategory === 'audio');
                const formatGroups = isCompleted ? getFormatMenuGroups(task.fileName, lang) : [];
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
                              {t.download.fromExtension}
                            </span>
                          )}
                          {task.hasCookies && (
                            <span className="inline-flex items-center gap-1 text-[12px] text-[#64748B]">
                              <ShieldCheck className="h-3.5 w-3.5 text-[#16A34A]" />
                              {t.download.cookiesSynced}
                            </span>
                          )}
                        </div>

                        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 font-mono text-[12px] text-[#64748B] tabular-nums">
                          <span>
                            {t.download.chunksMeta(task.threads, Math.max(1, task.chunks.length))}
                            {task.engine === 'ytdlp'
                              ? ` · ${mediaQualityLabel(task.mediaQuality ?? 'best', lang)}`
                              : ''}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>
                            {task.downloadedMB.toFixed(1)} MB / {task.totalMB.toFixed(1)} MB
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="inline-flex max-w-[260px] items-center gap-1 truncate font-mono text-[#64748B]">
                            <Folder className="h-3 w-3 shrink-0 text-[#94A3B8]" />
                            <span className="truncate">
                              {task.saveDir || chromeDefaultDir || t.download.chromeDefaultLabel}
                            </span>
                          </span>
                          <span aria-hidden="true">·</span>
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 font-sans font-medium text-[#16A34A]">
                              <Check className="h-3.5 w-3.5" />
                              {task.savedLocationLabel || t.download.savedLocally}
                            </span>
                          ) : isPaused ? (
                            <span className="font-sans font-medium text-[#D97706]">
                              {t.download.paused}
                            </span>
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
                            {t.download.sendToTranscribe}
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
                              <span>{t.download.convertFormat}</span>
                              <ChevronDown className="h-3 w-3 opacity-70" />
                            </button>

                            {isConvertMenuOpen && (
                              <div className="absolute right-0 top-full z-40 mt-2 w-[300px] rounded-panel border border-[#E5E7EB] bg-white p-3 shadow-xl">
                                <div className="mb-2 px-1 text-[12px] font-semibold text-[#0F172A]">
                                  {t.download.selectTargetFormat}
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
                            aria-label={isPaused ? t.download.resumeDownload : t.download.pauseDownload}
                            title={isPaused ? t.download.resumeDownload : t.download.pauseDownload}
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
                          onClick={() => onCopyText(task.cleanUrl, t.toasts.cleanUrlLabel)}
                          aria-label={t.download.copyCleanUrl}
                          title={t.download.copyCleanUrl}
                          className="flex h-8 w-8 items-center justify-center rounded-control border border-[#E5E7EB] bg-white text-[#475569] hover:border-[#CBD5E1] hover:text-[#0F172A]"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTask(task.id)}
                          aria-label={t.download.deleteTask}
                          title={t.download.deleteTask}
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
                          title={t.download.chunksProgressTitle(task.chunks.length)}
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

      {/* Clean JoelDeskPro Chrome Extension Setup Modal (Desktop Client Only) */}
      {pluginModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onClick={() => setPluginModalOpen(false)}
        >
          <div
            className="w-full max-w-[540px] overflow-hidden rounded-panel border border-[#E5E7EB] bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-4">
              <div>
                <h2 className="text-[15px] font-semibold text-[#0F172A]">
                  {t.download.pluginModal.title}
                </h2>
                <p className="mt-0.5 text-[12px] text-[#64748B]">
                  {t.download.pluginModal.subtitle(effectiveDisplayDir)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPluginModalOpen(false)}
                aria-label={t.download.pluginModal.close}
                className="flex h-8 w-8 items-center justify-center rounded-control text-[#64748B] hover:bg-[#F3F4F6] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {/* Single Desktop Client Bridge Status */}
              <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3">
                <div className="flex items-center justify-between text-[12px]">
                  <span className="font-medium text-[#0F172A]">
                    {t.download.pluginModal.localChannel}
                  </span>
                  <span
                    className={`font-medium ${
                      localEngineOnline ? 'text-[#16A34A]' : 'text-[#64748B]'
                    }`}
                  >
                    {localEngineOnline
                      ? t.download.pluginModal.localOnline
                      : t.download.pluginModal.localOffline}
                  </span>
                </div>
                <div className="mt-1 truncate font-mono text-[11px] text-[#64748B]">
                  http://127.0.0.1:{config.chromeBridgePort}
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
                    {t.download.pluginModal.downloadExtZip}
                  </button>
                  <button
                    type="button"
                    onClick={() => onCopyText('chrome://extensions', t.toasts.chromeExtUrlLabel)}
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t.download.pluginModal.copyExtensionsUrl}
                  </button>
                  <button
                    type="button"
                    onClick={onCheckClient}
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
                  >
                    {localEngineOnline && <Check className="h-3.5 w-3.5 text-[#16A34A]" />}
                    <span>{t.download.pluginModal.testConnection}</span>
                  </button>
                </div>

                {/* Concise 3-step install instruction */}
                <div className="grid grid-cols-1 gap-2 border-t border-[#E5E7EB] pt-3 text-[12px] text-[#475569] sm:grid-cols-3">
                  <div>
                    <span className="font-mono font-semibold text-[#0F172A]">1. </span>
                    {t.download.pluginModal.step1Prefix}
                    <span className="font-mono text-[#0F172A]">.zip</span>
                    {t.download.pluginModal.step1Suffix}
                  </div>
                  <div>
                    <span className="font-mono font-semibold text-[#0F172A]">2. </span>
                    {t.download.pluginModal.step2Prefix}
                    <span className="font-medium text-[#0F172A]">
                      {t.download.pluginModal.step2Bold}
                    </span>
                  </div>
                  <div>
                    <span className="font-mono font-semibold text-[#0F172A]">3. </span>
                    {t.download.pluginModal.step3Prefix}
                    <span className="font-medium text-[#0F172A]">
                      {t.download.pluginModal.step3Bold}
                    </span>
                    {t.download.pluginModal.step3Suffix}
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

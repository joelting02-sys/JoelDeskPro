import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  AudioWaveform,
  Check,
  Copy,
  Cpu,
  Download,
  ExternalLink,
  Film,
  Loader2,
  Play,
  Power,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ColabGpuSpec,
  ComputeProvider,
  ComputeRuntimeState,
  IdleShutdownMinutes,
  MediaKind,
  TranscriptLanguage,
  TranscriptOutputFormat,
  TranscriptionStage,
  TranscriptionTask,
  WhisperPresetId,
} from '../types/toolkit';
import {
  detectMediaKind,
  formatBytes,
  formatTranscriptExport,
  getComputeProviders,
  getTranscriptFileExtension,
  getWhisperPresets,
  triggerClientFileDownload,
} from '../services/toolkitAdapter';
import { formatMmSs } from '../services/computeBridge';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface TranscribeViewProps {
  lang: AppLanguage;
  tasks: TranscriptionTask[];
  computeState: ComputeRuntimeState;
  colabGpuSpec: ColabGpuSpec;
  autoShutdownEnabled: boolean;
  autoShutdownMinutes: IdleShutdownMinutes;
  localEngineOnline: boolean;
  onSelectColabGpu: (gpu: ColabGpuSpec) => void;
  onConnectCompute: (provider: ComputeProvider, modelName: string) => void;
  onStopCompute: () => void;
  onRefreshCompute: () => void;
  onToggleAutoShutdown: (enabled: boolean) => void;
  onChangeAutoShutdownMinutes: (minutes: IdleShutdownMinutes) => void;
  onCreateTask: (params: {
    fileName: string;
    fileSizeBytes: number;
    mediaKind: MediaKind;
    provider: ComputeProvider;
    preset: WhisperPresetId;
    outputFormat: TranscriptOutputFormat;
    language: TranscriptLanguage;
  }) => void;
  onChangeTaskOutputFormat: (id: string, format: TranscriptOutputFormat) => void;
  onDeleteTask: (id: string) => void;
  onCopyText: (text: string, label: string) => void;
}

export function TranscribeView({
  lang,
  tasks,
  computeState,
  colabGpuSpec,
  autoShutdownEnabled,
  autoShutdownMinutes,
  localEngineOnline,
  onSelectColabGpu,
  onConnectCompute,
  onStopCompute,
  onRefreshCompute,
  onToggleAutoShutdown,
  onChangeAutoShutdownMinutes,
  onCreateTask,
  onChangeTaskOutputFormat,
  onDeleteTask,
  onCopyText,
}: TranscribeViewProps) {
  const t = TRANSLATIONS[lang];
  const ct = t.transcribe.compute;
  const providersMeta = getComputeProviders(lang);
  const presetsMeta = getWhisperPresets(lang);

  const [stagedFile, setStagedFile] = useState<{
    name: string;
    size: number;
    mediaKind: MediaKind;
  } | null>(null);
  const [provider, setProvider] = useState<ComputeProvider>('colab-t4');
  const [preset, setPreset] = useState<WhisperPresetId>('balanced');
  const [outputFormat, setOutputFormat] = useState<TranscriptOutputFormat>('srt');
  const [language, setLanguage] = useState<TranscriptLanguage>('auto');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(tasks[0]?.id ?? null);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (computeState.status !== 'online') return;
    const timer = window.setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [computeState.status]);

  const activeQueueCount = tasks.filter((item) => item.stage !== 'completed').length;
  const uptimeSeconds =
    computeState.status === 'online' && computeState.startedAt
      ? Math.max(0, nowSec - Math.floor(computeState.startedAt))
      : null;

  const statusDotClass =
    computeState.status === 'online'
      ? 'bg-[#16A34A]'
      : computeState.status === 'starting' || computeState.status === 'stopping'
        ? 'bg-[#D97706] animate-pulse'
        : computeState.status === 'error'
          ? 'bg-[#DC2626]'
          : 'bg-[#94A3B8]';

  const statusLabel = (() => {
    if (computeState.status === 'online') {
      const pName = computeState.provider === 'kaggle-t4' ? 'Kaggle' : 'Colab';
      const base = `${ct.statusOnline} · ${pName} ${computeState.gpu}`;
      return uptimeSeconds !== null ? `${base} · ${formatMmSs(uptimeSeconds)}` : base;
    }
    if (computeState.status === 'starting') return ct.statusStarting;
    if (computeState.status === 'stopping') return ct.statusStopping;
    if (computeState.status === 'error') return ct.statusError;
    return ct.statusOffline;
  })();

  const autoShutdownStatusText = (() => {
    if (!autoShutdownEnabled) return ct.manualHint;
    if (activeQueueCount > 0) return ct.queueProtectedHint(activeQueueCount);
    if (computeState.status === 'online' && computeState.idleRemainingSeconds !== null) {
      return ct.idleCountdownHint(formatMmSs(computeState.idleRemainingSeconds));
    }
    return ct.idleCountdownHint(formatMmSs(autoShutdownMinutes * 60));
  })();

  const stageLocalFile = (file: File) => {
    setStagedFile({
      name: file.name,
      size: file.size || 42 * 1024 * 1024,
      mediaKind: detectMediaKind(file.name),
    });
  };

  const handleStart = () => {
    if (!stagedFile) return;
    onCreateTask({
      fileName: stagedFile.name,
      fileSizeBytes: stagedFile.size,
      mediaKind: stagedFile.mediaKind,
      provider,
      preset,
      outputFormat,
      language,
    });
    setStagedFile(null);
  };

  const activeSelectedTask =
    tasks.find((item) => item.id === selectedTaskId) ?? tasks[0] ?? null;

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[1040px] space-y-5">
        {/* Cloud GPU One-Click Connect & Auto-Shutdown Remote Bar */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left: 5-State Live Status + One-Click Connect Colab / Connect Kaggle */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div
                className="flex items-center gap-2 pr-1 text-[13px] font-medium text-[#0F172A]"
                title={computeState.errorMessage || undefined}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDotClass}`} />
                <span className="font-mono text-[12px] tabular-nums">{statusLabel}</span>
              </div>

              {computeState.status === 'online' ? (
                <button
                  type="button"
                  onClick={onStopCompute}
                  className="inline-flex items-center gap-1.5 rounded-control bg-[#DC2626] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#B91C1C] whitespace-nowrap"
                >
                  <Power className="h-3.5 w-3.5" />
                  {ct.stopGpu}
                </button>
              ) : computeState.status === 'starting' ? (
                <button
                  type="button"
                  onClick={onStopCompute}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#D97706]" />
                  {ct.cancelStart}
                </button>
              ) : computeState.status === 'stopping' ? (
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-1.5 text-[12px] font-medium text-[#94A3B8] cursor-not-allowed whitespace-nowrap"
                >
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {ct.stopping}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setProvider('colab-t4');
                      onConnectCompute('colab-t4', presetsMeta[preset].modelName);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-control bg-[#0F172A] px-3 py-1.5 text-[12px] font-medium text-white transition-colors hover:bg-[#1E293B] whitespace-nowrap"
                  >
                    <Cpu className="h-3.5 w-3.5 text-[#60A5FA]" />
                    <span>
                      {computeState.status === 'error'
                        ? ct.retryStart
                        : localEngineOnline && computeState.colabAuthed
                          ? ct.startGpu
                          : ct.connectColab}
                    </span>
                    {!(localEngineOnline && computeState.colabAuthed) && (
                      <ExternalLink className="h-3 w-3 opacity-70" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setProvider('kaggle-t4');
                      onConnectCompute('kaggle-t4', presetsMeta[preset].modelName);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#CBD5E1] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0F172A] transition-colors hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
                  >
                    <Cpu className="h-3.5 w-3.5 text-[#2563EB]" />
                    <span>{ct.connectKaggle}</span>
                    {!(localEngineOnline && computeState.kaggleAuthed) && (
                      <ExternalLink className="h-3 w-3 opacity-60" />
                    )}
                  </button>

                  {/* Compact Colab GPU Tier Selector */}
                  <div className="inline-flex items-center gap-0.5 rounded-control bg-[#F3F4F6] p-0.5">
                    {(['T4', 'L4', 'A100'] as ColabGpuSpec[]).map((gpu) => (
                      <button
                        key={gpu}
                        type="button"
                        onClick={() => onSelectColabGpu(gpu)}
                        className={`rounded-inner px-2 py-1 font-mono text-[11px] font-medium transition-colors ${
                          colabGpuSpec === gpu
                            ? 'bg-white text-[#0F172A] shadow-xs'
                            : 'text-[#64748B] hover:text-[#0F172A]'
                        }`}
                      >
                        {gpu}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {/* Orphan Runtime Cleanup Guard */}
              {computeState.orphanColabCount > 0 && computeState.status === 'offline' && (
                <button
                  type="button"
                  onClick={onStopCompute}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#FCA5A5] bg-[#FEF2F2] px-2.5 py-1.5 text-[12px] font-medium text-[#DC2626] hover:bg-[#FEE2E2] whitespace-nowrap"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {ct.stopOrphan(computeState.orphanColabCount)}
                </button>
              )}

              <button
                type="button"
                onClick={onRefreshCompute}
                title={ct.refreshStatus}
                aria-label={ct.refreshStatus}
                className="flex h-8 w-8 items-center justify-center rounded-control border border-[#E5E7EB] text-[#64748B] hover:bg-[#F8F9FA] hover:text-[#0F172A]"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Right: Outer-Level Auto-Shutdown Checkbox & Queue-Protection Status */}
            <div className="flex flex-wrap items-center gap-2.5">
              <label className="flex cursor-pointer items-center gap-2 text-[12px] font-medium text-[#0F172A] select-none">
                <input
                  type="checkbox"
                  checked={autoShutdownEnabled}
                  onChange={(e) => onToggleAutoShutdown(e.target.checked)}
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{ct.autoShutdownLabel}</span>
              </label>

              {autoShutdownEnabled && (
                <div className="inline-flex items-center gap-0.5 rounded-control bg-[#F3F4F6] p-0.5">
                  {([10, 15, 30] as IdleShutdownMinutes[]).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => onChangeAutoShutdownMinutes(mins)}
                      className={`rounded-inner px-2 py-0.5 font-mono text-[11px] font-medium transition-colors tabular-nums ${
                        autoShutdownMinutes === mins
                          ? 'bg-white text-[#0F172A] shadow-xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {ct.minutesUnit(mins)}
                    </button>
                  ))}
                </div>
              )}

              <span className="font-mono text-[11px] text-[#64748B] tabular-nums">
                {autoShutdownStatusText}
              </span>
            </div>
          </div>
        </section>

        {/* Manual Drop Zone & Auto-Detection */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const file = e.dataTransfer.files?.[0];
              if (file) stageLocalFile(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            className={`flex flex-col items-center justify-center rounded-control border border-dashed px-4 py-7 text-center transition-colors duration-150 ${
              isDragging
                ? 'border-[#2563EB] bg-[#2563EB]/4'
                : 'border-[#CBD5E1] bg-[#F8F9FA] hover:border-[#94A3B8]'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*,.mp3,.wav,.m4a,.flac,.mp4,.mkv,.mov,.webm"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  stageLocalFile(file);
                  e.target.value = '';
                }
              }}
            />

            {stagedFile ? (
              <div className="flex flex-col items-center">
                <div className="flex items-center gap-2 text-[15px] font-semibold text-[#0F172A]">
                  {stagedFile.mediaKind === 'video' ? (
                    <Film className="h-4 w-4 text-[#2563EB]" />
                  ) : (
                    <AudioWaveform className="h-4 w-4 text-[#2563EB]" />
                  )}
                  <span>{stagedFile.name}</span>
                </div>
                <p className="mt-1.5 text-[13px] text-[#475569]">
                  {stagedFile.mediaKind === 'video'
                    ? t.transcribe.videoAutoHint
                    : t.transcribe.audioDirectHint}
                  <span className="ml-2 font-mono text-[#64748B] tabular-nums">
                    · {formatBytes(stagedFile.size)}
                  </span>
                </p>
              </div>
            ) : (
              <>
                <Upload className="h-5 w-5 text-[#64748B]" strokeWidth={1.8} />
                <p className="mt-2.5 text-[14px] font-medium text-[#0F172A]">
                  {t.transcribe.dropPrompt}
                </p>
                <p className="mt-1 text-[12px] text-[#64748B]">{t.transcribe.dropHint}</p>
              </>
            )}
          </div>

          {stagedFile && (
            <div className="mt-2.5 flex justify-end text-[12px]">
              <button
                type="button"
                onClick={() => setStagedFile(null)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                {t.transcribe.clearSelected}
              </button>
            </div>
          )}

          <div className="my-5 h-px bg-[#E5E7EB]" />

          {/* Cloud Compute & Output Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-[#64748B]">
                  {t.transcribe.cloudCompute}
                </div>
                <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {(['colab-t4', 'kaggle-t4'] as ComputeProvider[]).map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setProvider(id)}
                      className={`rounded-inner px-3 py-1.5 text-[13px] font-medium transition-colors whitespace-nowrap ${
                        provider === id
                          ? 'bg-white text-[#0F172A] shadow-xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {providersMeta[id].name} · {id === 'colab-t4' ? colabGpuSpec : 'T4 x2'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[12px] font-medium text-[#64748B]">
                  {t.transcribe.exportFormat}
                </div>
                <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {(
                    [
                      { id: 'srt', label: t.transcribe.srtSubtitle },
                      { id: 'md_plain', label: t.transcribe.mdPlain },
                      { id: 'txt', label: 'TXT' },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setOutputFormat(item.id)}
                      className={`rounded-inner px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                        outputFormat === item.id
                          ? 'bg-white text-[#0F172A] shadow-xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[12px] font-medium text-[#64748B]">
                  {t.transcribe.language}
                </div>
                <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {(
                    [
                      { id: 'auto', label: t.transcribe.langAuto },
                      { id: 'zh', label: t.transcribe.langZh },
                      { id: 'en', label: t.transcribe.langEn },
                    ] as const
                  ).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLanguage(item.id)}
                      className={`rounded-inner px-2.5 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                        language === item.id
                          ? 'bg-white text-[#0F172A] shadow-xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="text-right text-[12px] text-[#64748B]">
              <div className="flex items-center justify-end gap-1.5 font-mono text-[#0F172A]">
                <Cpu className="h-3.5 w-3.5 text-[#2563EB]" />
                <span>{providersMeta[provider].gpuSpec}</span>
              </div>
              <div className="mt-0.5">{providersMeta[provider].note}</div>
            </div>
          </div>

          {/* faster-whisper Model Preset Cards */}
          <div className="mt-5">
            <div className="mb-2 text-[12px] font-medium text-[#64748B]">
              {t.transcribe.modelPresets}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(['fast', 'balanced', 'accurate'] as WhisperPresetId[]).map((id) => {
                const item = presetsMeta[id];
                const isSelected = preset === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPreset(id)}
                    className={`flex flex-col items-start rounded-control border p-3.5 text-left transition-colors duration-150 ${
                      isSelected
                        ? 'border-[#2563EB] bg-[#2563EB]/[0.03]'
                        : 'border-[#E5E7EB] bg-white hover:border-[#CBD5E1]'
                    }`}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="text-[14px] font-semibold text-[#0F172A]">{item.label}</span>
                      <span className="font-mono text-[12px] text-[#64748B] tabular-nums">
                        {item.sizeLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-[12px] text-[#64748B]">{item.summary}</div>
                    <div className="mt-2 font-mono text-[11px] text-[#475569]">
                      {item.modelName} · {item.speedTag}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Action Row */}
          <div className="mt-5 flex items-center justify-end">
            <button
              type="button"
              disabled={!stagedFile}
              onClick={handleStart}
              className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {stagedFile?.mediaKind === 'video'
                ? t.transcribe.startVideoTranscribe
                : t.transcribe.startAudioTranscribe}
            </button>
          </div>
        </section>

        {/* Task Queue + Transcript Result */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Task List */}
          <div className="overflow-hidden rounded-panel border border-[#E5E7EB] bg-white lg:col-span-5">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
              <h2 className="text-[14px] font-semibold text-[#0F172A]">
                {t.transcribe.queueTitle}
              </h2>
              <span className="font-mono text-[12px] text-[#64748B] tabular-nums">
                {t.transcribe.itemCount(tasks.length)}
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="px-4 py-12 text-center text-[13px] text-[#64748B]">
                {t.transcribe.emptyQueue}
              </div>
            ) : (
              <div className="divide-y divide-[#E5E7EB]">
                {tasks.map((task) => {
                  const isSelected = activeSelectedTask?.id === task.id;
                  const isDone = task.stage === 'completed';
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTaskId(task.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedTaskId(task.id);
                      }}
                      className={`px-4 py-3.5 transition-colors ${
                        isSelected ? 'bg-[#F8FAFC]' : 'hover:bg-[#F8F9FA]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[13px] font-medium text-[#0F172A]">
                            {task.mediaKind === 'video' ? (
                              <Film className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                            ) : (
                              <AudioWaveform className="h-3.5 w-3.5 shrink-0 text-[#64748B]" />
                            )}
                            <span className="truncate">{task.fileName}</span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[#64748B]">
                            <span>{providersMeta[task.provider].name}</span>
                            <span aria-hidden="true">·</span>
                            <span>{presetsMeta[task.preset].label}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {task.outputFormat === 'md_plain'
                                ? t.transcribe.mdPlain
                                : task.outputFormat.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteTask(task.id);
                          }}
                          aria-label={t.transcribe.deleteTask}
                          className="rounded-inner p-1 text-[#94A3B8] hover:bg-[#E5E7EB]/60 hover:text-[#DC2626]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Stage & Progress */}
                      <div className="mt-2.5">
                        <div className="flex items-center justify-between text-[12px]">
                          <span
                            className={`font-medium ${
                              isDone ? 'text-[#16A34A]' : 'text-[#D97706]'
                            }`}
                          >
                            {t.transcribe.stages[task.stage]}
                          </span>
                          <span className="font-mono text-[#64748B] tabular-nums">
                            {task.progress}%
                          </span>
                        </div>
                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#E5E7EB]">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isDone ? 'bg-[#16A34A]' : 'bg-[#2563EB]'
                            }`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Result Preview Pane */}
          <div className="flex flex-col overflow-hidden rounded-panel border border-[#E5E7EB] bg-white lg:col-span-7">
            <div className="flex items-center justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
              <div className="min-w-0">
                <h2 className="truncate text-[14px] font-semibold text-[#0F172A]">
                  {activeSelectedTask ? activeSelectedTask.fileName : t.transcribe.previewTitle}
                </h2>
              </div>
              {activeSelectedTask && activeSelectedTask.stage === 'completed' && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-0.5 rounded-control bg-[#F3F4F6] p-0.5">
                    {(
                      [
                        { id: 'srt', label: 'SRT' },
                        { id: 'md_plain', label: t.transcribe.mdPlain },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onChangeTaskOutputFormat(activeSelectedTask.id, opt.id)}
                        className={`rounded-inner px-2.5 py-1 text-[11px] font-medium transition-colors whitespace-nowrap ${
                          activeSelectedTask.outputFormat === opt.id
                            ? 'bg-white text-[#0F172A] shadow-xs'
                            : 'text-[#64748B] hover:text-[#0F172A]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onCopyText(
                        formatTranscriptExport(
                          activeSelectedTask.segments,
                          activeSelectedTask.outputFormat,
                          activeSelectedTask.fileName
                        ),
                        activeSelectedTask.outputFormat === 'md_plain'
                          ? t.toasts.mdPlainLabel
                          : t.toasts.srtLabel
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {t.transcribe.copy}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const base = activeSelectedTask.fileName.replace(/\.[^.]+$/, '');
                      const ext = getTranscriptFileExtension(activeSelectedTask.outputFormat);
                      triggerClientFileDownload(
                        `${base}.${ext}`,
                        formatTranscriptExport(
                          activeSelectedTask.segments,
                          activeSelectedTask.outputFormat,
                          activeSelectedTask.fileName
                        )
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-control bg-[#0F172A] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1E293B] whitespace-nowrap"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t.transcribe.exportExt(
                      getTranscriptFileExtension(activeSelectedTask.outputFormat).toUpperCase()
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-4">
              {!activeSelectedTask ? (
                <div className="py-12 text-center text-[13px] text-[#64748B]">
                  {t.transcribe.selectTaskHint}
                </div>
              ) : activeSelectedTask.stage !== 'completed' ? (
                <div className="space-y-4 py-4">
                  <div className="text-[13px] text-[#475569]">
                    {t.transcribe.runningOn(providersMeta[activeSelectedTask.provider].name)}{' '}
                    <span className="font-mono text-[#0F172A]">
                      {presetsMeta[activeSelectedTask.preset].modelName}
                    </span>
                  </div>
                  <div className="space-y-2.5">
                    {(
                      activeSelectedTask.needsAudioExtract
                        ? [
                            'extracting_audio',
                            'connecting_gpu',
                            'downloading_model',
                            'transcribing',
                          ]
                        : ['connecting_gpu', 'downloading_model', 'transcribing']
                    ).map((step) => {
                      const order: TranscriptionStage[] = [
                        'queued',
                        'extracting_audio',
                        'connecting_gpu',
                        'downloading_model',
                        'transcribing',
                        'completed',
                      ];
                      const currentIdx = order.indexOf(activeSelectedTask.stage);
                      const stepIdx = order.indexOf(step as TranscriptionStage);
                      const done = currentIdx > stepIdx;
                      const current = currentIdx === stepIdx;
                      return (
                        <div
                          key={step}
                          className="flex items-center justify-between rounded-control border border-[#E5E7EB] px-3.5 py-2.5 text-[13px]"
                        >
                          <span
                            className={
                              done || current
                                ? 'font-medium text-[#0F172A]'
                                : 'text-[#94A3B8]'
                            }
                          >
                            {t.transcribe.stages[step as TranscriptionStage]}
                          </span>
                          <span
                            className={`text-[12px] font-medium ${
                              done
                                ? 'text-[#16A34A]'
                                : current
                                  ? 'text-[#2563EB]'
                                  : 'text-[#94A3B8]'
                            }`}
                          >
                            {done ? (
                              <span className="inline-flex items-center gap-1">
                                <Check className="h-3.5 w-3.5" />
                                {t.transcribe.stepDone}
                              </span>
                            ) : current ? (
                              t.transcribe.stepRunning
                            ) : (
                              t.transcribe.stepWaiting
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : activeSelectedTask.outputFormat === 'md_plain' ? (
                <div className="space-y-3.5">
                  <div className="text-[12px] text-[#64748B]">{t.transcribe.mdPreviewHint}</div>
                  <div className="space-y-3 text-[14px] leading-relaxed text-[#0F172A]">
                    {activeSelectedTask.segments.map((seg, i) => (
                      <p key={i}>{seg.text}</p>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeSelectedTask.segments.map((seg, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-1 gap-1.5 border-b border-[#F1F5F9] pb-3 last:border-b-0 sm:grid-cols-[120px_1fr]"
                    >
                      <div className="font-mono text-[12px] text-[#64748B] tabular-nums">
                        {seg.start.slice(0, 8)}
                      </div>
                      <p className="text-[14px] leading-relaxed text-[#0F172A]">{seg.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

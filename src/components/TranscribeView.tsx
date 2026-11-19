import React, { useRef, useState } from 'react';
import {
  AudioWaveform,
  Check,
  Copy,
  Cpu,
  Download,
  Film,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  ComputeProvider,
  MediaKind,
  TranscriptLanguage,
  TranscriptOutputFormat,
  TranscriptionStage,
  TranscriptionTask,
  WhisperPresetId,
} from '../types/toolkit';
import {
  COMPUTE_PROVIDERS,
  WHISPER_PRESETS,
  detectMediaKind,
  formatBytes,
  formatTranscriptExport,
  getTranscriptFileExtension,
  triggerClientFileDownload,
} from '../services/toolkitAdapter';

interface TranscribeViewProps {
  tasks: TranscriptionTask[];
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

const STAGE_LABELS: Record<TranscriptionStage, string> = {
  queued: '排队中',
  extracting_audio: '自动提取音轨 (16kHz WAV)',
  connecting_gpu: '连接云端 T4 GPU',
  downloading_model: '云端拉取模型权重',
  transcribing: 'faster-whisper 推理中',
  completed: '已完成',
};

export function TranscribeView({
  tasks,
  onCreateTask,
  onChangeTaskOutputFormat,
  onDeleteTask,
  onCopyText,
}: TranscribeViewProps) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    tasks.find((t) => t.id === selectedTaskId) ?? tasks[0] ?? null;

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[1040px] space-y-6">
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
                    ? '已自动识别为视频 · 转录前将自动抽离 16kHz 音频轨道'
                    : '已自动识别为音频 · 直接送入云端 T4 转录'}
                  <span className="ml-2 font-mono text-[#64748B] tabular-nums">
                    · {formatBytes(stagedFile.size)}
                  </span>
                </p>
              </div>
            ) : (
              <>
                <Upload className="h-5 w-5 text-[#64748B]" strokeWidth={1.8} />
                <p className="mt-2.5 text-[14px] font-medium text-[#0F172A]">
                  拖入音频或视频文件，或点击选择
                </p>
                <p className="mt-1 text-[12px] text-[#64748B]">
                  自动识别媒体格式 · 视频自动转音频提取音轨（MP4 / MKV / MOV / MP3 / WAV / M4A）
                </p>
              </>
            )}
          </div>

          {/* Quick Demo Loaders */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <div className="flex items-center gap-3 text-[#64748B]">
              <span>快速体验识别：</span>
              <button
                type="button"
                onClick={() =>
                  setStagedFile({
                    name: '公开课录屏_T4算力演示.mp4',
                    size: 184 * 1024 * 1024,
                    mediaKind: 'video',
                  })
                }
                className="font-medium text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
              >
                载入示例视频 (.mp4)
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() =>
                  setStagedFile({
                    name: '访谈纪要原声.m4a',
                    size: 28.6 * 1024 * 1024,
                    mediaKind: 'audio',
                  })
                }
                className="font-medium text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
              >
                载入示例音频 (.m4a)
              </button>
            </div>
            {stagedFile && (
              <button
                type="button"
                onClick={() => setStagedFile(null)}
                className="text-[#64748B] hover:text-[#0F172A]"
              >
                清除已选
              </button>
            )}
          </div>

          <div className="my-5 h-px bg-[#E5E7EB]" />

          {/* Cloud Compute & Output Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-[#64748B]">云端算力节点</div>
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
                      {COMPUTE_PROVIDERS[id].name} · T4
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-1.5 text-[12px] font-medium text-[#64748B]">导出格式</div>
                <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {(
                    [
                      { id: 'srt', label: 'SRT 字幕' },
                      { id: 'md_plain', label: 'MD 无时间轴' },
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
                <div className="mb-1.5 text-[12px] font-medium text-[#64748B]">语言</div>
                <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {(
                    [
                      { id: 'auto', label: '自动' },
                      { id: 'zh', label: '中文' },
                      { id: 'en', label: 'English' },
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
                <span>{COMPUTE_PROVIDERS[provider].gpuSpec}</span>
              </div>
              <div className="mt-0.5">{COMPUTE_PROVIDERS[provider].note}</div>
            </div>
          </div>

          {/* faster-whisper Model Preset Cards */}
          <div className="mt-5">
            <div className="mb-2 text-[12px] font-medium text-[#64748B]">
              faster-whisper 模型档位
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {(['fast', 'balanced', 'accurate'] as WhisperPresetId[]).map((id) => {
                const item = WHISPER_PRESETS[id];
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
              {stagedFile?.mediaKind === 'video' ? '自动提取音轨并开始转录' : '开始云端转录'}
            </button>
          </div>
        </section>

        {/* Task Queue + Transcript Result */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Task List */}
          <div className="overflow-hidden rounded-panel border border-[#E5E7EB] bg-white lg:col-span-5">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
              <h2 className="text-[14px] font-semibold text-[#0F172A]">转录队列</h2>
              <span className="font-mono text-[12px] text-[#64748B] tabular-nums">
                {tasks.length} 项
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="px-4 py-12 text-center text-[13px] text-[#64748B]">
                暂无转录记录，拖入音视频即可开始
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
                            <span>{COMPUTE_PROVIDERS[task.provider].name}</span>
                            <span aria-hidden="true">·</span>
                            <span>{WHISPER_PRESETS[task.preset].label}</span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {task.outputFormat === 'md_plain'
                                ? 'MD 无时间轴'
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
                          aria-label="删除任务"
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
                            {STAGE_LABELS[task.stage]}
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
                  {activeSelectedTask ? activeSelectedTask.fileName : '转录文稿预览'}
                </h2>
              </div>
              {activeSelectedTask && activeSelectedTask.stage === 'completed' && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-0.5 rounded-control bg-[#F3F4F6] p-0.5">
                    {(
                      [
                        { id: 'srt', label: 'SRT' },
                        { id: 'md_plain', label: 'MD 无时间轴' },
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
                          ? '无时间轴 Markdown'
                          : 'SRT 字幕'
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
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
                    导出 .{getTranscriptFileExtension(activeSelectedTask.outputFormat).toUpperCase()}
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 p-4">
              {!activeSelectedTask ? (
                <div className="py-12 text-center text-[13px] text-[#64748B]">
                  选择左侧任务查看转录进度与结果
                </div>
              ) : activeSelectedTask.stage !== 'completed' ? (
                <div className="space-y-4 py-4">
                  <div className="text-[13px] text-[#475569]">
                    正在通过 {COMPUTE_PROVIDERS[activeSelectedTask.provider].name} 运行{' '}
                    <span className="font-mono text-[#0F172A]">
                      {WHISPER_PRESETS[activeSelectedTask.preset].modelName}
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
                            {STAGE_LABELS[step as TranscriptionStage]}
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
                                完成
                              </span>
                            ) : current ? (
                              '执行中'
                            ) : (
                              '等待中'
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : activeSelectedTask.outputFormat === 'md_plain' ? (
                <div className="space-y-3.5">
                  <div className="text-[12px] text-[#64748B]">
                    无时间轴 Markdown 预览 · 导出为纯净分段文档
                  </div>
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

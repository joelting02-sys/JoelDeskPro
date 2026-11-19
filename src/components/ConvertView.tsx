import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  AudioWaveform,
  Check,
  Download,
  FileOutput,
  FileText,
  Film,
  Play,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConversionTask, DocumentFormat } from '../types/toolkit';
import {
  detectDocumentFormat,
  formatBytes,
  formatLabel,
  getAvailableTargetFormats,
  getRecommendedTargetFormat,
  isAudioFormat,
  isVideoFormat,
  triggerClientFileDownload,
} from '../services/toolkitAdapter';

interface ConvertViewProps {
  tasks: ConversionTask[];
  onAddTask: (params: {
    fileName: string;
    fileSizeBytes: number;
    sourceFormat: DocumentFormat;
    targetFormat: DocumentFormat;
    autoStart?: boolean;
  }) => void;
  onUpdateTargetFormat: (id: string, target: DocumentFormat) => void;
  onStartTask: (id: string) => void;
  onStartAllReady: () => void;
  onDeleteTask: (id: string) => void;
}

type QuickPresetMode = 'auto' | 'pdf-docx' | 'docx-pdf' | 'pdf-png' | 'md-pdf';

export function ConvertView({
  tasks,
  onAddTask,
  onUpdateTargetFormat,
  onStartTask,
  onStartAllReady,
  onDeleteTask,
}: ConvertViewProps) {
  const [presetMode, setPresetMode] = useState<QuickPresetMode>('auto');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resolveTargetForFile = (source: DocumentFormat): DocumentFormat => {
    if (presetMode === 'pdf-docx' && source !== 'docx') return 'docx';
    if (presetMode === 'docx-pdf' && source !== 'pdf') return 'pdf';
    if (presetMode === 'pdf-png' && source !== 'png') return 'png';
    if (presetMode === 'md-pdf' && source !== 'pdf') return 'pdf';
    return getRecommendedTargetFormat(source);
  };

  const handleFiles = (fileList: FileList | File[]) => {
    Array.from(fileList).forEach((file) => {
      const source = detectDocumentFormat(file.name);
      const target = resolveTargetForFile(source);
      onAddTask({
        fileName: file.name,
        fileSizeBytes: file.size || 2.1 * 1024 * 1024,
        sourceFormat: source,
        targetFormat: target,
        autoStart: false,
      });
    });
  };

  const readyCount = tasks.filter((t) => t.status === 'ready').length;

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[1040px] space-y-6">
        {/* Preset & Drop Area */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex flex-wrap items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
              {(
                [
                  { id: 'auto', label: '自动识别' },
                  { id: 'pdf-docx', label: 'PDF → Word' },
                  { id: 'docx-pdf', label: 'Word → PDF' },
                  { id: 'pdf-png', label: 'PDF → 图片' },
                  { id: 'md-pdf', label: 'Markdown → PDF' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPresetMode(item.id)}
                  className={`rounded-inner px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                    presetMode === item.id
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
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
              multiple
              accept=".pdf,.doc,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg,.mp4,.mkv,.mov,.webm,.mp3,.wav,.m4a,.flac,.ogg"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  handleFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <Upload className="h-5 w-5 text-[#64748B]" strokeWidth={1.8} />
            <p className="mt-2.5 text-[14px] font-medium text-[#0F172A]">
              拖入文档或音视频文件，自动匹配可转换的目标格式
            </p>
            <p className="mt-1 text-[12px] text-[#64748B]">
              支持 PDF / Word / Markdown 以及 MP4 / MKV / MOV / MP3 / WAV / FLAC 批量互转
            </p>
          </div>

          {/* Demo Sample Loaders */}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[12px] text-[#64748B]">
            <span>快速加入示例文档：</span>
            <button
              type="button"
              onClick={() =>
                onAddTask({
                  fileName: '合同审批附件_2026.pdf',
                  fileSizeBytes: 2.9 * 1024 * 1024,
                  sourceFormat: 'pdf',
                  targetFormat: resolveTargetForFile('pdf'),
                })
              }
              className="font-medium text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
            >
              示例 PDF
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() =>
                onAddTask({
                  fileName: '产品需求说明书.docx',
                  fileSizeBytes: 1.6 * 1024 * 1024,
                  sourceFormat: 'docx',
                  targetFormat: resolveTargetForFile('docx'),
                })
              }
              className="font-medium text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
            >
              示例 Word (.docx)
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={() =>
                onAddTask({
                  fileName: '接口对接文档.md',
                  fileSizeBytes: 84 * 1024,
                  sourceFormat: 'md',
                  targetFormat: resolveTargetForFile('md'),
                })
              }
              className="font-medium text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
            >
              示例 Markdown
            </button>
          </div>
        </section>

        {/* Conversion Queue */}
        <section className="overflow-hidden rounded-panel border border-[#E5E7EB] bg-white">
          <div className="flex items-center justify-between border-b border-[#E5E7EB] px-5 py-3">
            <div className="flex items-center gap-2">
              <FileOutput className="h-4 w-4 text-[#64748B]" />
              <h2 className="text-[14px] font-semibold text-[#0F172A]">转换队列</h2>
              <span className="font-mono text-[12px] text-[#64748B] tabular-nums">
                · {tasks.length} 项
              </span>
            </div>

            {readyCount > 0 && (
              <button
                type="button"
                onClick={onStartAllReady}
                className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
              >
                <Play className="h-3 w-3 fill-current" />
                全部开始转换 ({readyCount})
              </button>
            )}
          </div>

          {tasks.length === 0 ? (
            <div className="px-5 py-14 text-center text-[13px] text-[#64748B]">
              暂无待转换文档，拖入文件或点击上方示例即可体验
            </div>
          ) : (
            <div className="divide-y divide-[#E5E7EB]">
              {tasks.map((task) => {
                const availableTargets = getAvailableTargetFormats(task.sourceFormat);
                const isDone = task.status === 'completed';
                const isConverting = task.status === 'converting';

                return (
                  <div
                    key={task.id}
                    className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 hover:bg-[#F8F9FA]/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-[14px] font-medium text-[#0F172A]">
                        {isVideoFormat(task.sourceFormat) ? (
                          <Film className="h-4 w-4 shrink-0 text-[#2563EB]" />
                        ) : isAudioFormat(task.sourceFormat) ? (
                          <AudioWaveform className="h-4 w-4 shrink-0 text-[#2563EB]" />
                        ) : (
                          <FileText className="h-4 w-4 shrink-0 text-[#64748B]" />
                        )}
                        <span className="truncate">{task.fileName}</span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[12px] text-[#64748B]">
                        <span className="font-mono tabular-nums">
                          {formatBytes(task.fileSizeBytes)}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{formatLabel(task.sourceFormat)}</span>
                        <ArrowRight className="h-3 w-3 text-[#94A3B8]" />
                        {task.status === 'ready' ? (
                          <select
                            aria-label="选择目标格式"
                            value={task.targetFormat}
                            onChange={(e) =>
                              onUpdateTargetFormat(task.id, e.target.value as DocumentFormat)
                            }
                            className="rounded-inner border border-[#E5E7EB] bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#0F172A] focus:border-[#2563EB] focus:outline-none"
                          >
                            {availableTargets.map((fmt) => (
                              <option key={fmt} value={fmt}>
                                {formatLabel(fmt)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-medium text-[#0F172A]">
                            {formatLabel(task.targetFormat)}
                          </span>
                        )}
                      </div>

                      {isConverting && (
                        <div className="mt-2.5 flex items-center gap-3">
                          <div className="h-1.5 max-w-[260px] flex-1 overflow-hidden rounded-full bg-[#E5E7EB]">
                            <div
                              className="h-full rounded-full bg-[#2563EB] transition-all duration-300"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="font-mono text-[12px] text-[#64748B] tabular-nums">
                            {task.progress}%
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {task.status === 'ready' && (
                        <button
                          type="button"
                          onClick={() => onStartTask(task.id)}
                          className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
                        >
                          转换
                        </button>
                      )}

                      {isConverting && (
                        <span className="text-[12px] font-medium text-[#D97706] whitespace-nowrap">
                          转换中
                        </span>
                      )}

                      {isDone && (
                        <button
                          type="button"
                          onClick={() => {
                            const base = task.fileName.replace(/\.[^.]+$/, '');
                            triggerClientFileDownload(
                              `${base}.${task.targetFormat}`,
                              `Joel Desk Pro 格式转换原型输出\n源文件: ${task.fileName}\n目标格式: ${task.targetFormat.toUpperCase()}\n`
                            );
                          }}
                          className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-1.5 text-[12px] font-medium text-[#0F172A] hover:bg-[#F8F9FA] whitespace-nowrap"
                        >
                          <Check className="h-3.5 w-3.5 text-[#16A34A]" />
                          <Download className="h-3.5 w-3.5 text-[#64748B]" />
                          导出 .{task.targetFormat}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onDeleteTask(task.id)}
                        aria-label="移除文件"
                        className="flex h-8 w-8 items-center justify-center rounded-control border border-[#E5E7EB] bg-white text-[#94A3B8] hover:border-[#FECACA] hover:text-[#DC2626]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

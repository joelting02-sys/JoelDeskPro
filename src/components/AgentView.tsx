import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUp,
  AudioWaveform,
  Check,
  Copy,
  Download,
  FileOutput,
  FileText,
  Film,
  Link2,
  Paperclip,
  X,
} from 'lucide-react';
import {
  AgentActionPayload,
  AgentMessage,
  AttachedFileItem,
  ComputeProvider,
  DocumentFormat,
  ThreadCount,
  WhisperPresetId,
  WorkspaceView,
} from '../types/toolkit';
import {
  COMPUTE_PROVIDERS,
  WHISPER_PRESETS,
  detectFileCategory,
  extractCleanUrl,
  formatBytes,
  formatLabel,
  getAvailableTargetFormats,
  getFileExtension,
} from '../services/toolkitAdapter';

interface AgentViewProps {
  messages: AgentMessage[];
  onSendMessage: (text: string, attachments: AttachedFileItem[]) => void;
  onUpdateAction: (messageId: string, updater: (action: AgentActionPayload) => AgentActionPayload) => void;
  onDispatchAction: (messageId: string, action: AgentActionPayload) => void;
  onNavigateView: (view: WorkspaceView) => void;
  onCopyText: (text: string, label: string) => void;
}

const QUICK_PROMPTS: Array<{
  title: string;
  subtitle: string;
  text: string;
  attachment?: AttachedFileItem;
}> = [
  {
    title: '杂乱文本精准提链',
    subtitle: '自动截取 http 链接并多线程下载',
    text: '【超清教程合集】速存防失效 https://cdn.example.com/courses/cuda_whisper_guide_2026.mp4 复制整段打开即可',
  },
  {
    title: 'PDF 转 Word 文档',
    subtitle: '自动识别格式并派发转换',
    text: '帮我把这个 PDF 转成 Word 格式',
    attachment: {
      id: 'sample-pdf',
      name: '2026年度技术架构方案.pdf',
      size: 3.8 * 1024 * 1024,
      category: 'document',
      extension: 'pdf',
    },
  },
  {
    title: '视频自动抽音轨转录',
    subtitle: 'Kaggle T4 · 精准版 faster-whisper',
    text: '用 Kaggle T4 精准版帮我转录这个视频里的语音',
    attachment: {
      id: 'sample-mp4',
      name: '产品复盘会议录屏.mp4',
      size: 162 * 1024 * 1024,
      category: 'video',
      extension: 'mp4',
    },
  },
];

export function AgentView({
  messages,
  onSendMessage,
  onUpdateAction,
  onDispatchAction,
  onNavigateView,
  onCopyText,
}: AgentViewProps) {
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AttachedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const draftUrlPreview = useMemo(() => extractCleanUrl(draft), [draft]);

  const addFiles = (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) return;
    const mapped: AttachedFileItem[] = list.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name,
      size: file.size || 2.4 * 1024 * 1024,
      category: detectFileCategory(file.name),
      extension: getFileExtension(file.name),
    }));
    setAttachments((prev) => [...prev, ...mapped]);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() && attachments.length === 0) return;
    onSendMessage(draft.trim(), attachments);
    setDraft('');
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFiles(e.dataTransfer.files);
    }
  };

  const isEmpty = messages.length === 0;

  return (
    <div
      className="relative flex h-full flex-col bg-[#F8F9FA]"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Full-pane Drag & Drop Overlay */}
      {isDragging && (
        <div className="pointer-events-none absolute inset-4 z-30 flex items-center justify-center rounded-panel border-2 border-dashed border-[#2563EB] bg-white/92">
          <div className="text-center">
            <p className="text-[15px] font-semibold text-[#0F172A]">松开文件，交给 AI 自动识别</p>
            <p className="mt-1 text-[13px] text-[#64748B]">
              支持音视频转录（视频自动提取音轨）及 PDF / Word 文档转换
            </p>
          </div>
        </div>
      )}

      {/* Main Scrollable Stream */}
      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-[760px] flex-col justify-center pb-8">
            <div className="mb-8">
              <h1 className="text-[28px] font-semibold tracking-tight text-[#0F172A] [text-wrap:balance]">
                丢入链接、文件，直接说你想做什么
              </h1>
              <p className="mt-2 text-[14px] text-[#64748B]">
                AI 助手会自动清洗链接、识别音视频或文档并调用工具；也可在左侧直达手动工作台。
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() =>
                    onSendMessage(item.text, item.attachment ? [item.attachment] : [])
                  }
                  className="group flex flex-col items-start rounded-panel border border-[#E5E7EB] bg-white p-4 text-left transition-colors duration-150 hover:border-[#CBD5E1] hover:bg-[#FCFDFE]"
                >
                  <span className="text-[14px] font-semibold text-[#0F172A] group-hover:text-[#2563EB] transition-colors">
                    {item.title}
                  </span>
                  <span className="mt-1.5 text-[12px] leading-relaxed text-[#64748B]">
                    {item.subtitle}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-[780px] space-y-6 pb-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] rounded-panel bg-[#0F172A] px-4 py-3 text-[14px] leading-relaxed text-white">
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-2">
                        {msg.attachments.map((file) => (
                          <div
                            key={file.id}
                            className="flex items-center gap-1.5 rounded-inner bg-white/12 px-2.5 py-1 text-[12px] text-white/95"
                          >
                            {file.category === 'video' ? (
                              <Film className="h-3.5 w-3.5 shrink-0" />
                            ) : file.category === 'audio' ? (
                              <AudioWaveform className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="max-w-[200px] truncate">{file.name}</span>
                            <span className="font-mono text-white/65 tabular-nums">
                              · {formatBytes(file.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                  </div>
                ) : (
                  <div className="w-full max-w-[680px]">
                    <div className="flex items-center gap-2 text-[12px] text-[#64748B]">
                      <span className="font-medium text-[#0F172A]">Joel Desk Pro Agent</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{msg.timestamp}</span>
                    </div>
                    <p className="mt-1.5 text-[14px] leading-relaxed text-[#1E293B]">
                      {msg.content}
                    </p>

                    {msg.action && (
                      <div className="mt-3">
                        <AgentActionCard
                          messageId={msg.id}
                          action={msg.action}
                          onUpdateAction={onUpdateAction}
                          onDispatchAction={onDispatchAction}
                          onNavigateView={onNavigateView}
                          onCopyText={onCopyText}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Bottom Composer */}
      <div className="border-t border-[#E5E7EB] bg-white px-5 py-4 sm:px-8">
        <form onSubmit={handleSubmit} className="mx-auto max-w-[780px]">
          {/* Real-time URL Extraction Preview Bar when messy link is pasted */}
          {draftUrlPreview.cleanUrl && (
            <div className="mb-2.5 flex items-center justify-between gap-3 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3.5 py-2 text-[12px]">
              <div className="flex min-w-0 items-center gap-2">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-[#2563EB]" />
                <span className="shrink-0 font-medium text-[#0F172A]">
                  {draftUrlPreview.hadNoise ? '已精准提取链接' : '已识别链接'}
                </span>
                <span className="truncate font-mono text-[#475569]">{draftUrlPreview.cleanUrl}</span>
              </div>
              <button
                type="button"
                onClick={() => onCopyText(draftUrlPreview.cleanUrl!, '纯链接')}
                className="shrink-0 text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
              >
                复制纯链
              </button>
            </div>
          )}

          {/* Staged Attachments */}
          {attachments.length > 0 && (
            <div className="mb-2.5 flex flex-wrap gap-2">
              {attachments.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center gap-2 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-1.5 text-[12px] text-[#0F172A]"
                >
                  {file.category === 'video' ? (
                    <Film className="h-3.5 w-3.5 text-[#2563EB]" />
                  ) : file.category === 'audio' ? (
                    <AudioWaveform className="h-3.5 w-3.5 text-[#2563EB]" />
                  ) : (
                    <FileText className="h-3.5 w-3.5 text-[#2563EB]" />
                  )}
                  <span className="max-w-[180px] truncate font-medium">{file.name}</span>
                  <span className="text-[#64748B]">
                    {file.category === 'video'
                      ? '视频·自动抽音轨'
                      : file.category === 'audio'
                        ? '音频'
                        : '文档'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== file.id))}
                    aria-label={`移除 ${file.name}`}
                    className="text-[#94A3B8] hover:text-[#0F172A]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input Box */}
          <div className="flex items-end gap-2 rounded-panel border border-[#E5E7EB] bg-[#F8F9FA] p-2 focus-within:border-[#2563EB] focus-within:bg-white transition-colors duration-150">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) {
                  addFiles(e.target.files);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="添加文件"
              title="添加音视频或文档"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-[#64748B] hover:bg-[#E5E7EB]/60 hover:text-[#0F172A] transition-colors"
            >
              <Paperclip className="h-4 w-4" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
              }}
              onKeyDown={handleKeyDown}
              placeholder="粘贴带杂字的链接、拖入 PDF/音视频，或直接输入指令…"
              className="max-h-32 flex-1 resize-none bg-transparent py-2 text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
            />

            <button
              type="submit"
              disabled={!draft.trim() && attachments.length === 0}
              aria-label="发送指令"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[#2563EB] text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed"
            >
              <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface AgentActionCardProps {
  messageId: string;
  action: AgentActionPayload;
  onUpdateAction: (messageId: string, updater: (action: AgentActionPayload) => AgentActionPayload) => void;
  onDispatchAction: (messageId: string, action: AgentActionPayload) => void;
  onNavigateView: (view: WorkspaceView) => void;
  onCopyText: (text: string, label: string) => void;
}

function AgentActionCard({
  messageId,
  action,
  onUpdateAction,
  onDispatchAction,
  onNavigateView,
  onCopyText,
}: AgentActionCardProps) {
  if (action.type === 'download') {
    const threadOptions: ThreadCount[] = [8, 16, 32, 64];

    return (
      <div className="rounded-panel border border-[#E5E7EB] bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
            <Download className="h-4 w-4 text-[#2563EB]" />
            <span>高速下载调度</span>
          </div>
          <span className="font-mono text-[12px] text-[#64748B] truncate max-w-[260px]">
            {action.fileName}
          </span>
        </div>

        <div className="mt-3 rounded-control bg-[#F8F9FA] px-3.5 py-2.5 font-mono text-[12px] text-[#0F172A] break-all">
          {action.cleanUrl}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
            {threadOptions.map((count) => (
              <button
                key={count}
                type="button"
                disabled={Boolean(action.dispatchedTaskId)}
                onClick={() =>
                  onUpdateAction(messageId, (prev) =>
                    prev.type === 'download' ? { ...prev, threads: count } : prev
                  )
                }
                className={`rounded-inner px-2.5 py-1 font-mono text-[12px] font-medium transition-colors whitespace-nowrap tabular-nums ${
                  action.threads === count
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {count} 线程
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onCopyText(action.cleanUrl, '纯链接')}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap"
            >
              <Copy className="h-3.5 w-3.5" />
              复制纯链
            </button>

            {action.dispatchedTaskId ? (
              <button
                type="button"
                onClick={() => onNavigateView('download')}
                className="inline-flex items-center gap-1.5 rounded-control bg-[#16A34A] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#15803D] whitespace-nowrap"
              >
                <Check className="h-3.5 w-3.5" />
                已加入下载 · 查看
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onDispatchAction(messageId, action)}
                className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
              >
                发送到高速下载
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (action.type === 'transcribe') {
    const providers: ComputeProvider[] = ['colab-t4', 'kaggle-t4'];
    const presets: WhisperPresetId[] = ['fast', 'balanced', 'accurate'];
    return (
      <div className="rounded-panel border border-[#E5E7EB] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
            <AudioWaveform className="h-4 w-4 text-[#2563EB]" />
            <span>云端语音转录</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[#64748B]">
            <span className="font-medium text-[#0F172A]">{action.fileName}</span>
            <span aria-hidden="true">·</span>
            <span>{action.needsAudioExtract ? '视频源 · 将自动提取音轨' : '音频源'}</span>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
            {providers.map((provider) => (
              <button
                key={provider}
                type="button"
                disabled={Boolean(action.dispatchedTaskId)}
                onClick={() =>
                  onUpdateAction(messageId, (prev) =>
                    prev.type === 'transcribe' ? { ...prev, provider } : prev
                  )
                }
                className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  action.provider === provider
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {COMPUTE_PROVIDERS[provider].name} T4
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                disabled={Boolean(action.dispatchedTaskId)}
                onClick={() =>
                  onUpdateAction(messageId, (prev) =>
                    prev.type === 'transcribe' ? { ...prev, preset } : prev
                  )
                }
                className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  action.preset === preset
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {WHISPER_PRESETS[preset].label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
            {(
              [
                { id: 'srt', label: 'SRT' },
                { id: 'md_plain', label: 'MD 无时间轴' },
              ] as const
            ).map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                disabled={Boolean(action.dispatchedTaskId)}
                onClick={() =>
                  onUpdateAction(messageId, (prev) =>
                    prev.type === 'transcribe' ? { ...prev, outputFormat: fmt.id } : prev
                  )
                }
                className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  action.outputFormat === fmt.id
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="font-mono text-[12px] text-[#64748B]">
            {WHISPER_PRESETS[action.preset].modelName} · {WHISPER_PRESETS[action.preset].sizeLabel}
          </span>

          {action.dispatchedTaskId ? (
            <button
              type="button"
              onClick={() => onNavigateView('transcribe')}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#16A34A] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#15803D] whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5" />
              已启动转录 · 查看进度
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDispatchAction(messageId, action)}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              启动云端转录
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  const targets = getAvailableTargetFormats(action.sourceFormat);
  return (
    <div className="rounded-panel border border-[#E5E7EB] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
          <FileOutput className="h-4 w-4 text-[#2563EB]" />
          <span>文档格式转换</span>
        </div>
        <span className="text-[12px] text-[#64748B]">
          {action.fileName} · {formatBytes(action.fileSizeBytes)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium text-[#0F172A]">{formatLabel(action.sourceFormat)}</span>
          <ArrowRight className="h-3.5 w-3.5 text-[#94A3B8]" />
          <div className="flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
            {targets.slice(0, 3).map((fmt: DocumentFormat) => (
              <button
                key={fmt}
                type="button"
                disabled={Boolean(action.dispatchedTaskId)}
                onClick={() =>
                  onUpdateAction(messageId, (prev) =>
                    prev.type === 'convert' ? { ...prev, targetFormat: fmt } : prev
                  )
                }
                className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  action.targetFormat === fmt
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {formatLabel(fmt)}
              </button>
            ))}
          </div>
        </div>

        {action.dispatchedTaskId ? (
          <button
            type="button"
            onClick={() => onNavigateView('convert')}
            className="inline-flex items-center gap-1.5 rounded-control bg-[#16A34A] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#15803D] whitespace-nowrap"
          >
            <Check className="h-3.5 w-3.5" />
            已开始转换 · 查看
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onDispatchAction(messageId, action)}
            className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
          >
            开始转换
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

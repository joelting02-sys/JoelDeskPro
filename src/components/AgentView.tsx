import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  ArrowUp,
  AudioWaveform,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileOutput,
  FileText,
  Film,
  Link2,
  Loader2,
  Paperclip,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import {
  AgentActionPayload,
  AgentMessage,
  AttachedFileItem,
  ComputeProvider,
  DocumentFormat,
  EndpointConfig,
  MagpieStatus,
  WhisperPresetId,
  WorkspaceView,
} from '../types/toolkit';
import {
  detectFileCategory,
  extractCleanUrl,
  formatBytes,
  formatLabel,
  getAvailableTargetFormats,
  getComputeProviders,
  getFileExtension,
  getWhisperPresets,
  stripDeskProToolTags,
} from '../services/toolkitAdapter';
import { AppLanguage, TRANSLATIONS } from '../i18n';
import { BrandLogo } from './BrandLogo';

interface AgentViewProps {
  lang: AppLanguage;
  config: EndpointConfig;
  magpieStatus: MagpieStatus;
  isSending?: boolean;
  messages: AgentMessage[];
  onSendMessage: (text: string, attachments: AttachedFileItem[]) => void;
  onUpdateAction: (messageId: string, updater: (action: AgentActionPayload) => AgentActionPayload) => void;
  onDispatchAction: (messageId: string, action: AgentActionPayload) => void;
  onNavigateView: (view: WorkspaceView) => void;
  onCopyText: (text: string, label: string) => void;
  onSelectMagpieModel: (model: string) => void;
  onRefreshMagpie: () => Promise<void>;
  onStopRun: () => void;
}

export function AgentView({
  lang,
  config,
  magpieStatus,
  isSending = false,
  messages,
  onSendMessage,
  onUpdateAction,
  onDispatchAction,
  onNavigateView,
  onCopyText,
  onSelectMagpieModel,
  onRefreshMagpie,
  onStopRun,
}: AgentViewProps) {
  const t = TRANSLATIONS[lang];
  const [draft, setDraft] = useState('');
  const [attachments, setAttachments] = useState<AttachedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [refreshingModels, setRefreshingModels] = useState(false);
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
      rawFile: file,
      localPath: (file as File & { path?: string }).path || undefined,
    }));
    setAttachments((prev) => [...prev, ...mapped]);
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isSending) return;
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

  const handleRefresh = async () => {
    setRefreshingModels(true);
    try {
      await onRefreshMagpie();
    } finally {
      setRefreshingModels(false);
    }
  };

  const isEmpty = messages.length === 0;
  const isMagpieActive = magpieStatus.supported && magpieStatus.settings.mode === 'magpie';
  const currentMagpieModel = magpieStatus.settings.model || magpieStatus.models[0]?.id || '';

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
            <p className="text-[15px] font-semibold text-[#0F172A]">{t.agent.dropTitle}</p>
            <p className="mt-1 text-[13px] text-[#64748B]">{t.agent.dropSubtitle}</p>
          </div>
        </div>
      )}

      {/* Main Scrollable Stream */}
      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8">
        {isEmpty ? (
          <div className="mx-auto flex h-full max-w-[680px] flex-col items-start justify-center pb-8">
            <BrandLogo size={46} className="mb-5 shadow-[0_6px_18px_rgba(10,10,14,0.22)] rounded-[12px]" />
            <h1 className="text-[28px] font-semibold tracking-tight text-[#0F172A] [text-wrap:balance]">
              {t.agent.welcomeTitle}
            </h1>
            <p className="mt-2.5 max-w-[580px] text-[14px] leading-relaxed text-[#64748B]">
              {t.agent.welcomeSubtitle}
            </p>
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
                  <div className="w-full max-w-[720px]">
                    <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#64748B]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#0F172A]">
                        {msg.model && <Sparkles className="h-3.5 w-3.5 text-[#2563EB]" />}
                        {msg.model ? 'Magpie' : 'Joel Desk Pro Agent'}
                      </span>
                      {msg.model && (
                        <span className="rounded-inner bg-[#F3F4F6] px-1.5 py-0.5 font-mono text-[11px] text-[#475569]">
                          {msg.model}
                        </span>
                      )}
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">{msg.timestamp}</span>
                      {msg.isStreaming && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#2563EB]">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {t.agent.streamingLabel}
                        </span>
                      )}
                    </div>

                    {msg.thinking && (
                      <ThinkingDrawer lang={lang} thinking={msg.thinking} />
                    )}

                    {(() => {
                      const visibleContent = stripDeskProToolTags(msg.content);
                      if (!visibleContent && !msg.isStreaming) return null;
                      return (
                        <div className="mt-2 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[#1E293B]">
                          {visibleContent}
                          {msg.isStreaming && (
                            <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-[#2563EB] align-middle" />
                          )}
                        </div>
                      );
                    })()}

                    {msg.error && (
                      <div className="mt-2.5 flex items-start gap-2 rounded-control border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 text-[12px] text-[#B91C1C]">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span className="whitespace-pre-wrap break-words font-mono">{msg.error}</span>
                      </div>
                    )}

                    {msg.action && (
                      <div className="mt-3">
                        <AgentActionCard
                          lang={lang}
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
            {isSending && !messages.some((m) => m.isStreaming) && (
              <div className="flex items-center gap-2 text-[13px] text-[#64748B]">
                <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                <span>{t.agent.thinkingCustomLlm(config.llmModel)}</span>
              </div>
            )}
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
                  {draftUrlPreview.hadNoise ? t.agent.extractedLink : t.agent.detectedLink}
                </span>
                <span className="truncate font-mono text-[#475569]">{draftUrlPreview.cleanUrl}</span>
              </div>
              <button
                type="button"
                onClick={() => onCopyText(draftUrlPreview.cleanUrl!, t.toasts.cleanUrlLabel)}
                className="shrink-0 text-[#2563EB] hover:text-[#1D4ED8] whitespace-nowrap"
              >
                {t.agent.copyUrl}
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
                      ? t.agent.videoAutoExtract
                      : file.category === 'audio'
                        ? t.agent.audioTag
                        : t.agent.docTag}
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((prev) => prev.filter((item) => item.id !== file.id))}
                    aria-label={t.agent.removeFile(file.name)}
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
              aria-label={t.agent.addFiles}
              title={t.agent.addFilesTitle}
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
              placeholder={t.agent.placeholder}
              className="max-h-32 flex-1 resize-none bg-transparent py-2 text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none"
            />

            {isSending && isMagpieActive ? (
              <button
                type="button"
                onClick={onStopRun}
                aria-label={t.agent.stopRun}
                title={t.agent.stopRun}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[#DC2626] text-white transition-colors duration-150 hover:bg-[#B91C1C]"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSending || (!draft.trim() && attachments.length === 0)}
                aria-label={t.agent.sendCommand}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control bg-[#2563EB] text-white transition-colors duration-150 hover:bg-[#1D4ED8] disabled:bg-[#CBD5E1] disabled:cursor-not-allowed"
              >
                <ArrowUp className="h-4 w-4" strokeWidth={2.2} />
              </button>
            )}
          </div>

          {/* Bottom Model Picker & Channel Controls */}
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-[#64748B]">
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {isMagpieActive ? (
                <>
                  <span
                    title={
                      magpieStatus.online
                        ? t.agent.magpieConnected
                        : t.agent.magpieDisconnected
                    }
                    className={`h-2 w-2 shrink-0 rounded-full ${
                      magpieStatus.online ? 'bg-[#16A34A]' : 'bg-[#D97706]'
                    }`}
                  />
                  {magpieStatus.models.length > 0 ? (
                    <select
                      value={currentMagpieModel}
                      disabled={isSending}
                      onChange={(e) => onSelectMagpieModel(e.target.value)}
                      aria-label={t.settings.magpieModelLabel}
                      className="h-7 max-w-[260px] rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-2 font-mono text-[11.5px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none disabled:opacity-60"
                    >
                      {!magpieStatus.models.some((m) => m.id === currentMagpieModel) &&
                        currentMagpieModel && (
                          <option value={currentMagpieModel}>{currentMagpieModel}</option>
                        )}
                      {magpieStatus.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.id}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-mono text-[11.5px] text-[#B45309]">
                      {t.agent.magpieDisconnected}
                    </span>
                  )}
                  <button
                    type="button"
                    disabled={refreshingModels || isSending}
                    onClick={handleRefresh}
                    title={t.agent.refreshModels}
                    aria-label={t.agent.refreshModels}
                    className="flex h-7 w-7 items-center justify-center rounded-control border border-[#E5E7EB] bg-[#F8F9FA] text-[#64748B] hover:border-[#2563EB] hover:bg-white hover:text-[#2563EB] disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${refreshingModels ? 'animate-spin' : ''}`} />
                  </button>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-inner bg-[#EFF6FF] px-2 py-0.5 text-[11.5px] font-medium text-[#1D4ED8]">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      config.runtimeMode === 'custom_endpoint' ? 'bg-[#2563EB]' : 'bg-[#16A34A]'
                    }`}
                  />
                  <span className="font-mono">
                    {config.runtimeMode === 'custom_endpoint'
                      ? t.agent.activeCustomModel(config.llmModel || 'Custom LLM')
                      : t.agent.activeLocalRouter}
                  </span>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => onNavigateView('settings')}
              title={t.agent.settingsLink}
              aria-label={t.agent.settingsLink}
              className="inline-flex h-7 items-center gap-1 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-2.5 text-[11px] font-medium text-[#475569] hover:border-[#CBD5E1] hover:bg-white hover:text-[#0F172A] whitespace-nowrap"
            >
              <SlidersHorizontal className="h-3 w-3 opacity-80" />
              <span>{t.agent.settingsLink}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface ThinkingDrawerProps {
  lang: AppLanguage;
  thinking: string;
}

function ThinkingDrawer({ lang, thinking }: ThinkingDrawerProps) {
  const t = TRANSLATIONS[lang];
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-2 overflow-hidden rounded-control border border-[#E5E7EB] bg-white">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-[12px] font-medium text-[#64748B] hover:bg-[#F8F9FA] hover:text-[#0F172A]"
      >
        <span>{t.agent.thinkingTitle}</span>
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-[#94A3B8]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[#94A3B8]" />
        )}
      </button>

      {expanded && (
        <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words border-t border-[#E5E7EB] bg-[#F8F9FA] p-3 font-mono text-[11px] leading-relaxed text-[#475569]">
          {thinking.trim()}
        </pre>
      )}
    </div>
  );
}

interface AgentActionCardProps {
  lang: AppLanguage;
  messageId: string;
  action: AgentActionPayload;
  onUpdateAction: (messageId: string, updater: (action: AgentActionPayload) => AgentActionPayload) => void;
  onDispatchAction: (messageId: string, action: AgentActionPayload) => void;
  onNavigateView: (view: WorkspaceView) => void;
  onCopyText: (text: string, label: string) => void;
}

function AgentActionCard({
  lang,
  messageId,
  action,
  onUpdateAction,
  onDispatchAction,
  onNavigateView,
  onCopyText,
}: AgentActionCardProps) {
  const t = TRANSLATIONS[lang];
  const providersMeta = getComputeProviders(lang);
  const presetsMeta = getWhisperPresets(lang);

  if (action.type === 'download') {
    return (
      <div className="rounded-panel border border-[#E5E7EB] bg-white p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0F172A]">
            <Download className="h-4 w-4 text-[#2563EB]" />
            <span>{t.agent.downloadDispatch}</span>
            <span className="rounded-inner bg-[#EFF6FF] px-2 py-0.5 font-mono text-[11px] font-medium text-[#2563EB]">
              JoelFast
            </span>
          </div>
          <span className="font-mono text-[12px] text-[#64748B] truncate max-w-[260px]">
            {action.fileName}
          </span>
        </div>

        <div className="mt-3 rounded-control bg-[#F8F9FA] px-3.5 py-2.5 font-mono text-[12px] text-[#0F172A] break-all">
          {action.cleanUrl}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => onCopyText(action.cleanUrl, t.toasts.cleanUrlLabel)}
            className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A] whitespace-nowrap"
          >
            <Copy className="h-3.5 w-3.5" />
            {t.agent.copyUrl}
          </button>

          {action.dispatchedTaskId ? (
            <button
              type="button"
              onClick={() => onNavigateView('download')}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#16A34A] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#15803D] whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5" />
              {t.agent.addedToDownload}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDispatchAction(messageId, action)}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              {t.agent.sendToDownload}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
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
            <span>{t.agent.cloudTranscribe}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[#64748B]">
            <span className="font-medium text-[#0F172A]">{action.fileName}</span>
            <span aria-hidden="true">·</span>
            <span>
              {action.needsAudioExtract ? t.agent.videoSourceHint : t.agent.audioSourceHint}
            </span>
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
                {providersMeta[provider].name} T4
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
                {presetsMeta[preset].label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
            {(
              [
                { id: 'srt', label: 'SRT' },
                { id: 'md_plain', label: t.agent.mdPlainLabel },
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
            {presetsMeta[action.preset].modelName} · {presetsMeta[action.preset].sizeLabel}
          </span>

          {action.dispatchedTaskId ? (
            <button
              type="button"
              onClick={() => onNavigateView('transcribe')}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#16A34A] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#15803D] whitespace-nowrap"
            >
              <Check className="h-3.5 w-3.5" />
              {t.agent.transcribeStarted}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDispatchAction(messageId, action)}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              {t.agent.startCloudTranscribe}
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
          <span>{t.agent.docConvert}</span>
        </div>
        <span className="text-[12px] text-[#64748B]">
          {action.fileName} · {formatBytes(action.fileSizeBytes)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium text-[#0F172A]">
            {formatLabel(action.sourceFormat, lang)}
          </span>
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
                {formatLabel(fmt, lang)}
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
            {t.agent.convertStarted}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onDispatchAction(messageId, action)}
            className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-3.5 py-1.5 text-[12px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
          >
            {t.agent.startConvert}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

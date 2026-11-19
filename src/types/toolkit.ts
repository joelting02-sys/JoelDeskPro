export type WorkspaceView = 'agent' | 'transcribe' | 'download' | 'convert' | 'settings';

export type ComputeProvider = 'colab-t4' | 'kaggle-t4';
export type ComputeStatus = 'offline' | 'starting' | 'online' | 'stopping' | 'error';
export type ColabGpuSpec = 'T4' | 'L4' | 'A100';
export type IdleShutdownMinutes = 10 | 15 | 30;
export type WhisperPresetId = 'fast' | 'balanced' | 'accurate';
export type TranscriptOutputFormat = 'srt' | 'md_plain' | 'txt';
export type TranscriptLanguage = 'auto' | 'zh' | 'en';

export interface ComputeRuntimeState {
  status: ComputeStatus;
  provider: ComputeProvider;
  gpu: ColabGpuSpec | 'T4 x2';
  model: string;
  startedAt: number | null;
  lastActivityAt: number | null;
  idleRemainingSeconds: number | null;
  orphanColabCount: number;
  colabAuthed: boolean;
  kaggleAuthed: boolean;
  errorMessage?: string | null;
}

export type MediaKind = 'audio' | 'video';

export type TranscriptionStage =
  | 'queued'
  | 'extracting_audio'
  | 'connecting_gpu'
  | 'downloading_model'
  | 'transcribing'
  | 'completed';

export interface TranscriptSegment {
  start: string;
  end: string;
  text: string;
}

export interface TranscriptionTask {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  mediaKind: MediaKind;
  needsAudioExtract: boolean;
  provider: ComputeProvider;
  preset: WhisperPresetId;
  outputFormat: TranscriptOutputFormat;
  language: TranscriptLanguage;
  stage: TranscriptionStage;
  progress: number;
  createdAt: string;
  segments: TranscriptSegment[];
  source: 'agent' | 'manual';
}

export type ThreadCount = 8 | 16 | 32 | 64;
export type DownloadStatus = 'downloading' | 'paused' | 'completed';
export type DownloadEngine = 'http_range' | 'ytdlp';
export type MediaQuality = 'best' | '1080p' | 'audio_only';
export type DownloadSource = 'agent' | 'manual' | 'chrome_extension';

export type DownloadExecutionMode =
  | 'web_range'
  | 'local_engine'
  | 'extension_bridge'
  | 'demo';

export interface ChromeExtensionPayload {
  url: string;
  fileName?: string;
  referer?: string;
  userAgent?: string;
  hasCookies?: boolean;
  tabTitle?: string;
  engine?: DownloadEngine;
  mediaQuality?: MediaQuality;
  threads?: ThreadCount;
  handledByLocal?: boolean;
}

export interface DownloadTask {
  id: string;
  rawInput: string;
  cleanUrl: string;
  fileName: string;
  saveDir: string;
  engine: DownloadEngine;
  threads: ThreadCount;
  mediaQuality?: MediaQuality;
  chunks: number[];
  totalMB: number;
  downloadedMB: number;
  speedMBps: number;
  status: DownloadStatus;
  createdAt: string;
  source: DownloadSource;
  referer?: string;
  userAgent?: string;
  hasCookies?: boolean;
  executionMode?: DownloadExecutionMode;
  savedLocationLabel?: string;
}

export type DocumentFormat =
  | 'pdf'
  | 'docx'
  | 'md'
  | 'png'
  | 'txt'
  | 'mp4'
  | 'mkv'
  | 'mov'
  | 'webm'
  | 'gif'
  | 'mp3'
  | 'wav'
  | 'm4a'
  | 'flac'
  | 'ogg';
export type ConversionStatus = 'ready' | 'converting' | 'completed';

export interface ConversionTask {
  id: string;
  fileName: string;
  fileSizeBytes: number;
  sourceFormat: DocumentFormat;
  targetFormat: DocumentFormat;
  progress: number;
  status: ConversionStatus;
  createdAt: string;
  source: 'agent' | 'manual';
}

export interface AttachedFileItem {
  id: string;
  name: string;
  size: number;
  category: 'audio' | 'video' | 'document' | 'other';
  extension: string;
}

export type AgentActionPayload =
  | {
      type: 'download';
      rawInput: string;
      cleanUrl: string;
      fileName: string;
      engine: DownloadEngine;
      threads: ThreadCount;
      mediaQuality?: MediaQuality;
      dispatchedTaskId?: string;
    }
  | {
      type: 'transcribe';
      fileName: string;
      fileSizeBytes: number;
      mediaKind: MediaKind;
      needsAudioExtract: boolean;
      provider: ComputeProvider;
      preset: WhisperPresetId;
      outputFormat: TranscriptOutputFormat;
      language: TranscriptLanguage;
      dispatchedTaskId?: string;
    }
  | {
      type: 'convert';
      fileName: string;
      fileSizeBytes: number;
      sourceFormat: DocumentFormat;
      targetFormat: DocumentFormat;
      dispatchedTaskId?: string;
    };

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments?: AttachedFileItem[];
  action?: AgentActionPayload;
  timestamp: string;
}

export interface EndpointConfig {
  llmBaseUrl: string;
  llmModel: string;
  llmApiKeyConfigured: boolean;
  runtimeMode: 'mock' | 'custom_endpoint';
  colabBridgeUrl: string;
  kaggleBridgeUrl: string;
  colabGpuSpec: ColabGpuSpec;
  autoShutdownEnabled: boolean;
  autoShutdownMinutes: IdleShutdownMinutes;
  ffmpegAutoExtract: boolean;
  downloaderRpcUrl: string;
  ytdlpPath: string;
  defaultThreads: ThreadCount;
  defaultSaveDir: string;
  chromeBridgeEnabled: boolean;
  chromeBridgePort: number;
  chromeBridgeToken: string;
  chromeBridgeAutoStart: boolean;
  clipboardSniffEnabled: boolean;
  converterApiUrl: string;
  githubRepo: string;
  githubBranch: string;
  autoCheckUpdate: boolean;
}

export interface ToastNotice {
  id: string;
  message: string;
  tone?: 'neutral' | 'success' | 'warning';
}

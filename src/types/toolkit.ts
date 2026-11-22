export type WorkspaceView = 'agent' | 'transcribe' | 'download' | 'convert' | 'settings';

export type ComputeProvider = 'colab-t4' | 'kaggle-t4';
export type WhisperPresetId = 'fast' | 'balanced' | 'accurate';
export type TranscriptOutputFormat = 'srt' | 'md_plain' | 'txt';
export type TranscriptLanguage = 'auto' | 'zh' | 'en';
export type MediaKind = 'audio' | 'video';

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
  rawFile?: File;
  localPath?: string;
}

export type CliAgentProvider = 'claude' | 'codex' | 'dsh';
export type AgentBackendMode = CliAgentProvider | 'custom_endpoint';
export type AgentPermissionMode = 'turbo' | 'normal';

export interface AgentToolStep {
  id: string;
  name: string;
  input?: string;
  output?: string;
  status: 'running' | 'done' | 'error';
}

export interface AgentProviderConfig {
  cliPath: string;
  model: string;
  envVars: string;
}

export interface AgentSettings {
  activeProvider: AgentBackendMode;
  permissionMode: AgentPermissionMode;
  workspaceDir: string;
  sharedEnv: string;
  systemPrompt: string;
  providers: Record<CliAgentProvider, AgentProviderConfig>;
}

export type AgentCliProbe = Record<
  CliAgentProvider,
  { installed: boolean; resolvedPath: string }
>;

export interface AgentRunnerStatus {
  supported: boolean;
  settings: AgentSettings;
  probes: AgentCliProbe;
  activeRunId: string | null;
}

export type AgentActionPayload =
  | {
      type: 'download';
      rawInput: string;
      cleanUrl: string;
      fileName: string;
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
      rawFile?: File;
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
  provider?: AgentBackendMode;
  model?: string;
  thinking?: string;
  toolSteps?: AgentToolStep[];
  isStreaming?: boolean;
  error?: string;
}

export interface EndpointConfig {
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  llmSystemPrompt: string;
  llmApiKeyConfigured: boolean;
  runtimeMode: 'mock' | 'custom_endpoint';
  whisperProjectDir: string;
  whisperPort: number;
  whisperAutoStart: boolean;
  whisperCloseOnExit: boolean;
  chromeBridgePort: number;
  chromeBridgeToken: string;
  tdmExePath: string;
  tdmAutoLaunch: boolean;
  tdmCloseOnExit: boolean;
  tdmHideOnDrag: boolean;
  tdmCapturePort: number;
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

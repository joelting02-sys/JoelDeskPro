export interface WhisperSettings {
  whisper_project_dir: string;
  whisper_python_path: string;
  whisper_port: number;
  whisper_auto_start: boolean;
  whisper_close_on_exit: boolean;
}

export interface WhisperStatus {
  supported: boolean;
  running: boolean;
  starting: boolean;
  managedByUs: boolean;
  port: number;
  url: string;
  projectDir: string;
  projectExists: boolean;
  pythonPath: string;
  lastError: string;
  computeStatus: string;
  computeProvider: string;
  computeGpu: string;
  pendingTasks: number;
  settings?: WhisperSettings;
}

export interface WhisperEvent {
  event:
    | 'whisper-state'
    | 'whisper-starting'
    | 'whisper-started'
    | 'whisper-stopped'
    | 'whisper-exited'
    | 'whisper-error';
  status?: WhisperStatus;
}

export interface WhisperDesktopApi {
  getStatus: () => Promise<WhisperStatus>;
  start: () => Promise<{ ok: boolean; needsDir?: boolean; error?: string; status?: WhisperStatus }>;
  stop: () => Promise<{ ok: boolean; status?: WhisperStatus }>;
  restart: () => Promise<{ ok: boolean; needsDir?: boolean; error?: string; status?: WhisperStatus }>;
  pickDir: () => Promise<{
    ok: boolean;
    canceled?: boolean;
    projectDir?: string;
    error?: string;
    status?: WhisperStatus;
  }>;
  saveSettings: (patch: Partial<WhisperSettings>) => Promise<{ ok: boolean; status?: WhisperStatus }>;
  saveTranscript: (
    itemId: string,
    fmt: 'txt' | 'srt'
  ) => Promise<{ ok: boolean; cancelled?: boolean; path?: string; error?: string }>;
  saveKaggleNotebook: () => Promise<{
    ok: boolean;
    cancelled?: boolean;
    path?: string;
    error?: string;
  }>;
  copyText: (text: string) => Promise<{ ok: boolean; error?: string }>;
  openStandalone: () => Promise<{ ok: boolean; mode?: string; error?: string }>;
  openOutputs: () => Promise<{ ok: boolean; path?: string; error?: string }>;
  onEvent: (listener: (event: WhisperEvent) => void) => () => void;
}

declare global {
  interface JoelDesktopApi {
    whisper?: WhisperDesktopApi;
  }
}

export const INITIAL_WHISPER_STATUS: WhisperStatus = {
  supported: false,
  running: false,
  starting: false,
  managedByUs: false,
  port: 8788,
  url: 'http://127.0.0.1:8788',
  projectDir: '',
  projectExists: false,
  pythonPath: '',
  lastError: '',
  computeStatus: 'offline',
  computeProvider: 'colab',
  computeGpu: '',
  pendingTasks: 0,
};

export function isDesktopWhisperSupported(): boolean {
  return Boolean(typeof window !== 'undefined' && window.joelDesktop?.isDesktop && window.joelDesktop?.whisper);
}

export async function dispatchFileToWhisper(
  port: number,
  file: File,
  options: {
    provider?: 'colab' | 'kaggle';
    model?: string;
    language?: string;
  } = {}
): Promise<{ ok: boolean; error?: string }> {
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    const patch: Record<string, string> = {};
    if (options.provider) patch.provider = options.provider;
    if (options.model) patch.whisper_model = options.model;
    if (options.language) patch.language = options.language;
    if (Object.keys(patch).length > 0) {
      await fetch(`${baseUrl}/api/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    }

    const fd = new FormData();
    fd.append('file', file);
    fd.append('language', options.language || 'auto');

    const res = await fetch(`${baseUrl}/api/transcribe`, {
      method: 'POST',
      body: fd,
    });
    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const data = (await res.json()) as { detail?: string; error?: string };
        detail = data.detail || data.error || detail;
      } catch {}
      return { ok: false, error: detail };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : '无法连接 Cloud Whisper Studio 服务',
    };
  }
}

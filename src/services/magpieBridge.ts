import { MagpieSettings, MagpieStatus } from '../types/toolkit';

export interface MagpieStreamEvent {
  type: 'status' | 'text-delta' | 'thinking-delta' | 'done';
  runId?: string;
  text?: string;
  status?: MagpieStatus;
  ok?: boolean;
  aborted?: boolean;
  error?: string;
}

export interface MagpieDesktopApi {
  getStatus: (forceRefresh?: boolean) => Promise<MagpieStatus>;
  saveSettings: (
    patch: Partial<MagpieSettings>
  ) => Promise<{ ok: boolean; status?: MagpieStatus; error?: string }>;
  send: (payload: {
    runId: string;
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    model?: string;
    systemPrompt?: string;
  }) => Promise<{ ok: boolean; runId?: string; model?: string; error?: string }>;
  stop: (runId?: string) => Promise<{ ok: boolean }>;
  onEvent: (listener: (event: MagpieStreamEvent) => void) => () => void;
}

declare global {
  interface JoelDesktopApi {
    magpie?: MagpieDesktopApi;
  }
}

export const INITIAL_MAGPIE_STATUS: MagpieStatus = {
  supported: false,
  online: false,
  models: [],
  settings: {
    mode: 'magpie',
    baseUrl: 'http://127.0.0.1:3425',
    apiKey: 'magpie',
    model: '',
    systemPrompt: '',
  },
};

export function isDesktopMagpieSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.joelDesktop?.isDesktop &&
      window.joelDesktop?.magpie
  );
}

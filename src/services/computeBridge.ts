import {
  ColabGpuSpec,
  ComputeProvider,
  ComputeRuntimeState,
  ComputeStatus,
  IdleShutdownMinutes,
} from '../types/toolkit';

export const COLAB_BROWSER_URL = 'https://colab.research.google.com/';
export const KAGGLE_BROWSER_URL = 'https://www.kaggle.com/account/login';

export const INITIAL_COMPUTE_STATE: ComputeRuntimeState = {
  status: 'offline',
  provider: 'colab-t4',
  gpu: 'T4',
  model: 'faster-whisper-medium',
  startedAt: null,
  lastActivityAt: null,
  idleRemainingSeconds: null,
  orphanColabCount: 0,
  colabAuthed: false,
  kaggleAuthed: false,
  errorMessage: null,
};

interface RawBackendComputeState {
  compute?: {
    status?: string;
    provider?: string;
    gpu?: string;
    model?: string;
    started_at?: number | null;
    last_activity_at?: number | null;
    idle_remaining_seconds?: number | null;
    orphan_colab_count?: number;
    colab_authed?: boolean;
    kaggle_authed?: boolean;
    error?: string | null;
  };
  settings?: {
    auto_shutdown_enabled?: boolean;
    auto_shutdown_minutes?: number;
  };
}

function normalizeStatus(raw?: string): ComputeStatus {
  if (
    raw === 'offline' ||
    raw === 'starting' ||
    raw === 'online' ||
    raw === 'stopping' ||
    raw === 'error'
  ) {
    return raw;
  }
  return 'offline';
}

function normalizeProvider(raw?: string): ComputeProvider {
  if (raw === 'kaggle' || raw === 'kaggle-t4') return 'kaggle-t4';
  return 'colab-t4';
}

function normalizeGpu(raw?: string, provider: ComputeProvider = 'colab-t4'): ColabGpuSpec | 'T4 x2' {
  if (provider === 'kaggle-t4') return 'T4 x2';
  if (raw === 'L4' || raw === 'A100' || raw === 'T4') return raw;
  return 'T4';
}

function mapSnapshot(data: RawBackendComputeState): {
  compute: ComputeRuntimeState;
  settings?: { autoShutdownEnabled?: boolean; autoShutdownMinutes?: IdleShutdownMinutes };
} {
  const c = data.compute || {};
  const provider = normalizeProvider(c.provider);
  const minutesRaw = data.settings?.auto_shutdown_minutes;
  const validMinutes: IdleShutdownMinutes | undefined =
    minutesRaw === 10 || minutesRaw === 15 || minutesRaw === 30 ? minutesRaw : undefined;

  return {
    compute: {
      status: normalizeStatus(c.status),
      provider,
      gpu: normalizeGpu(c.gpu, provider),
      model: c.model || 'faster-whisper-medium',
      startedAt: typeof c.started_at === 'number' ? c.started_at : null,
      lastActivityAt: typeof c.last_activity_at === 'number' ? c.last_activity_at : null,
      idleRemainingSeconds:
        typeof c.idle_remaining_seconds === 'number' ? c.idle_remaining_seconds : null,
      orphanColabCount: Number(c.orphan_colab_count || 0),
      colabAuthed: Boolean(c.colab_authed),
      kaggleAuthed: Boolean(c.kaggle_authed),
      errorMessage: c.error || null,
    },
    settings: data.settings
      ? {
          autoShutdownEnabled:
            typeof data.settings.auto_shutdown_enabled === 'boolean'
              ? data.settings.auto_shutdown_enabled
              : undefined,
          autoShutdownMinutes: validMinutes,
        }
      : undefined,
  };
}

/**
 * Opens an external URL in a new browser tab using an anchor click (avoids window.open).
 */
export function openExternalTab(url: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function getComputeBrowserAuthUrl(
  provider: ComputeProvider,
  localEngineOnline: boolean,
  port: number
): string {
  if (localEngineOnline) {
    const slug = provider === 'kaggle-t4' ? 'kaggle' : 'colab';
    return `http://127.0.0.1:${port}/api/compute/auth/${slug}`;
  }
  return provider === 'kaggle-t4' ? KAGGLE_BROWSER_URL : COLAB_BROWSER_URL;
}

export async function fetchLocalComputeState(port: number) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1600);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/state`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RawBackendComputeState;
    return mapSnapshot(data);
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function startLocalCompute(
  port: number,
  token: string,
  params: { provider: ComputeProvider; gpu: ColabGpuSpec | 'T4 x2'; model: string }
) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/compute/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DeskKit-Token': token,
      },
      body: JSON.stringify({
        provider: params.provider === 'kaggle-t4' ? 'kaggle' : 'colab',
        gpu: params.gpu,
        model: params.model,
      }),
    });
    const data = (await res.json()) as RawBackendComputeState & {
      needs_auth?: boolean;
      auth_url?: string;
      error?: string;
    };
    return {
      ok: res.ok,
      needsAuth: Boolean(data.needs_auth),
      authUrl: data.auth_url,
      error: data.error,
      snapshot: data.compute ? mapSnapshot(data) : null,
    };
  } catch {
    return { ok: false, needsAuth: false, authUrl: undefined, error: undefined, snapshot: null };
  }
}

export async function stopLocalCompute(port: number, token: string) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/compute/stop`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DeskKit-Token': token,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RawBackendComputeState;
    return mapSnapshot(data);
  } catch {
    return null;
  }
}

export async function refreshLocalCompute(port: number, token: string) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/compute/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DeskKit-Token': token,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RawBackendComputeState;
    return mapSnapshot(data);
  } catch {
    return null;
  }
}

export async function syncLocalComputeSettings(
  port: number,
  token: string,
  settings: {
    auto_shutdown_enabled?: boolean;
    auto_shutdown_minutes?: IdleShutdownMinutes;
  }
) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DeskKit-Token': token,
      },
      body: JSON.stringify(settings),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as RawBackendComputeState;
    return mapSnapshot(data);
  } catch {
    return null;
  }
}

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

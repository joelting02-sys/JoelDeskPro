// Desktop Client Local Engine (127.0.0.1) Bridge for Joel Desk Pro.
// Handles multi-chunk Range downloads, Chrome default download folder sync, and native folder selection.

export interface LocalEngineTaskSnapshot {
  id: string;
  url: string;
  fileName: string;
  saveDir: string;
  engine?: 'http_range' | 'ytdlp';
  source?: 'manual' | 'chrome_extension';
  hasCookies?: boolean;
  threads: number;
  totalBytes: number;
  downloadedBytes: number;
  speedMBps?: number;
  chunks: number[];
  status: 'downloading' | 'paused' | 'completed' | 'error';
  error?: string;
}

export interface LocalEngineStatus {
  online: boolean;
  desktop?: boolean;
  saveDir?: string;
  chromeDefaultDir?: string;
  customSaveDir?: string;
  tasks?: LocalEngineTaskSnapshot[];
}

export function sanitizeDownloadFileName(name: string): string {
  const cleaned = (name || 'download.bin').replace(/[\\/:*?"<>|]+/g, '_').trim();
  return cleaned || 'download.bin';
}

export function getChunkCountForThreads(threads: number): number {
  if (threads >= 64) return 16;
  if (threads >= 32) return 12;
  return 8;
}

/**
 * Probes the Joel Desk Pro Desktop Client local engine on 127.0.0.1:<port>
 * and returns the active Chrome default download folder + live tasks.
 */
export async function probeLocalEngine(port: number): Promise<LocalEngineStatus> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1100);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return { online: false };
    const data = (await res.json()) as {
      ok?: boolean;
      desktop?: boolean;
      saveDir?: string;
      chromeDefaultDir?: string;
      customSaveDir?: string;
      tasks?: LocalEngineTaskSnapshot[];
    };
    return {
      online: Boolean(data?.ok),
      desktop: Boolean(data?.desktop),
      saveDir: data?.saveDir,
      chromeDefaultDir: data?.chromeDefaultDir,
      customSaveDir: data?.customSaveDir,
      tasks: Array.isArray(data?.tasks) ? data.tasks : [],
    };
  } catch {
    return { online: false };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Dispatches a download task directly to the Joel Desk Pro Desktop Client engine.
 */
export async function dispatchToLocalEngine(
  port: number,
  token: string,
  payload: {
    url: string;
    fileName: string;
    saveDir?: string;
    threads: number;
    referer?: string;
    kind?: string;
  }
): Promise<{ ok: boolean; task?: LocalEngineTaskSnapshot }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/download`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-DeskKit-Token': token,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as { ok?: boolean; tasks?: LocalEngineTaskSnapshot[] };
    return { ok: Boolean(data?.ok), task: data?.tasks?.[0] };
  } catch {
    return { ok: false };
  }
}

/**
 * Opens the native Windows/macOS folder picker via the Desktop Client engine.
 */
export async function pickDesktopFolder(
  port: number
): Promise<{ ok: boolean; dir?: string; canceled?: boolean; unsupported?: boolean }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/folder/pick`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as {
      ok: boolean;
      dir?: string;
      canceled?: boolean;
      unsupported?: boolean;
    };
  } catch {
    return { ok: false, unsupported: true };
  }
}

/**
 * Sets or clears (empty string = Chrome Default Downloads) the custom save directory on the Desktop Client engine.
 */
export async function setDesktopSaveDir(
  port: number,
  dir: string
): Promise<{ ok: boolean; saveDir?: string; chromeDefaultDir?: string }> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/folder/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dir }),
    });
    if (!res.ok) return { ok: false };
    return (await res.json()) as { ok: boolean; saveDir?: string; chromeDefaultDir?: string };
  } catch {
    return { ok: false };
  }
}

/**
 * Deletes a task from the Desktop Client engine's in-memory task list.
 */
export async function deleteLocalEngineTask(port: number, id: string): Promise<void> {
  try {
    await fetch(`http://127.0.0.1:${port}/api/tasks/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch {
    // Ignore when engine is offline
  }
}

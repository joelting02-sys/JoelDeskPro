// Browser-native multi-chunk HTTP Range downloader + FileSystemDirectoryHandle writer
// + optional Local Desktop Engine (127.0.0.1) bridge + Chrome Extension CORS fallback.

import { triggerClientBlobDownload } from './toolkitAdapter';

export interface DirectoryHandleLike {
  name: string;
  getFileHandle: (
    name: string,
    options?: { create?: boolean }
  ) => Promise<{
    createWritable: () => Promise<{
      write: (data: BlobPart | { type: 'write'; position: number; data: Uint8Array }) => Promise<void>;
      close: () => Promise<void>;
      abort?: () => Promise<void>;
    }>;
  }>;
}

export interface LocalEngineStatus {
  online: boolean;
  saveDir?: string;
}

export interface WebDownloadCallbacks {
  onProgress: (update: {
    chunks: number[];
    downloadedMB: number;
    totalMB: number;
    speedMBps: number;
  }) => void;
  onComplete: (result: {
    savedVia: 'directory_handle' | 'browser_download' | 'extension_download';
    totalMB: number;
  }) => void;
  onFallback: (reason: 'cors_blocked' | 'video_platform_needs_local' | 'network_error') => void;
}

const DEMO_HOST_MARKERS = ['example.com', 'deskkit4kdemo', '7482910482910'];

export function isDemoPlaceholderUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return DEMO_HOST_MARKERS.some((marker) => lower.includes(marker));
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
 * Probes whether the optional local DeskKit Node engine is listening on 127.0.0.1:<port>.
 */
export async function probeLocalEngine(port: number): Promise<LocalEngineStatus> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 900);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return { online: false };
    const data = (await res.json()) as { ok?: boolean; saveDir?: string };
    return { online: Boolean(data?.ok), saveDir: data?.saveDir };
  } catch {
    return { online: false };
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Dispatches a download task to the optional local Node multi-chunk engine.
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
): Promise<{ ok: boolean; localTaskId?: string }> {
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
    const data = (await res.json()) as { ok?: boolean; tasks?: Array<{ id?: string }> };
    return { ok: Boolean(data?.ok), localTaskId: data?.tasks?.[0]?.id };
  } catch {
    return { ok: false };
  }
}

interface RangeProbeResult {
  supportsRange: boolean;
  totalBytes: number;
}

async function probeUrlRange(url: string, signal?: AbortSignal): Promise<RangeProbeResult> {
  // Prefer bytes=0-0 probe because many CDNs return Content-Range even if HEAD hides Content-Length
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
      mode: 'cors',
      signal,
    });
    if (res.status === 206) {
      const contentRange = res.headers.get('content-range') || '';
      const match = /\/(\d+)$/.exec(contentRange);
      const totalBytes = match ? Number(match[1]) : 0;
      // Drain tiny 1-byte body to release socket cleanly
      await res.arrayBuffer().catch(() => undefined);
      if (totalBytes > 0) {
        return { supportsRange: true, totalBytes };
      }
    }
    const len = Number(res.headers.get('content-length') || 0);
    if (res.body?.cancel) {
      await res.body.cancel().catch(() => undefined);
    }
    return { supportsRange: false, totalBytes: Number.isFinite(len) ? len : 0 };
  } catch {
    // Retry a plain HEAD probe before declaring CORS/network failure
    const head = await fetch(url, { method: 'HEAD', mode: 'cors', signal });
    if (!head.ok) throw new Error(`HTTP ${head.status}`);
    const len = Number(head.headers.get('content-length') || 0);
    const acceptRanges = (head.headers.get('accept-ranges') || '').toLowerCase();
    return {
      supportsRange: acceptRanges === 'bytes' && len > 0,
      totalBytes: Number.isFinite(len) ? len : 0,
    };
  }
}

/**
 * Triggers a real browser download via our Chrome Extension (bypasses CORS and keeps cookies/Referer).
 */
export function requestExtensionDirectDownload(params: {
  url: string;
  fileName: string;
  referer?: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const requestId = `dk-ext-dl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let settled = false;

    const cleanup = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMsg);
      window.clearTimeout(timer);
      resolve(ok);
    };

    const onMsg = (ev: MessageEvent) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === 'DESKKIT_EXT_DIRECT_DOWNLOAD_ACK' && ev.data.requestId === requestId) {
        cleanup(Boolean(ev.data.ok));
      }
    };

    const timer = window.setTimeout(() => cleanup(false), 2200);
    window.addEventListener('message', onMsg);
    window.postMessage(
      {
        type: 'DESKKIT_EXT_DIRECT_DOWNLOAD',
        requestId,
        url: params.url,
        fileName: sanitizeDownloadFileName(params.fileName),
        referer: params.referer || '',
      },
      '*'
    );
  });
}

/**
 * Executes a REAL multi-chunk HTTP Range download directly in the browser (no local software required!).
 * - When `dirHandle` is available (user picked a folder via showDirectoryPicker), writes chunks directly
 *   at exact byte offsets into that folder on disk.
 * - Otherwise assembles the downloaded chunks into a Blob and triggers a real browser file save.
 * - If direct browser fetch is blocked by CORS and the Chrome extension is connected, seamlessly hands off
 *   to the extension's CORS-free `chrome.downloads.download` API.
 */
export async function runWebMultiChunkDownload(params: {
  url: string;
  fileName: string;
  threads: number;
  dirHandle: DirectoryHandleLike | null;
  chromeConnected: boolean;
  referer?: string;
  signal?: AbortSignal;
  callbacks: WebDownloadCallbacks;
}): Promise<void> {
  const { url, threads, dirHandle, chromeConnected, referer, signal, callbacks } = params;
  const safeName = sanitizeDownloadFileName(params.fileName);
  const chunkCount = getChunkCountForThreads(threads);

  let probe: RangeProbeResult;
  try {
    probe = await probeUrlRange(url, signal);
  } catch {
    // Direct fetch blocked by CORS or network — try Chrome Extension direct download bridge if connected
    if (chromeConnected) {
      const handedOff = await requestExtensionDirectDownload({ url, fileName: safeName, referer });
      if (handedOff) {
        callbacks.onProgress({
          chunks: Array.from({ length: chunkCount }, () => 100),
          downloadedMB: 0,
          totalMB: 0,
          speedMBps: 0,
        });
        callbacks.onComplete({ savedVia: 'extension_download', totalMB: 0 });
        return;
      }
    }
    callbacks.onFallback('cors_blocked');
    return;
  }

  const startedAt = performance.now();
  const minRangeBytes = 512 * 1024; // Use multi-chunk Range when >= 512 KB

  // Path 1: Real parallel HTTP Range multi-chunk download
  if (probe.supportsRange && probe.totalBytes >= minRangeBytes) {
    const totalBytes = probe.totalBytes;
    const totalMB = Number((totalBytes / (1024 * 1024)).toFixed(2));
    const chunkSize = Math.ceil(totalBytes / chunkCount);
    const chunkProgress = Array.from({ length: chunkCount }, () => 0);
    const chunkBuffers: Array<Uint8Array | null> = Array.from({ length: chunkCount }, () => null);
    let totalDownloaded = 0;
    let lastEmit = 0;

    // Optional direct-to-disk writable stream into the user's selected local folder
    let writable: Awaited<
      ReturnType<Awaited<ReturnType<DirectoryHandleLike['getFileHandle']>>['createWritable']>
    > | null = null;
    let writeQueue = Promise.resolve();

    if (dirHandle) {
      try {
        const fileHandle = await dirHandle.getFileHandle(safeName, { create: true });
        writable = await fileHandle.createWritable();
      } catch {
        writable = null;
      }
    }

    const emitProgress = (force = false) => {
      const now = performance.now();
      if (!force && now - lastEmit < 180) return;
      lastEmit = now;
      const elapsedSec = Math.max(0.15, (now - startedAt) / 1000);
      const downloadedMB = Number((totalDownloaded / (1024 * 1024)).toFixed(2));
      const speedMBps = Number((downloadedMB / elapsedSec).toFixed(1));
      callbacks.onProgress({
        chunks: [...chunkProgress],
        downloadedMB,
        totalMB,
        speedMBps,
      });
    };

    try {
      // Concurrency pool (max 6-8 simultaneous Range connections per origin so browsers stay blazing fast)
      const maxConcurrent = Math.min(chunkCount, threads >= 32 ? 8 : 6);
      let nextChunkIndex = 0;

      const worker = async () => {
        while (nextChunkIndex < chunkCount) {
          const idx = nextChunkIndex++;
          const start = idx * chunkSize;
          const end = Math.min(totalBytes - 1, start + chunkSize - 1);
          const expected = end - start + 1;

          const res = await fetch(url, {
            method: 'GET',
            headers: { Range: `bytes=${start}-${end}` },
            mode: 'cors',
            signal,
          });
          if (!res.ok) throw new Error(`Chunk ${idx} HTTP ${res.status}`);

          if (res.body) {
            const reader = res.body.getReader();
            const parts: Uint8Array[] = [];
            let writtenInChunk = 0;

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              if (!value) continue;

              if (writable) {
                const writePos = start + writtenInChunk;
                const copy = value;
                writeQueue = writeQueue.then(() =>
                  writable!.write({ type: 'write', position: writePos, data: copy })
                );
              } else {
                parts.push(value);
              }

              writtenInChunk += value.byteLength;
              totalDownloaded += value.byteLength;
              chunkProgress[idx] = Math.min(100, Math.round((writtenInChunk / expected) * 100));
              emitProgress();
            }

            if (!writable) {
              const merged = new Uint8Array(writtenInChunk);
              let off = 0;
              for (const p of parts) {
                merged.set(p, off);
                off += p.byteLength;
              }
              chunkBuffers[idx] = merged;
            }
          } else {
            const arr = new Uint8Array(await res.arrayBuffer());
            if (writable) {
              writeQueue = writeQueue.then(() =>
                writable!.write({ type: 'write', position: start, data: arr })
              );
            } else {
              chunkBuffers[idx] = arr;
            }
            totalDownloaded += arr.byteLength;
          }

          chunkProgress[idx] = 100;
          emitProgress();
        }
      };

      await Promise.all(Array.from({ length: maxConcurrent }, () => worker()));
      await writeQueue;

      if (writable) {
        await writable.close();
        emitProgress(true);
        callbacks.onComplete({ savedVia: 'directory_handle', totalMB });
      } else {
        const blob = new Blob(
          chunkBuffers.filter((b): b is Uint8Array => b !== null) as BlobPart[]
        );
        emitProgress(true);
        triggerClientBlobDownload(safeName, blob);
        callbacks.onComplete({ savedVia: 'browser_download', totalMB });
      }
      return;
    } catch {
      if (writable?.abort) {
        await writable.abort().catch(() => undefined);
      }
      callbacks.onFallback('network_error');
      return;
    }
  }

  // Path 2: Single-stream real browser fetch when server doesn't expose Content-Range
  try {
    const res = await fetch(url, { method: 'GET', mode: 'cors', signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const contentLen = Number(res.headers.get('content-length') || probe.totalBytes || 0);
    const parts: Uint8Array[] = [];
    let downloaded = 0;
    let lastEmit = 0;

    let writable: Awaited<
      ReturnType<Awaited<ReturnType<DirectoryHandleLike['getFileHandle']>>['createWritable']>
    > | null = null;
    if (dirHandle) {
      try {
        const fileHandle = await dirHandle.getFileHandle(safeName, { create: true });
        writable = await fileHandle.createWritable();
      } catch {
        writable = null;
      }
    }

    if (res.body) {
      const reader = res.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        if (writable) {
          await writable.write({ type: 'write', position: downloaded, data: value });
        } else {
          parts.push(value);
        }
        downloaded += value.byteLength;
        const now = performance.now();
        if (now - lastEmit >= 180) {
          lastEmit = now;
          const pct = contentLen > 0 ? Math.min(99, Math.round((downloaded / contentLen) * 100)) : 50;
          const elapsedSec = Math.max(0.15, (now - startedAt) / 1000);
          const downloadedMB = Number((downloaded / (1024 * 1024)).toFixed(2));
          const totalMB = contentLen > 0 ? Number((contentLen / (1024 * 1024)).toFixed(2)) : Math.max(downloadedMB, 1);
          callbacks.onProgress({
            chunks: Array.from({ length: chunkCount }, () => pct),
            downloadedMB,
            totalMB,
            speedMBps: Number((downloadedMB / elapsedSec).toFixed(1)),
          });
        }
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      downloaded = buf.byteLength;
      if (writable) {
        await writable.write({ type: 'write', position: 0, data: buf });
      } else {
        parts.push(buf);
      }
    }

    const finalMB = Number((downloaded / (1024 * 1024)).toFixed(2));
    callbacks.onProgress({
      chunks: Array.from({ length: chunkCount }, () => 100),
      downloadedMB: finalMB,
      totalMB: finalMB,
      speedMBps: 0,
    });

    if (writable) {
      await writable.close();
      callbacks.onComplete({ savedVia: 'directory_handle', totalMB: finalMB });
    } else {
      triggerClientBlobDownload(safeName, new Blob(parts as BlobPart[]));
      callbacks.onComplete({ savedVia: 'browser_download', totalMB: finalMB });
    }
  } catch {
    if (chromeConnected) {
      const handedOff = await requestExtensionDirectDownload({ url, fileName: safeName, referer });
      if (handedOff) {
        callbacks.onComplete({ savedVia: 'extension_download', totalMB: 0 });
        return;
      }
    }
    callbacks.onFallback('network_error');
  }
}

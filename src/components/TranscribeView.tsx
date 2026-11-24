import { RefObject, useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioWaveform,
  ExternalLink,
  FolderOpen,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';
import { WhisperStatus } from '../services/whisperBridge';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface TranscribeViewProps {
  lang: AppLanguage;
  whisperStatus: WhisperStatus;
  isActive: boolean;
  reloadNonce: number;
  iframeRef: RefObject<HTMLIFrameElement | null>;
  onStart: () => void;
  onRestart: () => void;
  onPickDir: () => void;
  onOpenStandalone: () => void;
  onWhisperSnapshotSync?: (snapshot: {
    compute?: Record<string, unknown>;
    settings?: Record<string, unknown>;
  }) => void;
}

export function TranscribeView({
  lang,
  whisperStatus,
  isActive,
  reloadNonce,
  iframeRef,
  onStart,
  onRestart,
  onPickDir,
  onOpenStandalone,
  onWhisperSnapshotSync,
}: TranscribeViewProps) {
  const t = TRANSLATIONS[lang].transcribe;
  const autoTriedRef = useRef(false);
  const initialLangRef = useRef(lang);
  const langRef = useRef(lang);
  langRef.current = lang;
  const [webBackendOnline, setWebBackendOnline] = useState(false);

  const probeWebBackend = useCallback(async () => {
    try {
      const res = await fetch(`${whisperStatus.url}/api/state`);
      setWebBackendOnline(res.ok);
    } catch {
      setWebBackendOnline(false);
    }
  }, [whisperStatus.url]);

  useEffect(() => {
    if (whisperStatus.supported) return;
    probeWebBackend();
  }, [whisperStatus.supported, probeWebBackend]);

  // Auto-start when entering TranscribeView if configured and not yet started
  useEffect(() => {
    if (!isActive || !whisperStatus.supported) return;
    if (
      whisperStatus.projectExists &&
      !whisperStatus.running &&
      !whisperStatus.starting &&
      !whisperStatus.lastError &&
      whisperStatus.settings?.whisper_auto_start !== false &&
      !autoTriedRef.current
    ) {
      autoTriedRef.current = true;
      onStart();
    }
  }, [
    isActive,
    whisperStatus.supported,
    whisperStatus.projectExists,
    whisperStatus.running,
    whisperStatus.starting,
    whisperStatus.lastError,
    whisperStatus.settings?.whisper_auto_start,
    onStart,
  ]);

  // Notify embedded iframe to refresh immediately when returning to Transcribe tab
  useEffect(() => {
    if (!isActive || !whisperStatus.running) return;
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'cw-parent-cmd', cmd: 'refresh' },
        '*'
      );
    } catch {}
  }, [isActive, whisperStatus.running, iframeRef]);

  // Sync EN/ZH language live into embedded iframe without reloading it
  useEffect(() => {
    try {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'cw-parent-cmd', cmd: 'set-lang', lang },
        '*'
      );
    } catch {}
  }, [lang, whisperStatus.running, iframeRef]);

  // Handle native Desktop bridge calls & state sync from embedded Cloud Whisper Studio iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      const frameWin = iframeRef.current?.contentWindow;
      if (frameWin && event.source && event.source !== frameWin) return;

      if (data.type === 'cw-state-updated' && data.snapshot) {
        onWhisperSnapshotSync?.(
          data.snapshot as {
            compute?: Record<string, unknown>;
            settings?: Record<string, unknown>;
          }
        );
        return;
      }

      if (data.type !== 'cw-host-action') return;

      const requestId = data.requestId;
      const action = String(data.action || '');
      const payload = (data.payload || {}) as Record<string, unknown>;
      const replyTarget = (event.source as Window | null) || frameWin;

      const respond = (result: Record<string, unknown>) => {
        if (!requestId || !replyTarget) return;
        try {
          replyTarget.postMessage({ type: 'cw-host-result', requestId, result }, '*');
        } catch {}
      };

      const whisperApi = window.joelDesktop?.whisper;
      try {
        if (action === 'save_transcript') {
          if (!whisperApi) {
            respond({ ok: false, error: t.desktopBridgeUnavailable });
            return;
          }
          const fmt = payload.fmt === 'srt' ? 'srt' : 'txt';
          const res = await whisperApi.saveTranscript(String(payload.itemId || ''), fmt);
          respond(res || { ok: false });
          return;
        }
        if (action === 'save_kaggle_notebook') {
          if (!whisperApi) {
            respond({ ok: false, error: t.desktopBridgeUnavailable });
            return;
          }
          const res = await whisperApi.saveKaggleNotebook();
          respond(res || { ok: false });
          return;
        }
        if (action === 'copy_text') {
          const text = String(payload.text || '');
          if (whisperApi) {
            const res = await whisperApi.copyText(text);
            respond(res || { ok: false });
            return;
          }
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            respond({ ok: true });
            return;
          }
          respond({ ok: false });
          return;
        }
        respond({ ok: false, error: `Unknown bridge action: ${action}` });
      } catch (err) {
        respond({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [iframeRef, onWhisperSnapshotSync, t.desktopBridgeUnavailable]);

  const showEmbeddedFrame = whisperStatus.running || (!whisperStatus.supported && webBackendOnline);

  if (showEmbeddedFrame) {
    return (
      <div className="h-full w-full overflow-hidden bg-[#F8F9FA]">
        <iframe
          ref={iframeRef}
          key={`${whisperStatus.url}-${reloadNonce}`}
          src={`${whisperStatus.url}/?embedded=1&lang=${initialLangRef.current}`}
          allow="clipboard-read; clipboard-write"
          title="Cloud Whisper Studio"
          onLoad={() => {
            try {
              iframeRef.current?.contentWindow?.postMessage(
                { type: 'cw-parent-cmd', cmd: 'set-lang', lang: langRef.current },
                '*'
              );
            } catch {}
          }}
          className="block h-full w-full border-0 bg-[#F8F9FA]"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center overflow-y-auto bg-[#F8F9FA] p-6">
      {/* Web preview fallback when Cloud Whisper Studio backend is offline */}
      {!whisperStatus.supported && (
        <div className="w-full max-w-[480px] rounded-panel border border-[#E5E7EB] bg-white p-6 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-[#EFF6FF] text-[#2563EB]">
              <AudioWaveform className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[#0F172A]">{t.webOnlyTitle}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                {t.webOnlyDesc(whisperStatus.url)}
              </p>
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2.5">
            <button
              type="button"
              onClick={probeWebBackend}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              <RefreshCw className="h-4 w-4" />
              {t.retryProbeBtn}
            </button>
          </div>
        </div>
      )}

      {/* Desktop supported, project folder missing */}
      {whisperStatus.supported && !whisperStatus.projectExists && !whisperStatus.starting && (
        <div className="w-full max-w-[500px] rounded-panel border border-[#E5E7EB] bg-white p-6 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-[#EFF6FF] text-[#2563EB]">
              <AudioWaveform className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[#0F172A]">{t.missingDirTitle}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                {t.missingDirDesc}
              </p>
            </div>
          </div>

          {whisperStatus.projectDir && (
            <div className="mt-4 rounded-control border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 font-mono text-[12px] text-[#B91C1C] break-all">
              {whisperStatus.projectDir}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onPickDir}
              className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              <FolderOpen className="h-4 w-4" />
              {t.pickDirBtn}
            </button>
          </div>
        </div>
      )}

      {/* Starting backend */}
      {whisperStatus.supported && whisperStatus.starting && (
        <div className="flex flex-col items-center text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#2563EB]" />
          <p className="mt-3 text-[14px] font-medium text-[#0F172A]">{t.startingTitle}</p>
          <p className="mt-1 max-w-[380px] text-[12px] text-[#64748B]">{t.startingDesc}</p>
        </div>
      )}

      {/* Stopped or error */}
      {whisperStatus.supported && whisperStatus.projectExists && !whisperStatus.starting && (
        <div className="w-full max-w-[480px] rounded-panel border border-[#E5E7EB] bg-white p-6 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-[#EFF6FF] text-[#2563EB]">
              <AudioWaveform className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.readyTitle}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">{t.readyDesc}</p>
              {whisperStatus.lastError && (
                <p className="mt-2.5 rounded-inner border border-[#FECACA] bg-[#FEF2F2] px-2.5 py-1.5 font-mono text-[11px] text-[#B91C1C] break-all">
                  {whisperStatus.lastError}
                </p>
              )}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              <Play className="h-3.5 w-3.5 fill-current" />
              {whisperStatus.lastError ? t.retryStartBtn : t.startBtn}
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-2 text-[13px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.restartBtn}
            </button>
            <button
              type="button"
              onClick={onPickDir}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#64748B] hover:text-[#0F172A] whitespace-nowrap"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t.changeDirBtn}
            </button>
            <button
              type="button"
              onClick={onOpenStandalone}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#64748B] hover:text-[#0F172A] whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t.openStandaloneBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useRef } from 'react';
import {
  AppWindow,
  CloudDownload,
  Download,
  ExternalLink,
  FolderOpen,
  Loader2,
  Maximize2,
  Monitor,
  Play,
  RefreshCw,
} from 'lucide-react';
import { EndpointConfig } from '../types/toolkit';
import { TdmBounds, TdmStatus } from '../services/tdmBridge';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface DownloadViewProps {
  lang: AppLanguage;
  config: EndpointConfig;
  tdmStatus: TdmStatus;
  hiddenByUser: boolean;
  overlayBlocking: boolean;
  downloadingTdm: boolean;
  downloadError: string;
  onPickExe: () => void;
  onDownloadTdm: () => void;
  onAttach: (bounds?: TdmBounds) => void;
  onUpdateBounds: (bounds: TdmBounds) => void;
  onSetVisible: (visible: boolean, bounds?: TdmBounds) => void;
  onDetach: () => void;
  onRelaunch: (bounds?: TdmBounds) => void;
  onOpenSettings: () => void;
}

export function DownloadView({
  lang,
  config,
  tdmStatus,
  hiddenByUser,
  overlayBlocking,
  downloadingTdm,
  downloadError,
  onPickExe,
  onDownloadTdm,
  onAttach,
  onUpdateBounds,
  onSetVisible,
  onDetach,
  onRelaunch,
  onOpenSettings,
}: DownloadViewProps) {
  const t = TRANSLATIONS[lang].download;
  const hostRef = useRef<HTMLDivElement>(null);
  const autoTriedRef = useRef(false);

  const readRect = useCallback((): TdmBounds | undefined => {
    const el = hostRef.current;
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    if (r.width < 120 || r.height < 120) return undefined;
    return {
      x: Math.round(r.left),
      y: Math.round(r.top),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  }, []);

  // Sync visibility on mount, overlay state changes, and unmount
  useEffect(() => {
    if (!tdmStatus.supported) return;

    if (overlayBlocking) {
      if (tdmStatus.attached && tdmStatus.visible) {
        onSetVisible(false);
      }
      return;
    }

    if (tdmStatus.detached) return;
    const rect = readRect();
    if (!rect) return;

    if (tdmStatus.attached) {
      if (!hiddenByUser && !tdmStatus.visible) {
        onSetVisible(true, rect);
      }
    } else if (tdmStatus.exeExists && config.tdmAutoLaunch && !autoTriedRef.current && !hiddenByUser) {
      autoTriedRef.current = true;
      onAttach(rect);
    }
  }, [
    tdmStatus.supported,
    tdmStatus.attached,
    tdmStatus.visible,
    tdmStatus.detached,
    tdmStatus.exeExists,
    config.tdmAutoLaunch,
    overlayBlocking,
    hiddenByUser,
    readRect,
    onAttach,
    onSetVisible,
  ]);

  // Track layout geometry continuously via ResizeObserver
  useEffect(() => {
    const el = hostRef.current;
    if (!el || !tdmStatus.supported) return;

    const ro = new ResizeObserver(() => {
      if (overlayBlocking || tdmStatus.detached || !tdmStatus.attached || !tdmStatus.visible) return;
      const rect = readRect();
      if (rect) onUpdateBounds(rect);
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, [
    tdmStatus.supported,
    tdmStatus.attached,
    tdmStatus.visible,
    tdmStatus.detached,
    overlayBlocking,
    readRect,
    onUpdateBounds,
  ]);

  // Hide TDM immediately when leaving DownloadView
  useEffect(() => {
    return () => {
      if (window.joelDesktop?.isDesktop && window.joelDesktop.platform === 'win32') {
        window.joelDesktop.tdm.setVisible(false).catch(() => {});
      }
    };
  }, []);

  const isDockedAndShowing =
    tdmStatus.supported &&
    tdmStatus.attached &&
    tdmStatus.visible &&
    !tdmStatus.detached &&
    !hiddenByUser &&
    !overlayBlocking;

  return (
    <div
      ref={hostRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#F8F9FA] p-6"
    >
      {/* State 1: Web Preview / Non-Windows */}
      {!tdmStatus.supported && (
        <div className="w-full max-w-[460px] rounded-panel border border-[#E5E7EB] bg-white p-6 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-panel bg-[#EFF6FF] text-[#2563EB]">
            <Monitor className="h-5 w-5" />
          </div>
          <h2 className="text-[16px] font-semibold text-[#0F172A]">{t.webOnlyTitle}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#64748B]">{t.webOnlyDesc}</p>
        </div>
      )}

      {/* State 2: Desktop supported, TDM executable missing / unconfigured */}
      {tdmStatus.supported && !tdmStatus.exeExists && (
        <div className="w-full max-w-[480px] rounded-panel border border-[#E5E7EB] bg-white p-6 shadow-xs">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-[#EFF6FF] text-[#2563EB]">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-[16px] font-semibold text-[#0F172A]">{t.missingExeTitle}</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                {t.missingExeDesc}
              </p>
            </div>
          </div>

          {tdmStatus.exePath && (
            <div className="mt-4 rounded-control border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 font-mono text-[12px] text-[#B91C1C] break-all">
              {tdmStatus.exePath}
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onDownloadTdm}
              disabled={downloadingTdm}
              className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
            >
              {downloadingTdm ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CloudDownload className="h-4 w-4" />
              )}
              {downloadingTdm ? t.downloadTdmStatus : t.downloadTdmBtn}
            </button>
            <button
              type="button"
              onClick={onPickExe}
              className="inline-flex items-center gap-2 rounded-control border border-[#E5E7EB] bg-white px-4 py-2 text-[13px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
            >
              <FolderOpen className="h-4 w-4" />
              {t.pickExeBtn}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-2 text-[13px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
            >
              {t.openSettingsBtn}
            </button>
          </div>

          {downloadError && (
            <p className="mt-3 rounded-inner bg-[#FEF2F2] px-2.5 py-1.5 font-mono text-[11px] text-[#B91C1C]">
              {downloadError}
            </p>
          )}
        </div>
      )}

      {/* State 3: Starting / Attaching */}
      {tdmStatus.supported && tdmStatus.exeExists && tdmStatus.starting && !tdmStatus.visible && (
        <div className="flex flex-col items-center text-center">
          <Loader2 className="h-7 w-7 animate-spin text-[#2563EB]" />
          <p className="mt-3 text-[14px] font-medium text-[#0F172A]">{t.startingTitle}</p>
          <p className="mt-1 max-w-[360px] text-[12px] text-[#64748B]">{t.startingDesc}</p>
        </div>
      )}

      {/* State 4: Detached Standalone Mode */}
      {tdmStatus.supported && tdmStatus.exeExists && !tdmStatus.starting && tdmStatus.detached && (
        <div className="w-full max-w-[440px] rounded-panel border border-[#E5E7EB] bg-white p-6 text-center shadow-xs">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-panel bg-[#F1F5F9] text-[#475569]">
            <ExternalLink className="h-5 w-5" />
          </div>
          <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.detachedTitle}</h2>
          <p className="mt-1.5 text-[13px] text-[#64748B]">{t.detachedDesc}</p>
          <div className="mt-5 flex justify-center gap-2.5">
            <button
              type="button"
              onClick={() => onAttach(readRect())}
              className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              <Maximize2 className="h-4 w-4" />
              {t.reattachBtn}
            </button>
          </div>
        </div>
      )}

      {/* State 5: Not yet started OR hidden to tray by user */}
      {tdmStatus.supported &&
        tdmStatus.exeExists &&
        !tdmStatus.starting &&
        !tdmStatus.detached &&
        !isDockedAndShowing && (
          <div className="w-full max-w-[460px] rounded-panel border border-[#E5E7EB] bg-white p-6 shadow-xs">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-[#EFF6FF] text-[#2563EB]">
                <AppWindow className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-semibold text-[#0F172A]">
                  {hiddenByUser ? t.hiddenTitle : t.readyTitle}
                </h2>
                <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                  {hiddenByUser ? t.hiddenDesc : t.readyDesc}
                </p>
                {tdmStatus.lastError && (
                  <p className="mt-2 rounded-inner bg-[#FEF2F2] px-2.5 py-1.5 font-mono text-[11px] text-[#B91C1C]">
                    {tdmStatus.lastError}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onAttach(readRect())}
                className="inline-flex items-center gap-1.5 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] whitespace-nowrap"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                {hiddenByUser ? t.restoreBtn : t.launchAndDockBtn}
              </button>
              <button
                type="button"
                onClick={() => onRelaunch(readRect())}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-2 text-[13px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t.relaunchBtn}
              </button>
              <button
                type="button"
                onClick={onPickExe}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#64748B] hover:text-[#0F172A] whitespace-nowrap"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {t.changeExeBtn}
              </button>
              <button
                type="button"
                onClick={onDownloadTdm}
                disabled={downloadingTdm}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] font-medium text-[#64748B] hover:text-[#0F172A] disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap"
              >
                {downloadingTdm ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CloudDownload className="h-3.5 w-3.5" />
                )}
                {downloadingTdm ? t.downloadTdmStatus : t.downloadTdmBtn}
              </button>
            </div>

            {downloadError && (
              <p className="mt-3 rounded-inner bg-[#FEF2F2] px-2.5 py-1.5 font-mono text-[11px] text-[#B91C1C]">
                {downloadError}
              </p>
            )}
          </div>
        )}

      {/* Subtle underlay behind docked TDM window */}
      {isDockedAndShowing && (
        <div className="flex flex-col items-center gap-3 text-center select-none">
          <div className="text-[12px] text-[#94A3B8]">{t.dockedUnderlayHint}</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAttach(readRect())}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:text-[#0F172A]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.resyncBtn}
            </button>
            <button
              type="button"
              onClick={onDetach}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:text-[#0F172A]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t.detachBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

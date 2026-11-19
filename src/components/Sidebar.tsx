import {
  AudioWaveform,
  Download,
  FileOutput,
  MessageSquare,
  RefreshCw,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { WorkspaceView } from '../types/toolkit';
import { AppLanguage, TRANSLATIONS } from '../i18n';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  lang: AppLanguage;
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  activeCounts: {
    transcribe: number;
    download: number;
    convert: number;
  };
  hasUpdate: boolean;
  onOpenUpdateModal: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  lang,
  activeView,
  onSelectView,
  activeCounts,
  hasUpdate,
  onOpenUpdateModal,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const t = TRANSLATIONS[lang];

  const manualTools: Array<{
    id: WorkspaceView;
    label: string;
    icon: typeof AudioWaveform;
    count: number;
  }> = [
    {
      id: 'transcribe',
      label: t.views.transcribe,
      icon: AudioWaveform,
      count: activeCounts.transcribe,
    },
    {
      id: 'download',
      label: t.views.download,
      icon: Download,
      count: activeCounts.download,
    },
    {
      id: 'convert',
      label: t.views.convert,
      icon: FileOutput,
      count: activeCounts.convert,
    },
  ];

  const totalActiveTasks =
    activeCounts.transcribe + activeCounts.download + activeCounts.convert;

  const handleNav = (view: WorkspaceView) => {
    onSelectView(view);
    onCloseMobile();
  };

  const navContent = (
    <aside className="flex h-full w-[236px] shrink-0 flex-col border-r border-[#E5E7EB] bg-[#F3F4F6] select-none">
      {/* Brand Wordmark with White & Blue J Logo */}
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <BrandLogo size={32} className="shadow-[0_2px_8px_rgba(37,99,235,0.14)] rounded-[8px]" />
          <span className="text-[15px] font-semibold tracking-tight text-[#0F172A] whitespace-nowrap">
            Joel Desk Pro
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label={t.sidebar.closeSidebar}
          className="flex h-8 w-8 items-center justify-center rounded-control text-[#64748B] hover:bg-[#E5E7EB]/70 hover:text-[#0F172A] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Navigation: Clear Agent vs Manual Workbench Split */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label={t.sidebar.primaryNav}>
        {/* Section 1: Agent */}
        <div className="mb-5">
          <div className="mb-1.5 px-2.5 text-[11px] font-medium text-[#64748B]">
            {t.sidebar.smartDispatch}
          </div>
          <button
            type="button"
            onClick={() => handleNav('agent')}
            className={`flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[14px] font-medium transition-colors duration-150 whitespace-nowrap ${
              activeView === 'agent'
                ? 'bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-[#E5E7EB]'
                : 'text-[#475569] hover:bg-[#E5E7EB]/60 hover:text-[#0F172A]'
            }`}
          >
            <MessageSquare
              className={`h-4 w-4 shrink-0 ${
                activeView === 'agent' ? 'text-[#2563EB]' : 'text-[#64748B]'
              }`}
              strokeWidth={1.9}
            />
            <span className="truncate">{t.views.agent}</span>
          </button>
        </div>

        {/* Hairline Divider */}
        <div className="my-3 h-px bg-[#E5E7EB]" />

        {/* Section 2: Manual Workbenches */}
        <div>
          <div className="mb-1.5 px-2.5 text-[11px] font-medium text-[#64748B]">
            {t.sidebar.manualWorkbenches}
          </div>
          <div className="space-y-1">
            {manualTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeView === tool.id;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handleNav(tool.id)}
                  className={`flex w-full items-center justify-between rounded-control px-3 py-2 text-[14px] font-medium transition-colors duration-150 whitespace-nowrap ${
                    isActive
                      ? 'bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-[#E5E7EB]'
                      : 'text-[#475569] hover:bg-[#E5E7EB]/60 hover:text-[#0F172A]'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <Icon
                      className={`h-4 w-4 shrink-0 ${
                        isActive ? 'text-[#2563EB]' : 'text-[#64748B]'
                      }`}
                      strokeWidth={1.9}
                    />
                    <span className="truncate">{tool.label}</span>
                  </span>
                  {tool.count > 0 && (
                    <span className="font-mono text-[12px] font-medium text-[#2563EB] tabular-nums">
                      {tool.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Minimal Active Tasks Counter (no Global Overview label, no System Load) */}
      <div className="px-3 pb-3">
        <div className="flex items-center justify-between rounded-control border border-[#E5E7EB] bg-white px-3.5 py-2.5 text-[12px]">
          <span className="font-medium text-[#64748B]">{t.sidebar.activeTasks}</span>
          <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
            {totalActiveTasks}
          </span>
        </div>
      </div>

      {/* Bottom Utility: Update & Model/API Integration */}
      <div className="space-y-1 border-t border-[#E5E7EB] p-3">
        <button
          type="button"
          onClick={() => {
            onOpenUpdateModal();
            onCloseMobile();
          }}
          className="flex w-full items-center justify-between rounded-control px-3 py-2 text-[13px] font-medium text-[#475569] transition-colors duration-150 hover:bg-[#E5E7EB]/60 hover:text-[#0F172A] whitespace-nowrap"
        >
          <span className="flex items-center gap-2.5 truncate">
            <RefreshCw className="h-4 w-4 shrink-0 text-[#64748B]" strokeWidth={1.9} />
            <span className="truncate">{t.sidebar.checkUpdates}</span>
          </span>
          {hasUpdate && (
            <span className="text-[11px] font-semibold text-[#2563EB]">{t.sidebar.newVersion}</span>
          )}
        </button>

        <button
          type="button"
          onClick={() => handleNav('settings')}
          className={`flex w-full items-center gap-2.5 rounded-control px-3 py-2 text-[13px] font-medium transition-colors duration-150 whitespace-nowrap ${
            activeView === 'settings'
              ? 'bg-white text-[#0F172A] shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-[#E5E7EB]'
              : 'text-[#475569] hover:bg-[#E5E7EB]/60 hover:text-[#0F172A]'
          }`}
        >
          <SlidersHorizontal
            className={`h-4 w-4 shrink-0 ${
              activeView === 'settings' ? 'text-[#2563EB]' : 'text-[#64748B]'
            }`}
            strokeWidth={1.9}
          />
          <span className="truncate">{t.views.settings}</span>
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Static Sidebar */}
      <div className="hidden h-full lg:block">{navContent}</div>

      {/* Mobile Drawer Overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-[#0F172A]/25 transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative z-50 h-full">{navContent}</div>
        </div>
      )}
    </>
  );
}

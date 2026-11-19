import {
  Activity,
  AudioWaveform,
  Box,
  Download,
  FileOutput,
  MessageSquare,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { WorkspaceView } from '../types/toolkit';

interface SidebarProps {
  activeView: WorkspaceView;
  onSelectView: (view: WorkspaceView) => void;
  activeCounts: {
    transcribe: number;
    download: number;
    convert: number;
  };
  systemLoad: number;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function Sidebar({
  activeView,
  onSelectView,
  activeCounts,
  systemLoad,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const manualTools: Array<{
    id: WorkspaceView;
    label: string;
    icon: typeof AudioWaveform;
    count: number;
  }> = [
    {
      id: 'transcribe',
      label: '语音转录',
      icon: AudioWaveform,
      count: activeCounts.transcribe,
    },
    {
      id: 'download',
      label: '高速下载',
      icon: Download,
      count: activeCounts.download,
    },
    {
      id: 'convert',
      label: '格式转换',
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
      {/* Brand Wordmark */}
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-control bg-[#0F172A] text-white">
            <Box className="h-4 w-4" strokeWidth={2} />
          </div>
          <span className="text-[15px] font-semibold tracking-tight text-[#0F172A] whitespace-nowrap">
            Joel Desk Pro
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="关闭侧边栏"
          className="flex h-8 w-8 items-center justify-center rounded-control text-[#64748B] hover:bg-[#E5E7EB]/70 hover:text-[#0F172A] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Primary Navigation: Clear Agent vs Manual Workbench Split */}
      <nav className="flex-1 overflow-y-auto px-3 py-3" aria-label="主功能导航">
        {/* Section 1: Agent */}
        <div className="mb-5">
          <div className="mb-1.5 px-2.5 text-[11px] font-medium text-[#64748B]">
            智能调度
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
            <span className="truncate">AI 助手</span>
          </button>
        </div>

        {/* Hairline Divider */}
        <div className="my-3 h-px bg-[#E5E7EB]" />

        {/* Section 2: Manual Workbenches */}
        <div>
          <div className="mb-1.5 px-2.5 text-[11px] font-medium text-[#64748B]">
            手动工作台
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

      {/* Global Overview Card */}
      <div className="px-3 pb-3">
        <div className="rounded-panel border border-[#E5E7EB] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#0F172A]">全局概览</span>
            <Activity className="h-3.5 w-3.5 text-[#64748B]" />
          </div>

          <div className="mt-3 space-y-3">
            {/* Active Tasks Total */}
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-[#64748B]">活跃任务</span>
              <span className="font-mono font-semibold text-[#0F172A] tabular-nums">
                {totalActiveTasks}
                <span className="ml-1 font-sans font-normal text-[#94A3B8]">项</span>
              </span>
            </div>

            {/* System Load */}
            <div>
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-[#64748B]">系统负载</span>
                <span className="font-mono font-medium text-[#0F172A] tabular-nums">
                  {systemLoad}%
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    systemLoad >= 75
                      ? 'bg-[#D97706]'
                      : systemLoad >= 35
                        ? 'bg-[#2563EB]'
                        : 'bg-[#0F172A]'
                  }`}
                  style={{ width: `${systemLoad}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Utility: Model & API Integration */}
      <div className="border-t border-[#E5E7EB] p-3">
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
          <span className="truncate">模型与接口</span>
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

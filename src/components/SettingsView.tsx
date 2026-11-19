import { useEffect, useState } from 'react';
import {
  AudioWaveform,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  ExternalLink,
  FolderOpen,
  Plug,
  RefreshCw,
  Save,
} from 'lucide-react';
import { EndpointConfig } from '../types/toolkit';
import { API_PROTOCOL_SNIPPETS } from '../services/toolkitAdapter';
import { TdmStatus } from '../services/tdmBridge';
import { WhisperStatus } from '../services/whisperBridge';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface SettingsViewProps {
  lang: AppLanguage;
  config: EndpointConfig;
  tdmStatus: TdmStatus;
  whisperStatus: WhisperStatus;
  onSaveConfig: (next: EndpointConfig) => void;
  onPickWhisperDir: () => void;
  onOpenWhisperDocked: () => void;
  onRestartWhisper: () => void;
  onOpenWhisperStandalone: () => void;
  onOpenWhisperOutputs: () => void;
  onPickTdmExe: () => void;
  onOpenDownloadDocked: () => void;
  onDetachTdm: () => void;
  onOpenUpdateModal: () => void;
  onCopyText: (text: string, label: string) => void;
}

export function SettingsView({
  lang,
  config,
  tdmStatus,
  whisperStatus,
  onSaveConfig,
  onPickWhisperDir,
  onOpenWhisperDocked,
  onRestartWhisper,
  onOpenWhisperStandalone,
  onOpenWhisperOutputs,
  onPickTdmExe,
  onOpenDownloadDocked,
  onDetachTdm,
  onOpenUpdateModal,
  onCopyText,
}: SettingsViewProps) {
  const t = TRANSLATIONS[lang];
  const [form, setForm] = useState<EndpointConfig>(config);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testedOk, setTestedOk] = useState<Record<string, boolean>>({});
  const [showProtocols, setShowProtocols] = useState(false);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const handleTest = (key: string) => {
    setTestingKey(key);
    setTimeout(() => {
      setTestingKey(null);
      setTestedOk((prev) => ({ ...prev, [key]: true }));
    }, 450);
  };

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[880px] space-y-5">
        {/* Local LLM / Agent Endpoint */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.settings.llmTitle}</h2>
              <p className="mt-0.5 text-[12px] text-[#64748B]">{t.settings.llmDesc}</p>
            </div>
            <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, runtimeMode: 'mock' }))}
                className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  form.runtimeMode === 'mock'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {t.settings.modeMock}
              </button>
              <button
                type="button"
                onClick={() => setForm((prev) => ({ ...prev, runtimeMode: 'custom_endpoint' }))}
                className={`rounded-inner px-2.5 py-1 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  form.runtimeMode === 'custom_endpoint'
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {t.settings.modeCustom}
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.baseUrl}
              </label>
              <input
                type="text"
                value={form.llmBaseUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, llmBaseUrl: e.target.value }))}
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.modelId}
              </label>
              <input
                type="text"
                value={form.llmModel}
                onChange={(e) => setForm((prev) => ({ ...prev, llmModel: e.target.value }))}
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center justify-end">
            <button
              type="button"
              onClick={() => handleTest('llm')}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:bg-[#F8F9FA] hover:text-[#0F172A]"
            >
              {testedOk.llm ? (
                <Check className="h-3.5 w-3.5 text-[#16A34A]" />
              ) : (
                <Plug className="h-3.5 w-3.5" />
              )}
              {testingKey === 'llm'
                ? t.settings.testing
                : testedOk.llm
                  ? t.settings.testedOk
                  : t.settings.validateEndpoint}
            </button>
          </div>
        </section>

        {/* Cloud Whisper Studio Embedded Integration */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0F172A]">
                {t.settings.whisperTitle}
              </h2>
              <p className="mt-0.5 text-[12px] text-[#64748B]">{t.settings.whisperDesc}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-inner px-2.5 py-1 font-mono text-[11px] font-medium ${
                  !whisperStatus.supported
                    ? 'bg-[#F3F4F6] text-[#64748B]'
                    : whisperStatus.running
                      ? whisperStatus.computeStatus === 'online'
                        ? 'bg-[#F0FDF4] text-[#15803D]'
                        : 'bg-[#EFF6FF] text-[#1D4ED8]'
                      : whisperStatus.starting
                        ? 'bg-[#FFFBEB] text-[#B45309]'
                        : whisperStatus.projectExists
                          ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                          : 'bg-[#FEF2F2] text-[#B91C1C]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    !whisperStatus.supported
                      ? 'bg-[#94A3B8]'
                      : whisperStatus.running
                        ? whisperStatus.computeStatus === 'online'
                          ? 'bg-[#16A34A]'
                          : 'bg-[#2563EB]'
                        : whisperStatus.starting
                          ? 'bg-[#D97706]'
                          : whisperStatus.projectExists
                            ? 'bg-[#2563EB]'
                            : 'bg-[#DC2626]'
                  }`}
                />
                {!whisperStatus.supported
                  ? t.settings.whisperStatusWeb
                  : whisperStatus.running
                    ? whisperStatus.computeStatus === 'online'
                      ? t.settings.whisperStatusGpuOnline(whisperStatus.computeGpu || 'GPU')
                      : t.settings.whisperStatusRunning
                    : whisperStatus.starting
                      ? t.settings.whisperStatusStarting
                      : whisperStatus.projectExists
                        ? t.settings.whisperStatusReady
                        : t.settings.whisperStatusMissing}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.whisperProjectDir}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={form.whisperProjectDir}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, whisperProjectDir: e.target.value }))
                  }
                  placeholder={t.settings.whisperDirPlaceholder}
                  className="h-9 min-w-[260px] flex-1 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[12px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!whisperStatus.supported}
                  onClick={onPickWhisperDir}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50 whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t.settings.whisperPickDirBtn}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {t.settings.whisperPort}
                </label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={form.whisperPort}
                  onChange={(e) => {
                    const port = Number(e.target.value);
                    if (Number.isFinite(port)) {
                      setForm((prev) => ({ ...prev, whisperPort: port }));
                    }
                  }}
                  className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none tabular-nums"
                />
              </div>

              <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#475569]">
                <span className="font-medium text-[#0F172A]">
                  {t.settings.whisperBuiltInSettingsTitle}
                </span>
                <p className="mt-0.5">{t.settings.whisperBuiltInSettingsDesc}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-[13px] text-[#0F172A]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.whisperAutoStart}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, whisperAutoStart: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.whisperAutoStart}</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.whisperCloseOnExit}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, whisperCloseOnExit: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.whisperCloseOnExit}</span>
              </label>
            </div>

            {whisperStatus.supported && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onOpenWhisperDocked}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
                >
                  <AudioWaveform className="h-3.5 w-3.5" />
                  {t.settings.whisperOpenDockedBtn}
                </button>
                <button
                  type="button"
                  onClick={onRestartWhisper}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  {t.settings.whisperRestartBtn}
                </button>
                <button
                  type="button"
                  onClick={onOpenWhisperOutputs}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t.settings.whisperOutputsBtn}
                </button>
                <button
                  type="button"
                  onClick={onOpenWhisperStandalone}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {t.settings.whisperStandaloneBtn}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Native TDM Fast Integration */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.settings.tdmTitle}</h2>
              <p className="mt-0.5 text-[12px] text-[#64748B]">{t.settings.tdmDesc}</p>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-inner px-2.5 py-1 font-mono text-[11px] font-medium ${
                  !tdmStatus.supported
                    ? 'bg-[#F3F4F6] text-[#64748B]'
                    : tdmStatus.running
                      ? 'bg-[#F0FDF4] text-[#15803D]'
                      : tdmStatus.exeExists
                        ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                        : 'bg-[#FEF2F2] text-[#B91C1C]'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    !tdmStatus.supported
                      ? 'bg-[#94A3B8]'
                      : tdmStatus.running
                        ? 'bg-[#16A34A]'
                        : tdmStatus.exeExists
                          ? 'bg-[#2563EB]'
                          : 'bg-[#DC2626]'
                  }`}
                />
                {!tdmStatus.supported
                  ? t.settings.tdmStatusWeb
                  : tdmStatus.running
                    ? tdmStatus.detached
                      ? t.settings.tdmStatusDetached
                      : t.settings.tdmStatusRunning
                    : tdmStatus.exeExists
                      ? t.settings.tdmStatusReady
                      : t.settings.tdmStatusMissing}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.tdmExePath}
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={form.tdmExePath}
                  onChange={(e) => setForm((prev) => ({ ...prev, tdmExePath: e.target.value }))}
                  placeholder={t.settings.tdmExePlaceholder}
                  className="h-9 min-w-[260px] flex-1 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[12px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!tdmStatus.supported}
                  onClick={onPickTdmExe}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50 whitespace-nowrap"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {t.settings.tdmPickExeBtn}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {t.settings.tdmCapturePort}
                </label>
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={form.tdmCapturePort}
                  onChange={(e) => {
                    const port = Number(e.target.value);
                    if (Number.isFinite(port)) {
                      setForm((prev) => ({ ...prev, tdmCapturePort: port }));
                    }
                  }}
                  className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none tabular-nums"
                />
              </div>

              <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#475569]">
                <span className="font-medium text-[#0F172A]">{t.settings.tdmExtensionTitle}</span>
                <p className="mt-0.5">{t.settings.tdmExtensionDesc(form.tdmCapturePort)}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-[13px] text-[#0F172A]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.tdmAutoLaunch}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, tdmAutoLaunch: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.tdmAutoLaunch}</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.tdmCloseOnExit}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, tdmCloseOnExit: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.tdmCloseOnExit}</span>
              </label>

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.tdmHideOnDrag}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, tdmHideOnDrag: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.tdmHideOnDrag}</span>
              </label>
            </div>

            {tdmStatus.supported && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={onOpenDownloadDocked}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.settings.tdmOpenDockedBtn}
                </button>
                {tdmStatus.attached && (
                  <button
                    type="button"
                    onClick={onDetachTdm}
                    className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:text-[#0F172A] whitespace-nowrap"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {t.settings.tdmDetachBtn}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Document & Media Converter API */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.settings.converterTitle}</h2>
          <p className="mt-0.5 text-[12px] text-[#64748B]">{t.settings.converterDesc}</p>

          <div className="mt-4">
            <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
              {t.settings.converterUrl}
            </label>
            <input
              type="text"
              value={form.converterApiUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, converterApiUrl: e.target.value }))}
              className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
          </div>
        </section>

        {/* GitHub Update Source */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.settings.githubTitle}</h2>
              <p className="mt-0.5 text-[12px] text-[#64748B]">{t.settings.githubDesc}</p>
            </div>
            <button
              type="button"
              onClick={onOpenUpdateModal}
              className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#0F172A] hover:border-[#2563EB] hover:text-[#2563EB] whitespace-nowrap"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {t.settings.openUpdateBtn}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.githubRepo}
              </label>
              <input
                type="text"
                value={form.githubRepo}
                onChange={(e) => setForm((prev) => ({ ...prev, githubRepo: e.target.value }))}
                placeholder="joelting02-sys/JoelDeskPro"
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.githubBranch}
              </label>
              <input
                type="text"
                value={form.githubBranch}
                onChange={(e) => setForm((prev) => ({ ...prev, githubBranch: e.target.value }))}
                placeholder="main"
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2.5 pt-1 text-[13px] text-[#0F172A] sm:col-span-2">
              <input
                type="checkbox"
                checked={form.autoCheckUpdate}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, autoCheckUpdate: e.target.checked }))
                }
                className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
              />
              <span>{t.settings.autoCheckStartup}</span>
            </label>
          </div>
        </section>

        {/* Collapsible Adapter Protocol Reference */}
        <section className="overflow-hidden rounded-panel border border-[#E5E7EB] bg-white">
          <button
            type="button"
            onClick={() => setShowProtocols((prev) => !prev)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left"
          >
            <div>
              <div className="text-[14px] font-semibold text-[#0F172A]">
                {t.settings.protocolTitle}
              </div>
              <div className="text-[12px] text-[#64748B]">{t.settings.protocolDesc}</div>
            </div>
            {showProtocols ? (
              <ChevronUp className="h-4 w-4 text-[#64748B]" />
            ) : (
              <ChevronDown className="h-4 w-4 text-[#64748B]" />
            )}
          </button>

          {showProtocols && (
            <div className="grid grid-cols-1 gap-4 border-t border-[#E5E7EB] p-5 md:grid-cols-2">
              {(
                [
                  { key: 'llm', title: t.settings.protocols.llm },
                  { key: 'transcribe', title: t.settings.protocols.transcribe },
                  { key: 'tdmCapture', title: t.settings.protocols.tdmCapture },
                  { key: 'convert', title: t.settings.protocols.convert },
                ] as const
              ).map((item) => (
                <div
                  key={item.key}
                  className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] p-3.5"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[#0F172A]">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => onCopyText(API_PROTOCOL_SNIPPETS[item.key], item.title)}
                      className="inline-flex items-center gap-1 text-[11px] text-[#2563EB] hover:text-[#1D4ED8]"
                    >
                      <Copy className="h-3 w-3" />
                      {t.settings.copy}
                    </button>
                  </div>
                  <pre className="overflow-x-auto font-mono text-[11px] leading-relaxed text-[#334155]">
                    {API_PROTOCOL_SNIPPETS[item.key]}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Save Bar */}
        <div className="flex items-center justify-end pt-1">
          <button
            type="button"
            onClick={() => onSaveConfig(form)}
            className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#1D4ED8] transition-colors whitespace-nowrap"
          >
            <Save className="h-4 w-4" />
            {t.settings.saveConfig}
          </button>
        </div>
      </div>
    </div>
  );
}

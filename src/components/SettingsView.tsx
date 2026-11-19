import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Plug, RefreshCw, Save } from 'lucide-react';
import {
  ColabGpuSpec,
  EndpointConfig,
  IdleShutdownMinutes,
  ThreadCount,
} from '../types/toolkit';
import { API_PROTOCOL_SNIPPETS } from '../services/toolkitAdapter';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface SettingsViewProps {
  lang: AppLanguage;
  config: EndpointConfig;
  onSaveConfig: (next: EndpointConfig) => void;
  onOpenUpdateModal: () => void;
  onCopyText: (text: string, label: string) => void;
}

export function SettingsView({
  lang,
  config,
  onSaveConfig,
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

        {/* Cloud T4 Compute Bridge */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#0F172A]">{t.settings.cloudTitle}</h2>
          <p className="mt-0.5 text-[12px] text-[#64748B]">{t.settings.cloudDesc}</p>

          <div className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.colabUrl}
              </label>
              <input
                type="text"
                value={form.colabBridgeUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, colabBridgeUrl: e.target.value }))}
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.kaggleUrl}
              </label>
              <input
                type="text"
                value={form.kaggleBridgeUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, kaggleBridgeUrl: e.target.value }))}
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {t.settings.colabGpuSpec}
                </label>
                <div className="inline-flex h-9 items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {(['T4', 'L4', 'A100'] as ColabGpuSpec[]).map((gpu) => (
                    <button
                      key={gpu}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, colabGpuSpec: gpu }))}
                      className={`rounded-inner px-3 py-1 font-mono text-[12px] font-medium transition-colors ${
                        form.colabGpuSpec === gpu
                          ? 'bg-white text-[#0F172A] shadow-xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {gpu}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {t.settings.autoShutdownMinutes}
                </label>
                <div className="inline-flex h-9 items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                  {([10, 15, 30] as IdleShutdownMinutes[]).map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, autoShutdownMinutes: mins }))}
                      className={`rounded-inner px-3 py-1 font-mono text-[12px] font-medium transition-colors tabular-nums ${
                        form.autoShutdownMinutes === mins
                          ? 'bg-white text-[#0F172A] shadow-xs'
                          : 'text-[#64748B] hover:text-[#0F172A]'
                      }`}
                    >
                      {t.transcribe.compute.minutesUnit(mins)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 text-[13px] text-[#0F172A]">
              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={form.autoShutdownEnabled}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, autoShutdownEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.autoShutdownTitle}</span>
              </label>

              <label className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={form.ffmpegAutoExtract}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, ffmpegAutoExtract: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.ffmpegExtract}</span>
              </label>
            </div>
          </div>
        </section>

        {/* Downloader, Chrome Bridge & Converter Endpoints */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#0F172A]">
            {t.settings.downloaderTitle}
          </h2>
          <p className="mt-0.5 text-[12px] text-[#64748B]">{t.settings.downloaderDesc}</p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.downloaderRpc}
              </label>
              <input
                type="text"
                value={form.downloaderRpcUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, downloaderRpcUrl: e.target.value }))
                }
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.defaultThreads}
              </label>
              <div className="inline-flex h-9 items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                {([8, 16, 32, 64] as ThreadCount[]).map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, defaultThreads: count }))}
                    className={`rounded-inner px-3 py-1 font-mono text-[12px] font-medium transition-colors tabular-nums ${
                      form.defaultThreads === count
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.defaultSaveDir}
              </label>
              <input
                type="text"
                value={form.defaultSaveDir}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, defaultSaveDir: e.target.value }))
                }
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.bridgePort}
              </label>
              <input
                type="number"
                min={1024}
                max={65535}
                value={form.chromeBridgePort}
                onChange={(e) => {
                  const port = Number(e.target.value);
                  if (Number.isFinite(port)) {
                    setForm((prev) => ({ ...prev, chromeBridgePort: port }));
                  }
                }}
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none tabular-nums"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.bridgeToken}
              </label>
              <input
                type="text"
                value={form.chromeBridgeToken}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, chromeBridgeToken: e.target.value }))
                }
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.ytdlpPath}
              </label>
              <input
                type="text"
                value={form.ytdlpPath}
                onChange={(e) => setForm((prev) => ({ ...prev, ytdlpPath: e.target.value }))}
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                {t.settings.converterUrl}
              </label>
              <input
                type="text"
                value={form.converterApiUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, converterApiUrl: e.target.value }))
                }
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-1 sm:col-span-2 text-[13px] text-[#0F172A]">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.chromeBridgeEnabled}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, chromeBridgeEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.enableBridge}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.chromeBridgeAutoStart}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, chromeBridgeAutoStart: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.autoStartCapture}</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.clipboardSniffEnabled}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, clipboardSniffEnabled: e.target.checked }))
                  }
                  className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
                />
                <span>{t.settings.clipboardSniff}</span>
              </label>
            </div>
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
                  { key: 'download', title: t.settings.protocols.download },
                  { key: 'chromeBridge', title: t.settings.protocols.chromeBridge },
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

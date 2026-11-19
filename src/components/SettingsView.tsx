import { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Loader2,
  Plug,
  Save,
  Sparkles,
} from 'lucide-react';
import { EndpointConfig } from '../types/toolkit';
import { testLlmEndpointConnection } from '../services/toolkitAdapter';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface SettingsViewProps {
  lang: AppLanguage;
  config: EndpointConfig;
  onSaveConfig: (next: EndpointConfig) => void;
}

const LLM_PRESETS = [
  {
    id: 'ollama',
    label: 'Ollama (11434)',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: 'qwen2.5:14b',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (1234)',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: 'local-model',
  },
  {
    id: 'openai',
    label: 'OpenAI API',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek API',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
] as const;

export function SettingsView({ lang, config, onSaveConfig }: SettingsViewProps) {
  const t = TRANSLATIONS[lang].settings;
  const [form, setForm] = useState<EndpointConfig>(config);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    detail: string;
  } | null>(null);

  useEffect(() => {
    setForm(config);
  }, [config]);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testLlmEndpointConnection(form);
    setTesting(false);
    setTestResult(res);
  };

  const isCustom = form.runtimeMode === 'custom_endpoint';

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[780px]">
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold text-[#0F172A]">{t.llmTitle}</h2>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-inner px-2 py-0.5 font-mono text-[11px] font-medium ${
                    isCustom
                      ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                      : 'bg-[#F0FDF4] text-[#15803D]'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      isCustom ? 'bg-[#2563EB]' : 'bg-[#16A34A]'
                    }`}
                  />
                  {isCustom ? t.modeCustom : t.modeMock}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-[#64748B]">{t.llmDesc}</p>
            </div>

            <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
              <button
                type="button"
                onClick={() => {
                  setTestResult(null);
                  setForm((prev) => ({ ...prev, runtimeMode: 'mock' }));
                }}
                className={`rounded-inner px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  !isCustom
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {t.modeMock}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTestResult(null);
                  setForm((prev) => ({ ...prev, runtimeMode: 'custom_endpoint' }));
                }}
                className={`rounded-inner px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                  isCustom
                    ? 'bg-white text-[#0F172A] shadow-xs'
                    : 'text-[#64748B] hover:text-[#0F172A]'
                }`}
              >
                {t.modeCustom}
              </button>
            </div>
          </div>

          {!isCustom && (
            <div className="mt-5 rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3 text-[13px] leading-relaxed text-[#475569]">
              <div className="flex items-center gap-2 font-medium text-[#0F172A]">
                <Sparkles className="h-4 w-4 text-[#2563EB]" />
                <span>{t.localRouterNoticeTitle}</span>
              </div>
              <p className="mt-1">{t.localRouterNoticeDesc}</p>
            </div>
          )}

          {isCustom && (
            <div className="mt-5 space-y-4">
              {/* Quick Endpoint Presets */}
              <div>
                <div className="mb-1.5 text-[12px] font-medium text-[#475569]">
                  {t.quickPresetsLabel}
                </div>
                <div className="flex flex-wrap gap-2">
                  {LLM_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setTestResult(null);
                        setForm((prev) => ({
                          ...prev,
                          llmBaseUrl: preset.baseUrl,
                          llmModel: preset.model,
                        }));
                      }}
                      className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-1.5 font-mono text-[12px] text-[#334155] transition-colors hover:border-[#2563EB] hover:bg-white hover:text-[#2563EB]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                    {t.baseUrl}
                  </label>
                  <input
                    type="text"
                    value={form.llmBaseUrl}
                    onChange={(e) => {
                      setTestResult(null);
                      setForm((prev) => ({ ...prev, llmBaseUrl: e.target.value }));
                    }}
                    placeholder="http://127.0.0.1:11434/v1"
                    className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                    {t.modelId}
                  </label>
                  <input
                    type="text"
                    value={form.llmModel}
                    onChange={(e) => {
                      setTestResult(null);
                      setForm((prev) => ({ ...prev, llmModel: e.target.value }));
                    }}
                    placeholder="qwen2.5:14b"
                    className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {t.apiKeyLabel}
                </label>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={form.llmApiKey}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTestResult(null);
                      setForm((prev) => ({
                        ...prev,
                        llmApiKey: val,
                        llmApiKeyConfigured: Boolean(val.trim()),
                      }));
                    }}
                    placeholder={t.apiKeyPlaceholder}
                    className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] pl-3 pr-9 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKey((v) => !v)}
                    aria-label={showKey ? t.hideKey : t.showKey}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                  >
                    {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4">
            <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
              {t.systemPromptLabel}
            </label>
            <textarea
              rows={3}
              value={form.llmSystemPrompt}
              onChange={(e) => setForm((prev) => ({ ...prev, llmSystemPrompt: e.target.value }))}
              placeholder={t.systemPromptPlaceholder}
              className="w-full resize-y rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-2 text-[13px] leading-relaxed text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none"
            />
          </div>

          {testResult && (
            <div
              className={`mt-4 flex items-center gap-2 rounded-control border px-3.5 py-2.5 font-mono text-[12px] ${
                testResult.ok
                  ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                  : 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
              }`}
            >
              {testResult.ok ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>
                {testResult.ok
                  ? t.testedOk(testResult.latencyMs, testResult.detail)
                  : t.testFailed(testResult.detail)}
              </span>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-end gap-2.5 border-t border-[#E5E7EB] pt-4">
            {isCustom && (
              <button
                type="button"
                disabled={testing}
                onClick={handleTest}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-2 text-[13px] font-medium text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50 whitespace-nowrap"
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plug className="h-4 w-4" />
                )}
                {testing ? t.testing : t.validateEndpoint}
              </button>
            )}

            <button
              type="button"
              onClick={() => onSaveConfig(form)}
              className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8] whitespace-nowrap"
            >
              <Save className="h-4 w-4" />
              {t.saveConfig}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

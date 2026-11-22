import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  Cookie,
  Download,
  Eye,
  EyeOff,
  Loader2,
  LogIn,
  Plug,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { EndpointConfig, MagpieSettings, MagpieStatus } from '../types/toolkit';
import { testLlmEndpointConnection } from '../services/toolkitAdapter';
import { SiteCookieStatus } from '../services/tdmBridge';
import { AppLanguage, TRANSLATIONS } from '../i18n';

interface SettingsViewProps {
  lang: AppLanguage;
  config: EndpointConfig;
  magpieStatus: MagpieStatus;
  onSaveConfig: (next: EndpointConfig) => void;
  onSaveMagpieSettings: (patch: Partial<MagpieSettings>) => Promise<MagpieStatus | null>;
  onRefreshMagpie: () => Promise<MagpieStatus | null>;
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

export function SettingsView({
  lang,
  config,
  magpieStatus,
  onSaveConfig,
  onSaveMagpieSettings,
  onRefreshMagpie,
}: SettingsViewProps) {
  const t = TRANSLATIONS[lang].settings;
  const [form, setForm] = useState<EndpointConfig>(config);
  const [magpieForm, setMagpieForm] = useState<MagpieSettings>(magpieStatus.settings);
  const [showMagpieKey, setShowMagpieKey] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [refreshingMagpie, setRefreshingMagpie] = useState(false);
  const [savingMagpie, setSavingMagpie] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs: number;
    detail: string;
  } | null>(null);
  const cookieApi = typeof window !== 'undefined' ? window.joelDesktop?.cookies : undefined;
  const [cookieStatus, setCookieStatus] = useState<SiteCookieStatus | null>(null);
  const [loggingInSite, setLoggingInSite] = useState<string | null>(null);
  const [cookieBusy, setCookieBusy] = useState(false);
  const [cookieNotice, setCookieNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const loadCookieStatus = useCallback(async () => {
    if (!cookieApi) return;
    try {
      const st = await cookieApi.getStatus();
      if (st?.supported) {
        setCookieStatus(st);
      }
    } catch {}
  }, [cookieApi]);

  useEffect(() => {
    loadCookieStatus();
  }, [loadCookieStatus]);

  const handleOpenSiteLogin = async (siteId: string, siteLabel: string) => {
    if (!cookieApi) return;
    setLoggingInSite(siteId);
    setCookieNotice(null);
    try {
      const res = await cookieApi.openLogin(siteId);
      if (res?.status) {
        setCookieStatus(res.status);
        const entry = res.status.sites.find((s) => s.id === siteId);
        setCookieNotice({
          ok: Boolean(res.ok),
          text: res.ok
            ? t.cookiesLoginSavedMsg(siteLabel, entry?.count ?? 0)
            : res.error || 'Failed',
        });
      } else if (!res?.ok && res?.error) {
        setCookieNotice({ ok: false, text: res.error });
      }
    } finally {
      setLoggingInSite(null);
    }
  };

  const handleImportCookiesTxt = async () => {
    if (!cookieApi) return;
    setCookieBusy(true);
    setCookieNotice(null);
    try {
      const res = await cookieApi.importTxt();
      if (res?.canceled) return;
      if (res?.status) setCookieStatus(res.status);
      if (res?.ok) {
        setCookieNotice({
          ok: true,
          text: t.cookiesImportedMsg(res.importedCount ?? 0),
        });
      } else {
        setCookieNotice({ ok: false, text: res?.error || 'Import failed' });
      }
    } finally {
      setCookieBusy(false);
    }
  };

  const handleExportCookiesTxt = async (siteId?: string) => {
    if (!cookieApi) return;
    setCookieBusy(true);
    setCookieNotice(null);
    try {
      const res = await cookieApi.exportTxt(siteId);
      if (res?.canceled) return;
      if (res?.ok && res.path) {
        setCookieNotice({
          ok: true,
          text: t.cookiesExportedMsg(res.path, res.count ?? 0),
        });
      } else {
        setCookieNotice({ ok: false, text: res?.error || 'Export failed' });
      }
    } finally {
      setCookieBusy(false);
    }
  };

  const handleClearCookies = async () => {
    if (!cookieApi) return;
    setCookieBusy(true);
    setCookieNotice(null);
    try {
      const res = await cookieApi.clear();
      if (res?.status) setCookieStatus(res.status);
      if (res?.ok) {
        setCookieNotice({ ok: true, text: t.cookiesClearedMsg });
      } else {
        setCookieNotice({ ok: false, text: res?.error || 'Clear failed' });
      }
    } finally {
      setCookieBusy(false);
    }
  };

  useEffect(() => {
    setForm(config);
  }, [config]);

  useEffect(() => {
    setMagpieForm(magpieStatus.settings);
  }, [magpieStatus.settings]);

  const handleTestHttp = async () => {
    setTesting(true);
    setTestResult(null);
    const res = await testLlmEndpointConnection(form);
    setTesting(false);
    setTestResult(res);
  };

  const handleTestAndRefreshMagpie = async () => {
    setRefreshingMagpie(true);
    try {
      const updated = await onSaveMagpieSettings({
        baseUrl: magpieForm.baseUrl,
        apiKey: magpieForm.apiKey,
        model: magpieForm.model,
        systemPrompt: magpieForm.systemPrompt,
      });
      if (updated) {
        setMagpieForm(updated.settings);
      } else {
        await onRefreshMagpie();
      }
    } finally {
      setRefreshingMagpie(false);
    }
  };

  const handleSaveMagpie = async () => {
    setSavingMagpie(true);
    try {
      await onSaveMagpieSettings({ ...magpieForm, mode: 'magpie' });
    } finally {
      setSavingMagpie(false);
    }
  };

  const handleSaveHttp = async () => {
    if (magpieStatus.supported && magpieForm.mode !== 'custom_endpoint') {
      await onSaveMagpieSettings({ mode: 'custom_endpoint' });
    }
    onSaveConfig(form);
  };

  const useMagpieTab = magpieStatus.supported && magpieForm.mode === 'magpie';
  const isCustom = form.runtimeMode === 'custom_endpoint';

  return (
    <div className="h-full overflow-y-auto bg-[#F8F9FA] px-5 py-6 sm:px-8">
      <div className="mx-auto max-w-[740px]">
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[16px] font-semibold text-[#0F172A]">
                  {magpieStatus.supported ? t.channelTitle : t.llmTitle}
                </h2>
                {useMagpieTab ? (
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-inner px-2 py-0.5 font-mono text-[11px] font-medium ${
                      magpieStatus.online
                        ? 'bg-[#F0FDF4] text-[#15803D]'
                        : 'bg-[#FEF3C7] text-[#B45309]'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        magpieStatus.online ? 'bg-[#16A34A]' : 'bg-[#D97706]'
                      }`}
                    />
                    {magpieStatus.online
                      ? t.magpieBadgeOnline(magpieStatus.models.length)
                      : t.magpieBadgeOffline}
                  </span>
                ) : (
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
                )}
              </div>
              <p className="mt-1 text-[13px] text-[#64748B]">
                {magpieStatus.supported ? t.channelDesc : t.llmDesc}
              </p>
            </div>

            {magpieStatus.supported ? (
              <div className="inline-flex items-center gap-1 rounded-control bg-[#F3F4F6] p-1">
                <button
                  type="button"
                  onClick={() => setMagpieForm((prev) => ({ ...prev, mode: 'magpie' }))}
                  className={`rounded-inner px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                    useMagpieTab
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {t.modeMagpie}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTestResult(null);
                    setMagpieForm((prev) => ({ ...prev, mode: 'custom_endpoint' }));
                  }}
                  className={`rounded-inner px-3 py-1.5 text-[12px] font-medium transition-colors whitespace-nowrap ${
                    !useMagpieTab
                      ? 'bg-white text-[#0F172A] shadow-xs'
                      : 'text-[#64748B] hover:text-[#0F172A]'
                  }`}
                >
                  {t.modeCustom}
                </button>
              </div>
            ) : (
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
            )}
          </div>

          {useMagpieTab ? (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                    {t.magpieBaseUrlLabel}
                  </label>
                  <input
                    type="text"
                    value={magpieForm.baseUrl}
                    onChange={(e) =>
                      setMagpieForm((prev) => ({ ...prev, baseUrl: e.target.value }))
                    }
                    placeholder="http://127.0.0.1:3425"
                    className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                    {t.magpieTokenLabel}
                  </label>
                  <div className="relative">
                    <input
                      type={showMagpieKey ? 'text' : 'password'}
                      value={magpieForm.apiKey}
                      onChange={(e) =>
                        setMagpieForm((prev) => ({ ...prev, apiKey: e.target.value }))
                      }
                      placeholder="magpie"
                      className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] pl-3 pr-9 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowMagpieKey((v) => !v)}
                      aria-label={showMagpieKey ? t.hideKey : t.showKey}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                    >
                      {showMagpieKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-[12px] font-medium text-[#475569]">
                    {t.magpieModelLabel}
                  </label>
                  <button
                    type="button"
                    disabled={refreshingMagpie}
                    onClick={handleTestAndRefreshMagpie}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3 w-3 ${refreshingMagpie ? 'animate-spin' : ''}`} />
                    {t.magpieRefreshModels}
                  </button>
                </div>

                {magpieStatus.models.length > 0 ? (
                  <select
                    value={magpieForm.model}
                    onChange={(e) =>
                      setMagpieForm((prev) => ({ ...prev, model: e.target.value }))
                    }
                    className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                  >
                    {!magpieStatus.models.some((m) => m.id === magpieForm.model) && magpieForm.model && (
                      <option value={magpieForm.model}>{magpieForm.model}</option>
                    )}
                    {magpieStatus.models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.ownedBy ? `${m.id} (${m.ownedBy})` : m.id}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      value={magpieForm.model}
                      onChange={(e) =>
                        setMagpieForm((prev) => ({ ...prev, model: e.target.value }))
                      }
                      placeholder="auto/deepseek-v4.1-flash"
                      className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                    />
                    <p className="text-[11px] text-[#D97706]">
                      {magpieStatus.error || t.magpieNoModelsHint}
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {t.systemPromptLabel}
                </label>
                <textarea
                  rows={3}
                  value={magpieForm.systemPrompt}
                  onChange={(e) =>
                    setMagpieForm((prev) => ({ ...prev, systemPrompt: e.target.value }))
                  }
                  placeholder={t.systemPromptPlaceholder}
                  className="w-full resize-y rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-2 text-[13px] leading-relaxed text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>

              {magpieStatus.error && magpieStatus.models.length > 0 && (
                <div className="flex items-center gap-2 rounded-control border border-[#FECACA] bg-[#FEF2F2] px-3.5 py-2.5 font-mono text-[12px] text-[#B91C1C]">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{magpieStatus.error}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#E5E7EB] pt-4">
                <button
                  type="button"
                  disabled={refreshingMagpie}
                  onClick={handleTestAndRefreshMagpie}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3.5 py-2 text-[13px] font-medium text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50 whitespace-nowrap"
                >
                  {refreshingMagpie ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plug className="h-4 w-4" />
                  )}
                  {t.magpieTestAndRefresh}
                </button>

                <button
                  type="button"
                  disabled={savingMagpie}
                  onClick={handleSaveMagpie}
                  className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8] disabled:opacity-50 whitespace-nowrap"
                >
                  {savingMagpie ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t.saveMagpieConfig}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {magpieStatus.supported && (
                <div className="flex items-center gap-1.5 rounded-control bg-[#F3F4F6] p-1 w-fit">
                  <button
                    type="button"
                    onClick={() => {
                      setTestResult(null);
                      setForm((prev) => ({ ...prev, runtimeMode: 'custom_endpoint' }));
                    }}
                    className={`rounded-inner px-3 py-1 text-[12px] font-medium transition-colors ${
                      isCustom
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {t.modeCustom}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTestResult(null);
                      setForm((prev) => ({ ...prev, runtimeMode: 'mock' }));
                    }}
                    className={`rounded-inner px-3 py-1 text-[12px] font-medium transition-colors ${
                      !isCustom
                        ? 'bg-white text-[#0F172A] shadow-xs'
                        : 'text-[#64748B] hover:text-[#0F172A]'
                    }`}
                  >
                    {t.modeMock}
                  </button>
                </div>
              )}

              {!isCustom && (
                <div className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-4 py-3 text-[13px] leading-relaxed text-[#475569]">
                  <div className="flex items-center gap-2 font-medium text-[#0F172A]">
                    <Sparkles className="h-4 w-4 text-[#2563EB]" />
                    <span>{t.localRouterNoticeTitle}</span>
                  </div>
                  <p className="mt-1">{t.localRouterNoticeDesc}</p>
                </div>
              )}

              {isCustom && (
                <div className="space-y-4">
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

              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                  {t.systemPromptLabel}
                </label>
                <textarea
                  rows={3}
                  value={form.llmSystemPrompt}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, llmSystemPrompt: e.target.value }))
                  }
                  placeholder={t.systemPromptPlaceholder}
                  className="w-full resize-y rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 py-2 text-[13px] leading-relaxed text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#2563EB] focus:bg-white focus:outline-none"
                />
              </div>

              {testResult && (
                <div
                  className={`flex items-center gap-2 rounded-control border px-3.5 py-2.5 font-mono text-[12px] ${
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

              <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#E5E7EB] pt-4">
                {isCustom && (
                  <button
                    type="button"
                    disabled={testing}
                    onClick={handleTestHttp}
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
                  onClick={handleSaveHttp}
                  className="inline-flex items-center gap-2 rounded-control bg-[#2563EB] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#1D4ED8] whitespace-nowrap"
                >
                  <Save className="h-4 w-4" />
                  {t.saveConfig}
                </button>
              </div>
            </div>
          )}
        </section>

        {cookieApi && (
          <section className="mt-5 rounded-panel border border-[#E5E7EB] bg-white p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Cookie className="h-4 w-4 text-[#2563EB]" />
                  <h2 className="text-[16px] font-semibold text-[#0F172A]">{t.cookiesTitle}</h2>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-[#64748B]">
                  {t.cookiesDesc}
                </p>
              </div>

              <button
                type="button"
                onClick={loadCookieStatus}
                disabled={cookieBusy}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#2563EB] hover:text-[#1D4ED8] disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${cookieBusy ? 'animate-spin' : ''}`} />
                {t.magpieRefreshModels}
              </button>
            </div>

            <div className="mt-4 divide-y divide-[#E5E7EB] rounded-control border border-[#E5E7EB] bg-[#F8F9FA]">
              {(cookieStatus?.sites || []).map((site) => {
                const isLoggingThis = loggingInSite === site.id;
                return (
                  <div
                    key={site.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-[13px] font-medium text-[#0F172A]">{site.label}</span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-inner px-2 py-0.5 font-mono text-[11px] font-medium ${
                          site.hasCookies
                            ? 'bg-[#F0FDF4] text-[#15803D]'
                            : 'bg-[#E2E8F0] text-[#475569]'
                        }`}
                      >
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${
                            site.hasCookies ? 'bg-[#16A34A]' : 'bg-[#64748B]'
                          }`}
                        />
                        {site.hasCookies ? t.cookiesCount(site.count) : t.cookiesNotLoggedIn}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {site.count > 0 && (
                        <button
                          type="button"
                          disabled={cookieBusy}
                          onClick={() => handleExportCookiesTxt(site.id)}
                          className="inline-flex items-center gap-1 rounded-inner border border-[#E5E7EB] bg-white px-2.5 py-1 text-[12px] font-medium text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50 whitespace-nowrap"
                        >
                          <Download className="h-3.5 w-3.5" />
                          {t.cookiesExportTxtBtn}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={cookieBusy}
                        onClick={() => handleOpenSiteLogin(site.id, site.label)}
                        className="inline-flex items-center gap-1.5 rounded-inner bg-[#2563EB] px-3 py-1 text-[12px] font-medium text-white hover:bg-[#1D4ED8] disabled:opacity-60 whitespace-nowrap"
                      >
                        {isLoggingThis ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <LogIn className="h-3.5 w-3.5" />
                        )}
                        {isLoggingThis ? t.cookiesLoggingIn : t.cookiesLoginBtn}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {cookieNotice && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-control border px-3 py-2 text-[12px] ${
                  cookieNotice.ok
                    ? 'border-[#BBF7D0] bg-[#F0FDF4] text-[#15803D]'
                    : 'border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C]'
                }`}
              >
                {cookieNotice.ok ? (
                  <Check className="h-3.5 w-3.5 shrink-0" />
                ) : (
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="break-all">{cookieNotice.text}</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5 border-t border-[#E5E7EB] pt-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={cookieBusy}
                  onClick={handleImportCookiesTxt}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50 whitespace-nowrap"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {t.cookiesImportTxtBtn}
                </button>
                <button
                  type="button"
                  disabled={cookieBusy || !(cookieStatus?.totalCount)}
                  onClick={() => handleExportCookiesTxt()}
                  className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#475569] hover:border-[#2563EB] hover:text-[#2563EB] disabled:opacity-50 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  {t.cookiesExportAllBtn}
                </button>
              </div>

              <button
                type="button"
                disabled={cookieBusy || !(cookieStatus?.totalCount)}
                onClick={handleClearCookies}
                className="inline-flex items-center gap-1.5 rounded-control border border-[#E5E7EB] bg-white px-3 py-1.5 text-[12px] font-medium text-[#64748B] hover:border-[#FECACA] hover:text-[#B91C1C] disabled:opacity-50 whitespace-nowrap"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t.cookiesClearBtn}
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

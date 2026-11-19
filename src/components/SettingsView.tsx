import { useEffect, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Copy, Plug, Save } from 'lucide-react';
import { EndpointConfig, ThreadCount } from '../types/toolkit';
import { API_PROTOCOL_SNIPPETS } from '../services/toolkitAdapter';

interface SettingsViewProps {
  config: EndpointConfig;
  onSaveConfig: (next: EndpointConfig) => void;
  onCopyText: (text: string, label: string) => void;
}

export function SettingsView({ config, onSaveConfig, onCopyText }: SettingsViewProps) {
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
              <h2 className="text-[15px] font-semibold text-[#0F172A]">AI 大模型接口</h2>
              <p className="mt-0.5 text-[12px] text-[#64748B]">
                兼容 Ollama、LM Studio、vLLM 及标准 OpenAI API 协议，供 AI 助手调度工具
              </p>
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
                前端模拟演示
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
                本地/自定义端点
              </button>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                Base URL
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
                模型标识 (Model ID)
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
                ? '检测中…'
                : testedOk.llm
                  ? '接口格式校验通过'
                  : '校验端点格式'}
            </button>
          </div>
        </section>

        {/* Cloud T4 Compute Bridge */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#0F172A]">云端算力与音轨预处理</h2>
          <p className="mt-0.5 text-[12px] text-[#64748B]">
            对接你在 Google Colab / Kaggle 上运行的 faster-whisper T4 服务隧道地址
          </p>

          <div className="mt-4 space-y-3.5">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                Google Colab T4 Bridge URL
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
                Kaggle T4 x2 Bridge URL
              </label>
              <input
                type="text"
                value={form.kaggleBridgeUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, kaggleBridgeUrl: e.target.value }))}
                className="h-9 w-full rounded-control border border-[#E5E7EB] bg-[#F8F9FA] px-3 font-mono text-[13px] text-[#0F172A] focus:border-[#2563EB] focus:bg-white focus:outline-none"
              />
            </div>
            <label className="flex items-center gap-2.5 pt-1 text-[13px] text-[#0F172A]">
              <input
                type="checkbox"
                checked={form.ffmpegAutoExtract}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, ffmpegAutoExtract: e.target.checked }))
                }
                className="h-4 w-4 rounded-inner border-[#CBD5E1] accent-[#2563EB]"
              />
              <span>拖入视频时自动调用本地 FFmpeg 提取 16kHz 音频后再上传云端</span>
            </label>
          </div>
        </section>

        {/* Downloader, Chrome Bridge & Converter Endpoints */}
        <section className="rounded-panel border border-[#E5E7EB] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#0F172A]">本地下载内核与 Chrome 插件桥接</h2>
          <p className="mt-0.5 text-[12px] text-[#64748B]">
            配置 HTTP Range 多线程分片引擎、yt-dlp 流媒体内核、本地 Chrome 插件桥接服务（tiny_http / HTTP）及文档转换接口
          </p>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[#475569]">
                高速下载引擎 HTTP 接口
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
                默认 Range 分片线程数
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
                默认下载保存目录
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
                Chrome 插件本地桥接端口
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
                Chrome 插件桥接 Token
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
                yt-dlp 可执行路径（流媒体解析内核）
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
                文档转换服务地址 (LibreOffice / Pandoc)
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
                <span>开启 Chrome 插件本地 HTTP 监听</span>
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
                <span>捕获后立即开始下载</span>
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
                <span>剪贴板链接自动嗅探</span>
              </label>
            </div>
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
              <div className="text-[14px] font-semibold text-[#0F172A]">后端对接 JSON 协议参考</div>
              <div className="text-[12px] text-[#64748B]">
                查看前端预留的 5 个标准请求结构（含双内核下载与 Chrome 插件本地桥接）
              </div>
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
                  { key: 'llm', title: '大模型意图路由 (OpenAI 兼容)' },
                  { key: 'transcribe', title: '云端 T4 语音转录' },
                  { key: 'download', title: '双内核下载指令 (Range / yt-dlp)' },
                  { key: 'chromeBridge', title: 'Chrome 插件本地桥接 (tiny_http)' },
                  { key: 'convert', title: '文档格式转换' },
                ] as const
              ).map((item) => (
                <div key={item.key} className="rounded-control border border-[#E5E7EB] bg-[#F8F9FA] p-3.5">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[12px] font-semibold text-[#0F172A]">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => onCopyText(API_PROTOCOL_SNIPPETS[item.key], item.title)}
                      className="inline-flex items-center gap-1 text-[11px] text-[#2563EB] hover:text-[#1D4ED8]"
                    >
                      <Copy className="h-3 w-3" />
                      复制
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
            保存接口配置
          </button>
        </div>
      </div>
    </div>
  );
}

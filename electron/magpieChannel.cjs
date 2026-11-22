const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

const SETTINGS_FILE = path.join(os.homedir(), '.joeldeskpro', 'magpie-settings.json');
const DEFAULT_BASE_URL = 'http://127.0.0.1:3425';
const DEFAULT_API_KEY = 'magpie';

function createDefaultSettings() {
  return {
    mode: 'magpie',
    baseUrl: DEFAULT_BASE_URL,
    apiKey: DEFAULT_API_KEY,
    model: '',
    systemPrompt: '',
  };
}

function normalizeSettings(raw) {
  const defaults = createDefaultSettings();
  const s = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: s.mode === 'custom_endpoint' ? 'custom_endpoint' : 'magpie',
    baseUrl:
      typeof s.baseUrl === 'string' && s.baseUrl.trim()
        ? s.baseUrl.trim().replace(/\/+$/, '')
        : defaults.baseUrl,
    apiKey: typeof s.apiKey === 'string' ? s.apiKey.trim() : defaults.apiKey,
    model: typeof s.model === 'string' ? s.model.trim() : '',
    systemPrompt: typeof s.systemPrompt === 'string' ? s.systemPrompt : '',
  };
}

function buildV1Base(baseUrl) {
  const clean = (baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
  return clean.endsWith('/v1') ? clean : `${clean}/v1`;
}

async function fetchModels(baseUrl, apiKey) {
  const startedAt = Date.now();
  const apiBase = buildV1Base(baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const headers = {};
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    }
    const res = await fetch(`${apiBase}/models`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });
    const latencyMs = Math.max(1, Date.now() - startedAt);
    if (!res.ok) {
      return {
        online: false,
        models: [],
        latencyMs,
        error: `HTTP ${res.status}`,
      };
    }
    const json = await res.json();
    const list = Array.isArray(json?.data) ? json.data : [];
    const models = list
      .filter((item) => item && typeof item.id === 'string' && item.id.trim())
      .map((item) => ({
        id: item.id.trim(),
        ownedBy: typeof item.owned_by === 'string' ? item.owned_by.trim() : undefined,
      }));
    return {
      online: true,
      models,
      latencyMs,
    };
  } catch (err) {
    return {
      online: false,
      models: [],
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractApiError(rawText, status) {
  try {
    const parsed = JSON.parse(rawText);
    const msg = parsed?.error?.message || parsed?.message || parsed?.detail;
    if (typeof msg === 'string' && msg.trim()) {
      return msg.trim();
    }
  } catch {}
  const clean = String(rawText || '').trim();
  return clean ? `HTTP ${status}: ${clean.slice(0, 240)}` : `HTTP ${status}`;
}

function createMagpieChannel({ mainWindow } = {}) {
  let settings = createDefaultSettings();
  let loadedFromDisk = false;
  let cachedProbe = { online: false, models: [], latencyMs: undefined, error: undefined };
  let activeRun = null;

  function pushEvent(payload) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('magpie:event', payload);
    }
  }

  function ensureLoadedSync() {
    if (loadedFromDisk) return;
    loadedFromDisk = true;
    try {
      if (fsSync.existsSync(SETTINGS_FILE)) {
        const raw = JSON.parse(fsSync.readFileSync(SETTINGS_FILE, 'utf8'));
        settings = normalizeSettings(raw);
        return;
      }
    } catch {}
    try {
      fsSync.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
      fsSync.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    } catch {}
  }

  async function writeSettingsDisk(nextSettings) {
    await fs.mkdir(path.dirname(SETTINGS_FILE), { recursive: true });
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(nextSettings, null, 2), 'utf8');
  }

  function buildStatus() {
    return {
      supported: true,
      online: Boolean(cachedProbe.online),
      models: cachedProbe.models || [],
      latencyMs: cachedProbe.latencyMs,
      error: cachedProbe.error,
      settings,
    };
  }

  async function getStatus(forceRefresh = true) {
    ensureLoadedSync();
    if (forceRefresh || !cachedProbe.online) {
      cachedProbe = await fetchModels(settings.baseUrl, settings.apiKey);
      if (cachedProbe.online && cachedProbe.models.length > 0) {
        const exists = cachedProbe.models.some((m) => m.id === settings.model);
        if (!settings.model || !exists) {
          settings = { ...settings, model: cachedProbe.models[0].id };
          writeSettingsDisk(settings).catch(() => {});
        }
      }
    }
    return buildStatus();
  }

  async function saveSettings(patch) {
    ensureLoadedSync();
    settings = normalizeSettings({
      ...settings,
      ...(patch && typeof patch === 'object' ? patch : {}),
    });
    await writeSettingsDisk(settings);
    const status = await getStatus(true);
    pushEvent({ type: 'status', status });
    return { ok: true, status };
  }

  async function stopRun(runId) {
    if (!activeRun || (runId && activeRun.runId !== runId)) {
      return { ok: false };
    }
    const target = activeRun;
    target.aborted = true;
    try {
      target.controller.abort();
    } catch {}
    return { ok: true };
  }

  async function sendChat(payload) {
    ensureLoadedSync();
    const {
      runId,
      messages,
      model: reqModel,
      systemPrompt: reqSystemPrompt,
    } = payload || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return { ok: false, error: '消息内容不能为空' };
    }

    if (activeRun) {
      await stopRun(activeRun.runId);
    }

    const effectiveRunId = runId || `magpie-${Date.now()}`;
    const chosenModel = (typeof reqModel === 'string' && reqModel.trim()) || settings.model || '';
    if (!chosenModel) {
      const refreshed = await getStatus(true);
      if (!refreshed.online || refreshed.models.length === 0) {
        return {
          ok: false,
          error: `无法连接本地 Magpie（${settings.baseUrl}），请确认 Magpie 正在运行`,
        };
      }
    }

    const activeModel =
      (typeof reqModel === 'string' && reqModel.trim()) ||
      settings.model ||
      cachedProbe.models?.[0]?.id ||
      '';

    if (!activeModel) {
      return { ok: false, error: '未选择可用模型，请点击刷新模型列表' };
    }

    const sysPrompt =
      typeof reqSystemPrompt === 'string' ? reqSystemPrompt.trim() : settings.systemPrompt.trim();

    const apiMessages = [];
    if (sysPrompt) {
      apiMessages.push({ role: 'system', content: sysPrompt });
    }
    for (const msg of messages) {
      if (!msg || typeof msg.content !== 'string' || !msg.content.trim()) continue;
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      apiMessages.push({ role, content: msg.content });
    }

    const controller = new AbortController();
    const runState = {
      runId: effectiveRunId,
      controller,
      aborted: false,
    };
    activeRun = runState;

    const apiBase = buildV1Base(settings.baseUrl);
    const headers = {
      'Content-Type': 'application/json',
    };
    if (settings.apiKey) {
      headers.Authorization = `Bearer ${settings.apiKey}`;
    }

    // Run streaming loop asynchronously so IPC returns immediately with ok/runId
    (async () => {
      try {
        const res = await fetch(`${apiBase}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: activeModel,
            messages: apiMessages,
            stream: true,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          pushEvent({
            type: 'done',
            runId: effectiveRunId,
            ok: false,
            aborted: runState.aborted,
            error: extractApiError(errText, res.status),
          });
          return;
        }

        const contentType = (res.headers.get('content-type') || '').toLowerCase();
        if (!contentType.includes('text/event-stream') || !res.body) {
          const json = await res.json();
          const msgObj = json?.choices?.[0]?.message || {};
          const reasoning = msgObj.reasoning_content || msgObj.reasoning;
          if (typeof reasoning === 'string' && reasoning) {
            pushEvent({ type: 'thinking-delta', runId: effectiveRunId, text: reasoning });
          }
          const content = typeof msgObj.content === 'string' ? msgObj.content : '';
          if (content) {
            pushEvent({ type: 'text-delta', runId: effectiveRunId, text: content });
          }
          pushEvent({ type: 'done', runId: effectiveRunId, ok: true, aborted: false });
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() ?? '';

          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line || !line.startsWith('data:')) continue;
            const payloadStr = line.slice(5).trim();
            if (!payloadStr || payloadStr === '[DONE]') continue;

            let parsed = null;
            try {
              parsed = JSON.parse(payloadStr);
            } catch {
              continue;
            }

            if (parsed?.error?.message) {
              pushEvent({
                type: 'done',
                runId: effectiveRunId,
                ok: false,
                aborted: false,
                error: String(parsed.error.message),
              });
              return;
            }

            const delta = parsed?.choices?.[0]?.delta;
            if (!delta || typeof delta !== 'object') continue;
            const reasoning = delta.reasoning_content || delta.reasoning;
            if (typeof reasoning === 'string' && reasoning) {
              pushEvent({ type: 'thinking-delta', runId: effectiveRunId, text: reasoning });
            }
            if (typeof delta.content === 'string' && delta.content) {
              pushEvent({ type: 'text-delta', runId: effectiveRunId, text: delta.content });
            }
          }
        }

        pushEvent({
          type: 'done',
          runId: effectiveRunId,
          ok: !runState.aborted,
          aborted: runState.aborted,
        });
      } catch (err) {
        const isAbort =
          runState.aborted || (err instanceof Error && err.name === 'AbortError');
        pushEvent({
          type: 'done',
          runId: effectiveRunId,
          ok: false,
          aborted: isAbort,
          error: isAbort ? undefined : err instanceof Error ? err.message : String(err),
        });
      } finally {
        if (activeRun === runState) {
          activeRun = null;
        }
      }
    })();

    return { ok: true, runId: effectiveRunId, model: activeModel };
  }

  async function shutdown() {
    if (activeRun) {
      await stopRun(activeRun.runId);
      activeRun = null;
    }
  }

  return {
    getStatus,
    saveSettings,
    sendChat,
    stopRun,
    shutdown,
    buildV1Base,
  };
}

module.exports = {
  createMagpieChannel,
  buildV1Base,
  fetchModels,
};

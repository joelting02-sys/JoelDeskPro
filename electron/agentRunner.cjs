const fsSync = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { spawn, execFileSync } = require('node:child_process');

const DEFAULT_SETTINGS_FILE = path.join(os.homedir(), '.joeldeskpro', 'agent-settings.json');
const CLAUDIAN_CANDIDATES = [
  path.join(os.homedir(), 'Documents', 'Obsidian', 'My-2Brain', '.claudian', 'claudian-settings.json'),
  path.join(os.homedir(), 'Documents', 'Obsidian', 'My-Library', '.claudian', 'claudian-settings.json'),
];

const CLI_PROVIDERS = ['claude', 'codex', 'dsh'];
const VALID_MODES = ['claude', 'codex', 'dsh', 'custom_endpoint'];

function defaultWorkspaceDir() {
  const docs = path.join(os.homedir(), 'Documents');
  try {
    if (fsSync.existsSync(docs) && fsSync.statSync(docs).isDirectory()) {
      return docs;
    }
  } catch {}
  return os.homedir();
}

function createDefaultSettings() {
  return {
    activeProvider: 'claude',
    permissionMode: 'turbo',
    workspaceDir: defaultWorkspaceDir(),
    sharedEnv: '',
    systemPrompt: '',
    providers: {
      claude: { cliPath: '', model: '', envVars: '' },
      codex: { cliPath: '', model: '', envVars: '' },
      dsh: { cliPath: '', model: '', envVars: '' },
    },
  };
}

function stripOuterQuotes(value) {
  const s = String(value || '').trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

function parseEnvText(text) {
  const out = {};
  if (!text || typeof text !== 'string') return out;
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('export ')) line = line.slice(7).trim();
    const eqIdx = line.indexOf('=');
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"') && val.length >= 2) ||
      (val.startsWith("'") && val.endsWith("'") && val.length >= 2)
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function whereLookup(binName) {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('where.exe', [binName], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 3000,
      });
      const lines = out
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      const preferred =
        lines.find((l) => /\.(exe|cmd|bat)$/i.test(l) && fsSync.existsSync(l)) ||
        lines.find((l) => fsSync.existsSync(l));
      return preferred || '';
    }
    const out = execFileSync('which', [binName], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const p = out.split(/\r?\n/)[0]?.trim() || '';
    return p && fsSync.existsSync(p) ? p : '';
  } catch {
    return '';
  }
}

function detectCliForProvider(provider, configuredPath = '') {
  const explicit = stripOuterQuotes(configuredPath);
  if (explicit) {
    try {
      if (fsSync.existsSync(explicit) && fsSync.statSync(explicit).isFile()) {
        return { installed: true, resolvedPath: explicit };
      }
    } catch {}
  }

  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');

  const candidatesByProvider = {
    claude:
      process.platform === 'win32'
        ? [
            path.join(home, '.local', 'bin', 'claude.exe'),
            path.join(appData, 'npm', 'claude.cmd'),
          ]
        : [path.join(home, '.local', 'bin', 'claude'), '/usr/local/bin/claude'],
    codex:
      process.platform === 'win32'
        ? [
            path.join(appData, 'npm', 'codex.cmd'),
            path.join(home, '.local', 'bin', 'codex.exe'),
          ]
        : [path.join(home, '.local', 'bin', 'codex'), '/usr/local/bin/codex'],
    dsh:
      process.platform === 'win32'
        ? [
            path.join(
              localAppData,
              'Programs',
              'DeepSeek Harness',
              'resources',
              'runtime',
              'cli',
              'bin',
              'dsh.cmd'
            ),
            path.join(appData, 'npm', 'dsh.cmd'),
          ]
        : [path.join(home, '.local', 'bin', 'dsh'), '/usr/local/bin/dsh'],
  };

  const candidates = candidatesByProvider[provider] || [];
  for (const cand of candidates) {
    try {
      if (cand && fsSync.existsSync(cand) && fsSync.statSync(cand).isFile()) {
        return { installed: true, resolvedPath: cand };
      }
    } catch {}
  }

  const found = whereLookup(provider);
  if (found) {
    return { installed: true, resolvedPath: found };
  }
  return { installed: false, resolvedPath: '' };
}

function normalizeSettings(raw) {
  const defaults = createDefaultSettings();
  const s = raw && typeof raw === 'object' ? raw : {};
  const providersIn = s.providers && typeof s.providers === 'object' ? s.providers : {};

  const next = {
    activeProvider: VALID_MODES.includes(s.activeProvider) ? s.activeProvider : defaults.activeProvider,
    permissionMode: s.permissionMode === 'normal' ? 'normal' : 'turbo',
    workspaceDir:
      typeof s.workspaceDir === 'string' && s.workspaceDir.trim()
        ? stripOuterQuotes(s.workspaceDir)
        : defaults.workspaceDir,
    sharedEnv: typeof s.sharedEnv === 'string' ? s.sharedEnv : defaults.sharedEnv,
    systemPrompt: typeof s.systemPrompt === 'string' ? s.systemPrompt : defaults.systemPrompt,
    providers: {
      claude: { ...defaults.providers.claude },
      codex: { ...defaults.providers.codex },
      dsh: { ...defaults.providers.dsh },
    },
  };

  for (const key of CLI_PROVIDERS) {
    const p = providersIn[key];
    if (!p || typeof p !== 'object') continue;
    next.providers[key] = {
      cliPath: typeof p.cliPath === 'string' ? stripOuterQuotes(p.cliPath) : '',
      model: typeof p.model === 'string' ? p.model.trim() : '',
      envVars: typeof p.envVars === 'string' ? p.envVars : '',
    };
  }
  return next;
}

function applyClaudianJson(targetSettings, claudianData) {
  const next = normalizeSettings(targetSettings);
  const data = claudianData && typeof claudianData === 'object' ? claudianData : {};
  if (typeof data.sharedEnvironmentVariables === 'string') {
    next.sharedEnv = data.sharedEnvironmentVariables;
  }
  if (typeof data.systemPrompt === 'string' && !next.systemPrompt) {
    next.systemPrompt = data.systemPrompt;
  }
  const pc = data.providerConfigs && typeof data.providerConfigs === 'object' ? data.providerConfigs : {};

  if (pc.claude && typeof pc.claude === 'object') {
    if (typeof pc.claude.cliPath === 'string' && pc.claude.cliPath.trim()) {
      next.providers.claude.cliPath = stripOuterQuotes(pc.claude.cliPath);
    }
    if (typeof pc.claude.environmentVariables === 'string') {
      next.providers.claude.envVars = pc.claude.environmentVariables;
    }
    const selModel = Array.isArray(pc.claude.selectedModels) ? pc.claude.selectedModels[0]?.value : '';
    const visModel = Array.isArray(pc.claude.visibleModels) ? pc.claude.visibleModels[0] : '';
    const chosen = typeof selModel === 'string' && selModel.trim() ? selModel : visModel;
    if (typeof chosen === 'string' && chosen.trim()) {
      next.providers.claude.model = chosen.trim();
    }
  }

  if (pc.codex && typeof pc.codex === 'object') {
    if (typeof pc.codex.cliPath === 'string' && pc.codex.cliPath.trim()) {
      next.providers.codex.cliPath = stripOuterQuotes(pc.codex.cliPath);
    }
    if (typeof pc.codex.environmentVariables === 'string') {
      next.providers.codex.envVars = pc.codex.environmentVariables;
    }
    const selModel = Array.isArray(pc.codex.selectedModels) ? pc.codex.selectedModels[0]?.value : '';
    const visModel = Array.isArray(pc.codex.visibleModels) ? pc.codex.visibleModels[0] : '';
    const chosen = typeof selModel === 'string' && selModel.trim() ? selModel : visModel;
    if (typeof chosen === 'string' && chosen.trim()) {
      next.providers.codex.model = chosen.trim();
    }
  }

  if (pc.deepseek && typeof pc.deepseek === 'object') {
    if (typeof pc.deepseek.cliPath === 'string' && pc.deepseek.cliPath.trim()) {
      next.providers.dsh.cliPath = stripOuterQuotes(pc.deepseek.cliPath);
    }
    if (typeof pc.deepseek.environmentVariables === 'string') {
      next.providers.dsh.envVars = pc.deepseek.environmentVariables;
    }
    const selModel = Array.isArray(pc.deepseek.selectedModels)
      ? pc.deepseek.selectedModels[0]?.value
      : '';
    const visModel = Array.isArray(pc.deepseek.visibleModels) ? pc.deepseek.visibleModels[0] : '';
    const chosen = typeof selModel === 'string' && selModel.trim() ? selModel : visModel;
    if (typeof chosen === 'string' && chosen.trim()) {
      next.providers.dsh.model = chosen.trim();
    }
  }

  return next;
}

function summarizeValue(val, maxLen = 400) {
  if (val === undefined || val === null) return '';
  let text = '';
  if (typeof val === 'string') {
    text = val;
  } else if (Array.isArray(val)) {
    text = val
      .map((item) => (item && typeof item.text === 'string' ? item.text : JSON.stringify(item)))
      .join('\n');
  } else {
    try {
      text = JSON.stringify(val);
    } catch {
      text = String(val);
    }
  }
  const clean = text.trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen)}…`;
}

function quoteWinCmdArg(arg) {
  const s = String(arg);
  if (s === '') return '""';
  if (!/[\s"&|<>^()%!]/.test(s)) return s;
  return `"${s.replace(/"/g, '\\"')}"`;
}

function buildSpawnSpec(provider, resolvedCli, options) {
  const { permissionMode, model, sessionId, systemPrompt } = options;
  const isTurbo = permissionMode !== 'normal';
  const args = [];
  let stdinPromptPrefix = '';

  if (provider === 'claude') {
    args.push('-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages');
    if (isTurbo) args.push('--dangerously-skip-permissions');
    if (model) args.push('--model', model);
    if (sessionId) args.push('--resume', sessionId);
    if (systemPrompt && systemPrompt.trim()) {
      args.push('--append-system-prompt', systemPrompt.trim());
    }
  } else if (provider === 'codex') {
    if (sessionId) {
      args.push('exec', 'resume', '--json', '--skip-git-repo-check');
      if (isTurbo) args.push('--dangerously-bypass-approvals-and-sandbox');
      if (model) args.push('-m', model);
      args.push(sessionId, '-');
    } else {
      args.push('exec', '--json', '--skip-git-repo-check');
      if (isTurbo) {
        args.push('--dangerously-bypass-approvals-and-sandbox');
      } else {
        args.push('-s', 'workspace-write');
      }
      if (model) args.push('-m', model);
      args.push('-');
    }
    if (systemPrompt && systemPrompt.trim() && !sessionId) {
      stdinPromptPrefix = `[System Instructions]\n${systemPrompt.trim()}\n\n[User Request]\n`;
    }
  } else if (provider === 'dsh') {
    args.push('--profile', 'headless', '--json');
    if (isTurbo) {
      args.push('--permission-mode', 'danger-full-access', '--approval-policy', 'never');
    } else {
      args.push('--permission-mode', 'workspace-write', '--approval-policy', 'ask');
    }
    if (sessionId) args.push('--session-id', sessionId);
    args.push('-');
    if (systemPrompt && systemPrompt.trim() && !sessionId) {
      stdinPromptPrefix = `[System Instructions]\n${systemPrompt.trim()}\n\n[User Request]\n`;
    }
  } else {
    throw new Error(`Unsupported CLI provider: ${provider}`);
  }

  return { resolvedCli, args, stdinPromptPrefix };
}

function createProviderParser(provider, emit) {
  let sawTextDelta = false;
  let capturedSessionId = '';
  let lastErrorText = '';
  const codexMessages = new Map();
  let dshTextSegments = [];

  function recordSession(id) {
    if (typeof id === 'string' && id.trim() && id.trim() !== capturedSessionId) {
      capturedSessionId = id.trim();
      emit({ type: 'session', sessionId: capturedSessionId });
    }
  }

  function handleLine(rawLine) {
    const line = rawLine.trim();
    if (!line) return;

    let obj = null;
    try {
      obj = JSON.parse(line);
    } catch {
      emit({ type: 'text-delta', text: `${rawLine}\n` });
      sawTextDelta = true;
      return;
    }

    if (!obj || typeof obj !== 'object') return;

    if (provider === 'claude') {
      if (obj.session_id) recordSession(obj.session_id);

      if (obj.type === 'stream_event' && obj.event && typeof obj.event === 'object') {
        const ev = obj.event;
        if (ev.type === 'content_block_delta' && ev.delta && typeof ev.delta === 'object') {
          if (ev.delta.type === 'text_delta' && typeof ev.delta.text === 'string') {
            sawTextDelta = true;
            emit({ type: 'text-delta', text: ev.delta.text });
          } else if (ev.delta.type === 'thinking_delta' && typeof ev.delta.thinking === 'string') {
            emit({ type: 'thinking-delta', text: ev.delta.thinking });
          }
        }
        return;
      }

      if (obj.type === 'assistant' && Array.isArray(obj.message?.content)) {
        for (const block of obj.message.content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'tool_use') {
            emit({
              type: 'tool-call',
              toolId: block.id || `${block.name}-${Date.now()}`,
              name: block.name || 'tool',
              input: summarizeValue(block.input),
              status: 'running',
            });
          } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking) {
            emit({ type: 'thinking-delta', text: block.thinking });
          } else if (block.type === 'text' && typeof block.text === 'string' && block.text && !sawTextDelta) {
            sawTextDelta = true;
            emit({ type: 'text-delta', text: block.text });
          }
        }
        return;
      }

      if (obj.type === 'user' && Array.isArray(obj.message?.content)) {
        for (const block of obj.message.content) {
          if (!block || typeof block !== 'object') continue;
          if (block.type === 'tool_result') {
            emit({
              type: 'tool-call',
              toolId: block.tool_use_id || 'tool',
              output: summarizeValue(block.content),
              status: block.is_error ? 'error' : 'done',
            });
          }
        }
        return;
      }

      if (obj.type === 'result') {
        if (obj.is_error) {
          lastErrorText = summarizeValue(obj.result || obj.error || 'Claude Code returned an error', 800);
        } else if (typeof obj.result === 'string' && obj.result && !sawTextDelta) {
          sawTextDelta = true;
          emit({ type: 'text-delta', text: obj.result });
        }
      }
      return;
    }

    if (provider === 'codex') {
      if (obj.type === 'thread.started' && obj.thread_id) {
        recordSession(obj.thread_id);
        return;
      }

      if (
        (obj.type === 'item.started' || obj.type === 'item.updated' || obj.type === 'item.completed') &&
        obj.item &&
        typeof obj.item === 'object'
      ) {
        const item = obj.item;
        const isCompleted = obj.type === 'item.completed';

        if (item.type === 'agent_message' && typeof item.text === 'string') {
          const itemId = item.id || 'default';
          codexMessages.set(itemId, item.text);
          const combined = Array.from(codexMessages.values()).join('\n\n');
          sawTextDelta = true;
          emit({ type: 'text-replace', text: combined });
          return;
        }

        if (item.type === 'reasoning' && typeof item.text === 'string' && item.text && isCompleted) {
          emit({ type: 'thinking-delta', text: `${item.text}\n` });
          return;
        }

        if (item.type === 'command_execution') {
          emit({
            type: 'tool-call',
            toolId: item.id || `cmd-${Date.now()}`,
            name: 'Shell',
            input: summarizeValue(item.command, 300),
            output: isCompleted ? summarizeValue(item.aggregated_output) : undefined,
            status: isCompleted ? (item.exit_code && item.exit_code !== 0 ? 'error' : 'done') : 'running',
          });
          return;
        }

        if (item.type === 'file_change') {
          const filesSummary = Array.isArray(item.changes)
            ? item.changes.map((c) => `${c.kind || 'edit'}: ${c.path || ''}`).join(', ')
            : summarizeValue(item.changes);
          emit({
            type: 'tool-call',
            toolId: item.id || `file-${Date.now()}`,
            name: 'FileChange',
            input: filesSummary,
            status: isCompleted ? (item.status === 'failed' ? 'error' : 'done') : 'running',
          });
          return;
        }

        if (item.type === 'mcp_tool_call') {
          emit({
            type: 'tool-call',
            toolId: item.id || `mcp-${Date.now()}`,
            name: item.tool ? `${item.server || 'mcp'}:${item.tool}` : 'MCP',
            input: summarizeValue(item.arguments),
            output: isCompleted ? summarizeValue(item.error || item.result) : undefined,
            status: isCompleted ? (item.error ? 'error' : 'done') : 'running',
          });
          return;
        }

        if (item.type === 'web_search') {
          emit({
            type: 'tool-call',
            toolId: item.id || `search-${Date.now()}`,
            name: 'WebSearch',
            input: summarizeValue(item.query),
            status: isCompleted ? 'done' : 'running',
          });
        }
        return;
      }

      if (obj.type === 'error' && obj.message) {
        lastErrorText = String(obj.message);
      } else if (obj.type === 'turn.failed' && obj.error?.message) {
        lastErrorText = String(obj.error.message);
      }
      return;
    }

    if (provider === 'dsh') {
      if (obj.sessionId) recordSession(obj.sessionId);
      if (obj.session_id) recordSession(obj.session_id);

      if (obj.type === 'thinking' && typeof obj.text === 'string' && obj.text) {
        emit({ type: 'thinking-delta', text: `${obj.text}\n` });
        return;
      }

      if (obj.type === 'text' && typeof obj.text === 'string' && obj.text) {
        dshTextSegments.push(obj.text);
        sawTextDelta = true;
        emit({ type: 'text-replace', text: dshTextSegments.join('\n\n') });
        return;
      }

      if (obj.type === 'tool_call') {
        emit({
          type: 'tool-call',
          toolId: obj.callId || obj.id || `dsh-tool-${Date.now()}`,
          name: obj.tool || obj.name || 'tool',
          input: summarizeValue(obj.input),
          status: 'running',
        });
        return;
      }

      if (obj.type === 'tool_result') {
        emit({
          type: 'tool-call',
          toolId: obj.callId || obj.id || 'tool',
          output: summarizeValue(obj.error || obj.result),
          status: obj.status === 'error' || obj.error ? 'error' : 'done',
        });
        return;
      }

      if (obj.type === 'error' && obj.message) {
        lastErrorText = String(obj.message);
        return;
      }

      if (obj.type === 'final') {
        if (obj.reason?.kind === 'error') {
          lastErrorText = summarizeValue(
            obj.reason?.error?.message || obj.reason?.error?.code || 'DSH run failed',
            800
          );
        }
        if (typeof obj.text === 'string' && obj.text.trim() && dshTextSegments.length === 0) {
          sawTextDelta = true;
          emit({ type: 'text-replace', text: obj.text });
        }
      }
    }
  }

  return {
    handleLine,
    getState: () => ({
      sawTextDelta,
      capturedSessionId,
      lastErrorText,
    }),
  };
}

function createAgentRunner({ mainWindow, dialog } = {}) {
  let settings = createDefaultSettings();
  let loadedFromDisk = false;
  let activeRun = null;

  function pushEvent(payload) {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('agent:event', payload);
    }
  }

  function probeClis() {
    return {
      claude: detectCliForProvider('claude', settings.providers.claude.cliPath),
      codex: detectCliForProvider('codex', settings.providers.codex.cliPath),
      dsh: detectCliForProvider('dsh', settings.providers.dsh.cliPath),
    };
  }

  function getStatusSync() {
    return {
      supported: true,
      settings,
      probes: probeClis(),
      activeRunId: activeRun ? activeRun.runId : null,
    };
  }

  async function saveSettingsToDisk(nextSettings) {
    await fs.mkdir(path.dirname(DEFAULT_SETTINGS_FILE), { recursive: true });
    await fs.writeFile(DEFAULT_SETTINGS_FILE, JSON.stringify(nextSettings, null, 2), 'utf8');
  }

  function ensureLoadedSync() {
    if (loadedFromDisk) return;
    loadedFromDisk = true;
    try {
      if (fsSync.existsSync(DEFAULT_SETTINGS_FILE)) {
        const raw = JSON.parse(fsSync.readFileSync(DEFAULT_SETTINGS_FILE, 'utf8'));
        settings = normalizeSettings(raw);
        return;
      }
    } catch {}

    // First-time initialization: seed from Obsidian Claudian config if present
    for (const candidate of CLAUDIAN_CANDIDATES) {
      try {
        if (!fsSync.existsSync(candidate)) continue;
        const claudianData = JSON.parse(fsSync.readFileSync(candidate, 'utf8'));
        settings = applyClaudianJson(settings, claudianData);
        break;
      } catch {}
    }

    const probes = probeClis();
    for (const p of CLI_PROVIDERS) {
      if (!settings.providers[p].cliPath && probes[p]?.resolvedPath) {
        settings.providers[p].cliPath = probes[p].resolvedPath;
      }
    }

    try {
      fsSync.mkdirSync(path.dirname(DEFAULT_SETTINGS_FILE), { recursive: true });
      fsSync.writeFileSync(DEFAULT_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    } catch {}
  }

  async function getStatus() {
    ensureLoadedSync();
    return getStatusSync();
  }

  async function saveSettings(patch) {
    ensureLoadedSync();
    const merged = {
      ...settings,
      ...(patch && typeof patch === 'object' ? patch : {}),
      providers: {
        ...settings.providers,
        ...(patch?.providers && typeof patch.providers === 'object'
          ? {
              claude: { ...settings.providers.claude, ...(patch.providers.claude || {}) },
              codex: { ...settings.providers.codex, ...(patch.providers.codex || {}) },
              dsh: { ...settings.providers.dsh, ...(patch.providers.dsh || {}) },
            }
          : {}),
      },
    };
    settings = normalizeSettings(merged);
    await saveSettingsToDisk(settings);
    const status = getStatusSync();
    pushEvent({ type: 'status', status });
    return { ok: true, status };
  }

  async function importClaudianConfig(customPath) {
    ensureLoadedSync();
    const candidates = customPath ? [stripOuterQuotes(customPath)] : CLAUDIAN_CANDIDATES;
    let sourcePath = '';
    for (const cand of candidates) {
      try {
        if (cand && fsSync.existsSync(cand)) {
          sourcePath = cand;
          break;
        }
      } catch {}
    }
    if (!sourcePath) {
      return {
        ok: false,
        error: '未找到 Obsidian Claudian 配置文件 (.claudian/claudian-settings.json)',
        status: getStatusSync(),
      };
    }

    try {
      const raw = JSON.parse(await fs.readFile(sourcePath, 'utf8'));
      settings = applyClaudianJson(settings, raw);
      const probes = probeClis();
      for (const p of CLI_PROVIDERS) {
        if (!settings.providers[p].cliPath && probes[p]?.resolvedPath) {
          settings.providers[p].cliPath = probes[p].resolvedPath;
        }
      }
      await saveSettingsToDisk(settings);
      const status = getStatusSync();
      pushEvent({ type: 'status', status });
      return { ok: true, sourcePath, status };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        status: getStatusSync(),
      };
    }
  }

  async function pickWorkspace() {
    ensureLoadedSync();
    if (!dialog) return { ok: false, canceled: true };
    const res = await dialog.showOpenDialog(mainWindow || undefined, {
      title: '选择 Agent 工作目录',
      defaultPath: settings.workspaceDir || defaultWorkspaceDir(),
      properties: ['openDirectory'],
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { ok: false, canceled: true, status: getStatusSync() };
    }
    const chosen = res.filePaths[0];
    await saveSettings({ workspaceDir: chosen });
    return { ok: true, workspaceDir: chosen, status: getStatusSync() };
  }

  async function pickCliExe(provider) {
    ensureLoadedSync();
    if (!dialog || !CLI_PROVIDERS.includes(provider)) return { ok: false, canceled: true };
    const filters =
      process.platform === 'win32'
        ? [{ name: 'CLI Executables', extensions: ['exe', 'cmd', 'bat'] }, { name: 'All Files', extensions: ['*'] }]
        : [{ name: 'All Files', extensions: ['*'] }];
    const current = settings.providers[provider]?.cliPath || probeClis()[provider]?.resolvedPath || '';
    const res = await dialog.showOpenDialog(mainWindow || undefined, {
      title: `选择 ${provider.toUpperCase()} CLI 可执行文件`,
      defaultPath: current || undefined,
      properties: ['openFile'],
      filters,
    });
    if (res.canceled || !res.filePaths?.[0]) {
      return { ok: false, canceled: true, status: getStatusSync() };
    }
    const chosen = res.filePaths[0];
    await saveSettings({
      providers: {
        [provider]: { cliPath: chosen },
      },
    });
    return { ok: true, cliPath: chosen, status: getStatusSync() };
  }

  function killChildTree(child) {
    if (!child || !child.pid) return;
    if (process.platform === 'win32') {
      try {
        execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          timeout: 4000,
          stdio: 'ignore',
        });
        return;
      } catch {}
    }
    try {
      child.kill('SIGTERM');
    } catch {}
  }

  async function stopRun(runId) {
    if (!activeRun || (runId && activeRun.runId !== runId)) {
      return { ok: false };
    }
    const target = activeRun;
    target.aborted = true;
    killChildTree(target.child);
    return { ok: true };
  }

  async function sendMessage(payload) {
    ensureLoadedSync();
    const {
      runId,
      provider: reqProvider,
      prompt,
      sessionId,
      workspaceDir: reqWorkspace,
      permissionMode: reqPermMode,
      model: reqModel,
      systemPrompt: reqSystemPrompt,
    } = payload || {};

    const provider = CLI_PROVIDERS.includes(reqProvider) ? reqProvider : settings.activeProvider;
    if (!CLI_PROVIDERS.includes(provider)) {
      return { ok: false, error: `Invalid CLI provider: ${provider}` };
    }
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return { ok: false, error: 'Prompt cannot be empty' };
    }

    if (activeRun) {
      await stopRun(activeRun.runId);
    }

    const providerCfg = settings.providers[provider] || { cliPath: '', model: '', envVars: '' };
    const probe = detectCliForProvider(provider, providerCfg.cliPath);
    if (!probe.installed || !probe.resolvedPath) {
      return {
        ok: false,
        error: `未找到 ${provider.toUpperCase()} CLI，请在「AI 模型设置」中检查或指定可执行文件路径。`,
      };
    }

    const cwdCandidate = stripOuterQuotes(reqWorkspace || settings.workspaceDir || defaultWorkspaceDir());
    const cwd = fsSync.existsSync(cwdCandidate) ? cwdCandidate : defaultWorkspaceDir();
    const permissionMode = reqPermMode || settings.permissionMode || 'turbo';
    const model = (typeof reqModel === 'string' ? reqModel : providerCfg.model || '').trim();
    const systemPrompt =
      typeof reqSystemPrompt === 'string' ? reqSystemPrompt : settings.systemPrompt || '';

    const spawnSpec = buildSpawnSpec(provider, probe.resolvedPath, {
      permissionMode,
      model,
      sessionId: typeof sessionId === 'string' && sessionId.trim() ? sessionId.trim() : '',
      systemPrompt,
    });

    const childEnv = {
      ...process.env,
      ...parseEnvText(settings.sharedEnv),
      ...parseEnvText(providerCfg.envVars),
    };

    const effectiveRunId = runId || `run-${Date.now()}`;
    const isWinBatch = process.platform === 'win32' && /\.(cmd|bat)$/i.test(spawnSpec.resolvedCli);
    let child;
    try {
      if (isWinBatch) {
        const comspec = process.env.ComSpec || 'cmd.exe';
        const fullCmd = [spawnSpec.resolvedCli, ...spawnSpec.args].map(quoteWinCmdArg).join(' ');
        child = spawn(comspec, ['/d', '/s', '/c', `"${fullCmd}"`], {
          cwd,
          env: childEnv,
          shell: false,
          windowsVerbatimArguments: true,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } else {
        child = spawn(spawnSpec.resolvedCli, spawnSpec.args, {
          cwd,
          env: childEnv,
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const runState = {
      runId: effectiveRunId,
      provider,
      child,
      aborted: false,
    };
    activeRun = runState;

    const parser = createProviderParser(provider, (evt) => {
      pushEvent({ ...evt, runId: effectiveRunId, provider });
    });

    let stdoutBuffer = '';
    let stderrTail = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdoutBuffer += chunk;
      let nlIdx;
      while ((nlIdx = stdoutBuffer.indexOf('\n')) !== -1) {
        const line = stdoutBuffer.slice(0, nlIdx);
        stdoutBuffer = stdoutBuffer.slice(nlIdx + 1);
        parser.handleLine(line);
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrTail += chunk;
      if (stderrTail.length > 6000) {
        stderrTail = stderrTail.slice(-4000);
      }
    });

    child.on('error', (err) => {
      if (activeRun === runState) activeRun = null;
      pushEvent({
        type: 'done',
        runId: effectiveRunId,
        provider,
        ok: false,
        aborted: runState.aborted,
        error: err.message || String(err),
      });
    });

    child.on('close', (code) => {
      if (stdoutBuffer.trim()) {
        parser.handleLine(stdoutBuffer);
        stdoutBuffer = '';
      }
      if (activeRun === runState) activeRun = null;
      const pState = parser.getState();
      const succeeded = !runState.aborted && code === 0 && !pState.lastErrorText;
      let errMsg = '';
      if (!succeeded && !runState.aborted) {
        errMsg =
          pState.lastErrorText ||
          stderrTail.trim().split(/\r?\n/).slice(-6).join('\n') ||
          `${provider.toUpperCase()} 退出码 ${code}`;
      }
      pushEvent({
        type: 'done',
        runId: effectiveRunId,
        provider,
        ok: succeeded,
        aborted: runState.aborted,
        exitCode: code,
        sessionId: pState.capturedSessionId || undefined,
        error: errMsg || undefined,
      });
    });

    try {
      const fullPrompt = `${spawnSpec.stdinPromptPrefix}${prompt}`;
      child.stdin.write(fullPrompt, 'utf8');
      child.stdin.end();
    } catch {}

    return { ok: true, runId: effectiveRunId, provider, resolvedPath: probe.resolvedPath };
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
    importClaudianConfig,
    pickWorkspace,
    pickCliExe,
    sendMessage,
    stopRun,
    shutdown,
  };
}

module.exports = {
  createAgentRunner,
  createProviderParser,
  buildSpawnSpec,
  parseEnvText,
  applyClaudianJson,
  detectCliForProvider,
  quoteWinCmdArg,
};

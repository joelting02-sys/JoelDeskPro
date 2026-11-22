import {
  AgentBackendMode,
  AgentRunnerStatus,
  AgentSettings,
  CliAgentProvider,
} from '../types/toolkit';

export interface AgentStreamEvent {
  type:
    | 'status'
    | 'session'
    | 'text-delta'
    | 'text-replace'
    | 'thinking-delta'
    | 'tool-call'
    | 'done';
  runId?: string;
  provider?: CliAgentProvider;
  sessionId?: string;
  text?: string;
  toolId?: string;
  name?: string;
  input?: string;
  output?: string;
  status?: AgentRunnerStatus | 'running' | 'done' | 'error';
  ok?: boolean;
  aborted?: boolean;
  exitCode?: number;
  error?: string;
}

export interface AgentDesktopApi {
  getStatus: () => Promise<AgentRunnerStatus>;
  saveSettings: (
    patch: Partial<Omit<AgentSettings, 'providers'>> & {
      providers?: Partial<Record<CliAgentProvider, Partial<AgentSettings['providers'][CliAgentProvider]>>>;
    }
  ) => Promise<{ ok: boolean; status?: AgentRunnerStatus; error?: string }>;
  importClaudian: (
    customPath?: string
  ) => Promise<{ ok: boolean; sourcePath?: string; error?: string; status?: AgentRunnerStatus }>;
  pickWorkspace: () => Promise<{
    ok: boolean;
    canceled?: boolean;
    workspaceDir?: string;
    status?: AgentRunnerStatus;
  }>;
  pickCli: (provider: CliAgentProvider) => Promise<{
    ok: boolean;
    canceled?: boolean;
    cliPath?: string;
    status?: AgentRunnerStatus;
  }>;
  send: (payload: {
    runId: string;
    provider: CliAgentProvider;
    prompt: string;
    sessionId?: string | null;
    workspaceDir?: string;
    permissionMode?: 'turbo' | 'normal';
    model?: string;
    systemPrompt?: string;
  }) => Promise<{ ok: boolean; runId?: string; provider?: CliAgentProvider; resolvedPath?: string; error?: string }>;
  stop: (runId?: string) => Promise<{ ok: boolean }>;
  onEvent: (listener: (event: AgentStreamEvent) => void) => () => void;
}

declare global {
  interface JoelDesktopApi {
    agent?: AgentDesktopApi;
  }
}

export const INITIAL_AGENT_STATUS: AgentRunnerStatus = {
  supported: false,
  settings: {
    activeProvider: 'claude',
    permissionMode: 'turbo',
    workspaceDir: '',
    sharedEnv: '',
    systemPrompt: '',
    providers: {
      claude: { cliPath: '', model: '', envVars: '' },
      codex: { cliPath: '', model: '', envVars: '' },
      dsh: { cliPath: '', model: '', envVars: '' },
    },
  },
  probes: {
    claude: { installed: false, resolvedPath: '' },
    codex: { installed: false, resolvedPath: '' },
    dsh: { installed: false, resolvedPath: '' },
  },
  activeRunId: null,
};

export function isDesktopAgentSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.joelDesktop?.isDesktop &&
      window.joelDesktop?.agent
  );
}

export const AGENT_PROVIDER_META: Record<
  AgentBackendMode,
  { id: AgentBackendMode; label: string; shortLabel: string; badge: string }
> = {
  claude: {
    id: 'claude',
    label: 'Claude Code',
    shortLabel: 'Claude',
    badge: 'Anthropic / Magpie',
  },
  codex: {
    id: 'codex',
    label: 'Codex CLI',
    shortLabel: 'Codex',
    badge: 'OpenAI Codex',
  },
  dsh: {
    id: 'dsh',
    label: 'DeepSeek Harness (DSH)',
    shortLabel: 'DSH',
    badge: 'DeepSeek Harness',
  },
  custom_endpoint: {
    id: 'custom_endpoint',
    label: 'HTTP API',
    shortLabel: 'HTTP API',
    badge: 'OpenAI API',
  },
};

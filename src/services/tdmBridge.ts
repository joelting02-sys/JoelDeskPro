export interface TdmBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TdmNativeSettings {
  tdm_exe_path: string;
  tdm_auto_launch: boolean;
  tdm_close_on_exit: boolean;
  tdm_hide_on_drag: boolean;
  tdm_capture_port: number;
}

export interface TdmStatus {
  supported: boolean;
  running: boolean;
  attached: boolean;
  visible: boolean;
  detached: boolean;
  starting: boolean;
  pid: number;
  hwnd: string;
  exePath: string;
  exeExists: boolean;
  lastError: string;
  settings?: TdmNativeSettings;
}

export interface TdmEvent {
  event: 'tdm-activated' | 'tdm-hidden-by-user' | 'tdm-exited';
  status?: TdmStatus;
}

export interface LocalEngineStatus {
  online: boolean;
  desktop?: boolean;
  packaged?: boolean;
}

declare global {
  interface JoelDesktopApi {
    isDesktop: boolean;
    platform: string;
    tdm: {
      getStatus: () => Promise<TdmStatus>;
      pickExe: () => Promise<{ ok: boolean; canceled?: boolean; exePath?: string; status?: TdmStatus }>;
      saveSettings: (patch: Partial<TdmNativeSettings>) => Promise<{ ok: boolean; status?: TdmStatus }>;
      attach: (
        bounds?: TdmBounds,
        options?: { autoLaunch?: boolean; visible?: boolean }
      ) => Promise<{ ok: boolean; error?: string; status?: TdmStatus }>;
      updateBounds: (bounds: TdmBounds) => Promise<{ ok: boolean }>;
      setVisible: (
        visible: boolean,
        bounds?: TdmBounds
      ) => Promise<{ ok: boolean; error?: string; status?: TdmStatus }>;
      detach: () => Promise<{ ok: boolean; status?: TdmStatus }>;
      relaunch: (bounds?: TdmBounds) => Promise<{ ok: boolean; error?: string; status?: TdmStatus }>;
      sendUrl: (payload: {
        url: string;
        filename?: string;
        referer?: string;
      }) => Promise<{ ok: boolean; needsExe?: boolean; error?: string }>;
      onEvent: (listener: (event: TdmEvent) => void) => () => void;
    };
  }

  interface Window {
    joelDesktop?: JoelDesktopApi;
  }
}

export const INITIAL_TDM_STATUS: TdmStatus = {
  supported: false,
  running: false,
  attached: false,
  visible: false,
  detached: false,
  starting: false,
  pid: 0,
  hwnd: '',
  exePath: '',
  exeExists: false,
  lastError: '',
};

export function isDesktopTdmSupported(): boolean {
  return Boolean(
    typeof window !== 'undefined' &&
      window.joelDesktop?.isDesktop &&
      window.joelDesktop.platform === 'win32'
  );
}

export async function probeLocalEngine(port: number): Promise<LocalEngineStatus> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 1100);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return { online: false };
    const data = (await res.json()) as {
      ok?: boolean;
      desktop?: boolean;
      packaged?: boolean;
    };
    return {
      online: Boolean(data?.ok),
      desktop: Boolean(data?.desktop),
      packaged: Boolean(data?.packaged),
    };
  } catch {
    return { online: false };
  } finally {
    window.clearTimeout(timer);
  }
}

export type AppLanguage = 'en' | 'zh';

const LANG_STORAGE_KEY = 'joeldeskpro_lang';

export function getInitialLanguage(): AppLanguage {
  try {
    const saved = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'zh') return saved;
  } catch {
    // Ignore storage access errors
  }
  return 'en';
}

export function saveLanguage(lang: AppLanguage): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // Ignore storage errors
  }
}

export interface Translations {
  documentTitle: string;
  header: {
    appTitle: string;
    updateBtn: string;
    updateAvailable: string;
  };
  toasts: {
    copied: (label: string) => string;
    terminalCmdLabel: string;
    whisperDirSaved: (name: string) => string;
    whisperStarted: string;
    whisperRestarted: string;
    whisperStartFailed: (detail?: string) => string;
    whisperStandaloneOpened: string;
    updateFound: (tag: string) => string;
    upToDate: string;
    updateCheckFailed: (detail: string) => string;
    updatePullSuccess: (msg: string) => string;
    updatePullFailed: (msg: string) => string;
    reloading: string;
  };
  transcribe: {
    webOnlyTitle: string;
    webOnlyDesc: (url: string) => string;
    retryProbeBtn: string;
    missingDirTitle: string;
    missingDirDesc: string;
    pickDirBtn: string;
    startingTitle: string;
    startingDesc: string;
    readyTitle: string;
    readyDesc: string;
    startBtn: string;
    retryStartBtn: string;
    restartBtn: string;
    changeDirBtn: string;
    openStandaloneBtn: string;
    reloadUiBtn: string;
    restartServiceBtn: string;
    statusGpuOnline: (gpu: string) => string;
    statusServiceOnline: string;
    statusStarting: string;
    statusOffline: string;
    desktopBridgeUnavailable: string;
  };
  updateModal: {
    title: string;
    close: string;
    checking: string;
    newVersionFound: (tag: string) => string;
    upToDate: (tag: string) => string;
    viewCommits: string;
    downloadZip: string;
    pullingLocal: string;
    winScriptSecondary: string;
    unixScript: string;
    copyPullCmd: string;
    reloadWebSync: string;
    hideLog: string;
    viewLog: string;
  };
}

export const TRANSLATIONS: Record<AppLanguage, Translations> = {
  en: {
    documentTitle: 'Joel Desk Pro — Cloud Whisper Studio',
    header: {
      appTitle: 'Joel Desk Pro',
      updateBtn: 'Updates',
      updateAvailable: 'Update available',
    },
    toasts: {
      copied: (label) => `Copied ${label}`,
      terminalCmdLabel: 'update command',
      whisperDirSaved: (name) => `Selected Whisper project: ${name}`,
      whisperStarted: 'Cloud Whisper Studio started',
      whisperRestarted: 'Cloud Whisper Studio restarted',
      whisperStartFailed: (detail) =>
        detail ? `Failed to start Cloud Whisper Studio: ${detail}` : 'Failed to start Cloud Whisper Studio',
      whisperStandaloneOpened: 'Opened Cloud Whisper Studio in browser',
      updateFound: (tag) => `New version available (${tag})`,
      upToDate: 'Already up to date',
      updateCheckFailed: (detail) => `Update check failed: ${detail}`,
      updatePullSuccess: (msg) => msg,
      updatePullFailed: (msg) => msg,
      reloading: 'Reloading client…',
    },
    transcribe: {
      webOnlyTitle: 'Cloud Whisper Studio Backend Offline',
      webOnlyDesc: (url) =>
        `Start the Cloud Whisper Studio desktop app or run its backend on ${url}, then click Retry.`,
      retryProbeBtn: 'Retry Connection',
      missingDirTitle: 'Locate Cloud Whisper Studio Folder',
      missingDirDesc:
        'Select your local cloud-whisper-studio folder so Joel Desk Pro can launch and embed it automatically.',
      pickDirBtn: 'Select Project Folder',
      startingTitle: 'Starting Cloud Whisper Studio…',
      startingDesc:
        'Launching Python backend on 127.0.0.1:8788 and loading transcription UI.',
      readyTitle: 'Cloud Whisper Studio is Stopped',
      readyDesc:
        'Start the embedded Cloud Whisper Studio service to connect Colab / Kaggle T4 GPUs and transcribe audio or video.',
      startBtn: 'Start & Load',
      retryStartBtn: 'Retry Start',
      restartBtn: 'Restart Service',
      changeDirBtn: 'Change Folder',
      openStandaloneBtn: 'Open in Browser',
      reloadUiBtn: 'Reload UI',
      restartServiceBtn: 'Restart',
      statusGpuOnline: (gpu) => `GPU Online · ${gpu}`,
      statusServiceOnline: 'Service Online',
      statusStarting: 'Starting…',
      statusOffline: 'Offline',
      desktopBridgeUnavailable: 'Desktop bridge unavailable',
    },
    updateModal: {
      title: 'Joel Desk Pro Updates',
      close: 'Close',
      checking: 'Checking…',
      newVersionFound: (tag) => `Update available (${tag})`,
      upToDate: (tag) => `Up to date (${tag})`,
      viewCommits: 'View Commit',
      downloadZip: 'Source ZIP',
      pullingLocal: 'Pulling & building…',
      winScriptSecondary: 'Windows (.bat)',
      unixScript: 'macOS / Linux (.sh)',
      copyPullCmd: 'Copy git pull Command',
      reloadWebSync: 'Reload Client',
      hideLog: 'Hide log',
      viewLog: 'View log',
    },
  },
  zh: {
    documentTitle: 'Joel Desk Pro — 云端语音转录工作台',
    header: {
      appTitle: 'Joel Desk Pro',
      updateBtn: '检查更新',
      updateAvailable: '有新版本',
    },
    toasts: {
      copied: (label) => `已复制${label}`,
      terminalCmdLabel: '拉取命令',
      whisperDirSaved: (name) => `已选择 Whisper 目录：${name}`,
      whisperStarted: 'Cloud Whisper Studio 已启动',
      whisperRestarted: 'Cloud Whisper Studio 已重启',
      whisperStartFailed: (detail) =>
        detail ? `Cloud Whisper Studio 启动失败：${detail}` : 'Cloud Whisper Studio 启动失败',
      whisperStandaloneOpened: '已在浏览器打开独立版 Cloud Whisper Studio',
      updateFound: (tag) => `发现新版本 (${tag})`,
      upToDate: '当前已是最新版本',
      updateCheckFailed: (detail) => `检查更新失败：${detail}`,
      updatePullSuccess: (msg) => msg,
      updatePullFailed: (msg) => msg,
      reloading: '正在刷新客户端…',
    },
    transcribe: {
      webOnlyTitle: '未检测到本地 Cloud Whisper Studio 服务',
      webOnlyDesc: (url) =>
        `请先启动本地 Cloud Whisper Studio（默认端口 ${url}）或使用桌面版 Joel Desk Pro，再点击重试连接。`,
      retryProbeBtn: '重试连接',
      missingDirTitle: '请选择 Cloud Whisper Studio 项目目录',
      missingDirDesc:
        '选择你本机的 cloud-whisper-studio 文件夹后，Joel Desk Pro 将自动托管启动并内嵌完整转录工作台。',
      pickDirBtn: '选择项目文件夹',
      startingTitle: '正在启动 Cloud Whisper Studio…',
      startingDesc:
        '正在拉起本地转录后端（127.0.0.1:8788）并准备 Colab / Kaggle T4 调度界面。',
      readyTitle: 'Cloud Whisper Studio 尚未运行',
      readyDesc:
        '点击下方按钮即可自动启动本地服务，并在软件内直接上传音视频、连接 Colab / Kaggle T4 免费 GPU 出稿。',
      startBtn: '启动并加载工作台',
      retryStartBtn: '重试启动',
      restartBtn: '重启服务',
      changeDirBtn: '更换目录',
      openStandaloneBtn: '浏览器独立打开',
      reloadUiBtn: '刷新界面',
      restartServiceBtn: '重启服务',
      statusGpuOnline: (gpu) => `GPU 在线 · ${gpu}`,
      statusServiceOnline: '服务在线',
      statusStarting: '启动中…',
      statusOffline: '未启动',
      desktopBridgeUnavailable: '桌面端桥接不可用',
    },
    updateModal: {
      title: 'Joel Desk Pro 版本更新',
      close: '关闭窗口',
      checking: '检查中…',
      newVersionFound: (tag) => `发现 GitHub 新版本 (${tag})`,
      upToDate: (tag) => `已是最新版本 (${tag})`,
      viewCommits: '查看提交记录',
      downloadZip: '下载最新源码 (.zip)',
      pullingLocal: '正在从 GitHub 拉取并构建…',
      winScriptSecondary: 'Windows 脚本 (.bat)',
      unixScript: 'macOS / Linux (.sh)',
      copyPullCmd: '复制拉取命令',
      reloadWebSync: '重新加载客户端',
      hideLog: '收起日志',
      viewLog: '查看日志',
    },
  },
};

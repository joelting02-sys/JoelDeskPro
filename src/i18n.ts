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
  views: {
    agent: string;
    transcribe: string;
    download: string;
    convert: string;
    settings: string;
  };
  sidebar: {
    closeSidebar: string;
    openSidebar: string;
    primaryNav: string;
    smartDispatch: string;
    manualWorkbenches: string;
    activeTasks: string;
    checkUpdates: string;
    newVersion: string;
  };
  topbar: {
    newChat: string;
    clearCompleted: string;
  };
  toasts: {
    copied: (label: string) => string;
    newChatStarted: string;
    clearedConversions: string;
    videoAudioQueued: string;
    cloudTranscribeQueued: string;
    whisperDirSelected: (name: string) => string;
    whisperRestarted: string;
    whisperOpenedStandalone: string;
    whisperBackendFailed: string;
    whisperDropFilePrompt: string;
    tdmDispatched: string;
    tdmDispatchFailed: string;
    tdmMissingExe: string;
    tdmExeSelected: (name: string) => string;
    tdmDetached: string;
    tdmReattached: string;
    tdmActivatedFromExt: string;
    foundGitHubCommit: (sha: string) => string;
    alreadyLatest: string;
    checkUpdateFailed: string;
    localUpdated: string;
    convertingTo: (fmt: string) => string;
    batchConvertStarted: string;
    configSaved: string;
    cleanUrlLabel: string;
    terminalCmdLabel: string;
    mdPlainLabel: string;
    srtLabel: string;
  };
  agent: {
    dropTitle: string;
    dropSubtitle: string;
    welcomeTitle: string;
    welcomeSubtitle: string;
    extractedLink: string;
    detectedLink: string;
    copyUrl: string;
    videoAutoExtract: string;
    audioTag: string;
    docTag: string;
    removeFile: (name: string) => string;
    addFiles: string;
    addFilesTitle: string;
    placeholder: string;
    sendCommand: string;
    downloadDispatch: string;
    addedToDownload: string;
    sendToDownload: string;
    cloudTranscribe: string;
    videoSourceHint: string;
    audioSourceHint: string;
    mdPlainLabel: string;
    transcribeStarted: string;
    startCloudTranscribe: string;
    docConvert: string;
    convertStarted: string;
    startConvert: string;
  };
  transcribe: {
    webOnlyTitle: string;
    webOnlyDesc: (url: string) => string;
    retryProbeBtn: string;
    missingDirTitle: string;
    missingDirDesc: string;
    pickDirBtn: string;
    openSettingsBtn: string;
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
  download: {
    webOnlyTitle: string;
    webOnlyDesc: string;
    missingExeTitle: string;
    missingExeDesc: string;
    pickExeBtn: string;
    openSettingsBtn: string;
    startingTitle: string;
    startingDesc: string;
    detachedTitle: string;
    detachedDesc: string;
    reattachBtn: string;
    hiddenTitle: string;
    hiddenDesc: string;
    readyTitle: string;
    readyDesc: string;
    restoreBtn: string;
    launchAndDockBtn: string;
    relaunchBtn: string;
    changeExeBtn: string;
    dockedUnderlayHint: string;
    resyncBtn: string;
    detachBtn: string;
    statusDocked: string;
    statusDetached: string;
    statusHidden: string;
  };
  convert: {
    presets: {
      auto: string;
      pdfDocx: string;
      docxPdf: string;
      pdfPng: string;
      mdPdf: string;
    };
    dropTitle: string;
    dropHint: string;
    queueTitle: string;
    itemCount: (n: number) => string;
    startAllReady: (n: number) => string;
    emptyQueue: string;
    selectFormatAria: string;
    convertBtn: string;
    converting: string;
    exportExt: (ext: string) => string;
    removeFile: string;
    outputHeader: (source: string, target: string) => string;
  };
  settings: {
    llmTitle: string;
    llmDesc: string;
    modeMock: string;
    modeCustom: string;
    baseUrl: string;
    modelId: string;
    testing: string;
    testedOk: string;
    validateEndpoint: string;
    whisperTitle: string;
    whisperDesc: string;
    whisperStatusWeb: string;
    whisperStatusGpuOnline: (gpu: string) => string;
    whisperStatusRunning: string;
    whisperStatusStarting: string;
    whisperStatusReady: string;
    whisperStatusMissing: string;
    whisperProjectDir: string;
    whisperDirPlaceholder: string;
    whisperPickDirBtn: string;
    whisperPort: string;
    whisperBuiltInSettingsTitle: string;
    whisperBuiltInSettingsDesc: string;
    whisperAutoStart: string;
    whisperCloseOnExit: string;
    whisperOpenDockedBtn: string;
    whisperRestartBtn: string;
    whisperOutputsBtn: string;
    whisperStandaloneBtn: string;
    tdmTitle: string;
    tdmDesc: string;
    tdmStatusWeb: string;
    tdmStatusRunning: string;
    tdmStatusDetached: string;
    tdmStatusReady: string;
    tdmStatusMissing: string;
    tdmExePath: string;
    tdmExePlaceholder: string;
    tdmPickExeBtn: string;
    tdmCapturePort: string;
    tdmExtensionTitle: string;
    tdmExtensionDesc: (port: number) => string;
    tdmAutoLaunch: string;
    tdmCloseOnExit: string;
    tdmHideOnDrag: string;
    tdmOpenDockedBtn: string;
    tdmDetachBtn: string;
    converterTitle: string;
    converterDesc: string;
    converterUrl: string;
    githubTitle: string;
    githubDesc: string;
    openUpdateBtn: string;
    githubRepo: string;
    githubBranch: string;
    autoCheckStartup: string;
    protocolTitle: string;
    protocolDesc: string;
    copy: string;
    protocols: {
      llm: string;
      transcribe: string;
      tdmCapture: string;
      convert: string;
    };
    saveConfig: string;
  };
  updateModal: {
    title: string;
    close: string;
    currentVersion: (v: string) => string;
    localCommit: (sha: string) => string;
    checking: string;
    checkGitHub: string;
    newVersionFound: (tag: string) => string;
    upToDate: (tag: string) => string;
    latestCommitPrefix: string;
    viewCommits: string;
    downloadZip: string;
    privateRepoNotice: string;
    clickCheckHint: (repo: string) => string;
    pullTitle: string;
    pullOnlineDesc: string;
    pullOfflineDesc: string;
    modeLocalOnline: string;
    modeWeb: string;
    pullingLocal: string;
    pullNowBtn: string;
    winScriptPrimary: string;
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
    documentTitle: 'Joel Desk Pro — AI Agent & Personal Productivity Workbench',
    views: {
      agent: 'AI Agent',
      transcribe: 'Transcription',
      download: 'Downloader',
      convert: 'Converter',
      settings: 'Models & API',
    },
    sidebar: {
      closeSidebar: 'Close sidebar',
      openSidebar: 'Open sidebar',
      primaryNav: 'Primary navigation',
      smartDispatch: 'Assistant',
      manualWorkbenches: 'Workbenches',
      activeTasks: 'Active Tasks',
      checkUpdates: 'Updates',
      newVersion: 'New',
    },
    topbar: {
      newChat: 'New Chat',
      clearCompleted: 'Clear Completed',
    },
    toasts: {
      copied: (label) => `Copied ${label}`,
      newChatStarted: 'Started a new conversation',
      clearedConversions: 'Cleared completed conversions',
      videoAudioQueued: 'Video sent to Cloud Whisper Studio (auto audio extraction)',
      cloudTranscribeQueued: 'Audio submitted to Cloud Whisper Studio queue',
      whisperDirSelected: (name) => `Selected Whisper Studio folder: ${name}`,
      whisperRestarted: 'Cloud Whisper Studio service restarted',
      whisperOpenedStandalone: 'Opened Cloud Whisper Studio in standalone window',
      whisperBackendFailed: 'Could not start or reach Cloud Whisper Studio backend',
      whisperDropFilePrompt: 'Drop your audio or video file into Cloud Whisper Studio',
      tdmDispatched: 'Sent link to TDM Fast',
      tdmDispatchFailed: 'Could not reach TDM Fast capture port',
      tdmMissingExe: 'Select your local TDM Fast .exe in Downloader or Settings first',
      tdmExeSelected: (name) => `Selected TDM executable: ${name}`,
      tdmDetached: 'Detached TDM Fast into standalone window',
      tdmReattached: 'Docked TDM Fast back into Downloader view',
      tdmActivatedFromExt: 'TDM Fast activated — switched to Downloader view',
      foundGitHubCommit: (sha) => `New GitHub commit available (${sha})`,
      alreadyLatest: 'Already on the latest GitHub commit',
      checkUpdateFailed: 'Update check failed',
      localUpdated: 'Local client updated to latest GitHub version',
      convertingTo: (fmt) => `Converting to ${fmt}`,
      batchConvertStarted: 'Started batch format conversion',
      configSaved: 'Configuration saved',
      cleanUrlLabel: 'clean URL',
      terminalCmdLabel: 'update command',
      mdPlainLabel: 'plain Markdown',
      srtLabel: 'SRT subtitles',
    },
    agent: {
      dropTitle: 'Drop files to analyze automatically',
      dropSubtitle:
        'Supports audio/video transcription (auto audio extraction) and document conversion',
      welcomeTitle: 'Drop a link or file, and tell me what to do',
      welcomeSubtitle:
        'Links are cleaned for TDM Fast automatically, media routes into Cloud Whisper Studio — or switch directly on the left.',
      extractedLink: 'Extracted link',
      detectedLink: 'Detected link',
      copyUrl: 'Copy URL',
      videoAutoExtract: 'Video · Auto audio extract',
      audioTag: 'Audio',
      docTag: 'Document',
      removeFile: (name) => `Remove ${name}`,
      addFiles: 'Attach files',
      addFilesTitle: 'Attach audio, video, or documents',
      placeholder: 'Paste a URL, drop audio/video/documents, or type an instruction…',
      sendCommand: 'Send',
      downloadDispatch: 'Send to Downloader',
      addedToDownload: 'Sent · Open TDM',
      sendToDownload: 'Download in TDM',
      cloudTranscribe: 'Cloud Whisper Studio',
      videoSourceHint: 'Video · Auto-extract audio',
      audioSourceHint: 'Audio source',
      mdPlainLabel: 'MD Plain',
      transcribeStarted: 'Submitted · Open Studio',
      startCloudTranscribe: 'Send to Whisper Studio',
      docConvert: 'Format Conversion',
      convertStarted: 'Converting · View',
      startConvert: 'Start Conversion',
    },
    transcribe: {
      webOnlyTitle: 'Cloud Whisper Studio Not Detected',
      webOnlyDesc: (url) =>
        `Launch Cloud Whisper Studio locally at ${url} or use the Joel Desk Pro Windows desktop app (.exe) to auto-start and embed it directly here.`,
      retryProbeBtn: 'Retry Connection',
      missingDirTitle: 'Locate Cloud Whisper Studio Folder',
      missingDirDesc:
        'Select your local cloud-whisper-studio project folder once. After that, Joel Desk Pro automatically starts and embeds your Colab / Kaggle transcription studio here.',
      pickDirBtn: 'Select Project Folder',
      openSettingsBtn: 'Open Settings',
      startingTitle: 'Starting Cloud Whisper Studio…',
      startingDesc: 'Launching local FastAPI + ffmpeg backend and loading your GPU workspace.',
      readyTitle: 'Cloud Whisper Studio Stopped',
      readyDesc: 'Click below to launch and embed Cloud Whisper Studio in this workspace.',
      startBtn: 'Start Whisper Studio',
      retryStartBtn: 'Retry Start',
      restartBtn: 'Restart Service',
      changeDirBtn: 'Change Folder',
      openStandaloneBtn: 'Pop Out Standalone',
      reloadUiBtn: 'Refresh UI',
      restartServiceBtn: 'Restart Service',
      statusGpuOnline: (gpu) => `GPU Ready · ${gpu}`,
      statusServiceOnline: 'Service Online',
      statusStarting: 'Starting…',
      statusOffline: 'Stopped',
      desktopBridgeUnavailable: 'Desktop save dialog is only available in Joel Desk Pro desktop app',
    },
    download: {
      webOnlyTitle: 'Windows Desktop Only',
      webOnlyDesc:
        'TDM Fast native window docking runs inside the Joel Desk Pro Windows desktop app (.exe). Launch the Windows client to dock TDM Fast here.',
      missingExeTitle: 'Locate TDM Fast Executable',
      missingExeDesc:
        'Select your local TDM Fast .exe once. After that, opening Downloader automatically launches and docks TDM Fast into this panel, while Chrome keeps using your native TDM Fast extension.',
      pickExeBtn: 'Select TDM Fast (.exe)',
      openSettingsBtn: 'Open Settings',
      startingTitle: 'Launching & Docking TDM Fast…',
      startingDesc: 'Waiting for native TDM Fast window and aligning inside workbench bounds.',
      detachedTitle: 'TDM Fast Detached to Standalone Window',
      detachedDesc: 'TDM Fast is currently running in its own independent window.',
      reattachBtn: 'Dock Back Inside Desk Pro',
      hiddenTitle: 'TDM Fast Hidden in Background',
      hiddenDesc:
        'Downloads continue running in TDM Fast. Restore it into this panel or relaunch it below.',
      readyTitle: 'TDM Fast Ready to Dock',
      readyDesc: 'Click below to launch and dock TDM Fast inside Joel Desk Pro.',
      restoreBtn: 'Show TDM Interface',
      launchAndDockBtn: 'Launch & Dock TDM',
      relaunchBtn: 'Relaunch TDM',
      changeExeBtn: 'Change Path',
      dockedUnderlayHint: 'TDM Fast is docked above this area.',
      resyncBtn: 'Re-align Window',
      detachBtn: 'Pop Out Standalone',
      statusDocked: 'TDM Docked',
      statusDetached: 'Standalone',
      statusHidden: 'Background',
    },
    convert: {
      presets: {
        auto: 'Auto Detect',
        pdfDocx: 'PDF → Word',
        docxPdf: 'Word → PDF',
        pdfPng: 'PDF → Image',
        mdPdf: 'Markdown → PDF',
      },
      dropTitle: 'Drop documents, audio, or video files to match target formats',
      dropHint: 'Supports PDF / Word / Markdown as well as MP4 / MKV / MOV / MP3 / WAV / FLAC',
      queueTitle: 'Conversion Queue',
      itemCount: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
      startAllReady: (n) => `Convert All (${n})`,
      emptyQueue: 'No files in queue. Drop documents or media above to begin.',
      selectFormatAria: 'Select target format',
      convertBtn: 'Convert',
      converting: 'Converting',
      exportExt: (ext) => `Export .${ext}`,
      removeFile: 'Remove file',
      outputHeader: (source, target) =>
        `Joel Desk Pro Format Conversion Output\nSource: ${source}\nTarget: ${target}\n`,
    },
    settings: {
      llmTitle: 'AI Model Endpoint',
      llmDesc:
        'Compatible with Ollama, LM Studio, vLLM, and OpenAI-compatible APIs for Agent routing',
      modeMock: 'Built-in Local Router',
      modeCustom: 'Custom Endpoint',
      baseUrl: 'Base URL',
      modelId: 'Model ID',
      testing: 'Validating…',
      testedOk: 'Endpoint format valid',
      validateEndpoint: 'Validate Format',
      whisperTitle: 'Cloud Whisper Studio Integration',
      whisperDesc:
        'Automatically launch and embed your local Cloud Whisper Studio inside the Transcription workbench with native Save As support',
      whisperStatusWeb: 'Desktop App Only',
      whisperStatusGpuOnline: (gpu) => `GPU Online · ${gpu}`,
      whisperStatusRunning: 'Running · Embedded',
      whisperStatusStarting: 'Starting…',
      whisperStatusReady: 'Folder Located',
      whisperStatusMissing: 'Folder Not Found',
      whisperProjectDir: 'Local Cloud Whisper Studio Folder',
      whisperDirPlaceholder: 'Select folder containing backend/main.py',
      whisperPickDirBtn: 'Browse Folder',
      whisperPort: 'Local Service Port',
      whisperBuiltInSettingsTitle: 'Colab / Kaggle & Model Settings',
      whisperBuiltInSettingsDesc:
        'Configure Colab GPU tier, Kaggle credentials, Whisper model, and idle auto-shutdown directly inside Cloud Whisper Studio ⚙ Settings.',
      whisperAutoStart: 'Auto-start Cloud Whisper Studio backend when launching Joel Desk Pro',
      whisperCloseOnExit: 'Stop managed Cloud Whisper Studio backend when quitting Joel Desk Pro',
      whisperOpenDockedBtn: 'Open Transcription Workbench',
      whisperRestartBtn: 'Restart Backend',
      whisperOutputsBtn: 'Open Outputs Folder',
      whisperStandaloneBtn: 'Launch Standalone',
      tdmTitle: 'TDM Fast Downloader Integration',
      tdmDesc:
        'Dock your local TDM Fast window directly inside Downloader while keeping the native Chrome TDM extension running intact',
      tdmStatusWeb: 'Desktop App Only',
      tdmStatusRunning: 'Running & Docked',
      tdmStatusDetached: 'Running Standalone',
      tdmStatusReady: 'Executable Ready',
      tdmStatusMissing: 'Path Not Set',
      tdmExePath: 'Local TDM Fast Executable (.exe)',
      tdmExePlaceholder: 'Select TDM_Fast_*.exe on your PC',
      tdmPickExeBtn: 'Browse .exe',
      tdmCapturePort: 'TDM Capture Port',
      tdmExtensionTitle: 'Chrome Native TDM Extension',
      tdmExtensionDesc: (port) =>
        `Keep using the original TDM Fast Chrome extension as-is (127.0.0.1:${port}). Captures automatically wake Downloader.`,
      tdmAutoLaunch: 'Auto-launch & dock TDM when entering Downloader',
      tdmCloseOnExit: 'Close TDM process when quitting Joel Desk Pro',
      tdmHideOnDrag: 'Temporarily hide TDM while dragging window',
      tdmOpenDockedBtn: 'Open & Dock Downloader',
      tdmDetachBtn: 'Pop Out Standalone',
      converterTitle: 'Document & Media Converter',
      converterDesc: 'Configure local LibreOffice / Pandoc conversion backend endpoint',
      converterUrl: 'Converter Service URL',
      githubTitle: 'GitHub Client Updates',
      githubDesc:
        'Pull updates from GitHub via local Git (works with private repos) or check remote commits when public',
      openUpdateBtn: 'Open Updater',
      githubRepo: 'GitHub Repository (owner/repo)',
      githubBranch: 'Branch',
      autoCheckStartup: 'Check GitHub automatically on startup (requires public repo)',
      protocolTitle: 'Backend JSON Protocol Reference',
      protocolDesc: 'Inspect the 4 standard local adapter request schemas',
      copy: 'Copy',
      protocols: {
        llm: 'LLM Intent Router (OpenAI-compatible)',
        transcribe: 'Cloud Whisper Studio (/api/transcribe)',
        tdmCapture: 'TDM Native Capture Endpoint',
        convert: 'Document Format Conversion',
      },
      saveConfig: 'Save Configuration',
    },
    updateModal: {
      title: 'Joel Desk Pro Updates',
      close: 'Close',
      currentVersion: (v) => `Version v${v}`,
      localCommit: (sha) => `Local ${sha}`,
      checking: 'Checking…',
      checkGitHub: 'Check GitHub',
      newVersionFound: (tag) => `Update available (${tag})`,
      upToDate: (tag) => `Up to date (${tag})`,
      latestCommitPrefix: 'Latest commit: ',
      viewCommits: 'View Commit',
      downloadZip: 'Source ZIP',
      privateRepoNotice:
        'Private repo tip: Local Git pull below works directly with your PC’s Git login even while private. Remote version checking in the browser requires temporarily setting the repo to Public.',
      clickCheckHint: (repo) =>
        `Click "Check GitHub" to query ${repo} (when public), or pull directly via Local Git below.`,
      pullTitle: 'Pull Latest Code to Local Client',
      pullOnlineDesc:
        'Local engine online: click below to run git pull + npm install + npm run build (works with private repos via local Git auth).',
      pullOfflineDesc:
        'Run a one-click update script on your computer (uses your local Git login — works even when the repo is private).',
      modeLocalOnline: 'Desktop Client Online',
      modeWeb: 'Client Offline',
      pullingLocal: 'Pulling & building…',
      pullNowBtn: 'Pull Update via Local Git',
      winScriptPrimary: 'Windows Update Script (.bat)',
      winScriptSecondary: 'Windows (.bat)',
      unixScript: 'macOS / Linux (.sh)',
      copyPullCmd: 'Copy git pull Command',
      reloadWebSync: 'Reload Client',
      hideLog: 'Hide log',
      viewLog: 'View log',
    },
  },
  zh: {
    documentTitle: 'Joel Desk Pro — 极简桌面端 AI 助手与效率工具箱',
    views: {
      agent: 'AI 助手',
      transcribe: '语音转录',
      download: '高速下载',
      convert: '格式转换',
      settings: '模型与接口',
    },
    sidebar: {
      closeSidebar: '关闭侧边栏',
      openSidebar: '打开侧边栏',
      primaryNav: '主功能导航',
      smartDispatch: '智能调度',
      manualWorkbenches: '手动工作台',
      activeTasks: '当前任务',
      checkUpdates: '检查更新',
      newVersion: '新版本',
    },
    topbar: {
      newChat: '新建对话',
      clearCompleted: '清理已完成',
    },
    toasts: {
      copied: (label) => `已复制${label}`,
      newChatStarted: '已开启新对话',
      clearedConversions: '已清理已完成的转换记录',
      videoAudioQueued: '已送入 Cloud Whisper Studio（将自动抽离音轨并转录）',
      cloudTranscribeQueued: '已送入 Cloud Whisper Studio 转录队列',
      whisperDirSelected: (name) => `已选定 Cloud Whisper Studio 目录：${name}`,
      whisperRestarted: '已重启 Cloud Whisper Studio 后端服务',
      whisperOpenedStandalone: '已在独立窗口打开 Cloud Whisper Studio',
      whisperBackendFailed: '无法启动或连接 Cloud Whisper Studio 后端服务',
      whisperDropFilePrompt: '请将音视频直接拖入下方的 Cloud Whisper Studio 上传区',
      tdmDispatched: '已将链接发送给 TDM Fast',
      tdmDispatchFailed: '无法连接 TDM Fast 接收端口，请确认已启动',
      tdmMissingExe: '请先在「高速下载」或「模型与接口」中选择本机 TDM Fast 程序路径',
      tdmExeSelected: (name) => `已选定 TDM 程序：${name}`,
      tdmDetached: '已将 TDM Fast 弹出为独立窗口',
      tdmReattached: '已将 TDM Fast 重新贴合回工具箱',
      tdmActivatedFromExt: '检测到 TDM Fast 唤起，已自动切换到下载页',
      foundGitHubCommit: (sha) => `发现 GitHub 新提交 (${sha})`,
      alreadyLatest: '当前已是 GitHub 最新版本',
      checkUpdateFailed: '检查更新失败',
      localUpdated: '本地客户端已更新至 GitHub 最新版本',
      convertingTo: (fmt) => `正在转换为 ${fmt}`,
      batchConvertStarted: '已开始批量格式转换',
      configSaved: '配置已保存',
      cleanUrlLabel: '纯链接',
      terminalCmdLabel: '终端更新命令',
      mdPlainLabel: '无时间轴 Markdown',
      srtLabel: 'SRT 字幕',
    },
    agent: {
      dropTitle: '松开文件，交给 AI 自动识别',
      dropSubtitle: '支持音视频转录（送入 Cloud Whisper Studio）及 PDF / Word 文档转换',
      welcomeTitle: '丢入链接、文件，直接说你想做什么',
      welcomeSubtitle:
        'AI 助手会自动清洗链接发给 TDM Fast、把音视频直接送入 Cloud Whisper Studio 转录；也可在左侧直达工作台。',
      extractedLink: '已精准提取链接',
      detectedLink: '已识别链接',
      copyUrl: '复制纯链',
      videoAutoExtract: '视频·自动抽音轨',
      audioTag: '音频',
      docTag: '文档',
      removeFile: (name) => `移除 ${name}`,
      addFiles: '添加文件',
      addFilesTitle: '添加音视频或文档',
      placeholder: '粘贴带杂字的链接、拖入 PDF/音视频，或直接输入指令…',
      sendCommand: '发送指令',
      downloadDispatch: '高速下载调度',
      addedToDownload: '已发送 · 打开 TDM',
      sendToDownload: '发送到 TDM 下载',
      cloudTranscribe: 'Cloud Whisper Studio 转录',
      videoSourceHint: '视频源 · 将自动提取音轨',
      audioSourceHint: '音频源',
      mdPlainLabel: 'MD 无时间轴',
      transcribeStarted: '已送入 · 打开转录台',
      startCloudTranscribe: '送入 Whisper Studio 转录',
      docConvert: '文档格式转换',
      convertStarted: '已开始转换 · 查看',
      startConvert: '开始转换',
    },
    transcribe: {
      webOnlyTitle: '未检测到 Cloud Whisper Studio 本地服务',
      webOnlyDesc: (url) =>
        `请在本机运行 Cloud Whisper Studio（${url}），或启动 Windows 桌面版 Joel Desk Pro (.exe) 以自动拉起并无缝内嵌完整界面。`,
      retryProbeBtn: '重新检测连接',
      missingDirTitle: '定位 Cloud Whisper Studio 项目目录',
      missingDirDesc:
        '选择一次电脑上的 cloud-whisper-studio 工程文件夹后，点击「语音转录」会自动无黑框启动并在当前区域无缝运行 Colab / Kaggle 云端听写。',
      pickDirBtn: '浏览选择项目目录',
      openSettingsBtn: '打开设置',
      startingTitle: '正在启动 Cloud Whisper Studio…',
      startingDesc: '正在后台拉起 FastAPI 听写服务与 ffmpeg 音频瘦身管道，马上就绪。',
      readyTitle: 'Cloud Whisper Studio 未运行',
      readyDesc: '点击下方按钮立即启动并内嵌到当前语音转录工作区。',
      startBtn: '启动 Whisper Studio',
      retryStartBtn: '重试启动',
      restartBtn: '重启服务',
      changeDirBtn: '更换目录',
      openStandaloneBtn: '独立窗口打开',
      reloadUiBtn: '刷新界面',
      restartServiceBtn: '重启服务',
      statusGpuOnline: (gpu) => `绿灯就绪 · ${gpu}`,
      statusServiceOnline: '服务在线',
      statusStarting: '启动中…',
      statusOffline: '未启动',
      desktopBridgeUnavailable: '仅桌面版客户端支持调用系统原生保存弹窗',
    },
    download: {
      webOnlyTitle: '仅 Windows 桌面客户端可用',
      webOnlyDesc:
        '原生 TDM Fast 窗口贴合仅在 Windows 版 Joel Desk Pro (.exe) 中运行。请启动桌面端以在此区域直接内嵌操作 TDM Fast。',
      missingExeTitle: '选择本机 TDM Fast 程序 (.exe)',
      missingExeDesc:
        '选择一次电脑上的 TDM Fast 主程序路径后，点击「高速下载」会自动启动并贴合进此区域；你的 Chrome 原版 TDM 插件继续按原方式工作。',
      pickExeBtn: '选择 TDM Fast (.exe)',
      openSettingsBtn: '打开设置',
      startingTitle: '正在启动并贴合 TDM Fast…',
      startingDesc: '正在等待原生 TDM 窗口就绪并对齐到工作台区域。',
      detachedTitle: 'TDM Fast 已弹出为独立窗口',
      detachedDesc: '当前 TDM 正在独立窗口中运行，所有下载任务正常进行中。',
      reattachBtn: '重新贴合回工具箱',
      hiddenTitle: 'TDM Fast 已收起到后台',
      hiddenDesc: '下载仍在后台运行，你可以一键唤回此区域或重新启动 TDM。',
      readyTitle: 'TDM Fast 已就绪',
      readyDesc: '点击下方按钮将本机 TDM Fast 贴合进当前下载界面。',
      restoreBtn: '唤出 TDM 界面',
      launchAndDockBtn: '启动并贴合 TDM',
      relaunchBtn: '重启 / 唤回 TDM',
      changeExeBtn: '更换程序路径',
      dockedUnderlayHint: 'TDM Fast 已贴合运行于上方区域。',
      resyncBtn: '重新对齐窗口',
      detachBtn: '独立弹出',
      statusDocked: 'TDM 已贴合',
      statusDetached: '独立窗口',
      statusHidden: '后台运行',
    },
    convert: {
      presets: {
        auto: '自动识别',
        pdfDocx: 'PDF → Word',
        docxPdf: 'Word → PDF',
        pdfPng: 'PDF → 图片',
        mdPdf: 'Markdown → PDF',
      },
      dropTitle: '拖入文档或音视频文件，自动匹配可转换的目标格式',
      dropHint: '支持 PDF / Word / Markdown 以及 MP4 / MKV / MOV / MP3 / WAV / FLAC 批量互转',
      queueTitle: '转换队列',
      itemCount: (n) => `${n} 项`,
      startAllReady: (n) => `全部开始转换 (${n})`,
      emptyQueue: '暂无待转换文件，拖入文件即可开始',
      selectFormatAria: '选择目标格式',
      convertBtn: '转换',
      converting: '转换中',
      exportExt: (ext) => `导出 .${ext}`,
      removeFile: '移除文件',
      outputHeader: (source, target) =>
        `Joel Desk Pro 格式转换输出\n源文件: ${source}\n目标格式: ${target}\n`,
    },
    settings: {
      llmTitle: 'AI 大模型接口',
      llmDesc: '兼容 Ollama、LM Studio、vLLM 及标准 OpenAI API 协议，供 AI 助手调度工具',
      modeMock: '内置本地路由',
      modeCustom: '本地/自定义端点',
      baseUrl: 'Base URL',
      modelId: '模型标识 (Model ID)',
      testing: '检测中…',
      testedOk: '接口格式校验通过',
      validateEndpoint: '校验端点格式',
      whisperTitle: 'Cloud Whisper Studio 转录集成',
      whisperDesc:
        '自动托管并无缝内嵌本机 Cloud Whisper Studio，复用真实 Colab / Kaggle GPU 与系统原生另存为保存弹窗',
      whisperStatusWeb: '仅桌面版可用',
      whisperStatusGpuOnline: (gpu) => `绿灯就绪 · ${gpu}`,
      whisperStatusRunning: '运行中 · 已内嵌',
      whisperStatusStarting: '启动中…',
      whisperStatusReady: '已定位目录',
      whisperStatusMissing: '未定位目录',
      whisperProjectDir: '本机 Cloud Whisper Studio 项目目录',
      whisperDirPlaceholder: '请选择包含 backend/main.py 的工程目录',
      whisperPickDirBtn: '浏览选择目录',
      whisperPort: '本地监听端口',
      whisperBuiltInSettingsTitle: '算力与模型详细设置',
      whisperBuiltInSettingsDesc:
        'Colab GPU 规格、Kaggle 凭据（kaggle.json）、Whisper 模型及闲置自动关机开关直接在「语音转录」右上角 ⚙ 设置中管理。',
      whisperAutoStart: '启动 Joel Desk Pro 时自动拉起 Cloud Whisper Studio 后端',
      whisperCloseOnExit: '关闭 Joel Desk Pro 时同时停止其托管的后端进程',
      whisperOpenDockedBtn: '前往语音转录',
      whisperRestartBtn: '重启后端服务',
      whisperOutputsBtn: '打开输出目录',
      whisperStandaloneBtn: '独立窗口运行',
      tdmTitle: 'TDM Fast 下载器集成',
      tdmDesc: '将本机 TDM Fast 界面直接贴合进「高速下载」，Chrome 继续直接使用原版 TDM Fast 插件',
      tdmStatusWeb: '仅桌面版可用',
      tdmStatusRunning: '运行中 · 已贴合',
      tdmStatusDetached: '独立窗口运行中',
      tdmStatusReady: '已定位程序',
      tdmStatusMissing: '未找到程序',
      tdmExePath: '本机 TDM Fast 程序路径 (.exe)',
      tdmExePlaceholder: '请选择本机 TDM_Fast_*.exe 路径',
      tdmPickExeBtn: '浏览选择 .exe',
      tdmCapturePort: 'TDM 接收端口',
      tdmExtensionTitle: 'Chrome 原版 TDM 插件直连',
      tdmExtensionDesc: (port) =>
        `继续使用浏览器原本安装的 TDM Fast 插件（端口 127.0.0.1:${port}），捕获任务时工具箱会自动切到下载页。`,
      tdmAutoLaunch: '切换到「高速下载」时自动启动并贴合 TDM',
      tdmCloseOnExit: '关闭 Joel Desk Pro 时同时退出 TDM 进程',
      tdmHideOnDrag: '拖动主窗口时暂隐 TDM（松手即贴回）',
      tdmOpenDockedBtn: '前往下载并贴合',
      tdmDetachBtn: '独立窗口弹出',
      converterTitle: '文档与格式转换接口',
      converterDesc: '配置本地 LibreOffice / Pandoc 格式转换后端地址',
      converterUrl: '文档转换服务地址',
      githubTitle: 'GitHub 客户端更新',
      githubDesc:
        '私有仓库可直接用本机 Git 一键拉取；如需在网页内在线检测最新提交，可临时公开仓库后点击检查',
      openUpdateBtn: '打开更新面板',
      githubRepo: 'GitHub 仓库 (owner/repo)',
      githubBranch: '更新分支 (Branch)',
      autoCheckStartup: '启动时自动检测 GitHub 最新提交（需公开仓库）',
      protocolTitle: '后端对接 JSON 协议参考',
      protocolDesc: '查看当前保留的 4 个标准本地接口结构',
      copy: '复制',
      protocols: {
        llm: '大模型意图路由 (OpenAI 兼容)',
        transcribe: 'Cloud Whisper Studio (/api/transcribe)',
        tdmCapture: 'TDM 原生任务接收端口',
        convert: '文档格式转换',
      },
      saveConfig: '保存配置',
    },
    updateModal: {
      title: 'Joel Desk Pro 版本更新',
      close: '关闭窗口',
      currentVersion: (v) => `当前版本 v${v}`,
      localCommit: (sha) => `本地 ${sha}`,
      checking: '检查中…',
      checkGitHub: '检查 GitHub 更新',
      newVersionFound: (tag) => `发现 GitHub 新版本 (${tag})`,
      upToDate: (tag) => `已是最新版本 (${tag})`,
      latestCommitPrefix: '最新提交：',
      viewCommits: '查看提交记录',
      downloadZip: '下载最新源码 (.zip)',
      privateRepoNotice:
        '私有仓库说明：下方本机 Git 一键拉取直接复用你电脑已登录的 Git 凭据，仓库保持私有也能拉取；只有上方网页在线查提交时才需临时公开仓库。',
      clickCheckHint: (repo) =>
        `仓库公开时可点击右上角「检查 GitHub 更新」读取 ${repo}；私有仓库请直接用下方本机 Git 拉取。`,
      pullTitle: '客户端直接拉取最新代码',
      pullOnlineDesc:
        '本地引擎在线：点击下方按钮自动执行 git pull + npm run build（私有仓库只要本机 Git 已登录即可直拉）。',
      pullOfflineDesc:
        '下载一键更新脚本或复制命令到终端运行，直接走本机 Git 凭据拉取（私有仓库可用）。',
      modeLocalOnline: '桌面客户端在线',
      modeWeb: '客户端离线',
      pullingLocal: '正在从 GitHub 拉取并构建…',
      pullNowBtn: '一键拉取 GitHub 更新',
      winScriptPrimary: 'Windows 一键更新脚本 (.bat)',
      winScriptSecondary: 'Windows 脚本 (.bat)',
      unixScript: 'macOS / Linux (.sh)',
      copyPullCmd: '复制拉取命令',
      reloadWebSync: '重新加载客户端',
      hideLog: '收起日志',
      viewLog: '查看日志',
    },
  },
};

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
    stages: {
      queued: string;
      extracting_audio: string;
      connecting_gpu: string;
      downloading_model: string;
      transcribing: string;
      completed: string;
    };
    videoAutoHint: string;
    audioDirectHint: string;
    dropPrompt: string;
    dropHint: string;
    clearSelected: string;
    cloudCompute: string;
    exportFormat: string;
    srtSubtitle: string;
    mdPlain: string;
    language: string;
    langAuto: string;
    langZh: string;
    langEn: string;
    modelPresets: string;
    startVideoTranscribe: string;
    startAudioTranscribe: string;
    queueTitle: string;
    itemCount: (n: number) => string;
    emptyQueue: string;
    deleteTask: string;
    previewTitle: string;
    copy: string;
    exportExt: (ext: string) => string;
    selectTaskHint: string;
    runningOn: (provider: string) => string;
    stepDone: string;
    stepRunning: string;
    stepWaiting: string;
    mdPreviewHint: string;
    compute: {
      connectColab: string;
      connectKaggle: string;
      startGpu: string;
      stopGpu: string;
      cancelStart: string;
      retryStart: string;
      stopping: string;
      refreshStatus: string;
      stopOrphan: (count: number) => string;
      statusOffline: string;
      statusStarting: string;
      statusOnline: string;
      statusStopping: string;
      statusError: string;
      autoShutdownLabel: string;
      manualHint: string;
      queueProtectedHint: (count: number) => string;
      idleCountdownHint: (mmss: string) => string;
      minutesUnit: (m: number) => string;
      openedColabLogin: string;
      openedKaggleLogin: string;
      startingComputeToast: (provider: string, gpu: string) => string;
      stoppedComputeToast: string;
      refreshedComputeToast: string;
    };
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
    cloudTitle: string;
    cloudDesc: string;
    colabUrl: string;
    kaggleUrl: string;
    colabGpuSpec: string;
    autoShutdownTitle: string;
    autoShutdownMinutes: string;
    ffmpegExtract: string;
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
      videoAudioQueued: 'Video detected — extracting audio track & queuing transcription',
      cloudTranscribeQueued: 'Submitted to cloud T4 transcription queue',
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
        'Links are cleaned for TDM Fast automatically, media and documents route to the right tool — or switch directly on the left.',
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
      cloudTranscribe: 'Cloud Transcription',
      videoSourceHint: 'Video · Auto-extract audio',
      audioSourceHint: 'Audio source',
      mdPlainLabel: 'MD Plain',
      transcribeStarted: 'Started · View Progress',
      startCloudTranscribe: 'Start Transcription',
      docConvert: 'Format Conversion',
      convertStarted: 'Converting · View',
      startConvert: 'Start Conversion',
    },
    transcribe: {
      stages: {
        queued: 'Queued',
        extracting_audio: 'Extracting audio track (16kHz WAV)',
        connecting_gpu: 'Connecting cloud T4 GPU',
        downloading_model: 'Loading model weights',
        transcribing: 'Running faster-whisper inference',
        completed: 'Completed',
      },
      videoAutoHint: 'Video detected · 16kHz audio track will be extracted automatically',
      audioDirectHint: 'Audio detected · Ready for direct cloud T4 transcription',
      dropPrompt: 'Drop an audio or video file here, or click to browse',
      dropHint: 'Auto-detects media format · Extracts audio from video (MP4 / MKV / MOV / MP3 / WAV / M4A)',
      clearSelected: 'Clear',
      cloudCompute: 'Cloud Compute Node',
      exportFormat: 'Export Format',
      srtSubtitle: 'SRT Subtitles',
      mdPlain: 'MD Plain',
      language: 'Language',
      langAuto: 'Auto',
      langZh: 'Chinese',
      langEn: 'English',
      modelPresets: 'faster-whisper Model Tier',
      startVideoTranscribe: 'Extract Audio & Transcribe',
      startAudioTranscribe: 'Start Cloud Transcription',
      queueTitle: 'Transcription Queue',
      itemCount: (n) => `${n} ${n === 1 ? 'item' : 'items'}`,
      emptyQueue: 'No transcription tasks yet. Drop an audio or video file above to begin.',
      deleteTask: 'Delete task',
      previewTitle: 'Transcript Preview',
      copy: 'Copy',
      exportExt: (ext) => `Export .${ext}`,
      selectTaskHint: 'Select a task on the left to inspect progress or transcript output.',
      runningOn: (provider) => `Running on ${provider} with`,
      stepDone: 'Done',
      stepRunning: 'Running',
      stepWaiting: 'Pending',
      mdPreviewHint: 'Timestamp-free Markdown preview · Clean paragraph export',
      compute: {
        connectColab: 'Connect Colab',
        connectKaggle: 'Connect Kaggle',
        startGpu: 'Start GPU',
        stopGpu: 'Stop GPU',
        cancelStart: 'Cancel',
        retryStart: 'Retry',
        stopping: 'Stopping…',
        refreshStatus: 'Refresh status',
        stopOrphan: (count) => `Stop Residual (${count})`,
        statusOffline: 'Offline',
        statusStarting: 'Starting…',
        statusOnline: 'Online',
        statusStopping: 'Stopping…',
        statusError: 'Error',
        autoShutdownLabel: 'Auto-shutdown when idle',
        manualHint: 'Manual mode · stays online',
        queueProtectedHint: (count) => `${count} active · shuts down after queue finishes`,
        idleCountdownHint: (mmss) => `Queue empty · auto-off in ${mmss}`,
        minutesUnit: (m) => `${m}m`,
        openedColabLogin: 'Opened Google Colab sign-in in browser',
        openedKaggleLogin: 'Opened Kaggle sign-in in browser',
        startingComputeToast: (provider, gpu) => `Starting ${provider} (${gpu})…`,
        stoppedComputeToast: 'Cloud GPU stopped & runtime cleared',
        refreshedComputeToast: 'Compute status refreshed',
      },
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
      cloudTitle: 'Cloud GPU & Audio Preprocessing',
      cloudDesc:
        'Connect your Google Colab or Kaggle faster-whisper T4 tunnel URL',
      colabUrl: 'Google Colab T4 Bridge URL',
      kaggleUrl: 'Kaggle T4 x2 Bridge URL',
      colabGpuSpec: 'Colab GPU Tier',
      autoShutdownTitle: 'Auto-shutdown GPU when idle (synced with outer checkbox)',
      autoShutdownMinutes: 'Idle timeout',
      ffmpegExtract: 'Automatically extract 16kHz audio via local FFmpeg before cloud upload',
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
        transcribe: 'Cloud T4 Transcription',
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
      videoAudioQueued: '已识别视频，开始自动抽离音轨并转录',
      cloudTranscribeQueued: '已提交至云端 T4 转录队列',
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
      dropSubtitle: '支持音视频转录（视频自动提取音轨）及 PDF / Word 文档转换',
      welcomeTitle: '丢入链接、文件，直接说你想做什么',
      welcomeSubtitle:
        'AI 助手会自动清洗链接发给 TDM Fast、识别音视频或文档并调用工具；也可在左侧直达工作台。',
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
      cloudTranscribe: '云端语音转录',
      videoSourceHint: '视频源 · 将自动提取音轨',
      audioSourceHint: '音频源',
      mdPlainLabel: 'MD 无时间轴',
      transcribeStarted: '已启动转录 · 查看进度',
      startCloudTranscribe: '启动云端转录',
      docConvert: '文档格式转换',
      convertStarted: '已开始转换 · 查看',
      startConvert: '开始转换',
    },
    transcribe: {
      stages: {
        queued: '排队中',
        extracting_audio: '自动提取音轨 (16kHz WAV)',
        connecting_gpu: '连接云端 T4 GPU',
        downloading_model: '云端拉取模型权重',
        transcribing: 'faster-whisper 推理中',
        completed: '已完成',
      },
      videoAutoHint: '已自动识别为视频 · 转录前将自动抽离 16kHz 音频轨道',
      audioDirectHint: '已自动识别为音频 · 直接送入云端 T4 转录',
      dropPrompt: '拖入音频或视频文件，或点击选择',
      dropHint: '自动识别媒体格式 · 视频自动转音频提取音轨（MP4 / MKV / MOV / MP3 / WAV / M4A）',
      clearSelected: '清除已选',
      cloudCompute: '云端算力节点',
      exportFormat: '导出格式',
      srtSubtitle: 'SRT 字幕',
      mdPlain: 'MD 无时间轴',
      language: '语言',
      langAuto: '自动',
      langZh: '中文',
      langEn: 'English',
      modelPresets: 'faster-whisper 模型档位',
      startVideoTranscribe: '自动提取音轨并开始转录',
      startAudioTranscribe: '开始云端转录',
      queueTitle: '转录队列',
      itemCount: (n) => `${n} 项`,
      emptyQueue: '暂无转录记录，拖入音视频即可开始',
      deleteTask: '删除任务',
      previewTitle: '转录文稿预览',
      copy: '复制',
      exportExt: (ext) => `导出 .${ext}`,
      selectTaskHint: '选择左侧任务查看转录进度与结果',
      runningOn: (provider) => `正在通过 ${provider} 运行`,
      stepDone: '完成',
      stepRunning: '执行中',
      stepWaiting: '等待中',
      mdPreviewHint: '无时间轴 Markdown 预览 · 导出为纯净分段文档',
      compute: {
        connectColab: '连接 Colab',
        connectKaggle: '连接 Kaggle',
        startGpu: '启动算力',
        stopGpu: '关闭算力',
        cancelStart: '取消启动',
        retryStart: '重新启动',
        stopping: '正在关机…',
        refreshStatus: '刷新状态',
        stopOrphan: (count) => `关闭残留实例 (${count})`,
        statusOffline: '已关机',
        statusStarting: '启动中…',
        statusOnline: '绿灯就绪',
        statusStopping: '正在关机…',
        statusError: '启动异常',
        autoShutdownLabel: '闲置自动关机',
        manualHint: '手动模式 · 不会自动关机',
        queueProtectedHint: (count) => `处理中 ${count} 个任务 · 全部转完才自动关机`,
        idleCountdownHint: (mmss) => `队列已空 · ${mmss} 后自动关机`,
        minutesUnit: (m) => `${m} 分钟`,
        openedColabLogin: '已在浏览器打开 Google Colab 登录页',
        openedKaggleLogin: '已在浏览器打开 Kaggle 登录页',
        startingComputeToast: (provider, gpu) => `正在启动 ${provider} (${gpu})…`,
        stoppedComputeToast: '云端算力已关闭并清理实例',
        refreshedComputeToast: '已刷新算力状态',
      },
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
      cloudTitle: '云端算力与音轨预处理',
      cloudDesc: '对接你在 Google Colab / Kaggle 上运行的 faster-whisper T4 服务隧道地址',
      colabUrl: 'Google Colab T4 Bridge URL',
      kaggleUrl: 'Kaggle T4 x2 Bridge URL',
      colabGpuSpec: 'Colab GPU 规格',
      autoShutdownTitle: '闲置自动关机（与外部勾选项双向同步）',
      autoShutdownMinutes: '静置超时',
      ffmpegExtract: '拖入视频时自动调用本地 FFmpeg 提取 16kHz 音频后再上传云端',
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
        transcribe: '云端 T4 语音转录',
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

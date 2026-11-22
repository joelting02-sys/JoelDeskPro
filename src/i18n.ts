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
    tdmDownloaded: (name: string) => string;
    tdmDownloadFailed: string;
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
    claudianImported: (source: string) => string;
    claudianImportFailed: string;
    agentSettingsSaved: string;
    agentWorkspaceUpdated: (name: string) => string;
    agentStopped: string;
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
    activeLocalRouter: string;
    activeCustomModel: (model: string) => string;
    thinkingCustomLlm: (model: string) => string;
    turboMode: string;
    normalMode: string;
    workspaceLabel: string;
    sessionActive: string;
    stopRun: string;
    thinkingAndTools: (n: number) => string;
    thinkingTitle: string;
    streamingLabel: string;
    cliNotInstalled: string;
    settingsLink: string;
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
    downloadTdmBtn: string;
    downloadTdmStatus: string;
    downloadTdmFailed: string;
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
    localRouterNoticeTitle: string;
    localRouterNoticeDesc: string;
    quickPresetsLabel: string;
    baseUrl: string;
    modelId: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    showKey: string;
    hideKey: string;
    systemPromptLabel: string;
    systemPromptPlaceholder: string;
    testing: string;
    testedOk: (latencyMs: number, detail: string) => string;
    testFailed: (detail: string) => string;
    validateEndpoint: string;
    saveConfig: string;
    cliTitle: string;
    cliDesc: string;
    importClaudianBtn: string;
    claudianImportedHint: (source: string) => string;
    activeAgentLabel: string;
    permissionModeLabel: string;
    permTurboLabel: string;
    permTurboDesc: string;
    permNormalLabel: string;
    permNormalDesc: string;
    workspaceDirLabel: string;
    browseBtn: string;
    sharedEnvLabel: string;
    sharedEnvPlaceholder: string;
    cliPathLabel: string;
    defaultModelLabel: string;
    defaultModelPlaceholder: string;
    providerEnvLabel: string;
    installedBadge: string;
    missingBadge: string;
    saveAgentConfig: string;
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
      settings: 'AI Model Settings',
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
      tdmDispatched: 'Sent link to JoelFast',
      tdmDispatchFailed: 'Could not reach the JoelFast capture port',
      tdmMissingExe: 'Select your local JoelFast .exe in Downloader first',
      tdmExeSelected: (name) => `Selected JoelFast executable: ${name}`,
      tdmDownloaded: (name) => `Downloaded JoelFast from GitHub: ${name}`,
      tdmDownloadFailed: 'Could not download the JoelFast package from GitHub',
      tdmDetached: 'Detached JoelFast into standalone window',
      tdmReattached: 'Docked JoelFast back into Downloader view',
      tdmActivatedFromExt: 'JoelFast activated — switched to Downloader view',
      foundGitHubCommit: (sha) => `New GitHub commit available (${sha})`,
      alreadyLatest: 'Already on the latest GitHub commit',
      checkUpdateFailed: 'Update check failed',
      localUpdated: 'Local client updated to latest GitHub version',
      convertingTo: (fmt) => `Converting to ${fmt}`,
      batchConvertStarted: 'Started batch format conversion',
      configSaved: 'AI model settings saved & synced',
      cleanUrlLabel: 'clean URL',
      terminalCmdLabel: 'update command',
      mdPlainLabel: 'plain Markdown',
      srtLabel: 'SRT subtitles',
      claudianImported: (source) => `Imported Claudian config from ${source}`,
      claudianImportFailed: 'Failed to import Obsidian Claudian config',
      agentSettingsSaved: 'CLI Agent settings saved',
      agentWorkspaceUpdated: (name) => `Workspace set to ${name}`,
      agentStopped: 'Stopped active Agent run',
    },
    agent: {
      dropTitle: 'Drop files to analyze automatically',
      dropSubtitle:
        'Supports audio/video transcription (auto audio extraction) and document conversion',
      welcomeTitle: 'Drop a link or file, and tell me what to do',
      welcomeSubtitle:
        'Links are cleaned for JoelFast automatically, media routes into Cloud Whisper Studio — or switch directly on the left.',
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
      addedToDownload: 'Sent · Open JoelFast',
      sendToDownload: 'Download in JoelFast',
      cloudTranscribe: 'Cloud Whisper Studio',
      videoSourceHint: 'Video · Auto-extract audio',
      audioSourceHint: 'Audio source',
      mdPlainLabel: 'MD Plain',
      transcribeStarted: 'Submitted · Open Studio',
      startCloudTranscribe: 'Send to Whisper Studio',
      docConvert: 'Format Conversion',
      convertStarted: 'Converting · View',
      startConvert: 'Start Conversion',
      activeLocalRouter: 'Built-in Local Router',
      activeCustomModel: (model) => `Model: ${model}`,
      thinkingCustomLlm: (model) => `Waiting for ${model}…`,
      turboMode: 'Turbo · Auto',
      normalMode: 'Normal · Ask',
      workspaceLabel: 'Workspace',
      sessionActive: 'Session kept',
      stopRun: 'Stop',
      thinkingAndTools: (n) => `Reasoning & tool calls (${n})`,
      thinkingTitle: 'Reasoning',
      streamingLabel: 'Running…',
      cliNotInstalled: 'CLI missing',
      settingsLink: 'Agent Settings',
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
      openSettingsBtn: 'Home AI Settings',
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
        'JoelFast native window docking runs inside the Joel Desk Pro Windows desktop app (.exe). Launch the Windows client to dock JoelFast here.',
      missingExeTitle: 'Locate JoelFast Executable',
      missingExeDesc:
        'Select your local JoelFast .exe once. After that, opening Downloader automatically launches and docks JoelFast into this panel, while your browser extension keeps working as before.',
      downloadTdmBtn: 'Download JoelFast from GitHub',
      downloadTdmStatus: 'Downloading JoelFast from GitHub…',
      downloadTdmFailed: 'Could not download the JoelFast package. Please try again.',
      pickExeBtn: 'Select JoelFast (.exe)',
      openSettingsBtn: 'Open Settings',
      startingTitle: 'Launching & Docking JoelFast…',
      startingDesc: 'Waiting for the native JoelFast window and aligning inside workbench bounds.',
      detachedTitle: 'JoelFast Detached to Standalone Window',
      detachedDesc: 'JoelFast is currently running in its own independent window.',
      reattachBtn: 'Dock Back Inside Desk Pro',
      hiddenTitle: 'JoelFast Hidden in Background',
      hiddenDesc:
        'Downloads continue running in JoelFast. Restore it into this panel or relaunch it below.',
      readyTitle: 'JoelFast Ready to Dock',
      readyDesc: 'Click below to launch and dock JoelFast inside Joel Desk Pro.',
      restoreBtn: 'Show JoelFast Interface',
      launchAndDockBtn: 'Launch & Dock JoelFast',
      relaunchBtn: 'Relaunch JoelFast',
      changeExeBtn: 'Change Path',
      dockedUnderlayHint: 'JoelFast is docked above this area.',
      resyncBtn: 'Re-align Window',
      detachBtn: 'Pop Out Standalone',
      statusDocked: 'JoelFast Docked',
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
      llmTitle: 'Home AI Model Configuration',
      llmDesc:
        'Configure the AI engine used by the AI Agent home workspace. Changes are persisted and synced immediately.',
      modeMock: 'Built-in Local Router',
      modeCustom: 'Custom LLM Endpoint',
      localRouterNoticeTitle: 'Zero-config Instant Routing',
      localRouterNoticeDesc:
        'Automatically cleans URLs for JoelFast, prepares Cloud Whisper Studio uploads, and suggests document conversion targets offline.',
      quickPresetsLabel: 'Quick Endpoint Presets',
      baseUrl: 'Base URL (OpenAI-compatible)',
      modelId: 'Model ID',
      apiKeyLabel: 'API Key (Optional for local Ollama / LM Studio)',
      apiKeyPlaceholder: 'sk-...',
      showKey: 'Show API Key',
      hideKey: 'Hide API Key',
      systemPromptLabel: 'Custom System Prompt (Optional)',
      systemPromptPlaceholder:
        'Optional instructions for the Home AI Assistant behavior, tone, or language...',
      testing: 'Testing…',
      testedOk: (latencyMs, detail) => `Connected (${latencyMs}ms · ${detail})`,
      testFailed: (detail) => `Connection failed: ${detail}`,
      validateEndpoint: 'Test Connection',
      saveConfig: 'Save & Sync to Home',
      cliTitle: 'CLI Agents (Claudian Style)',
      cliDesc:
        'Drive local Claude Code, Codex, and DeepSeek Harness (DSH) directly with Magpie / custom environment variables and Turbo auto-execution.',
      importClaudianBtn: 'Import from Obsidian Claudian',
      claudianImportedHint: (source) => `Imported from: ${source}`,
      activeAgentLabel: 'Default Agent Backend',
      permissionModeLabel: 'Execution Permission',
      permTurboLabel: 'Turbo (Auto-Approve)',
      permTurboDesc: 'Bypasses tool confirmation prompts (--dangerously-skip-permissions / danger-full-access), like Antigravity.',
      permNormalLabel: 'Normal (Restricted)',
      permNormalDesc: 'Uses workspace-write sandbox / asks before sensitive actions.',
      workspaceDirLabel: 'Default Workspace Directory',
      browseBtn: 'Browse',
      sharedEnvLabel: 'Shared Environment Variables (KEY=VALUE)',
      sharedEnvPlaceholder: 'ANTHROPIC_BASE_URL=http://localhost:3425\nANTHROPIC_API_KEY=magpie',
      cliPathLabel: 'Executable Path',
      defaultModelLabel: 'Model Override (Optional)',
      defaultModelPlaceholder: 'Leave empty to use CLI default',
      providerEnvLabel: 'Provider Env Vars (Optional)',
      installedBadge: 'Detected',
      missingBadge: 'Not Found',
      saveAgentConfig: 'Save CLI Agent Settings',
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
      settings: 'AI 模型设置',
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
      tdmDispatched: '已将链接发送给 JoelFast',
      tdmDispatchFailed: '无法连接 JoelFast 接收端口，请确认已启动',
      tdmMissingExe: '请先在「高速下载」中选择本机 JoelFast 程序路径',
      tdmExeSelected: (name) => `已选定 JoelFast 程序：${name}`,
      tdmDownloaded: (name) => `已从 GitHub 下载 JoelFast：${name}`,
      tdmDownloadFailed: '无法从 GitHub 下载 JoelFast 安装包',
      tdmDetached: '已将 JoelFast 弹出为独立窗口',
      tdmReattached: '已将 JoelFast 重新贴合回工具箱',
      tdmActivatedFromExt: '检测到 JoelFast 唤起，已自动切换到下载页',
      foundGitHubCommit: (sha) => `发现 GitHub 新提交 (${sha})`,
      alreadyLatest: '当前已是 GitHub 最新版本',
      checkUpdateFailed: '检查更新失败',
      localUpdated: '本地客户端已更新至 GitHub 最新版本',
      convertingTo: (fmt) => `正在转换为 ${fmt}`,
      batchConvertStarted: '已开始批量格式转换',
      configSaved: 'AI 模型配置已保存并同步到主页',
      cleanUrlLabel: '纯链接',
      terminalCmdLabel: '终端更新命令',
      mdPlainLabel: '无时间轴 Markdown',
      srtLabel: 'SRT 字幕',
      claudianImported: (source) => `已从 Claudian 导入配置：${source}`,
      claudianImportFailed: '未找到或无法读取 Obsidian Claudian 配置',
      agentSettingsSaved: 'CLI Agent 配置已保存',
      agentWorkspaceUpdated: (name) => `工作目录已切换至 ${name}`,
      agentStopped: '已停止当前 Agent 执行',
    },
    agent: {
      dropTitle: '松开文件，交给 AI 自动识别',
      dropSubtitle: '支持音视频转录（送入 Cloud Whisper Studio）及 PDF / Word 文档转换',
      welcomeTitle: '丢入链接、文件，直接说你想做什么',
      welcomeSubtitle:
        'AI 助手会自动清洗链接发给 JoelFast、把音视频直接送入 Cloud Whisper Studio 转录；也可在左侧直达工作台。',
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
      addedToDownload: '已发送 · 打开 JoelFast',
      sendToDownload: '发送到 JoelFast 下载',
      cloudTranscribe: 'Cloud Whisper Studio 转录',
      videoSourceHint: '视频源 · 将自动提取音轨',
      audioSourceHint: '音频源',
      mdPlainLabel: 'MD 无时间轴',
      transcribeStarted: '已送入 · 打开转录台',
      startCloudTranscribe: '送入 Whisper Studio 转录',
      docConvert: '文档格式转换',
      convertStarted: '已开始转换 · 查看',
      startConvert: '开始转换',
      activeLocalRouter: '内置本地智能路由',
      activeCustomModel: (model) => `当前模型：${model}`,
      thinkingCustomLlm: (model) => `正在请求 ${model}…`,
      turboMode: 'Turbo · 免确认',
      normalMode: '普通 · 需确认',
      workspaceLabel: '工作目录',
      sessionActive: '会话保持中',
      stopRun: '停止',
      thinkingAndTools: (n) => `思考与工具调用 (${n})`,
      thinkingTitle: '思考过程',
      streamingLabel: '执行中…',
      cliNotInstalled: '未检测到 CLI',
      settingsLink: 'Agent 配置',
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
      openSettingsBtn: '前往设置',
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
        '原生 JoelFast 窗口贴合仅在 Windows 版 Joel Desk Pro (.exe) 中运行。请启动桌面端以在此区域直接内嵌操作 JoelFast。',
      missingExeTitle: '选择本机 JoelFast 程序 (.exe)',
      missingExeDesc:
        '选择一次电脑上的 JoelFast 主程序路径后，点击「高速下载」会自动启动并贴合进此区域；你的浏览器插件继续按原方式工作。',
      downloadTdmBtn: '从 GitHub 下载 JoelFast',
      downloadTdmStatus: '正在从 GitHub 下载 JoelFast…',
      downloadTdmFailed: '下载 JoelFast 失败，请稍后重试。',
      pickExeBtn: '选择 JoelFast (.exe)',
      openSettingsBtn: '前往设置',
      startingTitle: '正在启动并贴合 JoelFast…',
      startingDesc: '正在等待原生 JoelFast 窗口就绪并对齐到工作台区域。',
      detachedTitle: 'JoelFast 已弹出为独立窗口',
      detachedDesc: '当前 JoelFast 正在独立窗口中运行，所有下载任务正常进行中。',
      reattachBtn: '重新贴合回工具箱',
      hiddenTitle: 'JoelFast 已收起到后台',
      hiddenDesc: '下载仍在后台运行，你可以一键唤回此区域或重新启动 JoelFast。',
      readyTitle: 'JoelFast 已就绪',
      readyDesc: '点击下方按钮将本机 JoelFast 贴合进当前下载界面。',
      restoreBtn: '唤出 JoelFast 界面',
      launchAndDockBtn: '启动并贴合 JoelFast',
      relaunchBtn: '重启 / 唤回 JoelFast',
      changeExeBtn: '更换程序路径',
      dockedUnderlayHint: 'JoelFast 已贴合运行于上方区域。',
      resyncBtn: '重新对齐窗口',
      detachBtn: '独立弹出',
      statusDocked: 'JoelFast 已贴合',
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
      llmTitle: '主页 AI 模型配置',
      llmDesc:
        '专门用于设置「AI 助手」主页所使用的推理引擎与大模型 API，保存后将持久生效并实时同步至主页。',
      modeMock: '内置本地路由',
      modeCustom: '自定义大模型接口',
      localRouterNoticeTitle: '零配置极速智能调度',
      localRouterNoticeDesc:
        '无需外部密钥即可离线运行：自动清洗链接派发给 JoelFast、把音视频直传 Cloud Whisper Studio，并智能匹配文档转换目标格式。',
      quickPresetsLabel: '常用接口预设（点击快速填充）',
      baseUrl: 'Base URL（OpenAI 兼容格式）',
      modelId: '模型名称 (Model ID)',
      apiKeyLabel: 'API Key（Ollama / LM Studio 本地部署可留空）',
      apiKeyPlaceholder: 'sk-...',
      showKey: '显示密钥',
      hideKey: '隐藏密钥',
      systemPromptLabel: '自定义系统提示词 System Prompt（选填）',
      systemPromptPlaceholder: '可选：限定主页 AI 助手的人设、回复风格或常用规则…',
      testing: '连接测试中…',
      testedOk: (latencyMs, detail) => `连接成功 (${latencyMs}ms · ${detail})`,
      testFailed: (detail) => `连接失败：${detail}`,
      validateEndpoint: '测试连接',
      saveConfig: '保存并同步到主页',
      cliTitle: 'CLI Agent 引擎配置（类 Claudian）',
      cliDesc:
        '直接调用本机 Claude Code、Codex CLI 与 DeepSeek Harness (DSH)，支持注入 Magpie 等环境变量及 Turbo 免确认执行。',
      importClaudianBtn: '从 Obsidian Claudian 导入',
      claudianImportedHint: (source) => `已导入来源：${source}`,
      activeAgentLabel: '默认对话引擎',
      permissionModeLabel: '权限模式',
      permTurboLabel: 'Turbo 模式（全权免确认）',
      permTurboDesc: '自动放行文件读写与命令行操作（类 Antigravity），适合桌面高效协作。',
      permNormalLabel: '普通模式（受限/需确认）',
      permNormalDesc: '在工作区沙盒内运行或按工具策略确认。',
      workspaceDirLabel: '默认工作目录 (Workspace)',
      browseBtn: '浏览',
      sharedEnvLabel: '共享环境变量 Shared Env（每行 KEY=VALUE）',
      sharedEnvPlaceholder: 'ANTHROPIC_BASE_URL=http://localhost:3425\nANTHROPIC_API_KEY=magpie',
      cliPathLabel: '可执行文件路径',
      defaultModelLabel: '默认模型（选填）',
      defaultModelPlaceholder: '留空则沿用各 CLI 默认模型',
      providerEnvLabel: '独立环境变量（选填）',
      installedBadge: '已就绪',
      missingBadge: '未找到',
      saveAgentConfig: '保存 CLI Agent 配置',
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

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
    clearedDownloads: string;
    clearedConversions: string;
    videoAudioQueued: string;
    cloudTranscribeQueued: string;
    localEngineStarted: (chunks: number) => string;
    pluginLocalDownload: (fileName: string) => string;
    webRangeStarted: (chunks: number) => string;
    savedToDir: string;
    savedViaExtension: string;
    savedToBrowser: string;
    corsVideoFallback: string;
    corsDirectFallback: string;
    pluginReceived: (fileName: string) => string;
    multiThreadStarted: (threads: number, chunks: number) => string;
    handshakeSending: string;
    invalidPluginUrl: string;
    pluginDualConnected: string;
    pluginWebConnected: string;
    foundGitHubCommit: (sha: string) => string;
    alreadyLatest: string;
    checkUpdateFailed: string;
    localUpdated: string;
    convertingTo: (fmt: string) => string;
    batchConvertStarted: string;
    dirAuthorized: (name: string) => string;
    saveDirSwitched: (dir: string) => string;
    configSaved: string;
    cleanUrlLabel: string;
    chromeExtUrlLabel: string;
    terminalCmdLabel: string;
    mdPlainLabel: string;
    srtLabel: string;
    localEngineDirectLabel: string;
    corsLimitedLabel: string;
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
    threadsUnit: (count: number) => string;
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
    inputPlaceholder: string;
    threadsUnit: (count: number) => string;
    startDownload: string;
    filteredNoise: string;
    validLink: string;
    invalidLink: string;
    saveTo: string;
    switchDirTitle: string;
    dirAuthorizedBtn: string;
    chooseFolderBtn: string;
    chooseLocalFolderTitle: string;
    customPathLabel: string;
    customPathPlaceholder: string;
    confirm: string;
    presetDirs: {
      defaultDownloads: string;
      desktopVideos: string;
      mediaLibrary: string;
      macDownloads: string;
    };
    pluginTitle: string;
    statusDual: string;
    statusWeb: string;
    statusLocal: string;
    statusReady: string;
    pluginDesc: string;
    openPluginSettings: string;
    configurePlugin: string;
    filterAll: (n: number) => string;
    filterActive: (n: number) => string;
    filterCompleted: (n: number) => string;
    totalSpeed: string;
    emptyList: string;
    fromExtension: string;
    cookiesSynced: string;
    chunksMeta: (threads: number, chunks: number) => string;
    savedLocally: string;
    paused: string;
    sendToTranscribe: string;
    convertFormat: string;
    selectTargetFormat: string;
    resumeDownload: string;
    pauseDownload: string;
    copyCleanUrl: string;
    deleteTask: string;
    chunksProgressTitle: (chunks: number) => string;
    pluginModal: {
      title: string;
      subtitle: (dir: string) => string;
      close: string;
      webChannel: string;
      webConnected: string;
      webWaiting: string;
      webNote: string;
      localChannel: string;
      localOnline: string;
      localOptional: string;
      downloadExtZip: string;
      downloadLocalEngine: string;
      localEngineTooltip: string;
      copyExtensionsUrl: string;
      rehandshake: string;
      testConnection: string;
      step1Prefix: string;
      step1Suffix: string;
      step2Prefix: string;
      step2Bold: string;
      step3Prefix: string;
      step3Bold: string;
      step3Suffix: string;
    };
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
    downloaderTitle: string;
    downloaderDesc: string;
    downloaderRpc: string;
    defaultThreads: string;
    defaultSaveDir: string;
    bridgePort: string;
    bridgeToken: string;
    ytdlpPath: string;
    converterUrl: string;
    enableBridge: string;
    autoStartCapture: string;
    clipboardSniff: string;
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
      download: string;
      chromeBridge: string;
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
      clearedDownloads: 'Cleared completed downloads',
      clearedConversions: 'Cleared completed conversions',
      videoAudioQueued: 'Video detected — extracting audio track & queuing transcription',
      cloudTranscribeQueued: 'Submitted to cloud T4 transcription queue',
      localEngineStarted: (chunks) => `Dispatched to local engine (${chunks} parallel chunks)`,
      pluginLocalDownload: (fileName) => `Sent to local engine via extension: ${fileName}`,
      webRangeStarted: (chunks) => `Started ${chunks}-chunk parallel web download`,
      savedToDir: 'Saved to selected folder',
      savedViaExtension: 'Saved via extension',
      savedToBrowser: 'Saved to Downloads',
      corsVideoFallback:
        'Video host restricts direct browser CORS — install JoelDeskPro extension or run local engine to save directly.',
      corsDirectFallback:
        'Host restricts browser CORS — use the JoelDeskPro extension or local engine for direct saving.',
      pluginReceived: (fileName) => `Received from JoelDeskPro extension: ${fileName}`,
      multiThreadStarted: (threads, chunks) =>
        `Started ${threads}-thread · ${chunks}-chunk download`,
      handshakeSending: 'Sending bidirectional handshake to JoelDeskPro extension…',
      invalidPluginUrl: 'Invalid URL pushed by extension',
      pluginDualConnected: 'JoelDeskPro extension connected (Web + Local Engine)',
      pluginWebConnected: 'JoelDeskPro extension connected to Web App',
      foundGitHubCommit: (sha) => `New GitHub commit available (${sha})`,
      alreadyLatest: 'Already on the latest GitHub commit',
      checkUpdateFailed: 'Update check failed',
      localUpdated: 'Local client updated to latest GitHub version',
      convertingTo: (fmt) => `Converting to ${fmt}`,
      batchConvertStarted: 'Started batch format conversion',
      dirAuthorized: (name) => `Direct folder write authorized: ${name}`,
      saveDirSwitched: (dir) => `Download directory set to ${dir}`,
      configSaved: 'Configuration saved',
      cleanUrlLabel: 'clean URL',
      chromeExtUrlLabel: 'Chrome extensions URL',
      terminalCmdLabel: 'update command',
      mdPlainLabel: 'plain Markdown',
      srtLabel: 'SRT subtitles',
      localEngineDirectLabel: 'Local chunk engine direct write',
      corsLimitedLabel: 'CORS restricted (extension or local engine needed)',
    },
    agent: {
      dropTitle: 'Drop files to analyze automatically',
      dropSubtitle:
        'Supports audio/video transcription (auto audio extraction) and document conversion',
      welcomeTitle: 'Drop a link or file, and tell me what to do',
      welcomeSubtitle:
        'Links are cleaned automatically, media and documents are routed to the right tool — or switch directly to any workbench on the left.',
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
      downloadDispatch: 'High-Speed Download',
      threadsUnit: (count) => `${count} threads`,
      addedToDownload: 'Queued · View',
      sendToDownload: 'Send to Downloader',
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
      inputPlaceholder:
        'Paste direct link, YouTube / Douyin URL, or share text — auto-picks fastest multi-chunk mode…',
      threadsUnit: (count) => `${count}T`,
      startDownload: 'Download',
      filteredNoise: 'Noise stripped',
      validLink: 'Valid URL',
      invalidLink: 'No valid http:// or https:// URL detected',
      saveTo: 'Save to',
      switchDirTitle: 'Click to change local download folder',
      dirAuthorizedBtn: 'Folder Authorized',
      chooseFolderBtn: 'Choose Folder',
      chooseLocalFolderTitle: 'Select Local Save Folder',
      customPathLabel: 'Custom local path',
      customPathPlaceholder: 'e.g. D:\\Videos\\Downloads',
      confirm: 'Apply',
      presetDirs: {
        defaultDownloads: 'Default Downloads',
        desktopVideos: 'Desktop Videos',
        mediaLibrary: 'D: Media Library',
        macDownloads: 'macOS Downloads',
      },
      pluginTitle: 'JoelDeskPro Extension',
      statusDual: 'Connected (Web + Local Engine)',
      statusWeb: 'Connected to Web App',
      statusLocal: 'Local Engine Online',
      statusReady: 'Web ready · Install extension for site-wide sniffing',
      pluginDesc:
        'Dual-channel bridge for Web & Local client — hover over any YouTube, Douyin, or Bilibili video to download.',
      openPluginSettings: 'Extension Settings',
      configurePlugin: 'Setup JoelDeskPro Extension',
      filterAll: (n) => `All (${n})`,
      filterActive: (n) => `Active (${n})`,
      filterCompleted: (n) => `Completed (${n})`,
      totalSpeed: 'Total Speed',
      emptyList: 'No download tasks yet. Paste a link above or capture from the browser extension.',
      fromExtension: 'From Extension',
      cookiesSynced: 'Session Synced',
      chunksMeta: (threads, chunks) => `${threads} threads · ${chunks} chunks`,
      savedLocally: 'Saved locally',
      paused: 'Paused',
      sendToTranscribe: 'Transcribe',
      convertFormat: 'Convert',
      selectTargetFormat: 'Choose Target Format',
      resumeDownload: 'Resume download',
      pauseDownload: 'Pause download',
      copyCleanUrl: 'Copy clean URL',
      deleteTask: 'Remove task',
      chunksProgressTitle: (chunks) => `${chunks} concurrent download chunks`,
      pluginModal: {
        title: 'JoelDeskPro Extension Settings',
        subtitle: (dir) => `Web + Local dual-channel bridge · Saving to ${dir}`,
        close: 'Close modal',
        webChannel: 'Web Channel',
        webConnected: 'Connected',
        webWaiting: 'Not Installed',
        webNote: 'Auto-registers your live web app URL — no local install required',
        localChannel: 'Local Engine Channel',
        localOnline: 'Online',
        localOptional: 'Optional / Offline',
        downloadExtZip: 'Download JoelDeskPro (.zip)',
        downloadLocalEngine: 'Local Engine (.mjs · Optional)',
        localEngineTooltip:
          'Optional: Run node joeldeskpro-local-engine.mjs locally for direct disk writing & yt-dlp',
        copyExtensionsUrl: 'Copy chrome://extensions',
        rehandshake: 'Reconnect',
        testConnection: 'Test Connection',
        step1Prefix: 'Unzip ',
        step1Suffix: ' (manifest.json is at root)',
        step2Prefix: 'Enable ',
        step2Bold: 'Developer mode',
        step3Prefix: 'Click ',
        step3Bold: 'Load unpacked',
        step3Suffix: ' & select folder',
      },
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
      downloaderTitle: 'Local Engine & Chrome Extension Bridge',
      downloaderDesc:
        'Configure HTTP Range multi-chunk engine, yt-dlp media parser, local bridge port, and converter API',
      downloaderRpc: 'Downloader HTTP Endpoint',
      defaultThreads: 'Default Range Threads',
      defaultSaveDir: 'Default Save Directory',
      bridgePort: 'Extension Local Bridge Port',
      bridgeToken: 'Extension Bridge Token',
      ytdlpPath: 'yt-dlp Executable Path',
      converterUrl: 'Document Converter API (LibreOffice / Pandoc)',
      enableBridge: 'Enable local Chrome extension HTTP bridge',
      autoStartCapture: 'Start download immediately upon capture',
      clipboardSniff: 'Auto-detect URLs from clipboard',
      githubTitle: 'GitHub Client Updates',
      githubDesc:
        'Pull updates from GitHub via local Git (works with private repos) or check remote commits when public',
      openUpdateBtn: 'Open Updater',
      githubRepo: 'GitHub Repository (owner/repo)',
      githubBranch: 'Branch',
      autoCheckStartup: 'Check GitHub automatically on startup (requires public repo)',
      protocolTitle: 'Backend JSON Protocol Reference',
      protocolDesc: 'Inspect the 5 standard adapter request schemas reserved for local services',
      copy: 'Copy',
      protocols: {
        llm: 'LLM Intent Router (OpenAI-compatible)',
        transcribe: 'Cloud T4 Transcription',
        download: 'Dual-Engine Download (Range / yt-dlp)',
        chromeBridge: 'Chrome Extension Local Bridge',
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
      modeLocalOnline: 'Local Engine Online',
      modeWeb: 'Web Mode',
      pullingLocal: 'Pulling & building…',
      pullNowBtn: 'Pull Update via Local Git',
      winScriptPrimary: 'Windows Update Script (.bat)',
      winScriptSecondary: 'Windows (.bat)',
      unixScript: 'macOS / Linux (.sh)',
      copyPullCmd: 'Copy git pull Command',
      reloadWebSync: 'Mark Synced & Reload',
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
      clearedDownloads: '已清理已完成的下载记录',
      clearedConversions: '已清理已完成的转换记录',
      videoAudioQueued: '已识别视频，开始自动抽离音轨并转录',
      cloudTranscribeQueued: '已提交至云端 T4 转录队列',
      localEngineStarted: (chunks) => `已交由本地引擎 ${chunks} 分片直写硬盘`,
      pluginLocalDownload: (fileName) => `已通过插件交由本地引擎下载：${fileName}`,
      webRangeStarted: (chunks) => `网页端已启动 ${chunks} 分片并发拉取`,
      savedToDir: '已写入选定本地文件夹',
      savedViaExtension: '已通过插件保存到电脑',
      savedToBrowser: '已保存到浏览器下载目录',
      corsVideoFallback: '视频平台受跨域限制，安装 JoelDeskPro 插件或启动本地引擎即可直存电脑',
      corsDirectFallback: '该源站限制浏览器跨域直连，建议安装 JoelDeskPro 插件或启动本地引擎',
      pluginReceived: (fileName) => `已通过 JoelDeskPro 插件接收：${fileName}`,
      multiThreadStarted: (threads, chunks) => `已启动 ${threads} 线程 · ${chunks} 分片并发下载`,
      handshakeSending: '正在向 JoelDeskPro 插件发送双向握手信号…',
      invalidPluginUrl: '插件推送的链接无效',
      pluginDualConnected: 'JoelDeskPro 插件已连接（网页端 + 本地引擎双通道在线）',
      pluginWebConnected: 'JoelDeskPro 插件已直连当前网页端，看视频右上角可一键下载',
      foundGitHubCommit: (sha) => `发现 GitHub 新提交 (${sha})`,
      alreadyLatest: '当前已是 GitHub 最新版本',
      checkUpdateFailed: '检查更新失败',
      localUpdated: '本地客户端已更新至 GitHub 最新版本',
      convertingTo: (fmt) => `正在转换为 ${fmt}`,
      batchConvertStarted: '已开始批量格式转换',
      dirAuthorized: (name) => `已授权直写本地文件夹：${name}`,
      saveDirSwitched: (dir) => `下载保存路径已切换为 ${dir}`,
      configSaved: '接口配置已保存',
      cleanUrlLabel: '纯链接',
      chromeExtUrlLabel: 'Chrome 扩展管理地址',
      terminalCmdLabel: '终端更新命令',
      mdPlainLabel: '无时间轴 Markdown',
      srtLabel: 'SRT 字幕',
      localEngineDirectLabel: '本地分片引擎直写',
      corsLimitedLabel: '跨域受限（需插件或本地引擎）',
    },
    agent: {
      dropTitle: '松开文件，交给 AI 自动识别',
      dropSubtitle: '支持音视频转录（视频自动提取音轨）及 PDF / Word 文档转换',
      welcomeTitle: '丢入链接、文件，直接说你想做什么',
      welcomeSubtitle:
        'AI 助手会自动清洗链接、识别音视频或文档并调用工具；也可在左侧直达手动工作台。',
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
      threadsUnit: (count) => `${count} 线程`,
      addedToDownload: '已加入下载 · 查看',
      sendToDownload: '发送到高速下载',
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
      inputPlaceholder: '粘贴直链、抖音 / YouTube 链接或带杂字的分享文案，自动选最快方式分片下载…',
      threadsUnit: (count) => `${count} 线程`,
      startDownload: '开始下载',
      filteredNoise: '已自动过滤杂字',
      validLink: '有效链接',
      invalidLink: '未检测到以 http:// 或 https:// 开头的有效下载链接',
      saveTo: '保存到',
      switchDirTitle: '点击切换本地保存目录',
      dirAuthorizedBtn: '已授权直写文件夹',
      chooseFolderBtn: '选择文件夹',
      chooseLocalFolderTitle: '选择本地保存文件夹',
      customPathLabel: '自定义本机路径',
      customPathPlaceholder: '例如 D:\\Videos\\Downloads',
      confirm: '确定',
      presetDirs: {
        defaultDownloads: '默认下载目录',
        desktopVideos: '桌面视频文件夹',
        mediaLibrary: 'D 盘媒体素材库',
        macDownloads: 'macOS 下载目录',
      },
      pluginTitle: 'JoelDeskPro 插件',
      statusDual: '已连接（网页端 + 本地引擎）',
      statusWeb: '已直连当前网页端',
      statusLocal: '本地高速引擎在线',
      statusReady: '网页端可直用 · 安装插件解锁全站嗅探',
      pluginDesc: '支持网页端与本地客户端双通道，刷 YouTube、抖音、B 站时在视频右上角一键下载',
      openPluginSettings: '打开插件设置',
      configurePlugin: '配置 JoelDeskPro 插件',
      filterAll: (n) => `全部 (${n})`,
      filterActive: (n) => `下载中 (${n})`,
      filterCompleted: (n) => `已完成 (${n})`,
      totalSpeed: '总速率',
      emptyList: '暂无下载任务，粘贴链接或通过浏览器插件捕获即可开始',
      fromExtension: '来自 Chrome 插件',
      cookiesSynced: '已同步登录态',
      chunksMeta: (threads, chunks) => `${threads} 线程 · ${chunks} 分片并发`,
      savedLocally: '已保存到本地',
      paused: '已暂停',
      sendToTranscribe: '送去转录',
      convertFormat: '转换格式',
      selectTargetFormat: '选择目标格式',
      resumeDownload: '继续下载',
      pauseDownload: '暂停下载',
      copyCleanUrl: '复制纯链接',
      deleteTask: '移除任务',
      chunksProgressTitle: (chunks) => `${chunks} 个分片并发下载进度`,
      pluginModal: {
        title: 'JoelDeskPro 插件设置',
        subtitle: (dir) => `支持网页端直接用与本地客户端双通道 · 默认保存至 ${dir}`,
        close: '关闭窗口',
        webChannel: '网页端通道',
        webConnected: '已直连',
        webWaiting: '等待安装',
        webNote: '发布后免装客户端，自动注册当前网址',
        localChannel: '本地引擎通道',
        localOnline: '在线',
        localOptional: '可选未启动',
        downloadExtZip: '下载 JoelDeskPro 插件 (.zip)',
        downloadLocalEngine: '本地引擎 (.mjs · 可选)',
        localEngineTooltip: '可选：本机运行 node joeldeskpro-local-engine.mjs 解锁无限硬盘直写与 yt-dlp',
        copyExtensionsUrl: '复制 chrome://extensions',
        rehandshake: '重新握手',
        testConnection: '检测连接',
        step1Prefix: '解压 ',
        step1Suffix: '（首层即含 manifest.json）',
        step2Prefix: '扩展页右上角开 ',
        step2Bold: '开发者模式',
        step3Prefix: '点 ',
        step3Bold: '加载已解压扩展',
        step3Suffix: ' 选中文件夹',
      },
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
      downloaderTitle: '本地下载内核与 Chrome 插件桥接',
      downloaderDesc:
        '配置 HTTP Range 多线程分片引擎、yt-dlp 流媒体内核、本地 Chrome 插件桥接服务及文档转换接口',
      downloaderRpc: '高速下载引擎 HTTP 接口',
      defaultThreads: '默认 Range 分片线程数',
      defaultSaveDir: '默认下载保存目录',
      bridgePort: 'Chrome 插件本地桥接端口',
      bridgeToken: 'Chrome 插件桥接 Token',
      ytdlpPath: 'yt-dlp 可执行路径（流媒体解析内核）',
      converterUrl: '文档转换服务地址 (LibreOffice / Pandoc)',
      enableBridge: '开启 Chrome 插件本地 HTTP 监听',
      autoStartCapture: '捕获后立即开始下载',
      clipboardSniff: '剪贴板链接自动嗅探',
      githubTitle: 'GitHub 客户端更新',
      githubDesc:
        '私有仓库可直接用本机 Git 一键拉取；如需在网页内在线检测最新提交，可临时公开仓库后点击检查',
      openUpdateBtn: '打开更新面板',
      githubRepo: 'GitHub 仓库 (owner/repo)',
      githubBranch: '更新分支 (Branch)',
      autoCheckStartup: '启动时自动检测 GitHub 最新提交（需公开仓库）',
      protocolTitle: '后端对接 JSON 协议参考',
      protocolDesc: '查看前端预留的 5 个标准请求结构（含双内核下载与 Chrome 插件本地桥接）',
      copy: '复制',
      protocols: {
        llm: '大模型意图路由 (OpenAI 兼容)',
        transcribe: '云端 T4 语音转录',
        download: '双内核下载指令 (Range / yt-dlp)',
        chromeBridge: 'Chrome 插件本地桥接',
        convert: '文档格式转换',
      },
      saveConfig: '保存接口配置',
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
      modeLocalOnline: '本地引擎在线',
      modeWeb: '网页端模式',
      pullingLocal: '正在从 GitHub 拉取并构建…',
      pullNowBtn: '一键拉取 GitHub 更新',
      winScriptPrimary: 'Windows 一键更新脚本 (.bat)',
      winScriptSecondary: 'Windows 脚本 (.bat)',
      unixScript: 'macOS / Linux (.sh)',
      copyPullCmd: '复制拉取命令',
      reloadWebSync: '刷新网页端同步',
      hideLog: '收起日志',
      viewLog: '查看日志',
    },
  },
};

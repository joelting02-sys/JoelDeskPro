// Cloud Whisper Studio 前端交互逻辑（零构建依赖，纯 ES6，支持内嵌与中英双语同步）
const isEmbedded =
  new URLSearchParams(window.location.search).get("embedded") === "1" ||
  window.self !== window.top;
if (isEmbedded) {
  document.body.classList.add("embedded");
}

const initParams = new URLSearchParams(window.location.search);
let currentLang = initParams.get("lang") || localStorage.getItem("joeldeskpro_lang") || "zh";
if (currentLang !== "en" && currentLang !== "zh") {
  currentLang = "zh";
}

const I18N = {
  zh: {
    brandSub: "连接你的免费云端显卡 · 拖入视频秒出文字",
    providerAria: "选择云端算力",
    languageTitle: "识别语言",
    refreshTitle: "刷新云端连接状态",
    settingsTitleBtn: "算力与模型设置",
    langAuto: "语言：自动识别",
    langZh: "语言：中文",
    langEn: "语言：English",
    langJa: "语言：日语",
    langKo: "语言：韩语",
    statusOnline: "绿灯就绪",
    statusStarting: "启动中...",
    statusStopping: "正在关机...",
    statusError: "启动异常",
    statusOffline: "已关机",
    zeroUsage: "零消耗",
    preparing: "准备中",
    releasingGpu: "释放云端显卡",
    retryRightHint: "点右侧可重试",
    btnStopCompute: "关闭算力",
    btnCancelStart: "取消启动",
    btnStopping: "关闭中...",
    btnRetryStart: "重新启动",
    btnStartCompute: "启动算力",
    badgeOnline: "🟢 已连接",
    badgeStarting: "🟡 启动中",
    badgeError: "🔴 异常",
    badgeStandby: "⚪ 待机",
    defaultBannerMsg: "点击右上角「启动算力」亮绿灯后即可极速听写。",
    autoShutdownTooltip: "勾选：所有文件转完且闲置一段时间后自动关机；不勾选：完全由你手动关闭，不会自动帮你关",
    autoShutdownWithMins: (m) => `闲置自动关机 (${m}分)`,
    autoShutdownManual: "闲置自动关机（当前手动）",
    idleManualHint: "🖐 手动模式 · 不会自动关机",
    idlePendingHint: (n) => `🎬 等待/处理中 ${n} 个文件 · 全部转完才自动关机`,
    idleCountdownHint: (mmss) => `🛡 队列已空 · 闲置 ${mmss} 后自动关机`,
    toggleLogBtn: "查看详情",
    orphanStopBtn: "关闭残留实例",
    dropTitle: "把视频或音频拖到这里",
    dropOrText: "或",
    pickFileBtn: "点击选择文件",
    dropMultiText: "（支持一次选多个）",
    dropTip1: "✂️ 自动只留声音瘦身 90%",
    dropTip2: "⚡ 支持 MP4 / MKV / MP3 / M4A / WAV",
    tabQueueText: "当前任务",
    tabHistoryText: "历史记录",
    openFolderTitle: "打开自动保存的文件夹",
    openFolderBtn: "📂 输出目录",
    guideBadge: "小白 3 步快速上手",
    guideHeading: "像用家电遥控器一样，用云端显卡转文字",
    step1Title: "点击右上角「启动算力」",
    step1Desc: "选 Colab 或 Kaggle，等约 1 分钟顶部亮起 <strong>🟢 绿灯</strong>，说明免费/云端显卡已待命。",
    step2Title: "把视频或音频拖进上传区",
    step2Desc: "软件自动去掉画面只留声音，几秒传上云端，几十秒就能在这里看到完整文字稿和字幕。",
    step3Title: "转完点击「关闭算力」",
    step3Desc: "一键彻底释放云端显卡，绝不多扣一秒钟额度（也内置了闲置自动关机双保险）。",
    readerDefaultTitle: "未选择文件",
    copyBtn: "📋 复制",
    dlTxtBtn: "⬇️ TXT",
    dlSrtBtn: "⬇️ SRT",
    viewPlainBtn: "纯文字",
    viewTimelineBtn: "带时间轴",
    viewSrtBtn: "SRT 字幕源码",
    settingsTitle: "⚙️ 算力连接与听写设置",
    colabSecTitle: "⚡ Google Colab 连接",
    colabSecHint: "自动复用你本机已授权的 <code>colab-t4</code> 官方接口，无需打开浏览器。",
    colabGpuLabel: "Colab 显卡规格",
    gpuT4: "Tesla T4（推荐 · 速度快且省额度）",
    gpuL4: "NVIDIA L4（更强算力）",
    gpuA100: "NVIDIA A100（旗舰 · 消耗较高）",
    colabReady: "✅ 已自动连接",
    colabMissing: "⚠️ 未授权",
    kaggleSecTitle: "🏋️ Kaggle GPU 连接（每周 30 小时免费）",
    kaggleSecHint: "获取方式：登录 <a href=\"https://www.kaggle.com/settings\" target=\"_blank\" rel=\"noreferrer\">kaggle.com/settings</a> → 找到 API → 点击 <strong>Create New Token</strong> 下载 <code>kaggle.json</code>。",
    kaggleReady: (u) => `✅ 已连接 (${u})`,
    kaggleMissing: "未配置",
    kaggleChecking: "检测中...",
    uploadKaggleJsonBtn: "📄 一键导入 kaggle.json",
    dlKaggleNbBtn: "📓 下载备用 .ipynb",
    kaggleUserLabel: "或手动填写用户名",
    kaggleUserPlaceholder: "例如：joel_username",
    kaggleKeyLabel: "API Key",
    kaggleKeyPlaceholder: "粘贴 kaggle.json 里的 key",
    saveKaggleBtn: "验证并保存 Kaggle 凭据",
    modelSecTitle: "🧠 听写模型与省额度保险",
    modelSelectLabel: "Whisper 模型",
    modelTurbo: "large-v3-turbo（极速推荐）",
    modelLarge: "large-v3（最高精度）",
    modelMedium: "medium（轻量省显存）",
    modelSmall: "small（超快极简）",
    autoOffSelectLabel: "闲置自动关机（防忘关扣额度）",
    autoOff10: "闲置 10 分钟自动关机",
    autoOff15: "闲置 15 分钟自动关机（推荐）",
    autoOff30: "闲置 30 分钟自动关机",
    autoOff0: "关闭自动关机（仅手动）",
    cancelSettingsBtn: "取消",
    saveSettingsBtn: "保存设置",
    emptyQueue: "还没有任务，把视频或音频拖到上方框里即可开始。",
    emptyHistory: "暂无历史记录，完成一次转录后会自动保存在这里。",
    tagWork: "处理中",
    tagDone: "✅ 完成",
    tagWait: "⏳ 等绿灯",
    tagErr: "❌ 失败",
    slimPrefix: "瘦身",
    durationPrefix: "时长",
    deleteHistoryTitle: "删除记录",
    charsUnit: "字",
    metaLang: (v) => `语言：${v}`,
    metaDur: (v) => `音频时长：${v}`,
    metaElapsed: (v) => `云端耗时：${v} 秒`,
    metaCompute: (v) => `算力：${v}`,
    metaChars: (v) => `字数：${v}`,
    noSpeech: "（未识别到人声内容）",
    noSrt: "（无字幕内容）",
    noSegments: "（无分段数据）",
    toastDeleted: "已删除该历史记录",
    toastQueued: (name) => `已加入队列：${name}`,
    toastUploadFailed: (msg) => `上传失败：${msg}`,
    toastNeedKaggleSettings: "首次使用 Kaggle 请先在右上角「设置」里导入 kaggle.json",
    toastNeedKaggleCreds: "请先配置 Kaggle 凭据（kaggle.json）",
    toastStopSent: "已发送关闭算力指令",
    toastStartingCompute: (p) => `正在启动 ${p} 云端显卡，请等待绿灯...`,
    toastAutoOn: (m) => `🛡 已勾选自动关机：所有文件转完且闲置 ${m} 分钟后自动关机`,
    toastAutoOff: "🖐 已切换为手动控制：绝不自动关闭算力，用完自己点「关闭算力」",
    toastRefreshed: "已刷新云端状态",
    toastOrphanStopped: "已关闭残留 Colab 实例",
    toastCopied: "✓ 已复制到剪贴板",
    toastCopyFailed: "复制失败，请手动选中复制",
    toastSaved: (p) => `✓ 已保存到：${p}`,
    toastSaveFailed: "保存失败",
    toastSettingsSaved: "✓ 设置已保存",
    toastFillKaggle: "请填写 Kaggle 用户名和 API Key",
    toastKaggleSaved: "✅ Kaggle 凭据验证通过并已保存",
    toastKaggleImported: "✅ kaggle.json 验证成功并已导入",
  },
  en: {
    brandSub: "Connect Free Cloud GPUs · Drop Video or Audio to Transcribe",
    providerAria: "Select cloud compute provider",
    languageTitle: "Transcription Language",
    refreshTitle: "Refresh cloud runtime status",
    settingsTitleBtn: "Compute & Model Settings",
    langAuto: "Language: Auto",
    langZh: "Language: Chinese",
    langEn: "Language: English",
    langJa: "Language: Japanese",
    langKo: "Language: Korean",
    statusOnline: "GPU Ready",
    statusStarting: "Starting...",
    statusStopping: "Stopping...",
    statusError: "Start Error",
    statusOffline: "Offline",
    zeroUsage: "Zero usage",
    preparing: "Preparing",
    releasingGpu: "Releasing GPU",
    retryRightHint: "Click Start to retry",
    btnStopCompute: "Stop GPU",
    btnCancelStart: "Cancel",
    btnStopping: "Stopping...",
    btnRetryStart: "Retry Start",
    btnStartCompute: "Start GPU",
    badgeOnline: "🟢 Online",
    badgeStarting: "🟡 Starting",
    badgeError: "🔴 Error",
    badgeStandby: "⚪ Standby",
    defaultBannerMsg: "GPU offline. Click \"Start GPU\" at the top right to begin fast cloud transcription.",
    autoShutdownTooltip: "Checked: shut down GPU automatically after all queued files finish and stay idle. Unchecked: manual control only.",
    autoShutdownWithMins: (m) => `Auto-off (${m}m idle)`,
    autoShutdownManual: "Auto-off (Manual mode)",
    idleManualHint: "🖐 Manual mode · never auto-stops",
    idlePendingHint: (n) => `🎬 ${n} active · auto-off waits until queue finishes`,
    idleCountdownHint: (mmss) => `🛡 Queue empty · auto-off in ${mmss}`,
    toggleLogBtn: "Details",
    orphanStopBtn: "Stop Residual",
    dropTitle: "Drop video or audio files here",
    dropOrText: "or",
    pickFileBtn: "click to browse",
    dropMultiText: " (batch supported)",
    dropTip1: "✂️ Extracts slim 16kHz audio (-90%)",
    dropTip2: "⚡ Supports MP4 / MKV / MP3 / M4A / WAV",
    tabQueueText: "Queue",
    tabHistoryText: "History",
    openFolderTitle: "Open outputs folder",
    openFolderBtn: "📂 Outputs",
    guideBadge: "3-Step Quick Start",
    guideHeading: "Transcribe media on cloud GPUs like a remote control",
    step1Title: "Click \"Start GPU\" at the top right",
    step1Desc: "Pick Colab or Kaggle and wait ~1 min for the <strong>🟢 GPU Ready</strong> light.",
    step2Title: "Drop video or audio into the upload box",
    step2Desc: "Strips video locally, uploads lightweight audio, and streams transcripts & SRT here in seconds.",
    step3Title: "Click \"Stop GPU\" when done",
    step3Desc: "Immediately releases your cloud GPU quota with zero waste (plus optional idle auto-off).",
    readerDefaultTitle: "No file selected",
    copyBtn: "📋 Copy",
    dlTxtBtn: "⬇️ TXT",
    dlSrtBtn: "⬇️ SRT",
    viewPlainBtn: "Plain Text",
    viewTimelineBtn: "Timeline",
    viewSrtBtn: "SRT Source",
    settingsTitle: "⚙️ Compute & Transcription Settings",
    colabSecTitle: "⚡ Google Colab Connection",
    colabSecHint: "Reuses your authorized local <code>colab-t4</code> OAuth credentials headlessly without a browser.",
    colabGpuLabel: "Colab GPU Tier",
    gpuT4: "Tesla T4 (Recommended · Fast & quota-friendly)",
    gpuL4: "NVIDIA L4 (Higher throughput)",
    gpuA100: "NVIDIA A100 (Flagship · Higher quota usage)",
    colabReady: "✅ Connected",
    colabMissing: "⚠️ Unauthorized",
    kaggleSecTitle: "🏋️ Kaggle GPU Connection (30 hrs/week free)",
    kaggleSecHint: "Open <a href=\"https://www.kaggle.com/settings\" target=\"_blank\" rel=\"noreferrer\">kaggle.com/settings</a> → API → click <strong>Create New Token</strong> to download <code>kaggle.json</code>.",
    kaggleReady: (u) => `✅ Connected (${u})`,
    kaggleMissing: "Not configured",
    kaggleChecking: "Checking...",
    uploadKaggleJsonBtn: "📄 Import kaggle.json",
    dlKaggleNbBtn: "📓 Download fallback .ipynb",
    kaggleUserLabel: "Or enter username",
    kaggleUserPlaceholder: "e.g. joel_username",
    kaggleKeyLabel: "API Key",
    kaggleKeyPlaceholder: "Paste key from kaggle.json",
    saveKaggleBtn: "Verify & Save Kaggle Credentials",
    modelSecTitle: "🧠 Whisper Model & Auto-Shutdown",
    modelSelectLabel: "Whisper Model",
    modelTurbo: "large-v3-turbo (Fastest & recommended)",
    modelLarge: "large-v3 (Highest accuracy)",
    modelMedium: "medium (Lightweight)",
    modelSmall: "small (Ultra fast)",
    autoOffSelectLabel: "Idle Auto-Shutdown Guard",
    autoOff10: "Shut down after 10 min idle",
    autoOff15: "Shut down after 15 min idle (Recommended)",
    autoOff30: "Shut down after 30 min idle",
    autoOff0: "Disable auto-shutdown (Manual only)",
    cancelSettingsBtn: "Cancel",
    saveSettingsBtn: "Save Settings",
    emptyQueue: "No tasks yet. Drop audio or video files above to begin.",
    emptyHistory: "No history yet. Completed transcripts appear here automatically.",
    tagWork: "Working",
    tagDone: "✅ Done",
    tagWait: "⏳ Waiting",
    tagErr: "❌ Failed",
    slimPrefix: "saved",
    durationPrefix: "Dur",
    deleteHistoryTitle: "Delete item",
    charsUnit: "chars",
    metaLang: (v) => `Lang: ${v}`,
    metaDur: (v) => `Duration: ${v}`,
    metaElapsed: (v) => `Elapsed: ${v}s`,
    metaCompute: (v) => `GPU: ${v}`,
    metaChars: (v) => `Chars: ${v}`,
    noSpeech: "(No speech detected)",
    noSrt: "(No subtitles)",
    noSegments: "(No segments)",
    toastDeleted: "Deleted history record",
    toastQueued: (name) => `Queued: ${name}`,
    toastUploadFailed: (msg) => `Upload failed: ${msg}`,
    toastNeedKaggleSettings: "Import kaggle.json in Settings first to use Kaggle",
    toastNeedKaggleCreds: "Configure Kaggle credentials (kaggle.json) first",
    toastStopSent: "Stop GPU command sent",
    toastStartingCompute: (p) => `Starting ${p} cloud GPU, waiting for green light...`,
    toastAutoOn: (m) => `🛡 Auto-off enabled: shuts down ${m}m after queue finishes`,
    toastAutoOff: "🖐 Manual mode enabled: GPU will stay running until stopped",
    toastRefreshed: "Refreshed cloud status",
    toastOrphanStopped: "Residual Colab runtime stopped",
    toastCopied: "✓ Copied to clipboard",
    toastCopyFailed: "Copy failed — please select and copy manually",
    toastSaved: (p) => `✓ Saved to: ${p}`,
    toastSaveFailed: "Save failed",
    toastSettingsSaved: "✓ Settings saved",
    toastFillKaggle: "Enter both Kaggle username and API Key",
    toastKaggleSaved: "✅ Kaggle credentials verified and saved",
    toastKaggleImported: "✅ kaggle.json verified and imported",
  },
};

function t() {
  return I18N[currentLang] || I18N.zh;
}

function translateBackendText(text) {
  const s = String(text || "");
  if (!s || currentLang !== "en") return s;

  if (s.includes("算力未启动")) return "GPU offline · Zero quota consumption";
  if (s.includes("云端算力已断开")) return "Cloud GPU disconnected";
  if (s.includes("绿灯就绪")) {
    return "GPU ready and standing by — drop media files anytime";
  }
  if (s.includes("等待中（排队）") || s.includes("等待加入")) return "Queued";
  if (s.includes("等待云端算力亮绿灯")) return "Waiting for cloud GPU green light";
  if (s.includes("抽离") && s.includes("音频")) return "Extracting slim 16kHz audio locally";
  if (s.includes("上传云端")) return "Uploading slim audio to cloud GPU";
  if (s.includes("转录中") || s.includes("正在识别")) return "Running faster-whisper inference on cloud GPU";
  if (s === "转录完成" || s.includes("转录完成")) return "Transcription completed";
  if (s.includes("关闭算力") || s.includes("释放显卡") || s.includes("停机")) return "Stopping cloud GPU runtime";
  if (s.includes("检查云端是否已有空闲 Colab")) return "Checking existing Colab runtimes...";
  if (s.includes("申请") && s.includes("Colab")) return "Provisioning Google Colab GPU runtime...";
  if (s.includes("载入 Whisper")) return "Loading Whisper weights and tunnel on cloud GPU...";
  if (s.includes("Kaggle")) return s.replace("正在启动", "Starting").replace("等待笔记本亮绿灯", "waiting for notebook green light");
  return s;
}

const pendingHostCalls = new Map();
let hostCallSeq = 1;

function callHostBridge(action, payload = {}) {
  if (!isEmbedded || !window.parent || window.parent === window) {
    return Promise.resolve({ ok: false, error: "不在桌面宿主环境" });
  }
  const requestId = `cw-${Date.now()}-${hostCallSeq++}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pendingHostCalls.delete(requestId);
      resolve({ ok: false, error: "宿主响应超时" });
    }, 30000);
    pendingHostCalls.set(requestId, (result) => {
      clearTimeout(timer);
      resolve(result || { ok: false });
    });
    window.parent.postMessage(
      { type: "cw-host-action", requestId, action, payload },
      "*"
    );
  });
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;
  if (msg.type === "cw-host-result" && msg.requestId && pendingHostCalls.has(msg.requestId)) {
    const cb = pendingHostCalls.get(msg.requestId);
    pendingHostCalls.delete(msg.requestId);
    cb(msg.result);
    return;
  }
  if (msg.type === "cw-parent-cmd") {
    if (msg.cmd === "refresh") {
      if (msg.tab === "queue" || msg.tab === "history") {
        switchTab(msg.tab);
      }
      pollState();
      return;
    }
    if (msg.cmd === "set-lang" && (msg.lang === "en" || msg.lang === "zh")) {
      applyI18n(msg.lang);
    }
  }
});

const state = {
  snapshot: null,
  activeTab: "queue",      // "queue" | "history"
  activeView: "plain",     // "plain" | "timeline" | "srt"
  selectedRecord: null,    // 当前右侧显示的完整记录
  selectedId: null,
  autoOpenedIds: new Set(),
};

const $ = (id) => document.getElementById(id);

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

function setHtml(id, val) {
  const el = $(id);
  if (el) el.innerHTML = val;
}

function applyI18n(lang) {
  currentLang = lang === "en" ? "en" : "zh";
  document.documentElement.lang = currentLang === "en" ? "en" : "zh-CN";
  const dict = t();

  setText("brandSub", dict.brandSub);
  const provSwitch = $("providerSwitch");
  if (provSwitch) provSwitch.setAttribute("aria-label", dict.providerAria);
  if ($("languageQuick")) $("languageQuick").title = dict.languageTitle;
  if ($("refreshBtn")) $("refreshBtn").title = dict.refreshTitle;
  if ($("settingsBtn")) $("settingsBtn").title = dict.settingsTitleBtn;
  if ($("autoShutdownToggleWrap")) $("autoShutdownToggleWrap").title = dict.autoShutdownTooltip;

  setText("toggleLogBtn", dict.toggleLogBtn);
  setText("orphanStopBtn", dict.orphanStopBtn);
  setText("dropTitle", dict.dropTitle);
  setText("dropOrText", dict.dropOrText);
  setText("pickFileBtn", dict.pickFileBtn);
  setText("dropMultiText", dict.dropMultiText);
  setText("dropTip1", dict.dropTip1);
  setText("dropTip2", dict.dropTip2);
  setText("tabQueueText", dict.tabQueueText);
  setText("tabHistoryText", dict.tabHistoryText);
  if ($("openFolderBtn")) {
    $("openFolderBtn").title = dict.openFolderTitle;
    $("openFolderBtn").textContent = dict.openFolderBtn;
  }

  setText("guideBadge", dict.guideBadge);
  setText("guideHeading", dict.guideHeading);
  setText("step1Title", dict.step1Title);
  setHtml("step1Desc", dict.step1Desc);
  setText("step2Title", dict.step2Title);
  setHtml("step2Desc", dict.step2Desc);
  setText("step3Title", dict.step3Title);
  setHtml("step3Desc", dict.step3Desc);

  setText("copyBtn", dict.copyBtn);
  setText("dlTxtBtn", dict.dlTxtBtn);
  setText("dlSrtBtn", dict.dlSrtBtn);
  setText("viewPlainBtn", dict.viewPlainBtn);
  setText("viewTimelineBtn", dict.viewTimelineBtn);
  setText("viewSrtBtn", dict.viewSrtBtn);

  setText("settingsTitle", dict.settingsTitle);
  setText("colabSecTitle", dict.colabSecTitle);
  setHtml("colabSecHint", dict.colabSecHint);
  setText("colabGpuLabel", dict.colabGpuLabel);
  setText("kaggleSecTitle", dict.kaggleSecTitle);
  setHtml("kaggleSecHint", dict.kaggleSecHint);
  setText("uploadKaggleJsonBtn", dict.uploadKaggleJsonBtn);
  setText("dlKaggleNbBtn", dict.dlKaggleNbBtn);
  setText("kaggleUserLabel", dict.kaggleUserLabel);
  if ($("kaggleUserInput")) $("kaggleUserInput").placeholder = dict.kaggleUserPlaceholder;
  setText("kaggleKeyLabel", dict.kaggleKeyLabel);
  if ($("kaggleKeyInput")) $("kaggleKeyInput").placeholder = dict.kaggleKeyPlaceholder;
  setText("saveKaggleBtn", dict.saveKaggleBtn);
  setText("modelSecTitle", dict.modelSecTitle);
  setText("modelSelectLabel", dict.modelSelectLabel);
  setText("autoOffSelectLabel", dict.autoOffSelectLabel);
  setText("cancelSettingsBtn", dict.cancelSettingsBtn);
  setText("saveSettingsBtn", dict.saveSettingsBtn);

  document.querySelectorAll("[data-i18n-opt]").forEach((opt) => {
    const key = opt.getAttribute("data-i18n-opt");
    if (key && typeof dict[key] === "string") {
      opt.textContent = dict[key];
    }
  });

  if (state.snapshot) {
    renderSnapshot(state.snapshot);
  } else {
    setText("statusLabel", dict.statusOffline);
    setText("statusMeta", dict.zeroUsage);
    setText("powerBtnText", dict.btnStartCompute);
    setText("bannerBadge", dict.badgeStandby);
    setText("bannerMsg", dict.defaultBannerMsg);
    setText("autoShutdownLabel", dict.autoShutdownManual);
    setText("colabConnTag", dict.kaggleChecking);
    setText("kaggleConnTag", dict.kaggleMissing);
  }
  renderReader();
}

function showToast(msg, ms = 2600) {
  const el = $("toast");
  el.textContent = msg;
  el.classList.remove("hidden");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => el.classList.add("hidden"), ms);
}

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val.toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function formatSec(sec) {
  if (sec == null || isNaN(sec)) return "00:00";
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

async function api(path, options = {}) {
  const resp = await fetch(path, options);
  if (!resp.ok) {
    let detail = `HTTP ${resp.status}`;
    try {
      const data = await resp.json();
      detail = data.detail || data.error || detail;
    } catch (_) {}
    throw new Error(detail);
  }
  return resp.json();
}

function renderSnapshot(snap) {
  if (!snap) return;
  const dict = t();
  state.snapshot = snap;
  const { compute, settings, env, tasks, history } = snap;

  // Sync compact state snapshot back to Joel Desk Pro parent when embedded
  if (isEmbedded && window.parent && window.parent !== window) {
    try {
      window.parent.postMessage(
        { type: "cw-state-updated", snapshot: { compute, settings } },
        "*"
      );
    } catch (_) {}
  }

  // 1. 引擎切换按钮
  const isBusy = compute.status === "starting" || compute.status === "online" || compute.status === "stopping";
  document.querySelectorAll("#providerSwitch .seg-btn").forEach((btn) => {
    const p = btn.dataset.provider;
    const activeProvider = isBusy ? compute.provider : settings.provider;
    btn.classList.toggle("active", p === activeProvider);
    btn.disabled = isBusy;
  });

  // 2. 快速语言下拉
  if ($("languageQuick").value !== settings.language) {
    $("languageQuick").value = settings.language;
  }

  // 3. 状态灯与主开关按钮
  const pill = $("statusPill");
  const label = $("statusLabel");
  const meta = $("statusMeta");
  const powerBtn = $("powerBtn");
  const powerText = $("powerBtnText");
  const powerIcon = powerBtn.querySelector(".btn-icon");

  pill.className = "status-pill";
  if (compute.status === "online") {
    pill.classList.add("status-online");
    label.textContent = dict.statusOnline;
    meta.textContent = `${compute.gpu || compute.provider.toUpperCase()} · ${formatSec(compute.uptime_seconds)}`;
    powerBtn.className = "btn btn-stop";
    powerBtn.disabled = false;
    powerIcon.textContent = "■";
    powerText.textContent = dict.btnStopCompute;
  } else if (compute.status === "starting") {
    pill.classList.add("status-starting");
    label.textContent = dict.statusStarting;
    meta.textContent = `${compute.provider.toUpperCase()} · ${dict.preparing}`;
    powerBtn.className = "btn btn-stop";
    powerBtn.disabled = false;
    powerIcon.textContent = "■";
    powerText.textContent = dict.btnCancelStart;
  } else if (compute.status === "stopping") {
    pill.classList.add("status-starting");
    label.textContent = dict.statusStopping;
    meta.textContent = dict.releasingGpu;
    powerBtn.className = "btn btn-stop";
    powerBtn.disabled = true;
    powerIcon.textContent = "■";
    powerText.textContent = dict.btnStopping;
  } else if (compute.status === "error") {
    pill.classList.add("status-error");
    label.textContent = dict.statusError;
    meta.textContent = dict.retryRightHint;
    powerBtn.className = "btn btn-start";
    powerBtn.disabled = false;
    powerIcon.textContent = "▶";
    powerText.textContent = dict.btnRetryStart;
  } else {
    pill.classList.add("status-offline");
    label.textContent = dict.statusOffline;
    meta.textContent = dict.zeroUsage;
    powerBtn.className = "btn btn-start";
    powerBtn.disabled = false;
    powerIcon.textContent = "▶";
    powerText.textContent = dict.btnStartCompute;
  }

  // 4. 状态横幅
  const badge = $("bannerBadge");
  if (compute.status === "online") {
    badge.textContent = dict.badgeOnline;
    badge.style.background = "#ecfdf5";
    badge.style.color = "#065f46";
  } else if (compute.status === "starting") {
    badge.textContent = dict.badgeStarting;
    badge.style.background = "#fffbeb";
    badge.style.color = "#92400e";
  } else if (compute.status === "error") {
    badge.textContent = dict.badgeError;
    badge.style.background = "#fef2f2";
    badge.style.color = "#991b1b";
  } else {
    badge.textContent = dict.badgeStandby;
    badge.style.background = "#eef2ff";
    badge.style.color = "#3730a3";
  }

  $("bannerMsg").textContent = translateBackendText(compute.message) || dict.defaultBannerMsg;

  // 外围「闲置自动关机」勾选状态同步
  const autoToggle = $("autoShutdownToggle");
  const autoEnabled = Boolean(settings.auto_shutdown_enabled);
  const autoMins = Number(settings.auto_shutdown_minutes || 15);
  autoToggle.checked = autoEnabled;
  autoToggle.closest(".auto-off-toggle")?.classList.toggle("is-checked", autoEnabled);
  $("autoShutdownLabel").textContent = autoEnabled && autoMins > 0
    ? dict.autoShutdownWithMins(autoMins)
    : dict.autoShutdownManual;

  // 闲置倒计时（未勾选 = 完全手动不自动关；勾选且有排队文件 = 等全部转完再开始计时）
  const idleEl = $("idleHint");
  idleEl.classList.remove("manual");
  const pendingCount = compute.pending_tasks_count || 0;
  if (compute.status === "online" && !autoEnabled) {
    idleEl.textContent = dict.idleManualHint;
    idleEl.classList.add("manual");
    idleEl.classList.remove("hidden");
  } else if (compute.status === "online" && pendingCount > 0) {
    idleEl.textContent = dict.idlePendingHint(pendingCount);
    idleEl.classList.remove("hidden");
  } else if (compute.status === "online" && compute.idle_remaining_seconds != null) {
    idleEl.textContent = dict.idleCountdownHint(formatSec(compute.idle_remaining_seconds));
    idleEl.classList.remove("hidden");
  } else {
    idleEl.classList.add("hidden");
  }

  // 日志开关
  const hasLogs = Array.isArray(compute.logs) && compute.logs.length > 0;
  $("toggleLogBtn").classList.toggle("hidden", !hasLogs);
  if (hasLogs) {
    $("logContent").textContent = compute.logs.join("\n");
  }

  // 残留 Colab 实例提醒
  const showOrphan = compute.status === "offline" && (compute.orphan_colab_count || 0) > 0;
  $("orphanStopBtn").classList.toggle("hidden", !showOrphan);

  // 5. 任务列表 & 历史列表
  $("queueCount").textContent = tasks.length;
  $("historyCount").textContent = history.length;
  renderQueue(tasks);
  renderHistory(history);

  // 自动打开刚完成的任务
  for (const tsk of tasks) {
    if (tsk.status === "done" && tsk.result && !state.autoOpenedIds.has(tsk.id)) {
      state.autoOpenedIds.add(tsk.id);
      selectRecord(tsk.result);
    }
  }

  // 6. 设置弹窗里的连接标签
  const colabTag = $("colabConnTag");
  colabTag.textContent = env.colab_ready ? dict.colabReady : dict.colabMissing;
  colabTag.classList.toggle("ok", env.colab_ready);

  const kaggleTag = $("kaggleConnTag");
  kaggleTag.textContent = env.kaggle_ready ? dict.kaggleReady(env.kaggle_username) : dict.kaggleMissing;
  kaggleTag.classList.toggle("ok", env.kaggle_ready);
}

function renderQueue(tasks) {
  const dict = t();
  const box = $("queueList");
  if (!tasks.length) {
    box.innerHTML = `<div class="empty-list">${escapeHtml(dict.emptyQueue)}</div>`;
    return;
  }
  box.innerHTML = "";
  for (const tsk of tasks) {
    const card = document.createElement("div");
    card.className = "item-card" + (state.selectedId === tsk.id ? " selected" : "");

    let tagClass = "tag-work";
    let tagText = dict.tagWork;
    let showBar = true;
    if (tsk.status === "done") {
      tagClass = "tag-done";
      tagText = dict.tagDone;
      showBar = false;
    } else if (tsk.status === "waiting_gpu") {
      tagClass = "tag-wait";
      tagText = dict.tagWait;
      showBar = false;
    } else if (tsk.status === "error") {
      tagClass = "tag-err";
      tagText = dict.tagErr;
      showBar = false;
    }

    const sizeInfo = tsk.slim_size > 0
      ? `${formatBytes(tsk.orig_size)} → ${formatBytes(tsk.slim_size)} (${dict.slimPrefix} ${tsk.saved_percent}%)`
      : formatBytes(tsk.orig_size);

    card.innerHTML = `
      <div class="item-top">
        <span class="item-name" title="${escapeHtml(tsk.filename)}">${escapeHtml(tsk.filename)}</span>
        <span class="item-tag ${tagClass}">${tagText}</span>
      </div>
      <div class="item-sub">
        <span>${escapeHtml(translateBackendText(tsk.error || tsk.stage_label))}</span>
      </div>
      <div class="item-sub">
        <span>${sizeInfo}</span>
        ${tsk.duration ? `<span>${dict.durationPrefix} ${formatSec(tsk.duration)}</span>` : ""}
      </div>
      ${showBar ? `<div class="mini-progress"><div class="mini-progress-bar"></div></div>` : ""}
    `;

    if (tsk.status === "done" && tsk.result) {
      card.addEventListener("click", () => selectRecord(tsk.result));
    }
    box.appendChild(card);
  }
}

function renderHistory(history) {
  const dict = t();
  const box = $("historyList");
  if (!history.length) {
    box.innerHTML = `<div class="empty-list">${escapeHtml(dict.emptyHistory)}</div>`;
    return;
  }
  box.innerHTML = "";
  for (const h of history) {
    const card = document.createElement("div");
    card.className = "item-card" + (state.selectedId === h.id ? " selected" : "");
    card.innerHTML = `
      <div class="item-top">
        <span class="item-name" title="${escapeHtml(h.filename)}">${escapeHtml(h.filename)}</span>
        <button type="button" class="item-del" title="${escapeHtml(dict.deleteHistoryTitle)}">🗑</button>
      </div>
      <div class="item-sub">
        <span>${escapeHtml(h.created_at)} · ${formatSec(h.duration)} · ${h.char_count} ${escapeHtml(dict.charsUnit)}</span>
        <span>${escapeHtml((h.engine || "").toUpperCase())}</span>
      </div>
      <div class="item-preview">${escapeHtml(h.preview || "")}</div>
    `;
    card.querySelector(".item-del").addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        await api(`/api/history/${h.id}`, { method: "DELETE" });
        if (state.selectedId === h.id) {
          state.selectedId = null;
          state.selectedRecord = null;
          renderReader();
        }
        showToast(t().toastDeleted);
        pollState();
      } catch (err) {
        showToast(err.message);
      }
    });
    card.addEventListener("click", async () => {
      try {
        const detail = await api(`/api/history/${h.id}`);
        selectRecord(detail);
      } catch (err) {
        showToast(err.message);
      }
    });
    box.appendChild(card);
  }
}

function selectRecord(record) {
  state.selectedRecord = record;
  state.selectedId = record.id;
  renderReader();
  if (state.snapshot) {
    renderQueue(state.snapshot.tasks);
    renderHistory(state.snapshot.history);
  }
}

function renderReader() {
  const dict = t();
  const rec = state.selectedRecord;
  if (!rec) {
    $("emptyGuide").classList.remove("hidden");
    $("readerActive").classList.add("hidden");
    setText("readerTitle", dict.readerDefaultTitle);
    return;
  }
  $("emptyGuide").classList.add("hidden");
  $("readerActive").classList.remove("hidden");
  $("readerTitle").textContent = rec.filename;

  const metaParts = [
    dict.metaLang(rec.language || "auto"),
    dict.metaDur(formatSec(rec.duration)),
    dict.metaElapsed(rec.elapsed || 0),
    dict.metaCompute(rec.gpu || rec.engine || "GPU"),
    dict.metaChars((rec.text || "").length),
  ];
  $("readerMeta").innerHTML = metaParts.map((m) => `<span>${escapeHtml(m)}</span>`).join("");

  const body = $("readerBody");
  if (state.activeView === "plain") {
    body.innerHTML = `<div class="plain-text">${escapeHtml(rec.text || dict.noSpeech)}</div>`;
  } else if (state.activeView === "srt") {
    body.innerHTML = `<div class="srt-text">${escapeHtml(rec.srt || dict.noSrt)}</div>`;
  } else {
    const segs = rec.segments || [];
    if (!segs.length) {
      body.innerHTML = `<div class="plain-text">${escapeHtml(dict.noSegments)}</div>`;
    } else {
      body.innerHTML = segs
        .map(
          (s) => `
          <div class="timeline-row">
            <span class="timeline-time">${formatSec(s.start)} → ${formatSec(s.end)}</span>
            <span>${escapeHtml(s.text)}</span>
          </div>`
        )
        .join("");
    }
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------- 文件上传 ----------
async function uploadFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) return;
  const lang = $("languageQuick").value || "auto";

  // 切换到任务页签
  switchTab("queue");

  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("language", lang);
    try {
      const res = await api("/api/transcribe", { method: "POST", body: fd });
      renderSnapshot(res.state);
      showToast(t().toastQueued(file.name));
    } catch (err) {
      showToast(t().toastUploadFailed(err.message), 4000);
    }
  }
}

function switchTab(tab) {
  state.activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  $("queueList").classList.toggle("hidden", tab !== "queue");
  $("historyList").classList.toggle("hidden", tab !== "history");
}

// ---------- 轮询 ----------
async function pollState() {
  try {
    const snap = await api("/api/state");
    renderSnapshot(snap);
  } catch (_) {}
}

// ---------- 事件绑定 ----------
function bindEvents() {
  // 切换 Colab / Kaggle
  document.querySelectorAll("#providerSwitch .seg-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const provider = btn.dataset.provider;
      try {
        const snap = await api("/api/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        renderSnapshot(snap);
        if (provider === "kaggle" && !snap.env.kaggle_ready) {
          showToast(t().toastNeedKaggleSettings, 3500);
          openSettingsModal();
        }
      } catch (err) {
        showToast(err.message);
      }
    });
  });

  // 快速语言选择
  $("languageQuick").addEventListener("change", async (e) => {
    try {
      const snap = await api("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: e.target.value }),
      });
      renderSnapshot(snap);
    } catch (err) {
      showToast(err.message);
    }
  });

  // 启动 / 关闭算力主按钮
  $("powerBtn").addEventListener("click", async () => {
    if (!state.snapshot) return;
    const status = state.snapshot.compute.status;
    try {
      if (status === "online" || status === "starting") {
        const snap = await api("/api/compute/stop", { method: "POST" });
        renderSnapshot(snap);
        showToast(t().toastStopSent);
      } else {
        const provider = state.snapshot.settings.provider;
        if (provider === "kaggle" && !state.snapshot.env.kaggle_ready) {
          showToast(t().toastNeedKaggleCreds);
          openSettingsModal();
          return;
        }
        const snap = await api("/api/compute/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider }),
        });
        renderSnapshot(snap);
        showToast(t().toastStartingCompute(provider.toUpperCase()));
      }
    } catch (err) {
      showToast(err.message, 4000);
    }
  });

  // 外围「闲置自动关机」一键打勾切换
  $("autoShutdownToggle").addEventListener("change", async (e) => {
    const enabled = Boolean(e.target.checked);
    try {
      const patch = { auto_shutdown_enabled: enabled };
      if (enabled && Number(state.snapshot?.settings?.auto_shutdown_minutes || 0) <= 0) {
        patch.auto_shutdown_minutes = 15;
      }
      const snap = await api("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      renderSnapshot(snap);
      if (enabled) {
        showToast(t().toastAutoOn(snap.settings.auto_shutdown_minutes));
      } else {
        showToast(t().toastAutoOff);
      }
    } catch (err) {
      showToast(err.message);
    }
  });

  // 刷新状态
  $("refreshBtn").addEventListener("click", async () => {
    try {
      const snap = await api("/api/compute/refresh", { method: "POST" });
      renderSnapshot(snap);
      showToast(t().toastRefreshed);
    } catch (err) {
      showToast(err.message);
    }
  });

  // 关闭残留 Colab 实例
  $("orphanStopBtn").addEventListener("click", async () => {
    try {
      const snap = await api("/api/compute/stop", { method: "POST" });
      renderSnapshot(snap);
      showToast(t().toastOrphanStopped);
    } catch (err) {
      showToast(err.message);
    }
  });

  // 折叠日志
  $("toggleLogBtn").addEventListener("click", () => {
    $("logDrawer").classList.toggle("hidden");
  });

  // 拖拽上传
  const dropZone = $("dropZone");
  const fileInput = $("fileInput");

  dropZone.addEventListener("click", () => fileInput.click());
  $("pickFileBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    fileInput.click();
  });
  fileInput.addEventListener("change", (e) => {
    uploadFiles(e.target.files);
    fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((ev) => {
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      dropZone.classList.remove("dragover");
    });
  });
  dropZone.addEventListener("drop", (e) => {
    uploadFiles(e.dataTransfer.files);
  });

  // 队列 / 历史页签
  document.querySelectorAll(".tab-btn").forEach((b) => {
    b.addEventListener("click", () => switchTab(b.dataset.tab));
  });

  // 打开输出文件夹
  $("openFolderBtn").addEventListener("click", async () => {
    try {
      await api("/api/open-outputs", { method: "POST" });
    } catch (err) {
      showToast(err.message);
    }
  });

  // 右侧视图切换
  document.querySelectorAll(".view-pill").forEach((p) => {
    p.addEventListener("click", () => {
      state.activeView = p.dataset.view;
      document.querySelectorAll(".view-pill").forEach((x) => x.classList.toggle("active", x === p));
      renderReader();
    });
  });

  // 复制 / 下载 TXT / SRT
  $("copyBtn").addEventListener("click", async () => {
    const rec = state.selectedRecord;
    if (!rec) return;
    const text = state.activeView === "srt" ? rec.srt : rec.text;
    try {
      await navigator.clipboard.writeText(text || "");
      showToast(t().toastCopied);
    } catch (_) {
      if (isEmbedded) {
        const res = await callHostBridge("copy_text", { text: text || "" });
        if (res?.ok) {
          showToast(t().toastCopied);
          return;
        }
      }
      showToast(t().toastCopyFailed);
    }
  });

  $("dlTxtBtn").addEventListener("click", async () => {
    if (!state.selectedRecord) return;
    if (window.pywebview?.api?.save_transcript) {
      const res = await window.pywebview.api.save_transcript(state.selectedRecord.id, "txt");
      if (res?.ok) showToast(t().toastSaved(res.path));
      else if (!res?.cancelled) showToast(res?.error || t().toastSaveFailed);
      return;
    }
    if (isEmbedded) {
      const res = await callHostBridge("save_transcript", {
        itemId: state.selectedRecord.id,
        fmt: "txt",
      });
      if (res?.ok) showToast(t().toastSaved(res.path));
      else if (!res?.cancelled) showToast(res?.error || t().toastSaveFailed);
      return;
    }
    window.open(`/api/history/${state.selectedRecord.id}/download/txt`, "_blank");
  });

  $("dlSrtBtn").addEventListener("click", async () => {
    if (!state.selectedRecord) return;
    if (window.pywebview?.api?.save_transcript) {
      const res = await window.pywebview.api.save_transcript(state.selectedRecord.id, "srt");
      if (res?.ok) showToast(t().toastSaved(res.path));
      else if (!res?.cancelled) showToast(res?.error || t().toastSaveFailed);
      return;
    }
    if (isEmbedded) {
      const res = await callHostBridge("save_transcript", {
        itemId: state.selectedRecord.id,
        fmt: "srt",
      });
      if (res?.ok) showToast(t().toastSaved(res.path));
      else if (!res?.cancelled) showToast(res?.error || t().toastSaveFailed);
      return;
    }
    window.open(`/api/history/${state.selectedRecord.id}/download/srt`, "_blank");
  });

  // 设置弹窗
  $("settingsBtn").addEventListener("click", openSettingsModal);
  $("closeSettingsBtn").addEventListener("click", closeSettingsModal);
  $("cancelSettingsBtn").addEventListener("click", closeSettingsModal);
  $("settingsModal").addEventListener("click", (e) => {
    if (e.target === $("settingsModal")) closeSettingsModal();
  });

  $("saveSettingsBtn").addEventListener("click", async () => {
    try {
      const mins = Number($("autoOffSelect").value);
      const snap = await api("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          colab_gpu: $("colabGpuSelect").value,
          whisper_model: $("modelSelect").value,
          auto_shutdown_enabled: mins > 0,
          auto_shutdown_minutes: mins > 0 ? mins : 15,
        }),
      });
      renderSnapshot(snap);
      closeSettingsModal();
      showToast(t().toastSettingsSaved);
    } catch (err) {
      showToast(err.message);
    }
  });

  // Kaggle 凭据保存与 JSON 导入
  $("saveKaggleBtn").addEventListener("click", async () => {
    const username = $("kaggleUserInput").value.trim();
    const key = $("kaggleKeyInput").value.trim();
    if (!username || !key) {
      showToast(t().toastFillKaggle);
      return;
    }
    try {
      const snap = await api("/api/kaggle/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, key, verify: true }),
      });
      renderSnapshot(snap);
      $("kaggleKeyInput").value = "";
      showToast(t().toastKaggleSaved);
    } catch (err) {
      showToast(err.message, 4500);
    }
  });

  $("uploadKaggleJsonBtn").addEventListener("click", () => $("kaggleJsonInput").click());
  $("kaggleJsonInput").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const snap = await api("/api/kaggle/upload-json", { method: "POST", body: fd });
      renderSnapshot(snap);
      showToast(t().toastKaggleImported);
    } catch (err) {
      showToast(err.message, 4500);
    } finally {
      e.target.value = "";
    }
  });

  $("dlKaggleNbBtn").addEventListener("click", async () => {
    if (window.pywebview?.api?.save_kaggle_notebook) {
      const res = await window.pywebview.api.save_kaggle_notebook();
      if (res?.ok) showToast(t().toastSaved(res.path));
      else if (!res?.cancelled) showToast(res?.error || t().toastSaveFailed);
      return;
    }
    if (isEmbedded) {
      const res = await callHostBridge("save_kaggle_notebook", {});
      if (res?.ok) showToast(t().toastSaved(res.path));
      else if (!res?.cancelled) showToast(res?.error || t().toastSaveFailed);
      return;
    }
    window.open("/api/kaggle/notebook", "_blank");
  });
}

function openSettingsModal() {
  if (state.snapshot) {
    const s = state.snapshot.settings;
    $("colabGpuSelect").value = s.colab_gpu || "T4";
    $("modelSelect").value = s.whisper_model || "large-v3-turbo";
    $("autoOffSelect").value = s.auto_shutdown_enabled ? String(s.auto_shutdown_minutes || 15) : "0";
    $("kaggleUserInput").value = state.snapshot.env.kaggle_username || "";
  }
  $("settingsModal").classList.remove("hidden");
}

function closeSettingsModal() {
  $("settingsModal").classList.add("hidden");
}

// 启动初始化
bindEvents();
applyI18n(currentLang);
pollState();
setInterval(pollState, 2000);

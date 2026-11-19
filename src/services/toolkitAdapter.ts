import {
  AgentActionPayload,
  AttachedFileItem,
  ComputeProvider,
  DocumentFormat,
  DownloadEngine,
  EndpointConfig,
  MediaKind,
  MediaQuality,
  ThreadCount,
  TranscriptLanguage,
  TranscriptOutputFormat,
  TranscriptSegment,
  WhisperPresetId,
} from '../types/toolkit';
import { AppLanguage } from '../i18n';

export interface WhisperPresetMeta {
  id: WhisperPresetId;
  label: string;
  modelName: string;
  summary: string;
  sizeLabel: string;
  speedTag: string;
}

export const WHISPER_PRESETS_BY_LANG: Record<
  AppLanguage,
  Record<WhisperPresetId, WhisperPresetMeta>
> = {
  en: {
    fast: {
      id: 'fast',
      label: 'Fast',
      modelName: 'faster-whisper-small',
      summary: 'Rapid turnaround for meetings and short clips',
      sizeLabel: '484 MB',
      speedTag: '~12x realtime',
    },
    balanced: {
      id: 'balanced',
      label: 'Balanced',
      modelName: 'faster-whisper-medium',
      summary: 'Best balance of speed and accuracy for daily use',
      sizeLabel: '1.53 GB',
      speedTag: '~6x realtime',
    },
    accurate: {
      id: 'accurate',
      label: 'Accurate',
      modelName: 'faster-whisper-large-v3',
      summary: 'Highest precision for multilingual & technical speech',
      sizeLabel: '3.09 GB',
      speedTag: '~3x realtime',
    },
  },
  zh: {
    fast: {
      id: 'fast',
      label: '快速版',
      modelName: 'faster-whisper-small',
      summary: '极速出稿，适合日常会议与短音频',
      sizeLabel: '484 MB',
      speedTag: '约 12x 实时',
    },
    balanced: {
      id: 'balanced',
      label: '均衡版',
      modelName: 'faster-whisper-medium',
      summary: '速度与识别准确度兼顾，通用首选',
      sizeLabel: '1.53 GB',
      speedTag: '约 6x 实时',
    },
    accurate: {
      id: 'accurate',
      label: '精准版',
      modelName: 'faster-whisper-large-v3',
      summary: '最高精度，适合多语种与专业术语',
      sizeLabel: '3.09 GB',
      speedTag: '约 3x 实时',
    },
  },
};

export const WHISPER_PRESETS = WHISPER_PRESETS_BY_LANG.en;

export function getWhisperPresets(lang: AppLanguage) {
  return WHISPER_PRESETS_BY_LANG[lang];
}

export interface ComputeProviderMeta {
  id: ComputeProvider;
  name: string;
  gpuSpec: string;
  note: string;
}

export const COMPUTE_PROVIDERS_BY_LANG: Record<
  AppLanguage,
  Record<ComputeProvider, ComputeProviderMeta>
> = {
  en: {
    'colab-t4': {
      id: 'colab-t4',
      name: 'Google Colab',
      gpuSpec: 'NVIDIA T4 · 16 GB',
      note: 'Model weights download automatically on first switch',
    },
    'kaggle-t4': {
      id: 'kaggle-t4',
      name: 'Kaggle Kernel',
      gpuSpec: 'NVIDIA T4 x2 · 30 GB',
      note: 'Ideal for long media & large-v3 batch inference',
    },
  },
  zh: {
    'colab-t4': {
      id: 'colab-t4',
      name: 'Google Colab',
      gpuSpec: 'NVIDIA T4 · 16 GB',
      note: '首次切换模型将在云端实例自动拉取权重',
    },
    'kaggle-t4': {
      id: 'kaggle-t4',
      name: 'Kaggle Kernel',
      gpuSpec: 'NVIDIA T4 x2 · 30 GB',
      note: '适合长音视频与 large-v3 批量推理',
    },
  },
};

export const COMPUTE_PROVIDERS = COMPUTE_PROVIDERS_BY_LANG.en;

export function getComputeProviders(lang: AppLanguage) {
  return COMPUTE_PROVIDERS_BY_LANG[lang];
}

export const DEFAULT_ENDPOINT_CONFIG: EndpointConfig = {
  llmBaseUrl: 'http://127.0.0.1:11434/v1',
  llmModel: 'qwen2.5:14b',
  llmApiKeyConfigured: false,
  runtimeMode: 'mock',
  colabBridgeUrl: 'https://your-colab-tunnel.trycloudflare.com/api/transcribe',
  kaggleBridgeUrl: 'https://your-kaggle-worker.trycloudflare.com/api/transcribe',
  colabGpuSpec: 'T4',
  autoShutdownEnabled: false,
  autoShutdownMinutes: 15,
  ffmpegAutoExtract: true,
  downloaderRpcUrl: 'http://127.0.0.1:17890/api/download',
  ytdlpPath: 'yt-dlp',
  defaultThreads: 32,
  defaultSaveDir: 'C:\\Users\\Downloads\\JoelDeskPro',
  chromeBridgeEnabled: true,
  chromeBridgePort: 17890,
  chromeBridgeToken: 'joeldeskpro-local-bridge',
  chromeBridgeAutoStart: true,
  clipboardSniffEnabled: true,
  converterApiUrl: 'http://127.0.0.1:8765/api/convert',
  githubRepo: 'joelting02-sys/JoelDeskPro',
  githubBranch: 'main',
  autoCheckUpdate: false,
};

const STREAM_MEDIA_HOSTS = [
  'bilibili.com',
  'b23.tv',
  'youtube.com',
  'youtu.be',
  'x.com',
  'twitter.com',
  'douyin.com',
  'tiktok.com',
  'vimeo.com',
  'twitch.tv',
  'soundcloud.com',
];

export function detectDownloadEngine(url: string): DownloadEngine {
  if (!url) return 'http_range';
  const lower = url.toLowerCase();
  if (lower.includes('.m3u8') || lower.includes('.mpd')) {
    return 'ytdlp';
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (STREAM_MEDIA_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`))) {
      return 'ytdlp';
    }
  } catch {
    return 'http_range';
  }
  return 'http_range';
}

export function mediaQualityLabel(quality: MediaQuality, lang: AppLanguage = 'en'): string {
  switch (quality) {
    case 'best':
      return lang === 'zh' ? '最高画质' : 'Best Quality';
    case '1080p':
      return '1080P';
    case 'audio_only':
      return lang === 'zh' ? '仅音轨' : 'Audio Only';
  }
}

const VIDEO_EXTS = new Set(['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'm4v', 'ts']);
const AUDIO_EXTS = new Set(['mp3', 'wav', 'm4a', 'flac', 'ogg', 'aac', 'opus', 'wma']);
const DOC_EXTS = new Set(['pdf', 'docx', 'doc', 'md', 'markdown', 'txt', 'png', 'jpg', 'jpeg']);

export function getFileExtension(fileName: string): string {
  const parts = fileName.trim().split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

export function detectFileCategory(fileName: string): AttachedFileItem['category'] {
  const ext = getFileExtension(fileName);
  if (VIDEO_EXTS.has(ext)) return 'video';
  if (AUDIO_EXTS.has(ext)) return 'audio';
  if (DOC_EXTS.has(ext)) return 'document';
  return 'other';
}

export function detectMediaKind(fileName: string): MediaKind {
  const ext = getFileExtension(fileName);
  return VIDEO_EXTS.has(ext) ? 'video' : 'audio';
}

export function detectDocumentFormat(fileName: string): DocumentFormat {
  const ext = getFileExtension(fileName);
  if (ext === 'pdf') return 'pdf';
  if (ext === 'docx' || ext === 'doc') return 'docx';
  if (ext === 'md' || ext === 'markdown') return 'md';
  if (ext === 'png' || ext === 'jpg' || ext === 'jpeg') return 'png';
  if (ext === 'mp4' || ext === 'm4v') return 'mp4';
  if (ext === 'mkv') return 'mkv';
  if (ext === 'mov') return 'mov';
  if (ext === 'webm') return 'webm';
  if (ext === 'gif') return 'gif';
  if (ext === 'mp3') return 'mp3';
  if (ext === 'wav') return 'wav';
  if (ext === 'm4a' || ext === 'aac') return 'm4a';
  if (ext === 'flac') return 'flac';
  if (ext === 'ogg' || ext === 'opus') return 'ogg';
  return 'txt';
}

const VIDEO_CONVERT_FORMATS: DocumentFormat[] = ['mp4', 'mkv', 'mov', 'webm', 'gif'];
const AUDIO_CONVERT_FORMATS: DocumentFormat[] = ['mp3', 'wav', 'm4a', 'flac', 'ogg'];
const DOC_CONVERT_FORMATS: DocumentFormat[] = ['docx', 'pdf', 'png', 'md', 'txt'];

export function isVideoFormat(fmt: DocumentFormat): boolean {
  return VIDEO_CONVERT_FORMATS.includes(fmt);
}

export function isAudioFormat(fmt: DocumentFormat): boolean {
  return AUDIO_CONVERT_FORMATS.includes(fmt);
}

export function getRecommendedTargetFormat(source: DocumentFormat): DocumentFormat {
  if (source === 'pdf') return 'docx';
  if (source === 'docx' || source === 'md' || source === 'png' || source === 'txt') return 'pdf';
  if (source === 'mp4') return 'mp3';
  if (isVideoFormat(source)) return 'mp4';
  if (source === 'mp3') return 'wav';
  if (isAudioFormat(source)) return 'mp3';
  return 'pdf';
}

export function getAvailableTargetFormats(source: DocumentFormat): DocumentFormat[] {
  if (isVideoFormat(source)) {
    return [...VIDEO_CONVERT_FORMATS, ...AUDIO_CONVERT_FORMATS].filter((fmt) => fmt !== source);
  }
  if (isAudioFormat(source)) {
    return AUDIO_CONVERT_FORMATS.filter((fmt) => fmt !== source);
  }
  return DOC_CONVERT_FORMATS.filter((fmt) => fmt !== source);
}

export function getFormatMenuGroups(
  fileName: string,
  lang: AppLanguage = 'en'
): Array<{ groupLabel: string; options: Array<{ format: DocumentFormat; label: string; hint: string }> }> {
  const source = detectDocumentFormat(fileName);
  const category = detectFileCategory(fileName);
  const isZh = lang === 'zh';

  if (category === 'video' || isVideoFormat(source)) {
    return [
      {
        groupLabel: isZh ? '视频 / 动图格式' : 'Video & Animation',
        options: (
          [
            { format: 'mp4', label: 'MP4', hint: isZh ? '通用兼容 H.264' : 'Universal H.264' },
            { format: 'mkv', label: 'MKV', hint: isZh ? '无损封装' : 'Lossless container' },
            { format: 'mov', label: 'MOV', hint: isZh ? '适合剪辑' : 'Editing ready' },
            { format: 'webm', label: 'WEBM', hint: isZh ? '网页轻量化' : 'Lightweight web' },
            { format: 'gif', label: 'GIF', hint: isZh ? '动图导出' : 'Animated loop' },
          ] as const
        ).filter((item) => item.format !== source),
      },
      {
        groupLabel: isZh ? '提取为纯音频' : 'Extract Audio',
        options: [
          { format: 'mp3', label: 'MP3', hint: isZh ? '320kbps 通用' : '320kbps standard' },
          { format: 'wav', label: 'WAV', hint: isZh ? '无损音轨' : 'Uncompressed PCM' },
          { format: 'm4a', label: 'M4A', hint: isZh ? 'AAC 轻量' : 'AAC compact' },
          { format: 'flac', label: 'FLAC', hint: isZh ? '无损压缩' : 'Lossless audio' },
        ],
      },
    ];
  }

  if (category === 'audio' || isAudioFormat(source)) {
    return [
      {
        groupLabel: isZh ? '音频格式转换' : 'Audio Formats',
        options: (
          [
            { format: 'mp3', label: 'MP3', hint: isZh ? '高兼容' : 'High compatibility' },
            { format: 'wav', label: 'WAV', hint: isZh ? '无损 PCM' : 'Lossless PCM' },
            { format: 'flac', label: 'FLAC', hint: isZh ? '无损压缩' : 'Lossless compressed' },
            { format: 'm4a', label: 'M4A', hint: 'Apple / AAC' },
            { format: 'ogg', label: 'OGG', hint: isZh ? '小体积' : 'Compact stream' },
          ] as const
        ).filter((item) => item.format !== source),
      },
    ];
  }

  return [
    {
      groupLabel: isZh ? '文档格式转换' : 'Document Formats',
      options: (
        [
          { format: 'pdf', label: 'PDF', hint: isZh ? '固定排版' : 'Fixed layout' },
          { format: 'docx', label: 'Word', hint: isZh ? '.docx 可编辑' : 'Editable .docx' },
          { format: 'md', label: 'Markdown', hint: isZh ? '纯文本笔记' : 'Plain notes' },
          { format: 'png', label: 'PNG', hint: isZh ? '高清图片' : 'Lossless image' },
          { format: 'txt', label: 'TXT', hint: isZh ? '纯文本' : 'Plain text' },
        ] as const
      ).filter((item) => item.format !== source),
    },
  ];
}

export function formatLabel(fmt: DocumentFormat, lang: AppLanguage = 'en'): string {
  const isZh = lang === 'zh';
  switch (fmt) {
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'Word (.docx)';
    case 'md':
      return 'Markdown';
    case 'png':
      return isZh ? 'PNG 图片' : 'PNG Image';
    case 'txt':
      return isZh ? 'TXT 纯文本' : 'TXT Plain';
    case 'mp4':
      return isZh ? 'MP4 视频' : 'MP4 Video';
    case 'mkv':
      return isZh ? 'MKV 视频' : 'MKV Video';
    case 'mov':
      return isZh ? 'MOV 视频' : 'MOV Video';
    case 'webm':
      return isZh ? 'WEBM 视频' : 'WEBM Video';
    case 'gif':
      return isZh ? 'GIF 动图' : 'GIF Animation';
    case 'mp3':
      return isZh ? 'MP3 音频' : 'MP3 Audio';
    case 'wav':
      return isZh ? 'WAV 无损' : 'WAV Lossless';
    case 'm4a':
      return isZh ? 'M4A 音频' : 'M4A Audio';
    case 'flac':
      return isZh ? 'FLAC 无损' : 'FLAC Lossless';
    case 'ogg':
      return isZh ? 'OGG 音频' : 'OGG Audio';
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function nowTimeLabel(): string {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * 精准提取从 http:// 或 https:// 开始的纯净 URL，
 * 自动剥离前缀分享文案、后缀中文提示、书名号及常见闭合标点。
 */
export function extractCleanUrl(rawText: string): {
  cleanUrl: string | null;
  hadNoise: boolean;
  fileName: string;
} {
  if (!rawText) {
    return { cleanUrl: null, hadNoise: false, fileName: '' };
  }

  const match = rawText.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i);
  if (!match) {
    return { cleanUrl: null, hadNoise: false, fileName: '' };
  }

  let cleanUrl = match[0].replace(/[),.;!?'"\]]+$/g, '');
  const trimmedRaw = rawText.trim();
  const hadNoise = trimmedRaw !== cleanUrl;

  let fileName = 'download_package.bin';
  try {
    const parsed = new URL(cleanUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const lastSeg = segments[segments.length - 1];
    if (lastSeg && lastSeg.includes('.')) {
      fileName = decodeURIComponent(lastSeg);
    } else if (lastSeg) {
      fileName = `${decodeURIComponent(lastSeg)}.mp4`;
    } else {
      fileName = `${parsed.hostname.replace(/^www\./, '')}_resource.zip`;
    }
  } catch {
    fileName = 'extracted_resource.zip';
  }

  return { cleanUrl, hadNoise, fileName };
}

function inferRequestedTargetFormat(text: string, sourceFormat: DocumentFormat): DocumentFormat {
  const lower = text.toLowerCase();
  if (lower.includes('word') || lower.includes('docx') || lower.includes('doc')) return 'docx';
  if (lower.includes('pdf')) return sourceFormat === 'pdf' ? 'docx' : 'pdf';
  if (lower.includes('markdown') || lower.includes('md')) return 'md';
  if (lower.includes('图片') || lower.includes('png') || lower.includes('jpg')) return 'png';
  if (lower.includes('txt') || lower.includes('纯文本')) return 'txt';
  return getRecommendedTargetFormat(sourceFormat);
}

function inferProvider(text: string): ComputeProvider {
  const lower = text.toLowerCase();
  if (lower.includes('kaggle')) return 'kaggle-t4';
  return 'colab-t4';
}

function inferWhisperPreset(text: string): WhisperPresetId {
  const lower = text.toLowerCase();
  if (lower.includes('精准') || lower.includes('large') || lower.includes('高精度') || lower.includes('准确')) {
    return 'accurate';
  }
  if (lower.includes('快速') || lower.includes('small') || lower.includes('快点') || lower.includes('极速')) {
    return 'fast';
  }
  return 'balanced';
}

function inferThreads(text: string, defaultThreads: ThreadCount): ThreadCount {
  if (text.includes('64')) return 64;
  if (text.includes('32')) return 32;
  if (text.includes('16')) return 16;
  if (text.includes('8')) return 8;
  return defaultThreads;
}

export function parseAgentIntent(
  text: string,
  attachments: AttachedFileItem[],
  config: EndpointConfig,
  lang: AppLanguage = 'en'
): { reply: string; action?: AgentActionPayload } {
  const isZh = lang === 'zh';
  const trimmed = text.trim();
  const urlInfo = extractCleanUrl(trimmed);

  // 1. Extract URL from clean or noisy text -> High-Speed Download dispatch
  if (urlInfo.cleanUrl) {
    const threads = inferThreads(trimmed, config.defaultThreads);
    const engine = detectDownloadEngine(urlInfo.cleanUrl);
    const lowerText = trimmed.toLowerCase();
    const mediaQuality: MediaQuality =
      lowerText.includes('仅音频') ||
      lowerText.includes('audio only') ||
      lowerText.includes('mp3') ||
      lowerText.includes('音轨')
        ? 'audio_only'
        : lowerText.includes('1080')
          ? '1080p'
          : 'best';

    const reply = isZh
      ? urlInfo.hadNoise
        ? '已自动过滤前后杂字并提取纯净链接，系统将自动以最快多线程分片方案拉取（视频页自动解析）。'
        : '已识别链接，将自动选择最快的多线程分片方案开始下载。'
      : urlInfo.hadNoise
        ? 'Cleaned surrounding text and extracted the direct URL. Ready to download with automatic multi-chunk acceleration.'
        : 'URL detected. Ready to start downloading with the fastest multi-chunk mode.';

    return {
      reply,
      action: {
        type: 'download',
        rawInput: trimmed,
        cleanUrl: urlInfo.cleanUrl,
        fileName: urlInfo.fileName,
        engine,
        threads,
        mediaQuality,
      },
    };
  }

  // 2. Attached audio/video -> Cloud T4 Transcription
  const mediaAttachment = attachments.find((f) => f.category === 'video' || f.category === 'audio');
  if (mediaAttachment) {
    const isVideo = mediaAttachment.category === 'video';
    const provider = inferProvider(trimmed);
    const preset = inferWhisperPreset(trimmed);
    const reply = isZh
      ? isVideo
        ? '已识别为视频文件，转录前将自动抽离 16kHz 音轨并调度云端 T4 运行 faster-whisper。可在下方确认模型与算力节点。'
        : '已识别为音频文件，可直接发送至云端 T4 运行 faster-whisper 转录。'
      : isVideo
        ? 'Video file detected. A 16kHz audio track will be extracted automatically before dispatching to cloud T4 faster-whisper.'
        : 'Audio file detected. Ready to dispatch directly to cloud T4 faster-whisper.';

    const wantsMdPlain =
      trimmed.toLowerCase().includes('md') ||
      trimmed.toLowerCase().includes('markdown') ||
      trimmed.includes('无时间轴');
    return {
      reply,
      action: {
        type: 'transcribe',
        fileName: mediaAttachment.name,
        fileSizeBytes: mediaAttachment.size,
        mediaKind: isVideo ? 'video' : 'audio',
        needsAudioExtract: isVideo,
        provider,
        preset,
        outputFormat: wantsMdPlain ? 'md_plain' : trimmed.toLowerCase().includes('txt') ? 'txt' : 'srt',
        language: 'auto',
      },
    };
  }

  // 3. Attached document -> Format Conversion
  const docAttachment = attachments.find((f) => f.category === 'document');
  if (docAttachment) {
    const sourceFormat = detectDocumentFormat(docAttachment.name);
    const targetFormat = inferRequestedTargetFormat(trimmed, sourceFormat);
    return {
      reply: isZh
        ? `已识别源文件格式为 ${formatLabel(sourceFormat, lang)}，并为你匹配目标格式 ${formatLabel(targetFormat, lang)}。确认后即可开始转换。`
        : `Detected ${formatLabel(sourceFormat, lang)} input and matched target format ${formatLabel(targetFormat, lang)}. Confirm below to start converting.`,
      action: {
        type: 'convert',
        fileName: docAttachment.name,
        fileSizeBytes: docAttachment.size,
        sourceFormat,
        targetFormat,
      },
    };
  }

  // 4. Text mentions transcription or conversion without a real file attached (no fake sample files!)
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('转录') ||
    lower.includes('字幕') ||
    lower.includes('transcribe') ||
    lower.includes('subtitle') ||
    lower.includes('whisper') ||
    lower.includes('录音')
  ) {
    return {
      reply: isZh
        ? '请直接拖入或点击左下角回形针附上你的音频 / 视频文件，我会立即为你配置云端 T4 转录参数。'
        : 'Please drop or attach an audio or video file using the paperclip button below, and I will prepare cloud T4 transcription immediately.',
    };
  }

  if (
    lower.includes('pdf') ||
    lower.includes('word') ||
    lower.includes('docx') ||
    lower.includes('convert') ||
    lower.includes('转换') ||
    lower.includes('转成')
  ) {
    return {
      reply: isZh
        ? '请直接拖入或附上需要转换的文档或音视频文件，我会为你匹配目标格式并启动转换。'
        : 'Please drop or attach the document or media file you want to convert, and I will match the target format for you.',
    };
  }

  return {
    reply: isZh
      ? '你可以直接粘贴链接让我提取并高速下载，拖入文档指定转换格式，或附上音视频让我调用云端 T4 转录；也可以随时从左侧切换到对应工作台。'
      : 'Paste any URL to extract and download at high speed, drop documents to convert formats, or attach audio/video for cloud T4 transcription — or jump directly to any workbench on the left.',
  };
}

export function generateSimulatedTranscript(
  fileName: string,
  preset: WhisperPresetId,
  language: TranscriptLanguage,
  appLang: AppLanguage = 'en'
): TranscriptSegment[] {
  const isChinese = language === 'zh' || (language === 'auto' && appLang === 'zh');
  if (!isChinese) {
    return [
      {
        start: '00:00:00,400',
        end: '00:00:04,850',
        text: `Loaded ${fileName} on remote T4 GPU with ${WHISPER_PRESETS_BY_LANG.en[preset].modelName}.`,
      },
      {
        start: '00:00:05,120',
        end: '00:00:10,640',
        text: 'First, we separate the audio track cleanly and normalize speech segments for fast batched decoding.',
      },
      {
        start: '00:00:11,050',
        end: '00:00:16,900',
        text: 'Next step is wiring the local LLM tool-calling endpoint so links and files route automatically.',
      },
    ];
  }

  return [
    {
      start: '00:00:00,320',
      end: '00:00:05,180',
      text: `已完成对「${fileName}」的云端 T4 语音识别，当前使用模型为 ${WHISPER_PRESETS_BY_LANG.zh[preset].modelName}。`,
    },
    {
      start: '00:00:05,450',
      end: '00:00:11,920',
      text: '今天主要确认桌面端工具箱的整体结构：左侧保留 AI 助手和独立手动工作台，方便不同场景一键切换。',
    },
    {
      start: '00:00:12,300',
      end: '00:00:18,760',
      text: '视频文件拖入后自动抽离 16kHz 音轨，再提交给 Colab 或 Kaggle 的 T4 实例执行 faster-whisper 推理。',
    },
    {
      start: '00:00:19,100',
      end: '00:00:25,400',
      text: '后续接入本地大模型接口和多线程下载引擎后，整套流程即可作为日常主力桌面软件使用。',
    },
  ];
}

export function formatTranscriptExport(
  segments: TranscriptSegment[],
  format: TranscriptOutputFormat,
  title?: string
): string {
  if (format === 'srt') {
    return segments
      .map((seg, idx) => `${idx + 1}\n${seg.start} --> ${seg.end}\n${seg.text}`)
      .join('\n\n');
  }
  if (format === 'md_plain') {
    const heading = title ? `# ${title.replace(/\.[^.]+$/, '')}\n\n` : '';
    return `${heading}${segments.map((seg) => seg.text).join('\n\n')}`;
  }
  return segments.map((seg) => seg.text).join('\n');
}

export function getTranscriptFileExtension(format: TranscriptOutputFormat): string {
  if (format === 'md_plain') return 'md';
  return format;
}

export function triggerClientBlobDownload(fileName: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function triggerClientFileDownload(
  fileName: string,
  content: string,
  mimeType = 'text/plain;charset=utf-8'
) {
  triggerClientBlobDownload(fileName, new Blob([content], { type: mimeType }));
}

export {
  buildDeskKitChromeExtension,
  buildDeskKitChromeExtension as generateChromeExtensionFiles,
  buildLocalEngineScript,
  createZipBlob,
} from './chromeExtensionBuilder';

export const API_PROTOCOL_SNIPPETS = {
  llm: `POST {llmBaseUrl}/chat/completions
{
  "model": "qwen2.5:14b",
  "messages": [{ "role": "user", "content": "帮我下这个 https://example.com/demo.mp4" }],
  "tools": ["extract_and_download", "cloud_transcribe", "convert_document"]
}`,
  transcribe: `POST {colabOrKaggleBridgeUrl}
Content-Type: multipart/form-data
{
  "file": "<audio_or_video_binary>",
  "auto_extract_audio": true,
  "provider": "colab-t4 | kaggle-t4",
  "model": "small | medium | large-v3",
  "output_format": "srt | md_plain | txt"
}`,
  download: `POST {downloaderRpcUrl}
{
  "engine": "http_range | ytdlp",
  "url": "https://example.com/resource.mp4",
  "threads": 32,
  "media_quality": "best | 1080p | audio_only",
  "headers": {
    "Referer": "https://example.com/",
    "Cookie": "<optional_from_chrome_bridge>"
  }
}`,
  chromeBridge: `// Joel Desk Pro 本地轻量 HTTP 监听服务
POST http://127.0.0.1:17890/api/bridge/capture
X-DeskKit-Token: joeldeskpro-local-bridge
{
  "source": "chrome_extension",
  "url": "https://www.bilibili.com/video/BV1xx411c7mD",
  "referer": "https://www.bilibili.com/",
  "userAgent": "Mozilla/5.0 ...",
  "cookies": "SESSDATA=..."
}`,
  convert: `POST {converterApiUrl}
Content-Type: multipart/form-data
{
  "file": "<source_document>",
  "source_format": "pdf",
  "target_format": "docx"
}`,
};

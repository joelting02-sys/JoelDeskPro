# Joel Desk Pro — TDM Fast 资源嗅探与下载器完全复刻规范与差距清单

> **范围说明**：`Joel Desk Pro` 是一个多工具个人工作台，**下载器 + Chrome 资源嗅探插件**只是其中的一个功能子模块。本文档仅聚焦于将该子模块完全复刻到原版 **TDM Fast（桌面端 v5.0.1 + Chrome 插件 v4.7.3）** 的同等能力水准，不改变工作台其他模块定位；全文不包含任何商业授权或破解逻辑，也不含任何真实密钥或 Token。

---

## 一、总体差距概览

通过逐行对比原版 **TDM Fast 资源嗅探插件（v4.7.3）**、原版 **TDM Fast 桌面端（v5.0.1，Tauri 2.12 + Rust）** 以及你现有的 **`Joel Desk Pro`（提交 `da3e69d`，`src/services/chromeExtensionBuilder.ts` + `electron/localEngine.cjs` + `src/components/DownloadView.tsx`）**：

- **Chrome 插件层**：`Joel Desk Pro` 已复刻了约 **70%~75%** 的骨架，且修正了原版冷启动漏读黑名单的小 Bug、新增了「网页端 / 本地端」双通道桥接，但缺少 **11 处关键实战细节**（协议冷启动唤起、多平台 Feed 精准抓帖、垃圾流过滤、Cookies 完整字段、异步源码扫描等）。
- **桌面软件层**：这是决定能否真正下成功的核心差距。原版 TDM Fast 是完整的 **Rust 原生并发引擎 + 自动内核管理器（`yt-dlp` / `ffmpeg` / `ffprobe` / `deno`）**；而目前 `Joel Desk Pro` 的 `electron/localEngine.cjs` 还只是约百余行的 Node.js 极简原型，存在 `.m3u8`/`.mpd` 下载损坏、Cookies 传给 `yt-dlp` 断链、无断点续传与进度回传等结构性缺口。

| 层级 | 原版 TDM Fast (v4.7.3 + v5.0.1) | 现有 Joel Desk Pro (`da3e69d`) | 核心差距摘要 |
| :--- | :--- | :--- | :--- |
| **Chrome 插件** | MV3 嗅探 + 协议冷启动 + 多平台 Feed 精准解析 + 完整 Cookie 提取 | 保留了基本网络嗅探、X/YT 简版定位与双通道桥接 | 缺自定义协议唤起、缺 TikTok/X 深度定位、缺垃圾流过滤与 `cleanTitle`、Cookie 少 3 个字段 |
| **桌面内核管理** | 自动检测/下载/更新 `yt-dlp` + `ffmpeg` + `ffprobe` + `deno` | 无内核管理，直接赌系统 PATH 存在 `yt-dlp` | 换机器或未配环境直接报错；缺 `deno` 无法解 YouTube 新版 JS 签名；缺 `ffmpeg` 无法混流 |
| **流媒体与加密流** | `.m3u8` / `.mpd` 统一由 `yt-dlp` / `ffmpeg` 拉流混流为 `.mp4` | 仅把 YT/B站/TikTok 与 `video-platform` 走 `yt-dlp` | **严重缺陷**：一般网站嗅探出的 `.m3u8`/`.mpd` 会走普通 HTTP，直接把几 KB 文本索引存成坏 `.mp4` |
| **HTTP 多线程分片** | `GET Range` 探测、暂停/恢复/断点续传、单片重试、限速、HTTP/SOCKS5 代理 | 仅 `HEAD` 探测、内存一次性写盘、无暂停/续传/重试/代理 | 遇拒 `HEAD` 的 CDN 退化为单线程；任意分片超时整任务失败；不支持限速与代理 |
| **Cookies 与防风控** | 写标准 Netscape `cookies.txt` 传给 `yt-dlp --cookies`，透传 `Referer`/`UA` | 仅普通 HTTP 拼 `Cookie` 头，`downloadViaYtdlp()` 未传任何 Cookie/Referer | 抖音/YouTube/B站登录态与高画质下 `yt-dlp` 无法利用浏览器登录态 |
| **交互与防重** | 画质清晰度弹窗、新建下载确认框、单实例协议唤醒、8 秒同 URL 去重 | 无画质选择、无确认弹窗、无协议唤起、无去重 | 无法选 4K/1080p/纯音频；重复触发会产生重复任务 |

---

## 二、Chrome 资源嗅探插件完全复刻规格

> 目标修改文件：`src/services/chromeExtensionBuilder.ts`

### 1. 软件未启动时通过自定义协议自动冷启动唤起
- **现状差距**：`JoelDeskPro` 本地引擎（默认 `127.0.0.1:17890`）未启动时，插件不会拉起 `.exe`，只能退回网页端或弹提示。
- **复刻规格**：
  1. 在 `background.js` 发送 `POST http://127.0.0.1:<port>/api/bridge/capture` 失败（本地未在线）时，当目标模式为 `local` 或桌面端优先模式下，触发自定义协议 `joeldeskpro://capture`。
  2. **携带 Cookies 任务的特殊处理**：因为 Cookies 体积很大，塞进 URI 参数会触发操作系统命令行长度限制，且冷启动先不带 Cookies 入队会被 8 秒去重拦截。因此：
     - **含 Cookies 的任务**：协议只传 `joeldeskpro://capture?launch=1`（仅负责把软件拉起来，不带任务数据），随后用分级定时器 `delays = [3000, 3000, 4000, 5000]`（毫秒）轮询重试 HTTP POST，一旦送达即停止。
     - **不含 Cookies 的任务**：将负载做 UTF-8 Base64 编码，通过 `joeldeskpro://capture?data=<encodeURIComponent(b64)>` 直接带入任务，并在 `3500ms` 后执行一次 HTTP 兜底重试（依赖桌面端 8 秒 URL 去重避免重复）。
  3. **页面内触发机制（防后台标签页协议拦截）**：优先通过 `chrome.tabs.sendMessage(tab.id, { type: 'openProtocol', url: proto }, { frameId: 0 })` 让当前活动网页的 `content.js` 在顶层框架插入隐藏 `<a href="joeldeskpro://...">` 并调用 `.click()` 后移除；若当前是 `chrome://` 或扩展页无法注入，再兜底用 `chrome.tabs.create({ url: proto, active: false })` 并在 1500ms 后关闭标签。
- **保留优势**：继续保留 `JoelDeskPro` 现有的「网页端 + 本地端」双通道切换（`targetMode: 'auto' | 'web' | 'local'`）、`extDirectDownload` CORS 兜底下载，以及冷启动时正确从 `chrome.storage.local` 读取 `blacklist` 的修复。

### 2. 信息流（Feed）精准帖子 URL 定位（`content.js`）
- **现状差距**：现有 `resolvePostUrl()` 仅做了极简版 YouTube 和 X（X 直接拿 `article.querySelector('a[href*="/status/"]')`，遇到引用推文会抓成原推或错误链接），**完全缺失 TikTok、Reddit、Instagram 定位与抖音直播间拦截**。
- **复刻规格**：
  1. **`isPermalinkPage()` 优先放行**：当前路径匹配 `/status/\d+`、`/watch\b`、`/shorts/`、`/video/`、`/(p|reel|tv)/` 时直接返回 `location.href`。
  2. **X / Twitter 3 层策略**：
     - 策略 A：找包含视频的 `<article>` 内包裹 `<time>` 标签的 `a[href*="/status/"]`（精准指向本条推文而非引用推文）；退而找排除了 `/analytics`、`/likes`、`/retweets`、`/quotes` 的 status 链接。
     - 策略 B：当视频位于浮层/Portal 时，通过 `document.elementsFromPoint(clientX, clientY)` 穿透查找下方的 `<article>`。
     - 策略 C：按垂直距离找与 `<video>` 交叠或最近的 `<article>`。
  3. **TikTok 4 层策略**：
     - 向上 25 层找 `data-video-id` / `data-e2e-video-id` / `data-scroll-index-id` / `id` 内数字 ID，并结合作者链接 `a[href*="/@"]` 拼成 `https://www.tiktok.com/@<author>/video/<id>`。
     - 读取 `link[rel="canonical"]` 或 `meta[property="og:url"]`。
     - 读取 `blockquote.tiktok-embed[cite]` 或 `data-video-id`。
     - 兜底遍历页面 `a[href*="/video/"]`。
  4. **抖音精准识别与直播间拦截**：
     - 若域名命中 `live.douyin.com` 或 URL 含 `api_path|webcast`，拦截并弹出页内轻提示「抖音直播暂不支持下载，请打开具体的视频作品后再下载」，绝不把坏地址发给桌面端。
     - 提取 `aweme_id` 时同步扫描 `location.pathname`（`/video/(\d+)`）、URL query `modal_id`、父链属性（`data-e2e-aweme-id`、`data-aweme-id`、`data-video-id`、`data-id`）以及父容器内排除 `live.douyin|api_path|webcast` 的 `/video/` 链接。
  5. **通用平台兜底**：从 `<video>` 父元素向上爬 20 层找含 `/status/`、`/watch?v=`、`/video/`、`/shorts/` 的链接。

### 3. 页面脚本注入与源码扫描增强（`inject.js` + `content.js`）
- **现状差距**：现有 `inject.js` 缺 `MutationObserver`，`scanSource()` 只在加载时跑 1 次，抖音缺少 `__PACE_DATA__` 与结构化前置采集。
- **复刻规格**：
  1. 增加 `MutationObserver` 监听 `document.documentElement`（`childList: true, subtree: true`），有新 `<video>`/`<audio>` 节点插入 DOM 时立即扫描 `src` / `currentSrc` / `<source>`。
  2. `scanSource()` 定时执行 **9 轮**（首次加载 + `setInterval(..., 1500)` 共 8 次后清除），捕获异步脚本渲染进 HTML 的 `.m3u8` / `.mpd` / `.mp4` 直链（正则提取后反转义 `\/` 和 `&amp;`）。
  3. 抖音 `scanDouyinGlobals()` 补全全局键列表 `['_ROUTER_DATA', '__INITIAL_STATE__', '__INIT_PROPS__', '__PACE_DATA__', '_SSR_DATA', 'RENDER_DATA', '__NEXT_DATA__']`；接口解析优先执行结构化 `collectAwemeMap()`，再用 `deepCollectAweme()` 深扫兜底。
  4. `content.js` 在保留 `manifest` `world: "MAIN"` 注入的同时，保留动态插入 `<script src="chrome.runtime.getURL('inject.js')">` 的兜底注入（依赖 `window.__deskkitInjected` 防重）。

### 4. 网络响应头嗅探与垃圾过滤（`background.js`）
- **现状差距**：现有逻辑只认后缀 `.m3u8/.mpd`，会漏掉 URL query 参数型清单，且未过滤 DASH/CMAF 分片和伪装 `octet-stream` 的接口垃圾。
- **复刻规格**：
  1. **流清单拓展识别**：`isM3u8OrMpd = /\.(m3u8|mpd)(\?|$|#)/i.test(url) || /[?&](m3u8|playlist|manifest)/i.test(url)`。
  2. **精细垃圾过滤（在 `isM3u8OrMpd` 为 false 时生效）**：
     - 跳过 `.ts` / `.m4s` 分片（`!isAttachment`）。
     - 跳过 `videoplayback|googlevideo\.com`。
     - 跳过含 DASH/CMAF 分片参数的请求：`/[?&](range|sq|rn|rbuf|itag)=/i.test(url)`。
     - 跳过伪装为 `application/octet-stream` 的接口响应：`/\/api\/|\.json(\?|$)|badge_count|settings\.json/i.test(url)`（仅当非媒体、非流、非附件、非明确资源后缀时）。
     - 保留小体积的 `.m3u8` / `.mpd` 清单（绝不用 `MIN_MEDIA_SIZE = 200KB` 误杀主清单）；非流纯媒体小于 `200KB` 跳过以过滤探测包。
  3. **泛用清单名自动美化**：若流文件名匹配 `/^(index|master|playlist|manifest|video|chunklist)/i`，自动替换为主页清洗后的标题 `cleanTitle(info.title, pageUrl) + '.mp4'`。
  4. **非平台一般站点直链选择**：`content.js` 从 `getSniffed` 取直链时，`.mp4` 等候选应排除含 `/preview/i` 的预览片段；`RES_EXT` 补齐 `ts, tar.bz2, doc/xls/ppt, azw3, psd, ai, sketch` 等后缀。

### 5. SPA 路由跟踪、标题清洗与平台补充
- **现状差距**：缺少部分单页应用导航事件与异步标题更新，切页容易出现旧标题或带未读计数前缀的文件名。
- **复刻规格**：
  1. `background.js` 补全监听：`chrome.webNavigation.onHistoryStateUpdated`、`chrome.webNavigation.onReferenceFragmentUpdated`、`chrome.windows.onFocusChanged`（同步更新 `_activeTabId`，把 `tabId < 0` 的 Worker 媒体请求精准归属到当前活跃标签页）。
  2. `content.js` 使用 `MutationObserver` 监听 `<title>` 元素变化，变化时向后台发 `titleUpdate`，动态修正已记录 `video-platform` 条目的文件名。
  3. `background.js` 实现 `cleanTitle(title, url)`：剥离 `^\(\d+\+?\)\s*` 未读数（如 `(21) ...`）和站点后缀；若剩余部分命中泛用标题（`主页|首页|探索|通知|消息|home|explore|...`），则改从 URL 提取有意义名称（如 X 的 `<user>-<statusId>` 或 YouTube 的 `?v=<id>`）。
  4. `VIDEO_PLATFORMS` 补全 `redd.it` 和 `dailymotion.com`，并在 `isVideoPlatformPage()` 中补上 Reddit `/comments/` 判定。

### 6. Cookies 字段完整传递
- **现状差距**：目前 `getCookiesForUrl()` 仅取了 6 个字段，丢掉了生成 Netscape `cookies.txt` 必需的过期时间与主机标志。
- **复刻规格**：必须补全并返回全部 9 个字段：
  ```js
  {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    hostOnly: c.hostOnly,
    session: c.session,
    expirationDate: c.expirationDate,
  }
  ```

### 7. 右键菜单与 Popup 交互补齐
- 右键菜单增加 `image` 上下文到「高速下载此链接」，并在插件图标（`contexts: ['action']`）增加 `type: 'checkbox'` 的「接管视频/音频下载」快捷开关（在 `applyStored()` 中同步 `chrome.contextMenus.update` 勾选状态，遇 `lastError` 自动重建菜单）。
- Popup 列表按类型区分 4 色标签（HLS `#e91e63`、DASH `#9c27b0`、在线视频 `#d32f2f`、普通 HTTP `#2f7be0`），并在 `video-platform` 条目下显示提示行「整页视频：将解析并选择清晰度后下载」。

---

## 三、桌面端下载引擎完全复刻规格

> 目标修改文件：`electron/localEngine.cjs`、`electron/main.cjs`、`src/components/DownloadView.tsx`、`src/services/webRangeDownloader.ts`

### 1. 内核自动检测、安装与更新管理器（对标 `src/kernel.rs` + `src/ytdlp.rs`）
- **现状差距**：`localEngine.cjs` 直接写死 `spawn('yt-dlp', ...)`，既没有内嵌也没做自动下载；完全未使用 `ffmpeg`、`ffprobe`、`deno`。
- **复刻规格**：
  1. 在用户应用数据目录（如 `%APPDATA%/joel-desk-pro/bin/`）统一管理 4 个核心二进制：
     - `yt-dlp.exe`（全站视频/流媒体解析与并发下载）
     - `ffmpeg.exe` 与 `ffprobe.exe`（来自 `yt-dlp/FFmpeg-Builds`，负责音视频无损混流、HLS/DASH 封装与时长码率探测）
     - `deno.exe`（供 `yt-dlp` 执行 YouTube 新版 EJS/JS 签名解密）
  2. 暴露接口给前端状态栏与设置页：
     - `GET /api/kernel/status`：返回各组件是否存在、版本号与路径。
     - `POST /api/kernel/install` / `POST /api/kernel/update`：缺失时从官方 Release 自动下载并校验，下载/解压进度通过轮询或 SSE 回传前端。
  3. 调用 `yt-dlp` 时通过 `--ffmpeg-location <binDir>` 与将 `<binDir>` 注入子进程 `PATH`，确保不依赖用户全局环境变量。

### 2. 全协议任务分流路由（彻底修复 `.m3u8` / `.mpd` 损坏问题）
- **现状差距**：目前仅按 `payload.kind === 'video-platform'` 或域名白名单走 `yt-dlp`，**普通影视/课程站点嗅探到的 `.m3u8` 和 `.mpd` 会错走 `downloadMultiChunkRange()`，导致保存出无法播放的几 KB 索引文本**。
- **复刻规格**：按以下优先级分流：
  1. **视频平台页**（`kind === 'video-platform'` 或匹配 YT/B站/抖音/TikTok/X/Reddit/Vimeo/Instagram/Twitch 等）：走 `yt-dlp`（带清晰度参数与 Cookies）。
  2. **流媒体清单**（`kind === 'hls' || kind === 'dash'` 或 URL 匹配 `/\.(m3u8|mpd)(\?|$|#)/i` 或 `/[?&](m3u8|playlist|manifest)/i`）：**强制路由给 `yt-dlp`（带 `--concurrent-fragments`、`--ffmpeg-location`、`--merge-output-format mp4`）或 `ffmpeg` 拉流混流为完整 `.mp4`**。
  3. **普通文件直链**（HTTP/HTTPS 直链 `.mp4` / `.zip` / `.exe` / `.gguf` 等）：走重构后的 HTTP 多线程分片引擎。

### 3. HTTP 多线程分片引擎全面重构
- **现状差距**：当前 `downloadMultiChunkRange` 仅用 `HEAD` 探测、出错即死、无暂停/恢复/断点续传/限速/代理。
- **复刻规格**：
  1. **Range 探测策略升级**：优先发 `GET` 带 `Range: bytes=0-0`（很多 CDN 拒绝 `HEAD` 或隐藏 `Content-Length`，但会对 `bytes=0-0` 返回 `206 Partial Content` 和 `Content-Range: bytes 0-0/<total>`），立即取消响应体流；若 206 失败再降级试 `HEAD`。
  2. **任务生命周期与状态机**：支持 `queued | parsing | downloading | paused | merging | completed | error | canceled`。
     - 暴露控制接口：`POST /api/tasks/:id/pause`、`POST /api/tasks/:id/resume`、`POST /api/tasks/:id/cancel`、`DELETE /api/tasks/:id`。
  3. **真断点续传与进度持久化**：
     - 将任务元信息与每个分片的 `start / end / written` 偏移量持久化到 `<saveDir>/.<taskId>.joelpart.json`（或临时目录）。
     - 点击「暂停」时用 `AbortController` 立即中止所有分片请求并保存各片已写入字节数；点击「恢复」时从 `start + written` 发起 `Range` 请求续传，不再重头下载。
     - 下载全部完成并校验字节数后删除 `.joelpart.json` 并将临时文件名重命名为最终文件名。
  4. **单分片独立重试**：单个分片遇网络抖动/超时/5xx 时，按指数退避（例如 `1s -> 2s -> 4s`，最多 5 次）局部重下该分片未完成区间，不连累其他已完成分片。
  5. **全局/单任务限速与代理**：
     - 支持设置最大下载速度（令牌桶节流各分片读取速率）。
     - 支持配置 `proxyEnabled / proxyType (http | socks5) / proxyHost / proxyPort / proxyUser / proxyPass`（Node 侧对 HTTP/HTTPS 与 SOCKS5 代理做统一转发支持，同时透传给 `yt-dlp --proxy`）。
  6. **自动解压与响应头文件名解析**：处理非 Range 单流响应的 `Content-Encoding`（gzip/deflate/br），并优先从 `Content-Disposition` 提取 `filename*=UTF-8''...` 真实文件名。

### 4. `yt-dlp` 完整下载链路、Netscape `cookies.txt` 桥接与实时进度
- **现状差距**：目前 `downloadViaYtdlp` 忽略了 `cookies`、`referer`、`user-agent` 且 `stdio: 'ignore'` 导致界面完全看不到进度和错误。
- **复刻规格**：
  1. **Cookies 转写 Netscape 文件**：当任务附带插件传来的 `cookies` 数组时，在临时目录写入标准格式文件 `ck-<taskId>.txt`：
     ```text
     # Netscape HTTP Cookie File
     # Generated by Joel Desk Pro
     <domain>\t<TRUE|FALSE>\t<path>\t<TRUE|FALSE>\t<expiryInt>\t<name>\t<value>
     ```
     （注意：`includeSubdomains` 按 `!c.hostOnly && domain.startsWith('.') ? 'TRUE' : 'FALSE'` 判定；`expirationDate` 为空或会话 Cookie 时写 `0` 或未来时间戳防被 `yt-dlp` 忽略）。任务结束（无论成功或报错）后在 `finally` 中安全删除该临时文件。
  2. **标准执行参数**：
     ```text
     yt-dlp
       --newline
       --progress
       --no-playlist                (单视频模式)
       -f <formatSelector>          (默认 bestvideo+bestaudio/best，或用户所选清晰度)
       --merge-output-format mp4
       --concurrent-fragments <N>   (并发分片数，如 8~16)
       --retries 10
       --fragment-retries 10
       --retry-sleep exp=1:30
       --ffmpeg-location <binDir>
       --cookies <tempCookieFile>   (存在时)
       --referer <referer>          (存在时)
       --user-agent <userAgent>     (存在时)
       --proxy <proxyUrl>           (开启代理时)
       -o <outputTemplate>
       <url>
     ```
  3. **实时进度与日志解析**：接管 `stdout` / `stderr`（按行读取），正则匹配 `yt-dlp` 输出的 `[download]  42.3% of  128.50MiB at    8.42MiB/s ETA 00:08` 与 `[Merger]` 状态，实时更新任务的 `downloadedBytes / totalBytes / speedBps / etaSeconds / stage` 并回传前端进度条；失败时截取最后几行 stderr 作为可读错误提示。

### 5. 清晰度预解析与新建任务确认弹窗（`askVideoQuality`）
- **现状差距**：插件或前端送来视频后静默直接按默认配置下，无法在下载前挑选 4K/1080p/720p/仅 MP3，也不能临时改保存路径和文件名。
- **复刻规格**：
  1. 新增预解析接口 `POST /api/parse`：对平台视频调用 `yt-dlp -J --no-playlist`（带临时 `cookies.txt` 与 `--referer`），提取标题、时长、缩略图、合并格式选项（如 `2160p MP4`、`1080p MP4`、`720p MP4`、`仅音频 MP3/M4A`）与精确 `format_id` 组合。
  2. 前端 `DownloadView.tsx` 在开启「下载前询问画质/确认弹窗」时，收到插件推送或新建链接后弹出干净的新建任务弹窗：支持修改文件名、选择保存目录、选清晰度/线程数，点击确认后再调用 `POST /api/download` 开下（若同时收到多条批量资源也可一键全部开下）。

### 6. 自定义 URI 协议注册、单实例唤醒与 8 秒去重
- **现状差距**：`electron/main.cjs` 虽注册了 `requestSingleInstanceLock`，但未注册协议且未处理协议启动参数；`localEngine.cjs` 没有相同 URL 短时去重。
- **复刻规格**：
  1. 在 `electron/main.cjs` 注册协议：`app.setAsDefaultProtocolClient('joeldeskpro')`（打包后可由浏览器直接拉起 `.exe`）。
  2. 解析启动参数及 `second-instance` 事件中的 `argv`：提取 `joeldeskpro://capture?launch=1` 或 `joeldeskpro://capture?data=<b64>`，解出任务后送入 `localEngine` 并将主窗口置前聚焦（`mainWindow.restore(); mainWindow.focus()`）。
  3. **8 秒相同 URL 去重**：在 `localEngine.cjs` 的 `startTask()` 入口维护 `recentUrls = Map<normalizedUrl, timestamp>`，8000ms 内重复收到的同一 URL 直接忽略并返回已存在任务（完美兼容「协议冷启动 + HTTP 兜底重试」机制）。

---

## 四、顺手附注：`electron/localEngine.cjs` 中 Colab 算力模块需顺手修正的 3 处隐患

在排查 `electron/localEngine.cjs` 时顺便发现，此前同步进去的 Colab 模块有 3 处与真实可用规格不一致的地方，后续一并修掉即可跑通：

1. **MCP 端点域名错误**：第 23 行写成了 `https://colab.googleapis.com/mcp`，实际官方接口域名是 `https://colaboratory.googleapis.com/mcp`。
2. **`create_runtime` 参数结构不对**：第 522 行传了 `{ variant: 'GPU', accelerator: gpu }`，官方 `create_runtime` 要求嵌套结构：`{ runtime: { runtimeSpec: { variant: 'VARIANT_GPU', accelerator: gpu, shape: 'SHAPE_STANDARD' } } }`；另外 `delete_runtime` 参数键应为 `{ name: rt.name, allowMissing: true }`（运行时标识格式为 `runtimes/...`）。
3. **缺少 `execute_code` 部署步骤**：目前 `create_runtime` 后直接去探测 `COLAB_GATEWAY_URL/health`，但刚开出来的空 Colab 机器里还没有运行 Whisper/推理服务和 `cloudflared` 隧道，必须按《Colab连接原理与配置指南.md》先通过 `execute_code` 注入云端服务并注册网关后，再轮询 `/health` 亮绿灯。

---

## 五、分阶段复刻路线图与 AI Studio 更新 Prompt

### 推荐实施顺序（按收益从高到低）
- **阶段 P0（打通“能下且不下坏”）**：
  1. 桌面端补齐 `.m3u8` / `.mpd` 强制走 `yt-dlp`/`ffmpeg` 分流（彻底消灭坏 `.mp4`）。
  2. 桌面端落地插件 Cookies → Netscape `cookies.txt` → `yt-dlp --cookies` 完整链路 + `--referer` / `--user-agent` + `stdout` 实时进度解析。
  3. 桌面端增加内核管理器（自动检测与安装 `yt-dlp`、`ffmpeg`、`ffprobe`、`deno`）。
- **阶段 P1（打通“大文件稳 + 选画质”）**：
  1. 重写 HTTP 多线程分片引擎（`GET Range: bytes=0-0` 探测、分片元数据落盘断点续传、暂停/恢复/取消、单片重试、限速与代理）。
  2. 新增 `POST /api/parse`（`yt-dlp -J`）画质解析与新建任务确认弹窗。
- **阶段 P2（打通“体验丝滑如原版 TDM”）**：
  1. 补全 `chromeExtensionBuilder.ts` 的 11 处插件细节（X 3 层抓帖 / TikTok 4 层 / 抖音直播拦截、`MutationObserver` + 9 轮 `scanSource()`、垃圾参数过滤、`cleanTitle()`、9 字段 Cookies、右键开关与 4 色标签）。
  2. 桌面端注册 `joeldeskpro://` 协议 + `second-instance` 唤醒 + 8 秒去重，实现软件未开时在浏览器点下载自动拉起桌面端。

### 可直接发给 AI Studio / 开发助手的复刻指令（复制即用）

> 请严格对照《TDM_Fast完全复刻指南与差距清单.md》，仅升级 `Joel Desk Pro` 中的 **Chrome 资源嗅探插件与下载器引擎模块**（保持其他 AI Agent、云端转录、格式转换等模块不变）：
> 1. 先按第三节第 1、2、4 点改造 `electron/localEngine.cjs`：内置 `yt-dlp / ffmpeg / ffprobe / deno` 内核自检与安装接口；将所有 `.m3u8`/`.mpd` 流媒体强制路由到 `yt-dlp`/`ffmpeg` 混流为 `.mp4`；把插件传来的 Cookies 写为临时 Netscape `cookies.txt` 传给 `yt-dlp --cookies`（下完清理），并接管 `stdout` 实时回传百分比、网速与 ETA。
> 2. 再按第三节第 3、5、6 点升级 HTTP 多线程引擎与协议体验：改为 `GET Range: bytes=0-0` 探测、支持暂停/恢复/取消/断点续传/单分片重试/代理与限速；新增 `yt-dlp -J` 清晰度预解析与新建任务确认弹窗；在 `electron/main.cjs` 注册 `joeldeskpro://` 自定义协议并实现 8 秒 URL 去重。
> 3. 按第二节逐项补齐 `src/services/chromeExtensionBuilder.ts` 中的插件缺失细节（冷启动协议唤起与分级重试、X/TikTok/抖音信息流精准定位与直播拦截、`MutationObserver` + 多轮 `scanSource`、query 清单与垃圾流过滤、SPA 路由与 `cleanTitle()`、9 字段完整 Cookies、右键接管复选框），同时保留现有的网页端/本地端双通道桥接与黑名单读取修复。

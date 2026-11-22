# Joel Desk Pro

**Joel Desk Pro** 是一款极简桌面效率工作台，集成 **Magpie 本地大模型通道**、**JoelFast 高速下载器**、**Cloud Whisper Studio 云端 GPU 转录** 与 **文档/音视频格式转换**。

---

## 内置核心能力（Built-in Capabilities）

| 模块 | 能力说明 |
| --- | --- |
| **Magpie AI 通道** | 主进程直连本地 Magpie 网关（默认 `http://127.0.0.1:3425/v1`），自动拉取模型列表并流式输出正文与思考过程；也可切换任意 OpenAI 兼容接口。 |
| **JoelFast 高速下载** | 内嵌多线程高速下载器并桥接本机端口；自动清理抖音 / TikTok / B 站 / 小红书 / YouTube 分享口令中的前后杂字与符号，提取纯净链接直发下载。 |
| **Cloud Whisper Studio** | 内嵌云端转录服务（默认端口 `8788`），支持 Colab T4 / Kaggle T4 调度 `faster-whisper`（`fast` / `balanced` / `accurate`），视频自动抽离 `16kHz` 音轨后异步轮询出稿（`srt` / `md` / `txt`）。 |
| **格式转换工作台** | 支持常见文档（`PDF` / `Word` / `Markdown` / `PNG` / `TXT`）与音视频格式快速转换。 |
| **自更新机制** | 自动比对 `joelting02-sys/JoelDeskPro` GitHub Releases；新版安装包（`.exe`）默认下载至系统 **Downloads（下载）** 目录并拉起安装，不占用桌面。 |

---

## Desk Pro AI 工具调用协议（极简低 Token）

为减少上下文 Token 消耗，内置助手使用超轻量系统提示词，并在需要触发桌面工具时于**回复最后一行**输出单行协议标签（前端会自动剥离标签并执行对应操作）：

```text
[[TOOL:download|{"url":"https://v.douyin.com/xxx/","filename":"optional.mp4"}]]
[[TOOL:transcribe|{"preset":"fast|balanced|accurate","language":"auto|zh|en"}]]
[[TOOL:convert|{"target":"pdf|docx|md|png|txt|mp4|mp3|wav"}]]
[[TOOL:open|{"view":"download|transcribe|convert|settings"}]]
```

- **杂乱分享链接识别**：粘贴诸如 `5.38 复制打开抖音，看看【...】 https://v.douyin.com/xxx/ 帮我下载` 时，Agent 与前端均可自动剔除口令杂字，直接下发纯净链接到 JoelFast。
- **附件识别**：拖入音视频或文档后，Agent 可按需自动调度 Cloud Whisper Studio 云端转录或创建格式转换任务。

---

## 本地开发与构建

```bash
npm install
npm run dev          # 前端开发服务 (http://127.0.0.1:3000)
npm run build:win    # 构建前端并打包 Windows 安装包 / 便携版
```

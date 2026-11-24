# Joel Desk Pro

**Joel Desk Pro** 是专注语音转录的极简桌面端工作台，内嵌 **Cloud Whisper Studio** 云端 GPU 转录引擎，支持一键拉起本地后端、连接 Colab / Kaggle T4 免费算力与导出字幕/文本。

> 注：下载器 **TDM Fast** 已释放为独立桌面应用使用，不再内嵌于 Joel Desk Pro。

---

## 核心功能

- **Cloud Whisper Studio 内嵌工作台**：自动拉起本地转录后端（默认 `127.0.0.1:8788`），支持 `faster-whisper` 多档位转录、音视频抽轨与异步轮询出稿（`srt` / `txt`），支持中英文界面切换。
- **独立浏览器打开与目录管理**：支持一键重启服务、刷新界面、更换项目目录或在系统浏览器中独立打开。
- **GitHub Releases 一键自更新**：自动检测 `joelting02-sys/JoelDeskPro` 最新版本，新版 `.exe` 安装包自动保存至系统 **Downloads（下载）** 目录并拉起安装。

---

## 本地开发与构建

```bash
npm install
npm run dev          # 前端开发服务 (http://127.0.0.1:3000)
npm run build:win    # 构建前端并打包 Windows 安装包 / 便携版
```

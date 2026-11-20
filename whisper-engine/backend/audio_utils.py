"""本地音频提取/瘦身与字幕导出工具（依赖本机 ffmpeg）。"""
from __future__ import annotations

import asyncio
import shutil
import subprocess
from pathlib import Path
from typing import Any


SUPPORTED_EXTENSIONS = {
    ".mp4", ".mkv", ".mov", ".webm", ".avi", ".flv", ".wmv", ".m4v",
    ".mp3", ".m4a", ".wav", ".flac", ".ogg", ".opus", ".aac", ".wma",
}


def find_ffmpeg() -> str:
    found = shutil.which("ffmpeg")
    if found:
        return found
    raise RuntimeError("未在本机找到 ffmpeg，请先安装 ffmpeg 并加入系统 PATH。")


def _run_ffmpeg_sync(src: Path, dst: Path) -> tuple[float, int, int]:
    ffmpeg = find_ffmpeg()
    orig_size = src.stat().st_size
    cmd = [
        ffmpeg,
        "-y",
        "-i", str(src),
        "-vn",                # 丢弃视频画面，只保留声音
        "-ac", "1",           # 单声道（语音识别最优）
        "-ar", "16000",       # 16kHz（Whisper 原生采样率）
        "-b:a", "64k",        # 64kbps MP3，体积小且人声清晰
        "-f", "mp3",
        str(dst),
    ]
    proc = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if proc.returncode != 0 or not dst.exists() or dst.stat().st_size == 0:
        err_tail = (proc.stderr or "")[-400:].strip()
        raise RuntimeError(f"提取音频失败（文件可能已损坏或不含音轨）：{err_tail}")

    slim_size = dst.stat().st_size
    duration = probe_duration_sync(dst)
    return duration, orig_size, slim_size


def probe_duration_sync(path: Path) -> float:
    ffprobe = shutil.which("ffprobe")
    if not ffprobe:
        return 0.0
    try:
        proc = subprocess.run(
            [
                ffprobe,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=15,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        return max(0.0, float(proc.stdout.strip()))
    except Exception:
        return 0.0


async def extract_slim_audio(src: Path, dst: Path) -> dict[str, Any]:
    """异步执行音频瘦身，返回时长及压缩前后字节数。"""
    duration, orig_size, slim_size = await asyncio.to_thread(_run_ffmpeg_sync, src, dst)
    ratio = round((1 - slim_size / orig_size) * 100, 1) if orig_size > 0 else 0.0
    return {
        "duration": round(duration, 2),
        "orig_size": orig_size,
        "slim_size": slim_size,
        "saved_percent": max(0.0, ratio),
    }


def format_srt_timestamp(seconds: float) -> str:
    ms_total = max(0, int(round(seconds * 1000)))
    hours = ms_total // 3_600_000
    minutes = (ms_total % 3_600_000) // 60_000
    secs = (ms_total % 60_000) // 1000
    ms = ms_total % 1000
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{ms:03d}"


def build_srt(segments: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for idx, seg in enumerate(segments, start=1):
        start = format_srt_timestamp(float(seg.get("start", 0.0)))
        end = format_srt_timestamp(float(seg.get("end", 0.0)))
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        lines.append(f"{idx}\n{start} --> {end}\n{text}\n")
    return "\n".join(lines).strip() + ("\n" if lines else "")


def build_txt(text: str, segments: list[dict[str, Any]]) -> str:
    clean = (text or "").strip()
    if clean:
        return clean + "\n"
    joined = "\n".join(str(s.get("text", "")).strip() for s in segments if str(s.get("text", "")).strip())
    return joined + ("\n" if joined else "")


def sanitize_filename_stem(filename: str) -> str:
    stem = Path(filename).stem.strip() or "transcript"
    bad = '<>:"/\\|?*'
    for ch in bad:
        stem = stem.replace(ch, "_")
    return stem[:80].strip(" .") or "transcript"

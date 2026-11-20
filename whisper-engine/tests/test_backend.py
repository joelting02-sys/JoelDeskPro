"""Cloud Whisper Studio 自动化测试（音频瘦身、云端脚本语法、SRT/TXT、API 路由）。"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.audio_utils import build_srt, build_txt, extract_slim_audio, find_ffmpeg
from backend.cloud_worker_template import build_cloud_worker_script
from backend.kaggle_driver import build_kaggle_notebook_json
from backend.main import app


def test_cloud_worker_script_syntax():
    for engine, bg in [("colab", True), ("kaggle", False)]:
        code = build_cloud_worker_script(
            engine=engine,
            model_name="large-v3-turbo",
            gateway_url="https://example.workers.dev",
            admin_token="adm-test",
            background=bg,
        )
        # 1. 外层启动脚本必须语法合法
        compile(code, f"<worker-{engine}>", "exec")

        # 2. 提取内嵌的 SERVER_CODE 也必须语法合法
        marker = 'SERVER_CODE = r"""'
        start = code.index(marker) + len(marker)
        end = code.index('"""\n\n\ndef stop_existing', start)
        server_code = code[start:end]
        compile(server_code, f"<server-{engine}>", "exec")


def test_srt_and_txt_formatting():
    segs = [
        {"start": 0.0, "end": 2.345, "text": "你好，这是测试。"},
        {"start": 2.5, "end": 65.12, "text": "Cloud Whisper Studio 运行正常。"},
    ]
    srt = build_srt(segs)
    assert "00:00:00,000 --> 00:00:02,345" in srt
    assert "00:01:05,120" in srt
    assert "你好，这是测试。" in srt

    txt = build_txt("", segs)
    assert "你好，这是测试。" in txt
    assert "Cloud Whisper Studio 运行正常。" in txt


def test_ffmpeg_extract_slim_audio():
    ffmpeg = find_ffmpeg()
    with tempfile.TemporaryDirectory() as td:
        wav_path = Path(td) / "sample.wav"
        mp3_path = Path(td) / "slim.mp3"
        # 生成 2 秒 44.1kHz 立体声 PCM WAV（体积较大）
        subprocess.run(
            [
                ffmpeg, "-y",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-ac", "2", "-ar", "44100",
                str(wav_path),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        import asyncio
        info = asyncio.run(extract_slim_audio(wav_path, mp3_path))
        assert mp3_path.exists()
        assert info["slim_size"] < info["orig_size"]
        assert info["saved_percent"] > 80.0
        assert info["duration"] >= 1.5


def test_kaggle_notebook_export():
    raw = build_kaggle_notebook_json("large-v3-turbo")
    nb = json.loads(raw)
    assert nb["nbformat"] == 4
    assert len(nb["cells"]) == 2
    code = "".join(nb["cells"][1]["source"])
    compile(code, "<kaggle-nb>", "exec")


def test_fastapi_routes():
    with TestClient(app) as client:
        r = client.get("/")
        assert r.status_code == 200
        assert "Cloud Whisper Studio" in r.text

        r_state = client.get("/api/state", headers={"Origin": "null"})
        assert r_state.status_code == 200
        assert r_state.headers.get("access-control-allow-origin") == "*"
        data = r_state.json()
        assert "compute" in data and "env" in data and "settings" in data
        # 确保没有任何明文密钥泄露给前端
        dumped = json.dumps(data)
        assert "admin_token" not in dumped
        assert "gateway_token" not in dumped

        r_nb = client.get("/api/kaggle/notebook")
        assert r_nb.status_code == 200
        assert "nbformat" in r_nb.text


def test_no_auto_shutdown_while_tasks_pending():
    import time
    from backend.config import load_settings, save_settings
    from backend.state import AppStateManager

    orig = load_settings()
    try:
        # 1. 手动模式（未打勾）：即使队列为空且过了 30 分钟，也绝不倒计时/不自动关机
        save_settings({"auto_shutdown_enabled": False, "auto_shutdown_minutes": 15})
        mgr = AppStateManager()
        mgr.compute["status"] = "online"
        mgr.compute["started_at"] = time.time() - 1800
        mgr.compute["last_activity_at"] = time.time() - 1800
        snap_manual = mgr.get_snapshot()
        assert snap_manual["settings"]["auto_shutdown_enabled"] is False
        assert snap_manual["compute"]["idle_remaining_seconds"] is None

        # 2. 勾选自动关机，但等待区还有排队文件：禁止倒计时
        save_settings({"auto_shutdown_enabled": True, "auto_shutdown_minutes": 15})
        mgr.tasks["t1"] = {"id": "t1", "status": "done"}
        mgr.tasks["t2"] = {"id": "t2", "status": "queued"}
        assert mgr.has_pending_tasks() is True
        snap_pending = mgr.get_snapshot()
        assert snap_pending["compute"]["pending_tasks_count"] == 1
        assert snap_pending["compute"]["idle_remaining_seconds"] is None

        # 3. 勾选自动关机，且队列彻底清空：才恢复闲置计时
        mgr.tasks["t2"]["status"] = "done"
        assert mgr.has_pending_tasks() is False
        snap_empty = mgr.get_snapshot()
        assert snap_empty["compute"]["pending_tasks_count"] == 0
        assert snap_empty["compute"]["idle_remaining_seconds"] is not None
    finally:
        save_settings(orig)


if __name__ == "__main__":
    test_cloud_worker_script_syntax()
    test_srt_and_txt_formatting()
    test_ffmpeg_extract_slim_audio()
    test_kaggle_notebook_export()
    test_fastapi_routes()
    test_no_auto_shutdown_while_tasks_pending()
    print("ALL TESTS PASSED")

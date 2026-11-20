"""Cloud Whisper Studio — FastAPI 本地桌面服务入口。"""
from __future__ import annotations

import json
import os
import subprocess
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .audio_utils import SUPPORTED_EXTENSIONS, sanitize_filename_stem
from .config import (
    FRONTEND_DIR,
    OUTPUTS_DIR,
    UPLOADS_DIR,
    ensure_dirs,
    load_settings,
    save_kaggle_credentials,
    save_settings,
)
from .kaggle_driver import build_kaggle_notebook_json, verify_kaggle_credentials
from .state import state_manager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    ensure_dirs()
    await state_manager.start_background_loops()
    try:
        yield
    finally:
        await state_manager.stop_background_loops()


app = FastAPI(title="Cloud Whisper Studio", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


class StartComputeRequest(BaseModel):
    provider: str | None = None
    gpu: str | None = None
    model: str | None = None


class SettingsPatchRequest(BaseModel):
    provider: str | None = None
    colab_gpu: str | None = None
    whisper_model: str | None = None
    language: str | None = None
    auto_shutdown_enabled: bool | None = None
    auto_shutdown_minutes: int | None = None
    kaggle_kernel_slug: str | None = None
    beam_size: int | None = None
    vad_filter: bool | None = None


class KaggleCredRequest(BaseModel):
    username: str
    key: str
    verify: bool = True


@app.get("/api/state")
async def get_state() -> dict[str, Any]:
    return state_manager.get_snapshot()


@app.post("/api/compute/refresh")
async def refresh_compute() -> dict[str, Any]:
    return await state_manager.sync_remote_state()


@app.post("/api/compute/start")
async def start_compute(req: StartComputeRequest) -> dict[str, Any]:
    return await state_manager.start_compute(
        provider=req.provider,
        gpu=req.gpu,
        model_name=req.model,
    )


@app.post("/api/compute/stop")
async def stop_compute() -> dict[str, Any]:
    return await state_manager.stop_compute(reason="用户在软件内点击关闭算力")


@app.post("/api/settings")
async def update_settings(req: SettingsPatchRequest) -> dict[str, Any]:
    patch = {k: v for k, v in req.model_dump().items() if v is not None}
    save_settings(patch)
    return state_manager.get_snapshot()


@app.post("/api/kaggle/credentials")
async def set_kaggle_credentials(req: KaggleCredRequest) -> dict[str, Any]:
    try:
        if req.verify:
            await verify_kaggle_credentials(req.username, req.key)
        save_kaggle_credentials(req.username, req.key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return state_manager.get_snapshot()


@app.post("/api/kaggle/upload-json")
async def upload_kaggle_json(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        raw = await file.read()
        data = json.loads(raw.decode("utf-8"))
        username = str(data.get("username", "")).strip()
        key = str(data.get("key", "")).strip()
        if not username or not key:
            raise ValueError("kaggle.json 缺少 username 或 key 字段")
        await verify_kaggle_credentials(username, key)
        save_kaggle_credentials(username, key)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"导入 kaggle.json 失败：{exc}")
    return state_manager.get_snapshot()


@app.get("/api/kaggle/notebook")
async def download_kaggle_notebook() -> Response:
    settings = load_settings()
    nb_json = build_kaggle_notebook_json(settings.get("whisper_model", "large-v3-turbo"))
    return Response(
        content=nb_json.encode("utf-8"),
        media_type="application/x-ipynb+json",
        headers={
            "Content-Disposition": 'attachment; filename="cloud_whisper_kaggle.ipynb"'
        },
    )


@app.post("/api/transcribe")
async def upload_and_transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
) -> dict[str, Any]:
    orig_name = file.filename or "audio.mp3"
    ext = Path(orig_name).suffix.lower()
    if ext and ext not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"暂不支持 {ext} 格式，请拖入常见视频或音频文件（如 MP4 / MKV / MP3 / M4A / WAV）。",
        )

    ensure_dirs()
    tmp_path = UPLOADS_DIR / f"raw_{uuid.uuid4().hex[:10]}{ext or '.bin'}"
    try:
        with tmp_path.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"保存上传文件失败：{exc}")

    task = await state_manager.enqueue_file(orig_name, tmp_path, language=language)
    return {"task": task, "state": state_manager.get_snapshot()}


@app.get("/api/history/{item_id}")
async def get_history_detail(item_id: str) -> dict[str, Any]:
    item = state_manager.get_history_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="未找到该转录记录")
    return item


@app.delete("/api/history/{item_id}")
async def delete_history(item_id: str) -> dict[str, Any]:
    ok = state_manager.delete_history_item(item_id)
    if not ok:
        raise HTTPException(status_code=404, detail="未找到该转录记录")
    return {"ok": True}


@app.get("/api/history/{item_id}/download/{fmt}")
async def download_transcript(item_id: str, fmt: str) -> Response:
    item = state_manager.get_history_item(item_id)
    if not item:
        raise HTTPException(status_code=404, detail="未找到该转录记录")
    stem = sanitize_filename_stem(item["filename"])
    if fmt == "txt":
        content = item.get("text", "")
        return PlainTextResponse(
            content=content,
            headers={
                "Content-Disposition": f'attachment; filename="{stem}.txt"'
            },
        )
    if fmt == "srt":
        content = item.get("srt", "")
        return PlainTextResponse(
            content=content,
            headers={
                "Content-Disposition": f'attachment; filename="{stem}.srt"'
            },
        )
    raise HTTPException(status_code=400, detail="仅支持 txt 或 srt 格式")


@app.post("/api/open-outputs")
async def open_outputs_folder() -> dict[str, Any]:
    ensure_dirs()
    try:
        if os.name == "nt":
            os.startfile(str(OUTPUTS_DIR))
        else:
            subprocess.Popen(["xdg-open", str(OUTPUTS_DIR)])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True, "path": str(OUTPUTS_DIR)}


# 挂载前端静态资源
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
async def serve_index() -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "index.html"))

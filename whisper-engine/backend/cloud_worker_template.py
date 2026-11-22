"""生成部署在 Colab / Kaggle GPU 容器内的云端 Whisper 听写服务脚本。"""
from __future__ import annotations

import json


def build_cloud_worker_script(
    *,
    engine: str,
    model_name: str,
    gateway_url: str,
    admin_token: str,
    background: bool = True,
    max_idle_seconds: int = 3600,
) -> str:
    """生成一段自包含的 Python 启动脚本。

    - background=True  用于 Colab（execute_code 启动后台守护进程并注册网关后返回）
    - background=False 用于 Kaggle（前台阻塞运行，收到 /shutdown 或闲置超时后退出释放 GPU）
    """
    cfg = {
        "engine": engine,
        "model_name": model_name,
        "gateway_url": gateway_url.rstrip("/"),
        "admin_token": admin_token,
        "background": background,
        "max_idle_seconds": max_idle_seconds,
        "port": 8765,
    }
    cfg_json = json.dumps(cfg, ensure_ascii=False)

    return f'''# Cloud Whisper Studio — Cloud GPU Worker ({engine})
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

CFG = json.loads({cfg_json!r})
SERVER_FILE = "/tmp/cw_whisper_server.py"
SERVER_LOG = "/tmp/cw_whisper_server.log"
TUNNEL_LOG = "/tmp/cw_cloudflared.log"
CLOUDFLARED_BIN = "/tmp/cloudflared"


def run_cmd(cmd, check=True):
    return subprocess.run(cmd, check=check, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)


def find_cuda_lib_dirs():
    import glob
    import site
    dirs = []
    candidates = [
        "/usr/local/cuda/lib64",
        "/usr/local/cuda-12/lib64",
        "/usr/local/cuda-12.*/lib64",
        "/usr/lib/x86_64-linux-gnu",
    ]
    for sp in list(site.getsitepackages()) + [site.getusersitepackages()]:
        if sp:
            candidates.append(os.path.join(sp, "nvidia", "*", "lib"))
            candidates.append(os.path.join(sp, "torch", "lib"))
    for pat in candidates:
        for d in glob.glob(pat):
            if os.path.isdir(d) and d not in dirs:
                dirs.append(d)
    return dirs


def has_libcublas12(dirs):
    for d in dirs:
        if os.path.exists(os.path.join(d, "libcublas.so.12")):
            return True
    return False


def ensure_deps():
    need = []
    for mod, pkg in [
        ("faster_whisper", "faster-whisper"),
        ("fastapi", "fastapi"),
        ("uvicorn", "uvicorn"),
        ("multipart", "python-multipart"),
    ]:
        try:
            __import__(mod)
        except Exception:
            need.append(pkg)
    if need:
        print("[cw] Installing packages:", need, flush=True)
        run_cmd([sys.executable, "-m", "pip", "install", "-q", *need])

    if not has_libcublas12(find_cuda_lib_dirs()):
        print("[cw] Installing nvidia-cublas-cu12 & nvidia-cudnn-cu12...", flush=True)
        run_cmd([sys.executable, "-m", "pip", "install", "-q", "nvidia-cublas-cu12", "nvidia-cudnn-cu12"], check=False)

    if not os.path.exists(CLOUDFLARED_BIN) and not shutil.which("cloudflared"):
        print("[cw] Downloading cloudflared...", flush=True)
        url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64"
        req = urllib.request.Request(url, headers={{"User-Agent": "CloudWhisperStudio/1.0"}})
        with urllib.request.urlopen(req, timeout=60) as r, open(CLOUDFLARED_BIN, "wb") as out:
            shutil.copyfileobj(r, out)
        os.chmod(CLOUDFLARED_BIN, 0o755)


SERVER_CODE = r"""
import json
import os
import shutil
import subprocess
import tempfile
import threading
import time
import urllib.request
import uuid
import numpy as np
from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
import uvicorn

CFG = json.loads(os.environ["CW_CFG_JSON"])
LAST_ACTIVE = time.time()
STARTED_AT = time.time()
IN_FLIGHT = 0
JOBS = {{}}
JOBS_LOCK = threading.Lock()
MODEL = None
GPU_NAME = "CPU"
DEVICE = "cpu"
COMPUTE_TYPE = "int8"

def detect_gpu():
    global GPU_NAME, DEVICE, COMPUTE_TYPE
    try:
        import torch
        if torch.cuda.is_available():
            GPU_NAME = torch.cuda.get_device_name(0)
            DEVICE = "cuda"
            COMPUTE_TYPE = "float16"
            return
    except Exception:
        pass
    try:
        import ctranslate2
        if ctranslate2.get_cuda_device_count() > 0:
            GPU_NAME = "NVIDIA CUDA GPU"
            DEVICE = "cuda"
            COMPUTE_TYPE = "float16"
            return
    except Exception:
        pass

def load_whisper_model():
    global MODEL
    detect_gpu()
    from faster_whisper import WhisperModel
    try:
        MODEL = WhisperModel(CFG["model_name"], device=DEVICE, compute_type=COMPUTE_TYPE)
    except Exception:
        # Fallback to int8 on GPU or CPU if float16 fails
        fallback_ct = "int8_float16" if DEVICE == "cuda" else "int8"
        MODEL = WhisperModel(CFG["model_name"], device=DEVICE, compute_type=fallback_ct)

def clear_gateway():
    try:
        req = urllib.request.Request(
            CFG["gateway_url"] + "/_gateway/clear",
            data=b"{{}}",
            headers={{
                "Content-Type": "application/json",
                "X-Admin-Token": CFG["admin_token"],
                "User-Agent": "CloudWhisperStudio/1.0",
            }},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=8)
    except Exception:
        pass

def idle_watchdog():
    raw_idle = CFG.get("max_idle_seconds")
    # 0 表示手动模式，绝不在云端自动退出（旧写法 `or 3600` 会把 0 误当成 1 小时）
    max_idle = 3600 if raw_idle is None else int(raw_idle)
    if max_idle <= 0:
        return
    while True:
        time.sleep(30)
        if IN_FLIGHT > 0:
            continue
        if time.time() - LAST_ACTIVE > max_idle:
            clear_gateway()
            os._exit(0)

load_whisper_model()
threading.Thread(target=idle_watchdog, daemon=True).start()

app = FastAPI(title="Cloud Whisper Worker")

@app.get("/health")
def health():
    return {{
        "status": "ok",
        "service": "cloud-whisper-studio",
        "engine": CFG["engine"],
        "model": CFG["model_name"],
        "gpu": GPU_NAME,
        "device": DEVICE,
        "uptime_seconds": int(time.time() - STARTED_AT),
    }}

def decode_audio_16k(path: str):
    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-nostdin", "-threads", "0",
            "-i", path,
            "-f", "s16le", "-ac", "1", "-acodec", "pcm_s16le", "-ar", "16000",
            "-",
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        if proc.returncode == 0 and proc.stdout:
            return np.frombuffer(proc.stdout, np.int16).astype(np.float32) / 32768.0
    return path


def _prune_jobs():
    now = time.time()
    with JOBS_LOCK:
        stale = [
            jid for jid, job in JOBS.items()
            if job.get("finished_at") and now - float(job["finished_at"]) > 1800
        ]
        for jid in stale:
            JOBS.pop(jid, None)
        if len(JOBS) > 50:
            finished_items = [
                (jid, float(job.get("finished_at") or job.get("created_at") or 0.0))
                for jid, job in JOBS.items()
                if job.get("status") in ("done", "error")
            ]
            finished_items.sort(key=lambda item: item[1])
            while len(JOBS) > 50 and finished_items:
                old_jid, _ = finished_items.pop(0)
                JOBS.pop(old_jid, None)


def _run_whisper_job(tmp_path: str, lang_arg, beam_size: int, vad_bool: bool, t0: float, job_id=None):
    global LAST_ACTIVE
    audio_input = decode_audio_16k(tmp_path)
    segs_iter, info = MODEL.transcribe(
        audio_input,
        language=lang_arg,
        beam_size=max(1, min(10, int(beam_size))),
        vad_filter=vad_bool,
    )
    total_dur = round(float(getattr(info, "duration", 0.0)), 2)
    if job_id:
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if job is not None:
                job["duration"] = total_dur
    segments = []
    texts = []
    for s in segs_iter:
        LAST_ACTIVE = time.time()
        txt = (s.text or "").strip()
        if txt:
            segments.append({{
                "start": round(float(s.start), 2),
                "end": round(float(s.end), 2),
                "text": txt,
            }})
            texts.append(txt)
        if job_id:
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if job is not None:
                    job["processed_seconds"] = round(float(s.end), 2)
                    job["duration"] = total_dur
                    job["segments_done"] = len(segments)
    return {{
        "text": "\\n".join(texts),
        "segments": segments,
        "language": getattr(info, "language", lang_arg or "unknown"),
        "language_probability": round(float(getattr(info, "language_probability", 0.0)), 3),
        "duration": total_dur,
        "elapsed": round(time.time() - t0, 2),
        "engine": CFG["engine"],
        "gpu": GPU_NAME,
        "model": CFG["model_name"],
    }}


@app.post("/transcribe/submit")
async def transcribe_submit(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    beam_size: int = Form(5),
    vad_filter: str = Form("true"),
):
    global LAST_ACTIVE
    LAST_ACTIVE = time.time()
    suffix = os.path.splitext(file.filename or "audio.mp3")[1] or ".mp3"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    try:
        content = await file.read()
        with open(tmp_path, "wb") as fp:
            fp.write(content)
    except Exception as exc:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(exc))

    lang_arg = None if (not language or language == "auto") else language
    vad_bool = str(vad_filter).lower() not in ("false", "0", "no")
    beam_int = int(beam_size)
    job_id = uuid.uuid4().hex[:12]
    now = time.time()
    with JOBS_LOCK:
        JOBS[job_id] = {{
            "job_id": job_id,
            "status": "queued",
            "created_at": now,
            "started_at": None,
            "finished_at": None,
            "processed_seconds": 0.0,
            "duration": 0.0,
            "segments_done": 0,
            "result": None,
            "error": None,
        }}

    def _worker():
        global LAST_ACTIVE, IN_FLIGHT
        t_start = time.time()
        IN_FLIGHT += 1
        LAST_ACTIVE = t_start
        with JOBS_LOCK:
            job = JOBS.get(job_id)
            if job is not None:
                job["status"] = "running"
                job["started_at"] = t_start
        try:
            res = _run_whisper_job(tmp_path, lang_arg, beam_int, vad_bool, t_start, job_id=job_id)
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if job is not None:
                    job["result"] = res
                    job["status"] = "done"
        except Exception as exc:
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if job is not None:
                    job["error"] = str(exc)
                    job["status"] = "error"
        finally:
            IN_FLIGHT = max(0, IN_FLIGHT - 1)
            t_end = time.time()
            LAST_ACTIVE = t_end
            with JOBS_LOCK:
                job = JOBS.get(job_id)
                if job is not None:
                    job["finished_at"] = t_end
            try:
                os.remove(tmp_path)
            except Exception:
                pass
            _prune_jobs()

    threading.Thread(target=_worker, daemon=True).start()
    return JSONResponse({{"job_id": job_id, "status": "queued"}})


@app.get("/transcribe/status/{{job_id}}")
def transcribe_status(job_id: str):
    with JOBS_LOCK:
        job = JOBS.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        status = job["status"]
        started_at = job.get("started_at")
        finished_at = job.get("finished_at")
        res = job.get("result")
        elapsed = 0.0
        if status == "done" and isinstance(res, dict) and "elapsed" in res:
            elapsed = res["elapsed"]
        elif started_at is not None:
            elapsed = round(max(0.0, (finished_at or time.time()) - float(started_at)), 2)
        payload = {{
            "job_id": job_id,
            "status": status,
            "processed_seconds": job.get("processed_seconds", 0.0),
            "duration": job.get("duration", 0.0),
            "segments_done": job.get("segments_done", 0),
            "elapsed": elapsed,
        }}
        if status == "done":
            payload["result"] = res
        elif status == "error":
            payload["error"] = job.get("error") or "Unknown error"
    return JSONResponse(payload)


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    beam_size: int = Form(5),
    vad_filter: str = Form("true"),
):
    global LAST_ACTIVE, IN_FLIGHT
    IN_FLIGHT += 1
    LAST_ACTIVE = time.time()
    suffix = os.path.splitext(file.filename or "audio.mp3")[1] or ".mp3"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)
    t0 = time.time()
    try:
        content = await file.read()
        with open(tmp_path, "wb") as fp:
            fp.write(content)

        lang_arg = None if (not language or language == "auto") else language
        vad_bool = str(vad_filter).lower() not in ("false", "0", "no")
        # 放到线程池执行：转录期间 /health 仍能即时响应，本地不会误判「算力离线」
        payload = await run_in_threadpool(
            _run_whisper_job, tmp_path, lang_arg, int(beam_size), vad_bool, t0, None
        )
        LAST_ACTIVE = time.time()
        return JSONResponse(payload)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        IN_FLIGHT = max(0, IN_FLIGHT - 1)
        LAST_ACTIVE = time.time()
        try:
            os.remove(tmp_path)
        except Exception:
            pass

@app.post("/shutdown")
def shutdown(x_admin_token: str = Header(default="")):
    if x_admin_token != CFG["admin_token"]:
        raise HTTPException(status_code=401, detail="Invalid admin token")
    def _bye():
        time.sleep(0.4)
        clear_gateway()
        os._exit(0)
    threading.Thread(target=_bye, daemon=True).start()
    return {{"ok": True, "message": "shutting down"}}

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(CFG["port"]), log_level="warning")
"""


def stop_existing():
    for pattern in ("cw_whisper_server.py", "cloudflared"):
        try:
            subprocess.run(["pkill", "-f", pattern], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            pass
    time.sleep(0.5)


def register_gateway(tunnel_url: str):
    payload = json.dumps({{
        "backend_url": tunnel_url,
        "model": f"whisper-{{CFG['model_name']}} ({{CFG['engine']}})",
    }}).encode("utf-8")
    req = urllib.request.Request(
        CFG["gateway_url"] + "/_gateway/update",
        data=payload,
        headers={{
            "Content-Type": "application/json",
            "X-Admin-Token": CFG["admin_token"],
            "User-Agent": "CloudWhisperStudio/1.0",
        }},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_local_health(srv_proc, timeout=240):
    deadline = time.time() + timeout
    url = f"http://127.0.0.1:{{CFG['port']}}/health"
    while time.time() < deadline:
        if srv_proc.poll() is not None:
            log_tail = ""
            if os.path.exists(SERVER_LOG):
                log_tail = open(SERVER_LOG, "r", encoding="utf-8", errors="replace").read()[-1200:]
            raise RuntimeError(f"Whisper server exited early (code={{srv_proc.returncode}}). Log:\\n{{log_tail}}")
        try:
            with urllib.request.urlopen(url, timeout=3) as resp:
                if resp.status == 200:
                    return json.loads(resp.read().decode("utf-8"))
        except Exception:
            pass
        time.sleep(1.5)
    log_tail = ""
    if os.path.exists(SERVER_LOG):
        log_tail = open(SERVER_LOG, "r", encoding="utf-8", errors="replace").read()[-1200:]
    raise RuntimeError(f"Whisper server failed to become healthy within {{timeout}}s. Log:\\n{{log_tail}}")


def start_tunnel(timeout=45):
    cf_bin = CLOUDFLARED_BIN if os.path.exists(CLOUDFLARED_BIN) else shutil.which("cloudflared")
    log_fp = open(TUNNEL_LOG, "w", encoding="utf-8")
    proc = subprocess.Popen(
        [cf_bin, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{{CFG['port']}}"],
        stdout=log_fp,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.time() + timeout
    pattern = re.compile(r"https://[a-zA-Z0-9-]+\\.trycloudflare\\.com")
    while time.time() < deadline:
        if os.path.exists(TUNNEL_LOG):
            txt = open(TUNNEL_LOG, "r", encoding="utf-8", errors="replace").read()
            m = pattern.search(txt)
            if m:
                return m.group(0), proc
        time.sleep(0.8)
    raise RuntimeError("cloudflared tunnel URL not found in log")


def main():
    ensure_deps()
    stop_existing()
    with open(SERVER_FILE, "w", encoding="utf-8") as fp:
        fp.write(SERVER_CODE)

    env = os.environ.copy()
    env["CW_CFG_JSON"] = json.dumps(CFG, ensure_ascii=False)
    cuda_dirs = find_cuda_lib_dirs()
    if cuda_dirs:
        old_ld = env.get("LD_LIBRARY_PATH", "")
        env["LD_LIBRARY_PATH"] = ":".join(cuda_dirs + ([old_ld] if old_ld else []))
    srv_fp = open(SERVER_LOG, "w", encoding="utf-8")
    srv_proc = subprocess.Popen(
        [sys.executable, SERVER_FILE],
        env=env,
        stdout=srv_fp,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

    health_info = wait_local_health(srv_proc, timeout=240)
    tunnel_url, cf_proc = start_tunnel(timeout=45)
    # 等待 trycloudflare.com 公网 DNS 生效后再注册网关，避免 Worker 负缓存 502
    pub_deadline = time.time() + 30
    while time.time() < pub_deadline:
        try:
            req = urllib.request.Request(
                tunnel_url + "/health",
                headers={{"User-Agent": "CloudWhisperStudio/1.0"}},
            )
            with urllib.request.urlopen(req, timeout=4) as r:
                if r.status == 200:
                    break
        except Exception:
            time.sleep(1.5)
    register_gateway(tunnel_url)

    summary = {{
        "ok": True,
        "engine": CFG["engine"],
        "tunnel_url": tunnel_url,
        "gpu": health_info.get("gpu", "unknown"),
        "model": health_info.get("model", CFG["model_name"]),
    }}
    print("CW_READY:" + json.dumps(summary, ensure_ascii=False), flush=True)

    if not CFG["background"]:
        # Kaggle 前台保活：等待服务收到 /shutdown 或超时退出，随即结束 Kernel 释放 GPU
        srv_proc.wait()
        try:
            cf_proc.terminate()
        except Exception:
            pass


if __name__ == "__main__":
    main()
'''

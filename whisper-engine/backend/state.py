"""全局算力状态机、转录任务队列、历史记录与闲置自动关机看门狗。"""
from __future__ import annotations

import asyncio
import json
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from .audio_utils import build_srt, build_txt, extract_slim_audio, sanitize_filename_stem
from .colab_driver import list_active_runtimes, start_colab_worker, stop_colab_runtimes
from .config import (
    HISTORY_FILE,
    OUTPUTS_DIR,
    UPLOADS_DIR,
    ensure_dirs,
    get_public_env_status,
    load_settings,
)
from .gateway_client import (
    check_worker_health,
    clear_gateway_route,
    send_remote_shutdown,
    transcribe_via_gateway,
)
from .kaggle_driver import get_kaggle_kernel_status, start_kaggle_worker


def _now_str() -> str:
    return datetime.now().strftime("%H:%M:%S")


class AppStateManager:
    def __init__(self) -> None:
        ensure_dirs()
        self.compute: dict[str, Any] = {
            "status": "offline",     # offline | starting | online | stopping | error
            "provider": load_settings().get("provider", "colab"),
            "gpu": "",
            "model": load_settings().get("whisper_model", "large-v3-turbo"),
            "message": "算力未启动，不消耗任何额度",
            "started_at": None,
            "last_activity_at": None,
            "runtime_name": None,
            "kaggle_ref": None,
            "kaggle_url": None,
            "orphan_colab_count": 0,
            "logs": [],
        }
        self.tasks: dict[str, dict[str, Any]] = {}
        self.task_order: list[str] = []
        self.history: list[dict[str, Any]] = self._load_history()

        self._compute_lock = asyncio.Lock()
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._bg_tasks: list[asyncio.Task[Any]] = []
        self._health_fail_count = 0
        self._startup_task: asyncio.Task[Any] | None = None

    # ---------- 历史记录持久化 ----------
    def _load_history(self) -> list[dict[str, Any]]:
        if not HISTORY_FILE.exists():
            return []
        try:
            data = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except Exception:
            return []

    def _save_history(self) -> None:
        ensure_dirs()
        HISTORY_FILE.write_text(
            json.dumps(self.history[:200], ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _log(self, msg: str) -> None:
        self.compute["message"] = msg
        logs = self.compute["logs"]
        logs.append(f"[{_now_str()}] {msg}")
        if len(logs) > 40:
            del logs[:-40]

    # ---------- 生命周期 ----------
    async def start_background_loops(self) -> None:
        # 后台异步探测云端状态，确保软件窗口 1 秒内秒开
        self._bg_tasks.append(asyncio.create_task(self.sync_remote_state()))
        self._bg_tasks.append(asyncio.create_task(self._health_and_idle_loop()))
        self._bg_tasks.append(asyncio.create_task(self._transcription_worker_loop()))

    async def stop_background_loops(self) -> None:
        for t in self._bg_tasks:
            t.cancel()
        self._bg_tasks.clear()

    async def sync_remote_state(self) -> dict[str, Any]:
        """启动软件或手动刷新时探测云端是否已有在线算力（断电续连）。"""
        health = await check_worker_health(timeout=6.0)
        if health:
            self.compute["status"] = "online"
            self.compute["provider"] = health.get("engine") or self.compute["provider"]
            self.compute["gpu"] = health.get("gpu") or "GPU"
            self.compute["model"] = health.get("model") or self.compute["model"]
            uptime = int(health.get("uptime_seconds") or 0)
            if not self.compute["started_at"]:
                self.compute["started_at"] = time.time() - uptime
            if not self.compute["last_activity_at"]:
                self.compute["last_activity_at"] = time.time()
            self.compute["message"] = f"绿灯就绪：{self.compute['gpu']} 正在待命，随时可拖入文件"
        else:
            if self.compute["status"] == "online":
                self.compute["status"] = "offline"
                self.compute["started_at"] = None
                self.compute["message"] = "云端算力已断开"

        # 检查是否有残留的 Colab 实例避免偷偷扣费
        try:
            rts = await list_active_runtimes()
            self.compute["orphan_colab_count"] = len(rts)
            if rts and not self.compute["runtime_name"]:
                self.compute["runtime_name"] = rts[0].get("name")
        except Exception:
            pass
        return self.get_snapshot()

    def pending_task_count(self) -> int:
        active_statuses = ("queued", "extracting", "waiting_gpu", "uploading", "transcribing")
        count = sum(1 for t in self.tasks.values() if t.get("status") in active_statuses)
        return max(count, self._queue.qsize())

    def has_pending_tasks(self) -> bool:
        return self.pending_task_count() > 0

    async def _health_and_idle_loop(self) -> None:
        while True:
            try:
                await asyncio.sleep(12)
                if self.compute["status"] == "online":
                    busy = self.has_pending_tasks()
                    health = await check_worker_health(timeout=15.0 if busy else 8.0)
                    if not health:
                        if busy:
                            # 正在上传/转录时云端可能短暂无法响应 /health，绝不据此判离线
                            self.compute["last_activity_at"] = time.time()
                            continue
                        self._health_fail_count += 1
                        if self._health_fail_count < 3:
                            # 偶发网络抖动：连续 3 次（约 36 秒）探测失败才判定离线
                            continue
                        self._health_fail_count = 0
                        self._log("检测到云端算力已离线，状态切换为已关机")
                        self.compute["status"] = "offline"
                        self.compute["started_at"] = None
                        continue
                    self._health_fail_count = 0

                    # 只要队列中还有任何等待或正在处理的文件，就持续刷新活跃时间，绝不自动关机
                    if self.has_pending_tasks():
                        self.compute["last_activity_at"] = time.time()
                        continue

                    # 仅当用户勾选了「闲置自动关机」且队列彻底清空后，才按闲置时间自动关机
                    settings = load_settings()
                    auto_enabled = bool(settings.get("auto_shutdown_enabled", False))
                    idle_limit_min = int(settings.get("auto_shutdown_minutes") or 0)
                    if auto_enabled and idle_limit_min > 0 and self.compute["last_activity_at"]:
                        idle_sec = time.time() - float(self.compute["last_activity_at"])
                        if idle_sec >= idle_limit_min * 60:
                            await self.stop_compute(reason=f"所有队列任务已清空且闲置满 {idle_limit_min} 分钟，自动关闭算力以节省额度")
            except asyncio.CancelledError:
                break
            except Exception:
                pass

    # ---------- 算力启停 ----------
    async def start_compute(
        self,
        provider: str | None = None,
        gpu: str | None = None,
        model_name: str | None = None,
    ) -> dict[str, Any]:
        settings = load_settings()
        use_provider = (provider or settings.get("provider") or "colab").lower()
        use_gpu = (gpu or settings.get("colab_gpu") or "T4").upper()
        use_model = model_name or settings.get("whisper_model") or "large-v3-turbo"

        async with self._compute_lock:
            if self.compute["status"] == "online":
                return self.get_snapshot()
            if self.compute["status"] == "starting":
                return self.get_snapshot()

            self.compute["status"] = "starting"
            self.compute["provider"] = use_provider
            self.compute["gpu"] = use_gpu if use_provider == "colab" else "GPU T4 x2"
            self.compute["model"] = use_model
            self.compute["logs"] = []
            self._log(f"正在启动 {use_provider.upper()} 云端算力（模型：{use_model}）...")

        self._startup_task = asyncio.create_task(
            self._run_startup_flow(use_provider, use_gpu, use_model)
        )
        return self.get_snapshot()

    async def _run_startup_flow(self, provider: str, gpu: str, model_name: str) -> None:
        try:
            # 先清理旧路由，避免误判旧绿灯
            await clear_gateway_route()

            settings = load_settings()
            auto_enabled = bool(settings.get("auto_shutdown_enabled", False))
            idle_min = int(settings.get("auto_shutdown_minutes") or 15)
            # 手动模式下给云端传 0（禁用云端自动退出）；开启自动关机时给云端留充足兜底
            cloud_max_idle = max(3600, idle_min * 60 + 600) if auto_enabled else 0

            if provider == "colab":
                res = await start_colab_worker(gpu, model_name, self._log, max_idle_seconds=cloud_max_idle)
                self.compute["runtime_name"] = res.get("runtime_name")
                self.compute["gpu"] = res.get("gpu") or gpu
                self._log("云端部署完成，正在验证绿灯信号...")
                wait_seconds = 120
            elif provider == "kaggle":
                res = await start_kaggle_worker(
                    model_name=model_name,
                    kernel_slug=settings.get("kaggle_kernel_slug", "cloud-whisper-studio-worker"),
                    progress_cb=self._log,
                    max_idle_seconds=cloud_max_idle,
                )
                self.compute["kaggle_ref"] = res.get("kernel_ref")
                self.compute["kaggle_url"] = res.get("url")
                wait_seconds = 360
            else:
                raise RuntimeError(f"不支持的算力平台：{provider}")

            # 轮询固定网关 /health 等待亮绿灯
            deadline = time.time() + wait_seconds
            last_kaggle_check = 0.0
            while time.time() < deadline:
                if self.compute["status"] != "starting":
                    return
                health = await check_worker_health(timeout=6.0)
                if health:
                    self.compute["status"] = "online"
                    self.compute["provider"] = health.get("engine") or provider
                    self.compute["gpu"] = health.get("gpu") or self.compute["gpu"]
                    self.compute["model"] = health.get("model") or model_name
                    now = time.time()
                    self.compute["started_at"] = now
                    self.compute["last_activity_at"] = now
                    self._log(f"🟢 绿灯就绪！{self.compute['gpu']} 已连接，可以开始拖入文件")
                    return

                if provider == "kaggle" and time.time() - last_kaggle_check > 15:
                    last_kaggle_check = time.time()
                    ks = await get_kaggle_kernel_status(self.compute.get("kaggle_ref") or "")
                    kstatus = str(ks.get("status", "")).lower()
                    if kstatus == "error":
                        msg = ks.get("failureMessage") or "Kaggle 脚本执行报错，请检查 Kaggle 页面日志"
                        raise RuntimeError(msg)
                    if kstatus:
                        self._log(f"Kaggle 正在准备中（当前状态：{kstatus}），请稍候...")

                await asyncio.sleep(3)

            raise RuntimeError("等待云端绿灯超时，请检查网络或重试启动。")
        except asyncio.CancelledError:
            return
        except Exception as exc:
            self.compute["status"] = "error"
            self._log(f"启动失败：{exc}")

    async def stop_compute(self, reason: str = "用户手动关闭算力") -> dict[str, Any]:
        async with self._compute_lock:
            if self._startup_task and not self._startup_task.done():
                self._startup_task.cancel()

            self.compute["status"] = "stopping"
            self._log(f"正在关闭云端算力（{reason}）...")

            # 1. 通知云端服务下班（Kaggle 收到后会立刻结束进程释放 GPU）
            await send_remote_shutdown()
            # 2. 清空固定 Cloudflare 网关路由
            await clear_gateway_route()
            # 3. 如果有 Colab 运行时，彻底销毁实例
            deleted = await stop_colab_runtimes(self.compute.get("runtime_name"))
            if not deleted:
                # 兜底检查是否还有其他残留 Colab 实例
                deleted = await stop_colab_runtimes(None)

            self.compute["status"] = "offline"
            self.compute["started_at"] = None
            self.compute["last_activity_at"] = None
            self.compute["runtime_name"] = None
            self.compute["orphan_colab_count"] = 0
            extra = f"（已销毁 {len(deleted)} 个 Colab 实例）" if deleted else ""
            self._log(f"⚪ 算力已安全关闭{extra}，当前不消耗任何额度")
            return self.get_snapshot()

    # ---------- 任务队列与转录 ----------
    async def enqueue_file(
        self,
        original_name: str,
        saved_path: Path,
        language: str | None = None,
    ) -> dict[str, Any]:
        settings = load_settings()
        task_id = uuid.uuid4().hex[:10]
        task: dict[str, Any] = {
            "id": task_id,
            "filename": original_name,
            "source_path": str(saved_path),
            "slim_path": "",
            "language_req": language or settings.get("language", "auto"),
            "status": "queued",       # queued | extracting | waiting_gpu | uploading | transcribing | done | error
            "stage_label": "已加入队列",
            "orig_size": saved_path.stat().st_size if saved_path.exists() else 0,
            "slim_size": 0,
            "saved_percent": 0.0,
            "duration": 0.0,
            "elapsed": 0.0,
            "error": "",
            "created_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "result": None,
        }
        self.tasks[task_id] = task
        self.task_order.insert(0, task_id)
        if self.compute["status"] == "online":
            self.compute["last_activity_at"] = time.time()
        await self._queue.put(task_id)
        return self._public_task(task)

    def _public_task(self, t: dict[str, Any]) -> dict[str, Any]:
        return {
            k: v for k, v in t.items()
            if k not in ("source_path", "slim_path")
        }

    async def _transcription_worker_loop(self) -> None:
        while True:
            try:
                task_id = await self._queue.get()
                task = self.tasks.get(task_id)
                if not task:
                    continue
                await self._process_single_task(task)
            except asyncio.CancelledError:
                break
            except Exception:
                pass

    async def _process_single_task(self, task: dict[str, Any]) -> None:
        src = Path(task["source_path"])
        slim = UPLOADS_DIR / f"{task['id']}_slim.mp3"
        try:
            # 1. 本地抽音频瘦身
            task["status"] = "extracting"
            task["stage_label"] = "正在本地提取纯音频（瘦身提速）..."
            info = await extract_slim_audio(src, slim)
            task["slim_path"] = str(slim)
            task["orig_size"] = info["orig_size"]
            task["slim_size"] = info["slim_size"]
            task["saved_percent"] = info["saved_percent"]
            task["duration"] = info["duration"]

            # 2. 等待云端亮绿灯
            if self.compute["status"] != "online":
                task["status"] = "waiting_gpu"
                task["stage_label"] = "瘦身完成！等待点击「启动算力」亮绿灯后自动转录"
                while self.compute["status"] != "online":
                    if task.get("cancelled"):
                        task["status"] = "error"
                        task["error"] = "任务已取消"
                        return
                    await asyncio.sleep(1.5)

            # 3. 上传并调用云端 Whisper
            self.compute["last_activity_at"] = time.time()
            task["status"] = "uploading"
            task["stage_label"] = "正在上传音频到云端显卡..."
            settings = load_settings()

            def _fmt_sec(sec: float) -> str:
                total = max(0, int(round(sec)))
                return f"{total // 60:02d}:{total % 60:02d}"

            def _on_progress(processed_sec: float, total_dur: float, segs_done: int) -> None:
                task["status"] = "transcribing"
                self.compute["last_activity_at"] = time.time()
                dur = total_dur if total_dur > 0 else float(task.get("duration") or 0.0)
                if dur > 0:
                    pct = min(99, max(0, int(round(processed_sec * 100.0 / dur))))
                    task["stage_label"] = (
                        f"云端 GPU 听写中... {pct}%（{_fmt_sec(processed_sec)} / {_fmt_sec(dur)}，已出 {segs_done} 句）"
                    )
                else:
                    task["stage_label"] = f"云端 GPU 听写中...（已出 {segs_done} 句）"

            res = await transcribe_via_gateway(
                audio_path=slim,
                language=task["language_req"],
                beam_size=int(settings.get("beam_size", 5)),
                vad_filter=bool(settings.get("vad_filter", True)),
                progress_cb=_on_progress,
            )
            self.compute["last_activity_at"] = time.time()

            # 4. 生成并落地 .txt / .srt
            segments = res.get("segments", [])
            full_text = build_txt(res.get("text", ""), segments)
            srt_text = build_srt(segments)

            stem = sanitize_filename_stem(task["filename"])
            ts_tag = datetime.now().strftime("%Y%m%d_%H%M%S")
            txt_file = OUTPUTS_DIR / f"{stem}_{ts_tag}.txt"
            srt_file = OUTPUTS_DIR / f"{stem}_{ts_tag}.srt"
            txt_file.write_text(full_text, encoding="utf-8")
            srt_file.write_text(srt_text, encoding="utf-8")

            record = {
                "id": task["id"],
                "filename": task["filename"],
                "created_at": task["created_at"],
                "language": res.get("language", "unknown"),
                "duration": res.get("duration") or task["duration"],
                "elapsed": res.get("elapsed", 0.0),
                "engine": res.get("engine", self.compute["provider"]),
                "gpu": res.get("gpu", self.compute["gpu"]),
                "model": res.get("model", self.compute["model"]),
                "orig_size": task["orig_size"],
                "slim_size": task["slim_size"],
                "saved_percent": task["saved_percent"],
                "text": full_text.strip(),
                "srt": srt_text,
                "segments": segments,
                "txt_filename": txt_file.name,
                "srt_filename": srt_file.name,
            }

            task["status"] = "done"
            task["stage_label"] = f"转录完成（耗时 {record['elapsed']} 秒）"
            task["elapsed"] = record["elapsed"]
            task["result"] = record

            self.history.insert(0, record)
            self._save_history()
        except Exception as exc:
            task["status"] = "error"
            task["stage_label"] = "转录失败"
            task["error"] = str(exc)
        finally:
            if self.compute["status"] == "online":
                self.compute["last_activity_at"] = time.time()
            for p in (src, slim):
                try:
                    if p.exists():
                        p.unlink()
                except Exception:
                    pass

    def delete_history_item(self, item_id: str) -> bool:
        before = len(self.history)
        self.history = [h for h in self.history if h.get("id") != item_id]
        if len(self.history) != before:
            self._save_history()
            return True
        return False

    def get_history_item(self, item_id: str) -> dict[str, Any] | None:
        for h in self.history:
            if h.get("id") == item_id:
                return h
        return None

    def get_snapshot(self) -> dict[str, Any]:
        settings = load_settings()
        auto_enabled = bool(settings.get("auto_shutdown_enabled", False))
        idle_limit = int(settings.get("auto_shutdown_minutes") or 0)
        pending_count = self.pending_task_count()
        idle_remaining = None
        if (
            self.compute["status"] == "online"
            and auto_enabled
            and idle_limit > 0
            and pending_count == 0
            and self.compute["last_activity_at"]
        ):
            passed = time.time() - float(self.compute["last_activity_at"])
            idle_remaining = max(0, int(idle_limit * 60 - passed))

        uptime = None
        if self.compute["status"] == "online" and self.compute["started_at"]:
            uptime = max(0, int(time.time() - float(self.compute["started_at"])))

        return {
            "compute": {
                **self.compute,
                "uptime_seconds": uptime,
                "idle_remaining_seconds": idle_remaining,
                "pending_tasks_count": pending_count,
            },
            "settings": settings,
            "env": get_public_env_status(),
            "tasks": [self._public_task(self.tasks[tid]) for tid in self.task_order[:30] if tid in self.tasks],
            "history": [
                {
                    "id": h["id"],
                    "filename": h["filename"],
                    "created_at": h["created_at"],
                    "language": h.get("language", ""),
                    "duration": h.get("duration", 0),
                    "elapsed": h.get("elapsed", 0),
                    "engine": h.get("engine", ""),
                    "gpu": h.get("gpu", ""),
                    "char_count": len(h.get("text", "")),
                    "preview": (h.get("text", "")[:90] + "...") if len(h.get("text", "")) > 90 else h.get("text", ""),
                }
                for h in self.history[:50]
            ],
        }


state_manager = AppStateManager()

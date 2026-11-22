"""固定 Cloudflare 算力网关客户端。

所有对云端 Whisper 服务（无论运行在 Colab 还是 Kaggle）的请求都经由
t4-gateway.joelmz2801.workers.dev 统一转发。
"""
from __future__ import annotations

import asyncio
import re
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx

from .config import load_gateway_config


class GatewayError(RuntimeError):
    pass


def _require_gw() -> dict[str, str]:
    gw = load_gateway_config()
    if not gw.get("gateway_url") or not gw.get("gateway_token"):
        raise GatewayError("未找到固定网关配置（skillhome/colab-t4/gateway_config.json）")
    return gw


async def check_worker_health(timeout: float = 8.0) -> dict[str, Any] | None:
    """探测固定网关背后的云端 Whisper 服务是否存活（亮绿灯依据）。"""
    gw = load_gateway_config()
    if not gw.get("gateway_url") or not gw.get("gateway_token"):
        return None
    url = f"{gw['gateway_url']}/health"
    headers = {"Authorization": f"Bearer {gw['gateway_token']}"}
    try:
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, dict) and data.get("status") == "ok":
                    return data
    except Exception:
        return None
    return None


async def clear_gateway_route() -> bool:
    """清空 Cloudflare 网关上的活跃后端地址。"""
    gw = load_gateway_config()
    if not gw.get("gateway_url") or not gw.get("admin_token"):
        return False
    url = f"{gw['gateway_url']}/_gateway/clear"
    headers = {"X-Admin-Token": gw["admin_token"]}
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, headers=headers)
            return resp.status_code == 200
    except Exception:
        return False


async def send_remote_shutdown() -> bool:
    """通知云端 Whisper 服务优雅退出（Kaggle 会随之立刻释放 GPU）。"""
    gw = load_gateway_config()
    if not gw.get("gateway_url") or not gw.get("gateway_token"):
        return False
    url = f"{gw['gateway_url']}/shutdown"
    headers = {
        "Authorization": f"Bearer {gw['gateway_token']}",
        "X-Admin-Token": gw.get("admin_token", ""),
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(url, headers=headers)
            return resp.status_code in (200, 202)
    except Exception:
        return False


def _clean_error_detail(text: str, limit: int = 300) -> str:
    raw = (text or "").strip()
    if "<html" in raw.lower() or "<!doctype" in raw.lower():
        stripped = re.sub(r"<[^>]+>", " ", raw)
        stripped = re.sub(r"\s+", " ", stripped).strip()
        raw = stripped or "网关返回 HTML 错误页"
    return raw[:limit]


def _raise_for_gateway_status(resp: httpx.Response, *, legacy: bool = False) -> None:
    if resp.status_code == 200:
        return
    if resp.status_code == 503:
        raise GatewayError("云端算力尚未就绪或已离线，请先点击「启动算力」等待亮绿灯。")
    if resp.status_code == 502:
        raise GatewayError("云端隧道连接中断，请尝试重新启动算力。")
    if resp.status_code == 524:
        if legacy:
            raise GatewayError(
                "当前云端仍为旧版同步接口，单次转录超过 Cloudflare 100 秒网关上限（HTTP 524）。"
                "请先点击「关闭算力」再重新「启动算力」，以启用新版异步队列支持长音视频。"
            )
        raise GatewayError("请求 Cloudflare 网关超时（HTTP 524），请重试或重启算力。")
    detail = _clean_error_detail(resp.text)
    raise GatewayError(f"云端转录失败（HTTP {resp.status_code}）：{detail}")


async def transcribe_via_gateway(
    audio_path: Path,
    language: str = "auto",
    beam_size: int = 5,
    vad_filter: bool = True,
    timeout: float = 1800.0,
    progress_cb: Callable[[float, float, int], None] | None = None,
) -> dict[str, Any]:
    """将瘦身后的本地音频提交至云端 GPU 异步转录并轮询结果（规避 Cloudflare 100 秒超时）。"""
    gw = _require_gw()
    base_url = gw["gateway_url"].rstrip("/")
    submit_url = f"{base_url}/transcribe/submit"
    legacy_url = f"{base_url}/transcribe"
    headers = {"Authorization": f"Bearer {gw['gateway_token']}"}
    data = {
        "language": language or "auto",
        "beam_size": str(beam_size),
        "vad_filter": "true" if vad_filter else "false",
    }

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        with audio_path.open("rb") as fp:
            files = {"file": (audio_path.name, fp, "audio/mpeg")}
            resp = await client.post(submit_url, headers=headers, data=data, files=files, timeout=120.0)

        if resp.status_code == 404:
            with audio_path.open("rb") as fp:
                files = {"file": (audio_path.name, fp, "audio/mpeg")}
                legacy_resp = await client.post(
                    legacy_url, headers=headers, data=data, files=files, timeout=timeout
                )
            _raise_for_gateway_status(legacy_resp, legacy=True)
            result = legacy_resp.json()
            if not isinstance(result, dict) or "segments" not in result:
                raise GatewayError("云端返回了异常的数据格式。")
            return result

        _raise_for_gateway_status(resp)
        submit_payload = resp.json()
        job_id = submit_payload.get("job_id") if isinstance(submit_payload, dict) else None
        if not job_id:
            raise GatewayError("云端未返回有效的任务 ID（job_id）。")

        status_url = f"{base_url}/transcribe/status/{job_id}"
        deadline = time.monotonic() + timeout
        consecutive_transient = 0

        while time.monotonic() < deadline:
            try:
                poll_resp = await client.get(status_url, headers=headers, timeout=20.0)
            except httpx.HTTPError as exc:
                consecutive_transient += 1
                if consecutive_transient > 10:
                    raise GatewayError(f"连续 {consecutive_transient} 次查询云端转录进度失败：{exc}") from exc
                await asyncio.sleep(3.0)
                continue

            if poll_resp.status_code in (502, 503, 504, 524):
                consecutive_transient += 1
                if consecutive_transient > 10:
                    _raise_for_gateway_status(poll_resp)
                await asyncio.sleep(3.0)
                continue

            if poll_resp.status_code == 404:
                raise GatewayError("云端转录任务已丢失（可能云端算力已重启），请重新提交。")

            _raise_for_gateway_status(poll_resp)
            consecutive_transient = 0

            payload = poll_resp.json()
            if not isinstance(payload, dict):
                raise GatewayError("云端返回了异常的任务状态格式。")

            status = payload.get("status")
            if status in ("queued", "running"):
                if progress_cb is not None:
                    progress_cb(
                        float(payload.get("processed_seconds") or 0.0),
                        float(payload.get("duration") or 0.0),
                        int(payload.get("segments_done") or 0),
                    )
                await asyncio.sleep(2.5)
                continue

            if status == "done":
                result = payload.get("result")
                if not isinstance(result, dict) or "segments" not in result:
                    raise GatewayError("云端返回了异常的数据格式。")
                return result

            if status == "error":
                raise GatewayError(f"云端转录失败：{payload.get('error') or '未知错误'}")

            raise GatewayError(f"云端返回了未知的任务状态：{status}")

        raise GatewayError("云端转录超时，请稍后重试或检查云端算力状态。")

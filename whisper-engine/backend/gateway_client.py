"""固定 Cloudflare 算力网关客户端。

所有对云端 Whisper 服务（无论运行在 Colab 还是 Kaggle）的请求都经由
t4-gateway.joelmz2801.workers.dev 统一转发。
"""
from __future__ import annotations

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


async def transcribe_via_gateway(
    audio_path: Path,
    language: str = "auto",
    beam_size: int = 5,
    vad_filter: bool = True,
    timeout: float = 900.0,
) -> dict[str, Any]:
    """将瘦身后的本地音频上传至云端 GPU 执行转录。"""
    gw = _require_gw()
    url = f"{gw['gateway_url']}/transcribe"
    headers = {"Authorization": f"Bearer {gw['gateway_token']}"}
    data = {
        "language": language or "auto",
        "beam_size": str(beam_size),
        "vad_filter": "true" if vad_filter else "false",
    }

    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        with audio_path.open("rb") as fp:
            files = {"file": (audio_path.name, fp, "audio/mpeg")}
            resp = await client.post(url, headers=headers, data=data, files=files)

    if resp.status_code == 503:
        raise GatewayError("云端算力尚未就绪或已离线，请先点击「启动算力」等待亮绿灯。")
    if resp.status_code == 502:
        raise GatewayError("云端隧道连接中断，请尝试重新启动算力。")
    if resp.status_code != 200:
        detail = resp.text[:300]
        raise GatewayError(f"云端转录失败（HTTP {resp.status_code}）：{detail}")

    result = resp.json()
    if not isinstance(result, dict) or "segments" not in result:
        raise GatewayError("云端返回了异常的数据格式。")
    return result

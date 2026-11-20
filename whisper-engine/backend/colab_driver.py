"""Google Colab 无头算力驱动（复用本机 skillhome/colab-t4/colab_api.py）。"""
from __future__ import annotations

import asyncio
import importlib.util
import json
from typing import Any, Callable

from .cloud_worker_template import build_cloud_worker_script
from .config import DEFAULT_COLAB_T4_DIR, has_colab_auth, load_gateway_config

_colab_mod = None


def _get_colab_module():
    global _colab_mod
    if _colab_mod is not None:
        return _colab_mod
    api_path = DEFAULT_COLAB_T4_DIR / "colab_api.py"
    if not api_path.exists():
        raise RuntimeError(f"未找到 {api_path}，无法连接 Colab。")
    spec = importlib.util.spec_from_file_location("colab_t4_api", str(api_path))
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    _colab_mod = mod
    return mod


def list_active_runtimes_sync() -> list[dict[str, Any]]:
    if not has_colab_auth():
        return []
    mod = _get_colab_module()
    res = mod.mcp_call("list_runtimes")
    return res.get("runtimes", []) if isinstance(res, dict) else []


def _start_colab_sync(
    gpu: str,
    model_name: str,
    progress_cb: Callable[[str], None],
    max_idle_seconds: int = 0,
) -> dict[str, Any]:
    if not has_colab_auth():
        raise RuntimeError("本机未检测到 Colab OAuth 授权，请先在 skillhome/colab-t4 运行 oauth_colab.py。")
    gw = load_gateway_config()
    if not gw.get("gateway_url") or not gw.get("admin_token"):
        raise RuntimeError("未找到固定网关配置（skillhome/colab-t4/gateway_config.json）。")

    mod = _get_colab_module()
    spec = mod.build_spec(gpu or "T4", "STANDARD")

    progress_cb("正在检查云端是否已有空闲 Colab 显卡...")
    existing = mod.mcp_call("list_runtimes").get("runtimes", [])
    rt_name = None
    for rt in existing:
        if rt.get("runtimeSpec") == spec:
            rt_name = rt["name"]
            break

    if rt_name:
        progress_cb(f"复用已有 Colab {gpu} 显卡，正在启动听写服务...")
    else:
        progress_cb(f"正在向 Google Colab 申请 {gpu} 显卡（约需 15~30 秒）...")
        created = mod.mcp_call("create_runtime", {"runtime": {"runtimeSpec": spec}}, timeout=240)
        rt_name = created.get("name")
        if not rt_name:
            raise RuntimeError(f"申请 Colab 实例失败：{created}")

    progress_cb(f"显卡已分配，正在云端载入 Whisper ({model_name}) 并打通传输通道...")
    worker_script = build_cloud_worker_script(
        engine="colab",
        model_name=model_name,
        gateway_url=gw["gateway_url"],
        admin_token=gw["admin_token"],
        background=True,
        max_idle_seconds=max_idle_seconds,
    )
    exec_res = mod.mcp_call(
        "execute_code",
        {"runtime": rt_name, "code": worker_script},
        timeout=300,
    )

    # 解析 CW_READY 标记以便返回 GPU 详情；若未出现则立刻抛出云端真实报错
    raw_text = json.dumps(exec_res, ensure_ascii=False) if not isinstance(exec_res, str) else exec_res
    if "CW_READY:" not in raw_text:
        raise RuntimeError(f"云端启动脚本未返回就绪信号，输出摘要：{raw_text[-600:]}")

    ready_info: dict[str, Any] = {}
    import re
    m = re.search(r"CW_READY:(\{.*?\})", raw_text)
    if m:
        candidate = m.group(1).replace('\\"', '"')
        try:
            ready_info = json.loads(candidate)
        except Exception:
            pass

    return {
        "runtime_name": rt_name,
        "gpu": ready_info.get("gpu", gpu),
        "model": ready_info.get("model", model_name),
        "raw": exec_res,
    }


def _stop_colab_sync(runtime_name: str | None = None) -> list[str]:
    if not has_colab_auth():
        return []
    mod = _get_colab_module()
    deleted: list[str] = []
    targets = [runtime_name] if runtime_name else [
        rt["name"] for rt in list_active_runtimes_sync() if rt.get("name")
    ]
    for name in targets:
        try:
            mod.mcp_call("delete_runtime", {"name": name, "allowMissing": True})
            deleted.append(name)
        except Exception:
            pass
    return deleted


async def list_active_runtimes() -> list[dict[str, Any]]:
    return await asyncio.to_thread(list_active_runtimes_sync)


async def start_colab_worker(
    gpu: str,
    model_name: str,
    progress_cb: Callable[[str], None],
    max_idle_seconds: int = 0,
) -> dict[str, Any]:
    return await asyncio.to_thread(_start_colab_sync, gpu, model_name, progress_cb, max_idle_seconds)


async def stop_colab_runtimes(runtime_name: str | None = None) -> list[str]:
    return await asyncio.to_thread(_stop_colab_sync, runtime_name)

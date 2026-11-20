"""Kaggle GPU 无头算力驱动（直连官方 Kaggle REST API，无需额外 CLI 依赖）。

同时支持一键导出可直接导入 Kaggle 网页手动运行的 .ipynb 笔记本作为备用。
"""
from __future__ import annotations

import json
from typing import Any, Callable

import httpx

from .cloud_worker_template import build_cloud_worker_script
from .config import load_gateway_config, load_kaggle_credentials

KAGGLE_API_BASE = "https://www.kaggle.com/api/v1"


async def verify_kaggle_credentials(username: str, key: str) -> dict[str, Any]:
    """验证 Kaggle 用户名和 API Key 是否有效。"""
    url = f"{KAGGLE_API_BASE}/kernels/list"
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(
            url,
            params={"mine": "true", "pageSize": 1},
            auth=(username.strip(), key.strip()),
        )
    if resp.status_code == 401:
        raise RuntimeError("Kaggle 用户名或 API Key 无效（HTTP 401），请检查 kaggle.json 内容。")
    if resp.status_code >= 400:
        raise RuntimeError(f"连接 Kaggle 失败（HTTP {resp.status_code}）：{resp.text[:200]}")
    return {"ok": True, "username": username.strip()}


async def start_kaggle_worker(
    model_name: str,
    kernel_slug: str,
    progress_cb: Callable[[str], None],
    max_idle_seconds: int = 0,
) -> dict[str, Any]:
    """通过 Kaggle REST API 推送并自动启动 GPU 转录脚本。"""
    cred = load_kaggle_credentials()
    if not cred:
        raise RuntimeError("请先点击右上角「设置」，填入你的 Kaggle 用户名与 API Key（或上传 kaggle.json）。")
    username, api_key = cred

    gw = load_gateway_config()
    if not gw.get("gateway_url") or not gw.get("admin_token"):
        raise RuntimeError("未找到固定网关配置（skillhome/colab-t4/gateway_config.json）。")

    slug = (kernel_slug or "cloud-whisper-studio-worker").strip().lower().replace(" ", "-")
    kernel_ref = f"{username}/{slug}"

    progress_cb("正在生成云端 Whisper 脚本并推送到你的 Kaggle 账号...")
    script_text = build_cloud_worker_script(
        engine="kaggle",
        model_name=model_name,
        gateway_url=gw["gateway_url"],
        admin_token=gw["admin_token"],
        background=False,
        max_idle_seconds=max_idle_seconds,
    )

    payload = {
        "newTitle": "Cloud Whisper Studio Worker",
        "slug": kernel_ref,
        "text": script_text,
        "language": "python",
        "kernelType": "script",
        "isPrivate": True,
        "enableGpu": True,
        "enableTpu": False,
        "enableInternet": True,
        "datasetDataSources": [],
        "competitionDataSources": [],
        "kernelDataSources": [],
        "modelDataSources": [],
        "categoryIds": [],
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(
            f"{KAGGLE_API_BASE}/kernels/push",
            json=payload,
            auth=(username, api_key),
        )

    if resp.status_code == 401:
        raise RuntimeError("Kaggle 鉴权失败，请在「设置」中更新你的 Kaggle API Key。")
    if resp.status_code >= 400:
        raise RuntimeError(f"推送 Kaggle 脚本失败（HTTP {resp.status_code}）：{resp.text[:300]}")

    data = resp.json()
    if data.get("error"):
        raise RuntimeError(f"Kaggle 返回错误：{data['error']}")

    progress_cb("已成功触发 Kaggle GPU 开机！正在等待云端安装环境并亮绿灯（首次约需 1~2 分钟）...")
    return {
        "kernel_ref": kernel_ref,
        "url": data.get("url") or f"https://www.kaggle.com/code/{kernel_ref}",
        "version": data.get("versionNumber"),
    }


async def get_kaggle_kernel_status(kernel_ref: str) -> dict[str, Any]:
    cred = load_kaggle_credentials()
    if not cred or not kernel_ref:
        return {}
    username, api_key = cred
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(
                f"{KAGGLE_API_BASE}/kernels/status",
                params={"userName": username, "kernelSlug": kernel_ref.split("/")[-1]},
                auth=(username, api_key),
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return {}


def build_kaggle_notebook_json(model_name: str = "large-v3-turbo") -> str:
    """导出一个可直接上传到 Kaggle 网页点击 Run All 的 .ipynb 备用笔记本。"""
    gw = load_gateway_config()
    script_text = build_cloud_worker_script(
        engine="kaggle",
        model_name=model_name,
        gateway_url=gw.get("gateway_url", "https://t4-gateway.joelmz2801.workers.dev"),
        admin_token=gw.get("admin_token", "PLEASE_FILL_ADMIN_TOKEN"),
        background=False,
        max_idle_seconds=3600,
    )
    nb = {
        "cells": [
            {
                "cell_type": "markdown",
                "metadata": {},
                "source": [
                    "# Cloud Whisper Studio — Kaggle GPU 备用启动页\n",
                    "在右侧 Settings 选择 **GPU T4 x2** 并开启 **Internet**，点击 **Run All** 后，本地软件会自动亮 🟢 绿灯。\n",
                ],
            },
            {
                "cell_type": "code",
                "execution_count": None,
                "metadata": {},
                "outputs": [],
                "source": script_text.splitlines(keepends=True),
            },
        ],
        "metadata": {
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": "3.10.0"},
        },
        "nbformat": 4,
        "nbformat_minor": 4,
    }
    return json.dumps(nb, ensure_ascii=False, indent=2)

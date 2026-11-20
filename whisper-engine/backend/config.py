"""配置与路径管理模块。

自动发现并复用本机 skillhome/colab-t4 中的官方 Colab 授权与固定 Cloudflare 网关配置，
以及标准 ~/.kaggle/kaggle.json 凭据。严禁将明文密钥直接暴露给前端。
"""
from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FRONTEND_DIR = PROJECT_ROOT / "frontend"
# 数据（设置、历史、转录结果）存放在用户目录，升级或重装 Joel Desk Pro 都不会丢
DATA_DIR = Path(os.environ.get("CW_DATA_DIR") or (Path.home() / ".joeldeskpro" / "whisper-data"))
# 旧版独立 Cloud Whisper Studio 的数据目录：首次运行时自动搬过来
LEGACY_DATA_DIRS = [
    PROJECT_ROOT / "data",
    Path.home() / "Documents" / "Projects" / "cloud-whisper-studio" / "data",
]
UPLOADS_DIR = DATA_DIR / "uploads"
OUTPUTS_DIR = DATA_DIR / "outputs"
SETTINGS_FILE = DATA_DIR / "settings.json"
HISTORY_FILE = DATA_DIR / "history.json"

DEFAULT_COLAB_T4_DIR = Path(
    os.environ.get(
        "COLAB_T4_DIR",
        str(Path.home() / "Documents" / "skillhome" / "colab-t4"),
    )
)
KAGGLE_CRED_FILE = Path.home() / ".kaggle" / "kaggle.json"

DEFAULT_SETTINGS: dict[str, Any] = {
    "provider": "colab",              # "colab" | "kaggle"
    "colab_gpu": "T4",                # "T4" | "L4" | "A100"
    "whisper_model": "large-v3-turbo",# "large-v3-turbo" | "large-v3" | "medium" | "small"
    "language": "auto",               # "auto" | "zh" | "en" | "ja" | "ko" | ...
    "auto_shutdown_enabled": False,   # False = 手动控制不自动关；True = 队列清空闲置后自动关
    "auto_shutdown_minutes": 15,      # 勾选闲置自动关机时的等待分钟数
    "kaggle_kernel_slug": "cloud-whisper-studio-worker",
    "beam_size": 5,
    "vad_filter": True,
}


def _migrate_legacy_data() -> None:
    if (DATA_DIR / "settings.json").exists() or (DATA_DIR / "history.json").exists():
        return
    for legacy in LEGACY_DATA_DIRS:
        try:
            if legacy.resolve() == DATA_DIR.resolve() or not legacy.is_dir():
                continue
            DATA_DIR.mkdir(parents=True, exist_ok=True)
            for name in ("settings.json", "history.json"):
                if (legacy / name).is_file():
                    shutil.copy2(legacy / name, DATA_DIR / name)
            if (legacy / "outputs").is_dir():
                shutil.copytree(legacy / "outputs", DATA_DIR / "outputs", dirs_exist_ok=True)
            return
        except Exception:
            continue


def ensure_dirs() -> None:
    _migrate_legacy_data()
    for d in (DATA_DIR, UPLOADS_DIR, OUTPUTS_DIR):
        d.mkdir(parents=True, exist_ok=True)


def load_settings() -> dict[str, Any]:
    ensure_dirs()
    settings = dict(DEFAULT_SETTINGS)
    if SETTINGS_FILE.exists():
        try:
            saved = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
            if isinstance(saved, dict):
                settings.update(saved)
        except Exception:
            pass
    return settings


def save_settings(patch: dict[str, Any]) -> dict[str, Any]:
    ensure_dirs()
    current = load_settings()
    allowed_keys = set(DEFAULT_SETTINGS.keys())
    for k, v in patch.items():
        if k in allowed_keys:
            current[k] = v
    SETTINGS_FILE.write_text(
        json.dumps(current, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return current


def load_gateway_config() -> dict[str, str]:
    """读取 colab-t4 固定网关配置（内部使用，不直接返回前端）。"""
    cfg_path = DEFAULT_COLAB_T4_DIR / "gateway_config.json"
    if not cfg_path.exists():
        return {}
    try:
        data = json.loads(cfg_path.read_text(encoding="utf-8"))
        return {
            "gateway_url": str(data.get("gateway_url", "")).rstrip("/"),
            "gateway_token": str(data.get("gateway_token", "")),
            "admin_token": str(data.get("admin_token", "")),
        }
    except Exception:
        return {}


def has_colab_auth() -> bool:
    return (
        (DEFAULT_COLAB_T4_DIR / "colab_api.py").exists()
        and (DEFAULT_COLAB_T4_DIR / "token.json").exists()
        and (DEFAULT_COLAB_T4_DIR / "client_secret.json").exists()
    )


def load_kaggle_credentials() -> tuple[str, str] | None:
    """读取 ~/.kaggle/kaggle.json 或环境变量中的 Kaggle API 凭据。"""
    env_user = os.environ.get("KAGGLE_USERNAME", "").strip()
    env_key = os.environ.get("KAGGLE_KEY", "").strip()
    if env_user and env_key:
        return env_user, env_key

    if KAGGLE_CRED_FILE.exists():
        try:
            data = json.loads(KAGGLE_CRED_FILE.read_text(encoding="utf-8"))
            user = str(data.get("username", "")).strip()
            key = str(data.get("key", "")).strip()
            if user and key:
                return user, key
        except Exception:
            pass
    return None


def save_kaggle_credentials(username: str, key: str) -> None:
    username = username.strip()
    key = key.strip()
    if not username or not key:
        raise ValueError("Kaggle 用户名和 API Key 均不能为空")
    KAGGLE_CRED_FILE.parent.mkdir(parents=True, exist_ok=True)
    KAGGLE_CRED_FILE.write_text(
        json.dumps({"username": username, "key": key}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def get_public_env_status() -> dict[str, Any]:
    """返回可安全展示给前端的环境连接状态（无任何明文密钥）。"""
    gw = load_gateway_config()
    kaggle_cred = load_kaggle_credentials()
    return {
        "colab_ready": has_colab_auth(),
        "gateway_ready": bool(gw.get("gateway_url") and gw.get("gateway_token") and gw.get("admin_token")),
        "gateway_url": gw.get("gateway_url", ""),
        "kaggle_ready": kaggle_cred is not None,
        "kaggle_username": kaggle_cred[0] if kaggle_cred else "",
        "outputs_dir": str(OUTPUTS_DIR),
    }

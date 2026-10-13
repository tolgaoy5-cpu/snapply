from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from threading import RLock
from typing import Any

_LOCK = RLock()


def _data_dir() -> Path:
    override = os.environ.get("JOB_COPILOT_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return Path.home() / ".job-copilot"


def _state_path() -> Path:
    return _data_dir() / "state.json"


def _empty_state() -> dict[str, Any]:
    return {
        "schema_version": 1,
        "master_profile": {},
        "application_memory": {},
        "saved_cv": {},
        "saved_answers": {},
        "referees": [],
    }


def load_state() -> dict[str, Any]:
    with _LOCK:
        path = _state_path()
        if not path.exists():
            return _empty_state()
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return _empty_state()
        state = _empty_state()
        if isinstance(raw, dict):
            if isinstance(raw.get("master_profile"), dict):
                state["master_profile"] = raw["master_profile"]
            if isinstance(raw.get("application_memory"), dict):
                state["application_memory"] = raw["application_memory"]
            if isinstance(raw.get("saved_cv"), dict):
                state["saved_cv"] = raw["saved_cv"]
            if isinstance(raw.get("saved_answers"), dict):
                state["saved_answers"] = raw["saved_answers"]
            if isinstance(raw.get("referees"), list):
                state["referees"] = raw["referees"]
        return state


def save_state(state: dict[str, Any]) -> dict[str, Any]:
    with _LOCK:
        directory = _data_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = _state_path()
        payload = _empty_state()
        payload["master_profile"] = state.get("master_profile") if isinstance(state.get("master_profile"), dict) else {}
        payload["application_memory"] = state.get("application_memory") if isinstance(state.get("application_memory"), dict) else {}
        payload["saved_cv"] = state.get("saved_cv") if isinstance(state.get("saved_cv"), dict) else {}
        payload["saved_answers"] = state.get("saved_answers") if isinstance(state.get("saved_answers"), dict) else {}
        payload["referees"] = state.get("referees") if isinstance(state.get("referees"), list) else []
        fd, tmp_name = tempfile.mkstemp(prefix="state-", suffix=".json", dir=str(directory))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_name, path)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
        return payload


def set_master_profile(profile: dict[str, Any]) -> dict[str, Any]:
    state = load_state()
    state["master_profile"] = profile if isinstance(profile, dict) else {}
    return save_state(state)


def set_memory_item(key: str, item: dict[str, Any]) -> dict[str, Any]:
    state = load_state()
    memory = state.setdefault("application_memory", {})
    memory[key] = item
    return save_state(state)


def replace_memory(memory: dict[str, Any]) -> dict[str, Any]:
    state = load_state()
    state["application_memory"] = memory if isinstance(memory, dict) else {}
    return save_state(state)


def upsert_saved_answer(item: dict[str, Any]) -> dict[str, Any]:
    """Store a user-confirmed answer to an application question, keyed by its signature."""
    with _LOCK:
        state = load_state()
        answers = state.setdefault("saved_answers", {})
        previous = answers.get(item["signature"]) or {}
        answers[item["signature"]] = {**previous, **item, "created_at": previous.get("created_at") or item.get("confirmed_at")}
        return save_state(state)


def delete_saved_answer(signature: str) -> dict[str, Any]:
    with _LOCK:
        state = load_state()
        state.setdefault("saved_answers", {}).pop(signature, None)
        return save_state(state)


def set_referees(referees: list[dict[str, Any]]) -> dict[str, Any]:
    """Replace the saved referees (other people's details, entered and confirmed by the user)."""
    with _LOCK:
        state = load_state()
        state["referees"] = [r for r in referees if isinstance(r, dict)][:10]
        return save_state(state)


def _cv_path() -> Path:
    return _data_dir() / "saved_cv.bin"

def save_cv(content: bytes, *, filename: str, content_type: str = "application/octet-stream") -> dict[str, Any]:
    if not content:
        raise ValueError("CV content is empty")
    with _LOCK:
        directory = _data_dir()
        directory.mkdir(parents=True, exist_ok=True)
        path = _cv_path()
        fd, tmp_name = tempfile.mkstemp(prefix="cv-", suffix=".bin", dir=str(directory))
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(content)
                f.flush()
                os.fsync(f.fileno())
            os.replace(tmp_name, path)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)
        state = load_state()
        state["saved_cv"] = {
            "name": filename or "cv",
            "type": content_type or "application/octet-stream",
            "size": len(content),
        }
        save_state(state)
        return state["saved_cv"]

def get_saved_cv_meta() -> dict[str, Any]:
    state = load_state()
    meta = state.get("saved_cv") if isinstance(state.get("saved_cv"), dict) else {}
    if not meta or not _cv_path().exists():
        return {}
    return dict(meta)

def get_saved_cv_bytes() -> bytes | None:
    path = _cv_path()
    if not path.exists():
        return None
    try:
        return path.read_bytes()
    except OSError:
        return None

def forget_saved_cv() -> None:
    with _LOCK:
        try:
            _cv_path().unlink(missing_ok=True)
        except OSError:
            pass
        state = load_state()
        state["saved_cv"] = {}
        save_state(state)

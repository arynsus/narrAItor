"""Model download manager with progress reporting."""

import asyncio
import json
import os
import shutil
import threading
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional

MODELS: List[Dict] = [
    {
        "id":          "Qwen3-TTS-Tokenizer-12Hz",
        "repo_id":     "Qwen/Qwen3-TTS-Tokenizer-12Hz",
        "ms_repo_id":  "Qwen/Qwen3-TTS-Tokenizer-12Hz",
        "name":        "Tokenizer (Required)",
        "description": "Required for all synthesis.",
        "size_bytes":  500_000_000,
        "required":    True,
        "type":        "tokenizer",
    },
    {
        "id":          "Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "repo_id":     "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "ms_repo_id":  "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
        "name":        "Custom Voice 1.7B",
        "description": "9 premium voices with instruction control.",
        "size_bytes":  3_500_000_000,
        "required":    False,
        "type":        "custom",
    },
    {
        "id":          "Qwen3-TTS-12Hz-0.6B-CustomVoice",
        "repo_id":     "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        "ms_repo_id":  "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice",
        "name":        "Custom Voice 0.6B",
        "description": "Faster, smaller custom voice model.",
        "size_bytes":  1_200_000_000,
        "required":    False,
        "type":        "custom",
    },
    {
        "id":          "Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "repo_id":     "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "ms_repo_id":  "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
        "name":        "Voice Designer 1.7B",
        "description": "Generate voices from text descriptions.",
        "size_bytes":  3_500_000_000,
        "required":    False,
        "type":        "design",
    },
    {
        "id":          "Qwen3-TTS-12Hz-1.7B-Base",
        "repo_id":     "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "ms_repo_id":  "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
        "name":        "Voice Clone 1.7B",
        "description": "Clone any voice from a 3-second reference audio.",
        "size_bytes":  3_500_000_000,
        "required":    False,
        "type":        "clone",
    },
    {
        "id":          "Qwen3-TTS-12Hz-0.6B-Base",
        "repo_id":     "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        "ms_repo_id":  "Qwen/Qwen3-TTS-12Hz-0.6B-Base",
        "name":        "Voice Clone 0.6B",
        "description": "Lighter voice cloning model.",
        "size_bytes":  1_200_000_000,
        "required":    False,
        "type":        "clone",
    },
]


class ModelManager:
    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self._active_downloads: Dict[str, threading.Event] = {}

    def list_models(self) -> List[Dict]:
        result = []
        for m in MODELS:
            local_dir = self.models_dir / m["id"]
            downloaded = _has_model_weights(local_dir)
            size_bytes = _dir_size(local_dir) if downloaded else 0
            result.append({
                "id":          m["id"],
                "name":        m["name"],
                "description": m["description"],
                "size_bytes":  size_bytes,
                "size_label":  _fmt_bytes(m["size_bytes"]),
                "downloaded":  downloaded,
                "required":    m["required"],
                "type":        m["type"],
            })
        return result

    def delete_model(self, model_id: str) -> bool:
        local_dir = self.models_dir / model_id
        if local_dir.exists():
            shutil.rmtree(local_dir)
            return True
        return False

    def cancel_download(self, model_id: str) -> None:
        ev = self._active_downloads.get(model_id)
        if ev:
            ev.set()

    async def download_stream(
        self, model_id: str, source: str = "huggingface"
    ) -> AsyncGenerator[str, None]:
        """Async generator that yields SSE-formatted data strings."""
        model_info = next((m for m in MODELS if m["id"] == model_id), None)
        if not model_info:
            yield _sse({"status": "error", "error": f"Unknown model: {model_id}"})
            return

        if model_id in self._active_downloads:
            yield _sse({"status": "error", "error": "Download already in progress."})
            return

        cancel_event = threading.Event()
        self._active_downloads[model_id] = cancel_event
        local_dir  = self.models_dir / model_id
        expected   = model_info["size_bytes"]
        loop       = asyncio.get_event_loop()
        progress_q: asyncio.Queue = asyncio.Queue()

        def _download():
            try:
                local_dir.mkdir(parents=True, exist_ok=True)

                if source == "modelscope":
                    _download_modelscope(model_info["ms_repo_id"], local_dir, cancel_event)
                else:
                    _download_huggingface(model_info["repo_id"], local_dir, cancel_event)

                if cancel_event.is_set():
                    loop.call_soon_threadsafe(progress_q.put_nowait, {"status": "cancelled"})
                else:
                    loop.call_soon_threadsafe(progress_q.put_nowait, {"status": "done", "percent": 100})
            except Exception as e:
                loop.call_soon_threadsafe(
                    progress_q.put_nowait, {"status": "error", "error": str(e)}
                )
            finally:
                self._active_downloads.pop(model_id, None)

        def _size_poller():
            """Poll download dir size and report progress."""
            while not cancel_event.is_set():
                if local_dir.exists():
                    current = _dir_size(local_dir)
                    pct     = min(99, int(100 * current / expected)) if expected > 0 else 0
                    loop.call_soon_threadsafe(
                        progress_q.put_nowait,
                        {"status": "downloading", "percent": pct,
                         "message": f"Downloading… {_fmt_bytes(current)} / {_fmt_bytes(expected)}"}
                    )
                cancel_event.wait(1.5)

        threading.Thread(target=_download,      daemon=True).start()
        threading.Thread(target=_size_poller,   daemon=True).start()

        yield _sse({"status": "downloading", "percent": 0, "message": "Starting download…"})

        while True:
            try:
                update = await asyncio.wait_for(progress_q.get(), timeout=3.0)
            except asyncio.TimeoutError:
                continue

            yield _sse(update)

            if update.get("status") in ("done", "error", "cancelled"):
                break


# ── Download backends ─────────────────────────────────────────────────────────

def _download_huggingface(repo_id: str, local_dir: Path, cancel_event: threading.Event) -> None:
    from huggingface_hub import snapshot_download
    snapshot_download(
        repo_id=repo_id,
        local_dir=str(local_dir),
        local_files_only=False,
        ignore_patterns=["*.pt", "*.bin"] if False else None,  # download all
    )


def _download_modelscope(repo_id: str, local_dir: Path, cancel_event: threading.Event) -> None:
    try:
        from modelscope import snapshot_download as ms_download
        ms_download(model_id=repo_id, local_dir=str(local_dir))
    except ImportError:
        raise RuntimeError(
            "ModelScope not installed. Run: pip install modelscope"
        )


# ── Utilities ─────────────────────────────────────────────────────────────────

_WEIGHT_FILES = (
    "model.safetensors",
    "model.safetensors.index.json",
    "pytorch_model.bin",
    "pytorch_model.bin.index.json",
)

def _has_model_weights(path: Path) -> bool:
    """Return True only when the model directory contains actual weight files at its root."""
    return path.is_dir() and any((path / f).exists() for f in _WEIGHT_FILES)


def _dir_size(path: Path) -> int:
    total = 0
    try:
        for entry in os.scandir(path):
            if entry.is_file(follow_symlinks=False):
                total += entry.stat().st_size
            elif entry.is_dir(follow_symlinks=False):
                total += _dir_size(Path(entry.path))
    except (PermissionError, FileNotFoundError):
        pass
    return total


def _fmt_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"


def _sse(data: dict) -> str:
    import json
    return f"data: {json.dumps(data)}\n\n"

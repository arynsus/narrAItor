"""TTS engine wrapper for Qwen3-TTS models."""

import os
import threading
import tempfile
from pathlib import Path
from typing import Optional, Tuple

# Lazy imports — only loaded when a model is first used
_torch = None
_sf = None
_np = None
_Qwen3TTSModel = None

try:
    from scipy.signal import resample as _scipy_resample
    _HAS_SCIPY = True
except ImportError:
    _HAS_SCIPY = False


def _import_deps():
    global _torch, _sf, _np, _Qwen3TTSModel
    if _torch is None:
        import torch
        import soundfile as sf
        import numpy as np
        from qwen_tts import Qwen3TTSModel
        _torch = torch
        _sf = sf
        _np = np
        _Qwen3TTSModel = Qwen3TTSModel


def _apply_speed(audio, sr: int, speed: float):
    """Pitch-preserving time stretch using FFT resampling (scipy) or fallback."""
    if abs(speed - 1.0) < 0.02:
        return audio, sr
    import numpy as np
    new_len = max(1, int(len(audio) / speed))
    if _HAS_SCIPY:
        resampled = _scipy_resample(audio, new_len)
    else:
        # Fallback: linear interpolation (slight pitch artifact at extremes)
        old_idx = np.linspace(0, len(audio) - 1, new_len)
        resampled = np.interp(old_idx, np.arange(len(audio)), audio)
    return resampled.astype(audio.dtype), sr


class TTSEngine:
    """
    Manages loaded Qwen3-TTS model instances and provides synthesis methods.
    Keeps at most one model loaded at a time to conserve memory.
    """

    def __init__(self, models_dir: Path):
        self.models_dir = models_dir
        self._loaded_key: Optional[str] = None
        self._loaded_model = None
        self._lock = threading.Lock()

    # ── Model management ──────────────────────────────────────────────────────

    def _model_path(self, model_name: str) -> Path:
        """Convert model name to local directory path."""
        # Strip 'Qwen/' prefix if present
        name = model_name.split("/")[-1] if "/" in model_name else model_name
        return self.models_dir / name

    def is_model_available(self, model_name: str) -> bool:
        path = self._model_path(model_name)
        return _has_model_weights(path)

    def _get_device(self) -> str:
        _import_deps()
        if _torch.cuda.is_available():
            return "cuda:0"
        try:
            if _torch.backends.mps.is_available():
                return "mps"
        except AttributeError:
            pass
        return "cpu"

    def _get_dtype(self, device: str):
        _import_deps()
        return _torch.float32 if device == "cpu" else _torch.bfloat16

    def _load_model(self, model_name: str):
        _import_deps()
        model_path = self._model_path(model_name)
        if not model_path.exists():
            raise RuntimeError(
                f"Model '{model_name}' is not downloaded. "
                "Please download it in Settings."
            )

        device = self._get_device()
        dtype  = self._get_dtype(device)

        kwargs = {
            "device_map": device,
            "dtype": dtype,
        }

        # Try flash attention (optional, GPU only)
        if device != "cpu":
            try:
                import flash_attn  # noqa: F401
                kwargs["attn_implementation"] = "flash_attention_2"
            except ImportError:
                pass

        print(f"[TTS] Loading {model_name} on {device}…")
        model = _Qwen3TTSModel.from_pretrained(str(model_path), **kwargs)
        print(f"[TTS] Model loaded.")
        return model

    def _ensure_model(self, model_name: str):
        """Load model if not already loaded. Unloads previous model first."""
        with self._lock:
            if self._loaded_key == model_name:
                return self._loaded_model
            # Unload current
            if self._loaded_model is not None:
                del self._loaded_model
                self._loaded_model = None
                try:
                    import gc, torch
                    gc.collect()
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                except Exception:
                    pass
            # Load new
            self._loaded_model = self._load_model(model_name)
            self._loaded_key   = model_name
            return self._loaded_model

    def unload(self):
        with self._lock:
            if self._loaded_model is not None:
                del self._loaded_model
                self._loaded_model = None
                self._loaded_key   = None

    # ── Synthesis ─────────────────────────────────────────────────────────────

    def _model_name_for_voice(self, voice: dict) -> str:
        vtype = voice["type"]
        size  = voice.get("model_size", "1.7B")
        if vtype == "preset":
            return f"Qwen3-TTS-12Hz-{size}-CustomVoice"
        if vtype == "designed":
            return "Qwen3-TTS-12Hz-1.7B-VoiceDesign"
        if vtype == "cloned":
            return f"Qwen3-TTS-12Hz-{size}-Base"
        raise ValueError(f"Unknown voice type: {vtype}")

    def synthesize(self, voice: dict, text: str, output_path: Path, speed: float = 1.0) -> Tuple[int, float]:
        """
        Synthesize text with the given voice config and write WAV to output_path.
        Returns (sample_rate, duration_seconds).
        """
        _import_deps()

        model_name = self._model_name_for_voice(voice)
        model      = self._ensure_model(model_name)
        vtype      = voice["type"]

        if vtype == "preset":
            wavs, sr = model.generate_custom_voice(
                text=text,
                language=voice.get("language", "Auto") or "Auto",
                speaker=voice["speaker"],
                **_instruct_kwargs(voice.get("instruct")),
            )

        elif vtype == "designed":
            wavs, sr = model.generate_voice_design(
                text=text,
                language="Auto",
                instruct=voice["description"],
            )

        elif vtype == "cloned":
            ref_audio = voice.get("reference_audio")
            if not ref_audio:
                raise ValueError("Cloned voice has no reference audio.")
            ref_text  = voice.get("transcription", "") or ""
            wavs, sr  = model.generate_voice_clone(
                text=text,
                language="Auto",
                ref_audio=ref_audio,
                ref_text=ref_text or None,
                x_vector_only_mode=(not ref_text),
            )
        else:
            raise ValueError(f"Unsupported voice type: {vtype}")

        audio = wavs[0]
        audio, sr = _apply_speed(audio, sr, speed)
        duration = len(audio) / sr

        output_path.parent.mkdir(parents=True, exist_ok=True)
        _sf.write(str(output_path), audio, sr)

        return sr, duration

    def synthesize_preview(self, voice: dict, text: str, output_path: Path, speed: float = 1.0) -> Tuple[int, float]:
        """Synthesize a short preview (first sentence or ~300 chars)."""
        preview_text = _extract_preview_text(text, max_chars=300)
        return self.synthesize(voice, preview_text, output_path, speed=speed)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _instruct_kwargs(instruct: Optional[str]) -> dict:
    """Return {'instruct': instruct} only if non-empty."""
    if instruct and instruct.strip():
        return {"instruct": instruct.strip()}
    return {}


_WEIGHT_FILES = (
    "model.safetensors",
    "model.safetensors.index.json",
    "pytorch_model.bin",
    "pytorch_model.bin.index.json",
)

def _has_model_weights(path: Path) -> bool:
    """Return True only when the model directory contains actual weight files at its root."""
    return path.is_dir() and any((path / f).exists() for f in _WEIGHT_FILES)


def _extract_preview_text(text: str, max_chars: int = 300) -> str:
    """Get the first complete sentence(s) up to max_chars."""
    text = text.strip()
    if len(text) <= max_chars:
        return text
    # Try to break at sentence boundary
    for end_char in ('.', '!', '?', '\n'):
        idx = text.find(end_char, 80)
        if 0 < idx <= max_chars:
            return text[:idx + 1].strip()
    return text[:max_chars].strip() + "…"

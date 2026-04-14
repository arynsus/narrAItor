"""Data layer — voices, projects, chapters stored as JSON files."""

import json
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional


# ── Atomic JSON helpers ────────────────────────────────────────────────────────

def _read_json(path: Path, default: Any = None) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default if default is not None else {}


def _write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", dir=path.parent, delete=False, suffix=".tmp", encoding="utf-8"
    ) as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        tmp = f.name
    os.replace(tmp, path)


def _new_id() -> str:
    return str(uuid.uuid4())


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


# ── Store ─────────────────────────────────────────────────────────────────────

class Store:
    def __init__(self, data_dir: Path):
        self.data_dir   = data_dir
        self.audio_dir  = data_dir / "audio"
        self.proj_dir   = data_dir / "projects"
        self._voices_path = data_dir / "voices.json"

        self.audio_dir.mkdir(parents=True, exist_ok=True)
        self.proj_dir.mkdir(parents=True, exist_ok=True)

    # ── Voices ────────────────────────────────────────────────────────────────

    def list_voices(self) -> List[Dict]:
        return _read_json(self._voices_path, {"voices": []})["voices"]

    def get_voice(self, voice_id: str) -> Optional[Dict]:
        return next((v for v in self.list_voices() if v["id"] == voice_id), None)

    def create_voice(self, data: Dict) -> Dict:
        voices = self.list_voices()
        voice = {
            "id":           _new_id(),
            "created_at":   _now(),
            **data,
        }
        voices.append(voice)
        _write_json(self._voices_path, {"voices": voices})
        return voice

    def update_voice(self, voice_id: str, data: Dict) -> Optional[Dict]:
        voices = self.list_voices()
        for i, v in enumerate(voices):
            if v["id"] == voice_id:
                voices[i] = {**v, **data, "id": voice_id}
                _write_json(self._voices_path, {"voices": voices})
                return voices[i]
        return None

    def delete_voice(self, voice_id: str) -> bool:
        voices = self.list_voices()
        filtered = [v for v in voices if v["id"] != voice_id]
        if len(filtered) == len(voices):
            return False
        _write_json(self._voices_path, {"voices": filtered})
        # Remove audio files
        for f in self.audio_dir.glob(f"voice_{voice_id}*"):
            try: f.unlink()
            except: pass
        return True

    # ── Voice audio ───────────────────────────────────────────────────────────

    def voice_preview_path(self, voice_id: str) -> Path:
        return self.audio_dir / f"voice_{voice_id}_preview.wav"

    def set_voice_preview(self, voice_id: str, audio_path: Path) -> None:
        dest = self.voice_preview_path(voice_id)
        if str(audio_path) != str(dest):
            shutil.copy2(audio_path, dest)
        # Update voice record
        voices = self.list_voices()
        for v in voices:
            if v["id"] == voice_id:
                v["has_preview"] = True
        _write_json(self._voices_path, {"voices": voices})

    # ── Projects ──────────────────────────────────────────────────────────────

    def list_projects(self) -> List[Dict]:
        projects = []
        for proj_dir in sorted(self.proj_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            meta_path = proj_dir / "metadata.json"
            if proj_dir.is_dir() and meta_path.exists():
                meta = _read_json(meta_path)
                # Count chapters
                chapters = _read_json(proj_dir / "chapters.json", {"chapters": []})["chapters"]
                meta["chapter_count"] = len(chapters)
                meta["has_cover"] = (proj_dir / "cover.jpg").exists() or (proj_dir / "cover.png").exists()
                projects.append(meta)
        return projects

    def get_project(self, project_id: str) -> Optional[Dict]:
        path = self.proj_dir / project_id / "metadata.json"
        if not path.exists():
            return None
        meta = _read_json(path)
        chapters = _read_json(self.proj_dir / project_id / "chapters.json", {"chapters": []})["chapters"]
        meta["chapter_count"] = len(chapters)
        meta["has_cover"] = self._cover_path(project_id) is not None
        return meta

    def create_project(self, data: Dict) -> Dict:
        project_id = _new_id()
        proj_dir = self.proj_dir / project_id
        proj_dir.mkdir(parents=True, exist_ok=True)
        (proj_dir / "audio").mkdir(exist_ok=True)

        meta = {
            "id":         project_id,
            "created_at": _now(),
            "updated_at": _now(),
            **data,
        }
        _write_json(proj_dir / "metadata.json", meta)
        _write_json(proj_dir / "chapters.json", {"chapters": []})
        return meta

    def update_project(self, project_id: str, data: Dict) -> Optional[Dict]:
        path = self.proj_dir / project_id / "metadata.json"
        if not path.exists():
            return None
        meta = _read_json(path)
        meta.update(data)
        meta["updated_at"] = _now()
        _write_json(path, meta)
        return meta

    def delete_project(self, project_id: str) -> bool:
        proj_dir = self.proj_dir / project_id
        if not proj_dir.exists():
            return False
        shutil.rmtree(proj_dir)
        return True

    def save_cover(self, project_id: str, file_content: bytes, extension: str = "jpg") -> Path:
        proj_dir = self.proj_dir / project_id
        # Remove old cover
        for ext in ("jpg", "png", "jpeg", "webp"):
            old = proj_dir / f"cover.{ext}"
            if old.exists():
                old.unlink()
        path = proj_dir / f"cover.{extension.lstrip('.')}"
        path.write_bytes(file_content)
        return path

    def _cover_path(self, project_id: str) -> Optional[Path]:
        for ext in ("jpg", "png", "jpeg", "webp"):
            p = self.proj_dir / project_id / f"cover.{ext}"
            if p.exists():
                return p
        return None

    def get_cover_path(self, project_id: str) -> Optional[Path]:
        return self._cover_path(project_id)

    # ── Chapters ──────────────────────────────────────────────────────────────

    def _chapters_path(self, project_id: str) -> Path:
        return self.proj_dir / project_id / "chapters.json"

    def list_chapters(self, project_id: str) -> List[Dict]:
        data = _read_json(self._chapters_path(project_id), {"chapters": []})
        chapters = data.get("chapters", [])
        # Sort by order field
        return sorted(chapters, key=lambda c: c.get("order", 0))

    def add_chapters(self, project_id: str, items: List[Dict]) -> List[Dict]:
        existing = self.list_chapters(project_id)
        max_order = max((c.get("order", 0) for c in existing), default=-1)
        new_chapters = []
        for i, item in enumerate(items):
            ch = {
                "id":         _new_id(),
                "order":      max_order + 1 + i,
                "status":     "draft",
                "title":      item.get("title", f"Chapter {len(existing) + i + 1}"),
                "text":       item.get("text", ""),
                "voice_id":   item.get("voice_id"),
                "audio_path": None,
                "preview_audio_path": None,
                "duration_seconds": None,
                "created_at": _now(),
                "updated_at": _now(),
            }
            new_chapters.append(ch)
        all_chapters = existing + new_chapters
        _write_json(self._chapters_path(project_id), {"chapters": all_chapters})
        return new_chapters

    def get_chapter(self, chapter_id: str) -> Optional[Dict]:
        # Search across all projects
        for proj_dir in self.proj_dir.iterdir():
            if not proj_dir.is_dir():
                continue
            chapters = _read_json(proj_dir / "chapters.json", {"chapters": []})["chapters"]
            ch = next((c for c in chapters if c["id"] == chapter_id), None)
            if ch:
                ch["project_id"] = proj_dir.name
                return ch
        return None

    def find_project_for_chapter(self, chapter_id: str) -> Optional[str]:
        for proj_dir in self.proj_dir.iterdir():
            if not proj_dir.is_dir():
                continue
            chapters = _read_json(proj_dir / "chapters.json", {"chapters": []})["chapters"]
            if any(c["id"] == chapter_id for c in chapters):
                return proj_dir.name
        return None

    def update_chapter(self, chapter_id: str, data: Dict) -> Optional[Dict]:
        project_id = self.find_project_for_chapter(chapter_id)
        if not project_id:
            return None
        path = self._chapters_path(project_id)
        chapters_data = _read_json(path, {"chapters": []})
        chapters = chapters_data["chapters"]
        for i, ch in enumerate(chapters):
            if ch["id"] == chapter_id:
                # Handle clear_audio flag
                if data.pop("clear_audio", False):
                    # Remove audio files
                    audio_dir = self.proj_dir / project_id / "audio"
                    for pat in [f"{chapter_id}.wav", f"{chapter_id}_preview.wav"]:
                        p = audio_dir / pat
                        if p.exists():
                            try: p.unlink()
                            except: pass
                    chapters[i].update({"audio_path": None, "preview_audio_path": None, "status": "draft", "duration_seconds": None})
                chapters[i].update({k: v for k, v in data.items() if k not in ("id", "created_at", "project_id")})
                chapters[i]["updated_at"] = _now()
                _write_json(path, {"chapters": chapters})
                return chapters[i]
        return None

    def delete_chapter(self, chapter_id: str) -> bool:
        project_id = self.find_project_for_chapter(chapter_id)
        if not project_id:
            return False
        path = self._chapters_path(project_id)
        chapters_data = _read_json(path, {"chapters": []})
        chapters = chapters_data["chapters"]
        filtered = [c for c in chapters if c["id"] != chapter_id]
        # Re-order
        for i, c in enumerate(filtered):
            c["order"] = i
        _write_json(path, {"chapters": filtered})
        # Remove audio
        audio_dir = self.proj_dir / project_id / "audio"
        for pat in [f"{chapter_id}.wav", f"{chapter_id}_preview.wav"]:
            p = audio_dir / pat
            if p.exists():
                try: p.unlink()
                except: pass
        return True

    def reorder_chapters(self, project_id: str, ids: List[str]) -> None:
        path = self._chapters_path(project_id)
        chapters_data = _read_json(path, {"chapters": []})
        chapters = chapters_data["chapters"]
        id_to_ch = {c["id"]: c for c in chapters}
        reordered = []
        for i, cid in enumerate(ids):
            if cid in id_to_ch:
                id_to_ch[cid]["order"] = i
                reordered.append(id_to_ch[cid])
        _write_json(path, {"chapters": reordered})

    def chapter_audio_path(self, project_id: str, chapter_id: str, preview: bool = False) -> Path:
        suffix = "_preview" if preview else ""
        return self.proj_dir / project_id / "audio" / f"{chapter_id}{suffix}.wav"

    def set_chapter_audio(self, chapter_id: str, audio_path: Path, duration_seconds: float, preview: bool = False) -> None:
        project_id = self.find_project_for_chapter(chapter_id)
        if not project_id:
            return
        dest = self.chapter_audio_path(project_id, chapter_id, preview)
        dest.parent.mkdir(parents=True, exist_ok=True)
        if str(audio_path) != str(dest):
            shutil.copy2(audio_path, dest)

        update = {
            "updated_at": _now(),
        }
        if preview:
            update["preview_audio_path"] = str(dest)
        else:
            update["audio_path"] = str(dest)
            update["status"] = "ready"
            update["duration_seconds"] = duration_seconds

        self.update_chapter(chapter_id, update)

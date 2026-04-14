"""narrAItor FastAPI server — entry point for the Python backend."""

import argparse
import asyncio
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

from data import Store
from downloader import ModelManager
from tts import TTSEngine
from exporter import AudiobookExporter, check_ffmpeg

# ── CLI args ──────────────────────────────────────────────────────────────────

parser = argparse.ArgumentParser()
parser.add_argument("--data-dir",  required=True)
parser.add_argument("--port",      type=int, default=4892)
args = parser.parse_args()

DATA_DIR   = Path(args.data_dir)
PORT       = args.port
MODELS_DIR = DATA_DIR / "models"

# ── App init ──────────────────────────────────────────────────────────────────

app = FastAPI(title="narrAItor", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store    = Store(DATA_DIR)
models   = ModelManager(MODELS_DIR)
tts      = TTSEngine(MODELS_DIR)
exporter = AudiobookExporter(DATA_DIR)

# ── Pydantic models ────────────────────────────────────────────────────────────

class VoiceCreate(BaseModel):
    name:            str
    type:            str
    speaker:         Optional[str] = None
    language:        Optional[str] = "Auto"
    instruct:        Optional[str] = None
    description:     Optional[str] = None
    reference_audio: Optional[str] = None
    transcription:   Optional[str] = None
    model_size:      Optional[str] = "1.7B"

class VoiceUpdate(BaseModel):
    name:            Optional[str] = None
    instruct:        Optional[str] = None
    description:     Optional[str] = None
    language:        Optional[str] = None
    transcription:   Optional[str] = None

class PreviewRequest(BaseModel):
    text: str

class DraftPreviewRequest(BaseModel):
    config: Dict[str, Any]
    text:   str

class ProjectCreate(BaseModel):
    title:       str
    author:      Optional[str] = ""
    genre:       Optional[str] = ""
    description: Optional[str] = ""

class ProjectUpdate(BaseModel):
    title:       Optional[str] = None
    author:      Optional[str] = None
    genre:       Optional[str] = None
    description: Optional[str] = None

class ChapterItem(BaseModel):
    title:    str
    text:     Optional[str] = ""
    voice_id: Optional[str] = None

class ChaptersAdd(BaseModel):
    chapters: List[ChapterItem]

class ChapterUpdate(BaseModel):
    title:        Optional[str] = None
    text:         Optional[str] = None
    voice_id:     Optional[str] = None
    clear_audio:  Optional[bool] = False

class ReorderRequest(BaseModel):
    ids: List[str]

class MoveFileRequest(BaseModel):
    src:  str
    dest: str

# ── Server ping ────────────────────────────────────────────────────────────────

@app.get("/api/ping")
def ping():
    return {"ok": True}

@app.get("/api/info")
def info():
    return {
        "data_dir":    str(DATA_DIR),
        "models_dir":  str(MODELS_DIR),
        "ffmpeg":      check_ffmpeg(),
    }

# ── Models ─────────────────────────────────────────────────────────────────────

@app.get("/api/models")
def list_models():
    return {"models": models.list_models()}

@app.get("/api/models/{model_id}/download")
async def download_model(model_id: str, source: str = "huggingface"):
    async def gen():
        async for chunk in models.download_stream(model_id, source):
            yield chunk
    return StreamingResponse(gen(), media_type="text/event-stream",
                              headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.delete("/api/models/{model_id}")
def delete_model(model_id: str):
    ok = models.delete_model(model_id)
    if not ok:
        raise HTTPException(404, "Model not found")
    return {"ok": True}

# ── Voices ─────────────────────────────────────────────────────────────────────

@app.get("/api/voices")
def list_voices():
    return {"voices": store.list_voices()}

@app.post("/api/voices")
def create_voice(body: VoiceCreate):
    voice = store.create_voice(body.model_dump(exclude_none=False))
    return voice

@app.put("/api/voices/{voice_id}")
def update_voice(voice_id: str, body: VoiceUpdate):
    voice = store.update_voice(voice_id, body.model_dump(exclude_unset=True))
    if not voice:
        raise HTTPException(404, "Voice not found")
    return voice

@app.delete("/api/voices/{voice_id}")
def delete_voice(voice_id: str):
    ok = store.delete_voice(voice_id)
    if not ok:
        raise HTTPException(404, "Voice not found")
    return {"ok": True}

@app.post("/api/voices/{voice_id}/preview")
async def preview_voice(voice_id: str, body: PreviewRequest):
    voice = store.get_voice(voice_id)
    if not voice:
        raise HTTPException(404, "Voice not found")
    out = store.voice_preview_path(voice_id)
    try:
        sr, dur = await asyncio.get_event_loop().run_in_executor(
            None, tts.synthesize_preview, voice, body.text, out
        )
        store.set_voice_preview(voice_id, out)
        return {"audio_url": f"/api/voices/{voice_id}/audio", "duration": dur}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.post("/api/voices/preview-draft")
async def preview_draft_voice(body: DraftPreviewRequest):
    out = DATA_DIR / "audio" / "draft_preview.wav"
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        sr, dur = await asyncio.get_event_loop().run_in_executor(
            None, tts.synthesize_preview, body.config, body.text, out
        )
        return {"audio_url": "/api/voices/draft-preview/audio", "duration": dur}
    except Exception as e:
        raise HTTPException(500, str(e))

@app.get("/api/voices/{voice_id}/audio")
def voice_audio(voice_id: str):
    if voice_id == "draft-preview":
        path = DATA_DIR / "audio" / "draft_preview.wav"
    else:
        path = store.voice_preview_path(voice_id)
    if not path.exists():
        raise HTTPException(404, "Audio not found")
    return FileResponse(str(path), media_type="audio/wav")

# ── Projects ───────────────────────────────────────────────────────────────────

@app.get("/api/projects")
def list_projects():
    return {"projects": store.list_projects()}

@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    project = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    return project

@app.post("/api/projects")
def create_project(body: ProjectCreate):
    return store.create_project(body.model_dump())

@app.put("/api/projects/{project_id}")
def update_project(project_id: str, body: ProjectUpdate):
    project = store.update_project(project_id, body.model_dump(exclude_unset=True))
    if not project:
        raise HTTPException(404, "Project not found")
    return project

@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    ok = store.delete_project(project_id)
    if not ok:
        raise HTTPException(404, "Project not found")
    return {"ok": True}

@app.post("/api/projects/{project_id}/cover")
async def upload_cover(project_id: str, file: UploadFile = File(...)):
    content   = await file.read()
    extension = (file.filename or "cover.jpg").rsplit(".", 1)[-1].lower()
    if extension not in ("jpg", "jpeg", "png", "webp"):
        extension = "jpg"
    path = store.save_cover(project_id, content, extension)
    return {"ok": True, "path": str(path)}

@app.get("/api/projects/{project_id}/cover")
def get_project_cover(project_id: str):
    path = store.get_cover_path(project_id)
    if not path or not path.exists():
        raise HTTPException(404, "No cover")
    return FileResponse(str(path))

# ── Chapters ───────────────────────────────────────────────────────────────────

@app.get("/api/chapters/{project_id}")
def list_chapters(project_id: str):
    return {"chapters": store.list_chapters(project_id)}

@app.post("/api/chapters/{project_id}")
def add_chapters(project_id: str, body: ChaptersAdd):
    new_chapters = store.add_chapters(project_id, [c.model_dump() for c in body.chapters])
    return {"chapters": new_chapters}

@app.put("/api/chapters/{chapter_id}")
def update_chapter(chapter_id: str, body: ChapterUpdate):
    updates = body.model_dump(exclude_unset=True)
    chapter = store.update_chapter(chapter_id, updates)
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    return chapter

@app.delete("/api/chapters/{chapter_id}")
def delete_chapter(chapter_id: str):
    ok = store.delete_chapter(chapter_id)
    if not ok:
        raise HTTPException(404, "Chapter not found")
    return {"ok": True}

@app.post("/api/chapters/{project_id}/reorder")
def reorder_chapters(project_id: str, body: ReorderRequest):
    store.reorder_chapters(project_id, body.ids)
    return {"ok": True}

@app.get("/api/chapters/{chapter_id}/generate")
async def generate_chapter(chapter_id: str, preview: bool = False):
    chapter = store.get_chapter(chapter_id)
    if not chapter:
        raise HTTPException(404, "Chapter not found")

    voice_id = chapter.get("voice_id")
    if not voice_id:
        raise HTTPException(400, "Chapter has no voice assigned")

    voice = store.get_voice(voice_id)
    if not voice:
        raise HTTPException(404, f"Voice '{voice_id}' not found")

    text = chapter.get("text", "").strip()
    if not text:
        raise HTTPException(400, "Chapter has no text")

    project_id = chapter.get("project_id") or store.find_project_for_chapter(chapter_id)
    if not project_id:
        raise HTTPException(500, "Cannot determine project for chapter")

    async def gen():
        yield _sse({"status": "generating", "message": "Loading AI model…"})

        out_path = store.chapter_audio_path(project_id, chapter_id, preview)

        try:
            store.update_chapter(chapter_id, {"status": "generating"})
            yield _sse({"status": "generating", "message": "Synthesising speech…"})

            loop = asyncio.get_event_loop()
            if preview:
                sr, dur = await loop.run_in_executor(None, tts.synthesize_preview, voice, text, out_path)
            else:
                sr, dur = await loop.run_in_executor(None, tts.synthesize, voice, text, out_path)

            store.set_chapter_audio(chapter_id, out_path, dur, preview)

            yield _sse({
                "status":           "done",
                "audio_path":       str(out_path),
                "duration_seconds": dur,
                "preview":          preview,
            })

        except Exception as e:
            store.update_chapter(chapter_id, {"status": "error"})
            yield _sse({"status": "error", "error": str(e)})

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.get("/api/chapters/{chapter_id}/audio")
def chapter_audio(chapter_id: str):
    chapter = store.get_chapter(chapter_id)
    if not chapter:
        raise HTTPException(404, "Chapter not found")
    audio_path = chapter.get("audio_path") or chapter.get("preview_audio_path")
    if not audio_path or not Path(audio_path).exists():
        raise HTTPException(404, "Audio not generated yet")
    return FileResponse(str(audio_path), media_type="audio/wav")

# ── Export ─────────────────────────────────────────────────────────────────────

@app.get("/api/export/{project_id}/m4b")
async def export_m4b(project_id: str, bitrate: str = "128k"):
    project  = store.get_project(project_id)
    if not project:
        raise HTTPException(404, "Project not found")
    chapters = store.list_chapters(project_id)
    cover    = store.get_cover_path(project_id)

    async def gen():
        async for chunk in exporter.export_m4b_stream(project_id, chapters, project, cover, bitrate):
            yield chunk

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.post("/api/export/move")
async def move_export(body: MoveFileRequest):
    """Move exported file to user-chosen destination."""
    import shutil
    src, dest = Path(body.src), Path(body.dest)
    if not src.exists():
        raise HTTPException(404, "Source file not found")
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(src), str(dest))
    return {"ok": True}

# ── Helpers ────────────────────────────────────────────────────────────────────

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"

# ── Entry point ────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"[narrAItor] Starting server on port {PORT}")
    print(f"[narrAItor] Data directory: {DATA_DIR}")
    uvicorn.run(app, host="127.0.0.1", port=PORT, log_level="warning")

---
name: narrAItor project overview
description: Core architecture, tech stack, and file structure for narrAItor
type: project
---

narrAItor is an Electron desktop app for AI-powered audiobook creation using Qwen3-TTS models.

**Stack:** Electron + Vanilla JS frontend, Python FastAPI backend (port 4892), JSON file persistence.

**Key files:**
- `src/pages/books.js` — Library page (project CRUD)
- `src/pages/booth.js` — Recording studio (chapters, queue, generation)
- `src/pages/casting.js` — Voice library
- `src/pages/settings.js` — Settings + model download
- `src/components.js` — Toast, Modal, AudioPlayer shared components
- `src/api.js` — API client wrapper
- `python/server.py` — FastAPI entry point
- `python/tts.py` — TTS engine wrapper (Qwen3-TTS)
- `python/data.py` — JSON-based data persistence
- `python/exporter.py` — M4B audiobook export via ffmpeg

**Data location:** `~/.config/narrAItor/` — voices.json, projects/{id}/metadata.json + chapters.json + audio/

**Why:** Offline, privacy-preserving TTS audiobook generation tool for personal use.

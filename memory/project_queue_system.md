---
name: Generation queue system
description: Client-side sequential TTS generation queue in booth.js
type: project
---

Queue is managed entirely client-side in `booth.js` as module-level state (`queue[]`, `queueRunning`, `queueExpanded`).

**Design:** Sequential — processes one job at a time (GPU-bound TTS). `runQueue()` loops through `pending` jobs, calling `processJob()` which wraps an EventSource in a Promise.

**Job states:** `pending → generating → done | error`

**Key functions:**
- `enqueueChapters(ids)` — adds jobs, skips chapters without voice/text or already queued
- `enqueueAll()` — queues all eligible chapters  
- `cancelQueueJob(id)` — cancels pending/generating, resets chapter status to draft
- `runQueue()` / `processJob()` — async sequential processor
- `renderQueue()` — updates left-panel queue UI (called from processJob callbacks)

**Speed control:** Stored per-chapter as `chapter.speed` (float 0.5–2.0). Saved via ChapterUpdate API. Backend reads it at generation time and applies `scipy.signal.resample` for pitch-preserving time stretch.

**UI location:** Queue panel in left sidebar (between chapter list and export button), collapsible.

**How to apply:** When adding generation features or modifying booth, respect this queue architecture — do not revert to direct EventSource calls for full generation.

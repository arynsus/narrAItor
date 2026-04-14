"""M4B audiobook export using ffmpeg."""

import asyncio
import json
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import AsyncGenerator, List, Optional


def check_ffmpeg() -> bool:
    """Return True if ffmpeg is available in PATH."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True, timeout=5
        )
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def get_audio_duration(wav_path: Path) -> float:
    """Get audio duration in seconds using soundfile."""
    try:
        import soundfile as sf
        info = sf.info(str(wav_path))
        return info.duration
    except Exception:
        return 0.0


class AudiobookExporter:
    def __init__(self, data_dir: Path):
        self.data_dir = data_dir

    async def export_m4b_stream(
        self,
        project_id: str,
        chapters: List[dict],
        project_meta: dict,
        cover_path: Optional[Path],
        bitrate: str = "128k",
    ) -> AsyncGenerator[str, None]:
        """Async generator yielding SSE progress events."""
        loop       = asyncio.get_event_loop()
        progress_q: asyncio.Queue = asyncio.Queue()

        def _run():
            try:
                output_path = self._do_export(
                    project_id, chapters, project_meta, cover_path, bitrate,
                    on_progress=lambda pct, msg: loop.call_soon_threadsafe(
                        progress_q.put_nowait,
                        {"status": "progress", "percent": pct, "message": msg}
                    )
                )
                loop.call_soon_threadsafe(
                    progress_q.put_nowait,
                    {"status": "done", "percent": 100, "output_path": str(output_path)}
                )
            except Exception as e:
                loop.call_soon_threadsafe(
                    progress_q.put_nowait,
                    {"status": "error", "error": str(e)}
                )

        threading.Thread(target=_run, daemon=True).start()

        while True:
            try:
                update = await asyncio.wait_for(progress_q.get(), timeout=5.0)
            except asyncio.TimeoutError:
                yield _sse({"status": "progress", "percent": 0, "message": "Working…"})
                continue

            yield _sse(update)
            if update.get("status") in ("done", "error"):
                break

    def _do_export(
        self,
        project_id: str,
        chapters: List[dict],
        project_meta: dict,
        cover_path: Optional[Path],
        bitrate: str,
        on_progress,
    ) -> Path:

        if not check_ffmpeg():
            raise RuntimeError(
                "ffmpeg not found. Install ffmpeg and make sure it's in your PATH."
            )

        # Only chapters with audio
        ready_chapters = [c for c in chapters if c.get("audio_path")]
        if not ready_chapters:
            raise RuntimeError("No chapters have generated audio. Generate audio for at least one chapter first.")

        on_progress(2, "Preparing audio files…")

        export_dir = self.data_dir / "projects" / project_id / "export"
        export_dir.mkdir(parents=True, exist_ok=True)

        title  = project_meta.get("title", "Audiobook")
        author = project_meta.get("author", "")
        safe_title = "".join(c for c in title if c.isalnum() or c in " -_").strip()
        output_path = export_dir / f"{safe_title or 'audiobook'}.m4b"

        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)

            # ── Step 1: Convert each WAV to AAC ───────────────────────────────
            aac_files = []
            durations = []
            total = len(ready_chapters)

            for i, ch in enumerate(ready_chapters):
                on_progress(5 + int(60 * i / total), f"Encoding chapter {i + 1}/{total}: {ch.get('title', '')}…")

                wav_path = Path(ch["audio_path"])
                if not wav_path.exists():
                    continue

                aac_path = tmp_dir / f"ch_{i:04d}.aac"
                _run_ffmpeg([
                    "ffmpeg", "-y", "-i", str(wav_path),
                    "-c:a", "aac", "-b:a", bitrate,
                    str(aac_path)
                ])
                dur = get_audio_duration(wav_path)
                aac_files.append(aac_path)
                durations.append(dur)

            if not aac_files:
                raise RuntimeError("Could not encode any audio files.")

            on_progress(68, "Concatenating chapters…")

            # ── Step 2: Concatenate AAC files ──────────────────────────────────
            concat_list = tmp_dir / "concat.txt"
            with open(concat_list, "w", encoding="utf-8") as f:
                for aac in aac_files:
                    f.write(f"file '{aac}'\n")

            combined_aac = tmp_dir / "combined.aac"
            _run_ffmpeg([
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(concat_list),
                "-c", "copy",
                str(combined_aac)
            ])

            on_progress(75, "Writing chapter markers…")

            # ── Step 3: Build ffmetadata with chapters ────────────────────────
            metadata_path = tmp_dir / "metadata.txt"
            _write_ffmetadata(metadata_path, project_meta, ready_chapters, durations)

            on_progress(82, "Assembling M4B file…")

            # ── Step 4: Assemble final M4B ────────────────────────────────────
            cmd = [
                "ffmpeg", "-y",
                "-i", str(combined_aac),
                "-i", str(metadata_path),
            ]

            if cover_path and cover_path.exists():
                cmd += ["-i", str(cover_path)]
                cmd += [
                    "-map", "0:a",
                    "-map", "2:v",
                    "-map_metadata", "1",
                    "-c:a", "copy",
                    "-c:v", "mjpeg",
                    "-disposition:v", "attached_pic",
                    "-metadata:s:v", "title=Cover",
                    "-metadata:s:v", "comment=Cover (front)",
                ]
            else:
                cmd += [
                    "-map", "0:a",
                    "-map_metadata", "1",
                    "-c:a", "copy",
                ]

            cmd += [
                "-movflags", "+faststart",
                str(output_path)
            ]

            _run_ffmpeg(cmd)

        on_progress(98, "Finalising…")
        return output_path


# ── Helpers ───────────────────────────────────────────────────────────────────

def _write_ffmetadata(path: Path, meta: dict, chapters: List[dict], durations: List[float]) -> None:
    lines = [";FFMETADATA1"]
    if meta.get("title"):
        lines.append(f"title={meta['title']}")
    if meta.get("author"):
        lines.append(f"artist={meta['author']}")
        lines.append(f"album_artist={meta['author']}")
    if meta.get("genre"):
        lines.append(f"genre={meta['genre']}")
    if meta.get("description"):
        lines.append(f"comment={meta['description']}")
    lines.append("media_type=2")  # audiobook

    current_ms = 0
    for ch, dur in zip(chapters, durations):
        end_ms = current_ms + int(dur * 1000)
        lines += [
            "",
            "[CHAPTER]",
            "TIMEBASE=1/1000",
            f"START={current_ms}",
            f"END={end_ms}",
            f"title={ch.get('title', 'Chapter')}",
        ]
        current_ms = end_ms

    path.write_text("\n".join(lines), encoding="utf-8")


def _run_ffmpeg(cmd: list) -> None:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=3600)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg error:\n{result.stderr[-2000:]}")


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"

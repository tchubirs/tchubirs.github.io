"""Obtém o vídeo-fonte licenciado pela campanha + a legenda, se existir."""
from __future__ import annotations

import glob
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .transcript import Segment, parse_subtitles, transcribe_local


@dataclass
class SourceMedia:
    video: Path
    segments: list[Segment]
    transcript_origin: str          # "legenda-da-fonte" | "whisper-local"


def _ytdlp(args: list[str]) -> None:
    exe = shutil.which("yt-dlp")
    cmd = [exe, *args] if exe else ["python3", "-m", "yt_dlp", *args]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"yt-dlp falhou:\n{p.stderr[-1500:]}")


def fetch_source(url_or_path: str, workdir: str | Path,
                 sub_langs: str = "en,pt,es") -> SourceMedia:
    """Baixa (ou copia) a fonte. Prefere legenda pronta; só transcreve se faltar."""
    wd = Path(workdir)
    wd.mkdir(parents=True, exist_ok=True)

    local = Path(url_or_path)
    if local.exists():
        video = wd / f"source{local.suffix or '.mp4'}"
        if video.resolve() != local.resolve():
            shutil.copy2(local, video)
        subs = sorted(glob.glob(str(local.parent / f"{local.stem}*.vtt"))
                      + glob.glob(str(local.parent / f"{local.stem}*.srt")))
    else:
        _ytdlp([
            "-f", "bv*[height<=1080]+ba/b[height<=1080]/b",
            "--merge-output-format", "mp4",
            "--write-subs", "--write-auto-subs",
            "--sub-langs", sub_langs, "--sub-format", "vtt/srt",
            "--no-playlist", "--retries", "5",
            "-o", str(wd / "source.%(ext)s"),
            url_or_path,
        ])
        cands = [p for p in wd.glob("source.*")
                 if p.suffix.lower() in (".mp4", ".mkv", ".webm", ".mov")]
        if not cands:
            raise RuntimeError("yt-dlp não produziu arquivo de vídeo.")
        video = max(cands, key=lambda p: p.stat().st_size)
        subs = sorted(glob.glob(str(wd / "source*.vtt"))
                      + glob.glob(str(wd / "source*.srt")))

    for s in subs:
        try:
            segs = parse_subtitles(s)
            if len(segs) >= 5:
                return SourceMedia(video, segs, "legenda-da-fonte")
        except Exception:
            continue

    return SourceMedia(video, transcribe_local(video), "whisper-local")

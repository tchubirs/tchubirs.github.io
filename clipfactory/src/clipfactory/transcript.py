"""Transcrição com timestamps.

Ordem de preferência (do mais barato para o mais caro):
  1. Legenda já existente na fonte (VTT/SRT baixado pelo yt-dlp)  -> R$ 0,00
  2. faster-whisper local                                          -> R$ 0,00 + CPU
Nunca chamamos API paga de transcrição: o custo por clipe é o número que
decide se esta operação vive ou morre.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Segment:
    start: float
    end: float
    text: str


_TS = re.compile(
    r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*"
    r"(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})"
)
_TAG = re.compile(r"<[^>]+>")


def _secs(h, m, s, ms) -> float:
    return int(h or 0) * 3600 + int(m) * 60 + int(s) + int(str(ms).ljust(3, "0")) / 1000.0


def parse_subtitles(path: str | Path) -> list[Segment]:
    """Lê VTT ou SRT. Tolera as duas variantes de separador decimal."""
    raw = Path(path).read_text(encoding="utf-8", errors="replace")
    segments: list[Segment] = []
    block_text: list[str] = []
    cur: tuple[float, float] | None = None

    def flush():
        nonlocal block_text, cur
        if cur and block_text:
            text = " ".join(block_text).strip()
            text = _TAG.sub("", text)
            text = re.sub(r"\s+", " ", text).strip()
            if text:
                segments.append(Segment(cur[0], cur[1], text))
        block_text, cur = [], None

    for line in raw.splitlines():
        line = line.strip()
        if not line:
            flush()
            continue
        m = _TS.search(line)
        if m:
            flush()
            g = m.groups()
            cur = (_secs(g[0], g[1], g[2], g[3]), _secs(g[4], g[5], g[6], g[7]))
            continue
        if line.upper().startswith(("WEBVTT", "NOTE ", "KIND:", "LANGUAGE:")):
            continue
        if line.isdigit() and cur is None:
            continue  # índice de cue do SRT
        if cur is not None:
            block_text.append(line)
    flush()

    # Legenda automática do YouTube repete linhas em cascata. Deduplica
    # mantendo a primeira ocorrência de cada texto consecutivo.
    deduped: list[Segment] = []
    for s in segments:
        if deduped and s.text == deduped[-1].text:
            deduped[-1] = Segment(deduped[-1].start, max(deduped[-1].end, s.end), s.text)
            continue
        deduped.append(s)
    return deduped


def transcribe_local(video_path: str | Path, model_size: str = "base") -> list[Segment]:
    """Fallback com faster-whisper. Só roda se a fonte não tiver legenda."""
    try:
        from faster_whisper import WhisperModel
    except ImportError as e:
        raise RuntimeError(
            "A fonte não trouxe legenda e faster-whisper não está instalado.\n"
            "Rode: pip install -r requirements-whisper.txt"
        ) from e
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segs, _ = model.transcribe(str(video_path), vad_filter=True)
    return [Segment(float(s.start), float(s.end), s.text.strip()) for s in segs]


def window(segments: list[Segment], start: float, end: float) -> list[Segment]:
    """Segmentos que caem dentro de [start, end], recortados na borda."""
    out = []
    for s in segments:
        if s.end <= start or s.start >= end:
            continue
        out.append(Segment(max(s.start, start) - start,
                           min(s.end, end) - start,
                           s.text))
    return out


def to_plaintext(segments: list[Segment], with_timestamps: bool = True) -> str:
    if not with_timestamps:
        return " ".join(s.text for s in segments)
    return "\n".join(f"[{s.start:.1f}] {s.text}" for s in segments)

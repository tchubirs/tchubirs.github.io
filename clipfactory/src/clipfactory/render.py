"""Renderização vertical 9:16 com legenda queimada e gancho — via ffmpeg.

Sem API paga. O custo por clipe aqui é só CPU. É por isso que esta operação
tem custo marginal perto de zero, ao contrário de gerar vídeo com IA.
"""
from __future__ import annotations

import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .transcript import Segment, window

W, H = 1080, 1920


def ffmpeg_bin() -> str:
    """ffmpeg do sistema se houver; senão o binário estático do imageio-ffmpeg."""
    exe = shutil.which("ffmpeg")
    if exe:
        return exe
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception as e:
        raise RuntimeError(
            "ffmpeg não encontrado. Instale o ffmpeg ou `pip install imageio-ffmpeg`."
        ) from e


def ffprobe_duration(path: str | Path) -> float:
    """Duração via ffmpeg (o binário estático não traz ffprobe separado)."""
    p = subprocess.run(
        [ffmpeg_bin(), "-hide_banner", "-i", str(path)],
        capture_output=True, text=True,
    )
    import re
    m = re.search(r"Duration:\s*(\d+):(\d{2}):(\d{2})\.(\d+)", p.stderr)
    if not m:
        raise RuntimeError(f"não consegui ler a duração de {path}")
    h, mi, s, cs = m.groups()
    return int(h) * 3600 + int(mi) * 60 + int(s) + int(cs) / (10 ** len(cs))


def _ass_time(t: float) -> str:
    if t < 0:
        t = 0.0
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def _ass_escape(text: str) -> str:
    return (text.replace("\\", "\\\\").replace("{", "(").replace("}", ")")
                .replace("\n", " ").strip())


# Largura útil = PlayResX - margens. Com DejaVu Sans Bold nesses corpos, a
# largura média do glifo fica em ~0,55em, então cabem ~21 caracteres por linha
# na legenda e ~18 no gancho. Estes números foram medidos renderizando, não
# estimados: passar deles corta o texto nas bordas do quadro.
CAP_CHARS_PER_LINE = 21
CAP_MAX_LINES = 2
HOOK_CHARS_PER_LINE = 18


def _split_lines(text: str, max_chars: int) -> list[str]:
    """Quebra em linhas de no máximo max_chars, sem partir palavra."""
    lines, cur = [], ""
    for w in text.split():
        if not cur:
            cur = w
        elif len(cur) + 1 + len(w) <= max_chars:
            cur = f"{cur} {w}"
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _chunk_text(text: str, max_chars: int, max_lines: int) -> list[str]:
    """Divide um texto longo em blocos que cabem em max_lines linhas.

    Legenda longa demais não é "espremida" — vira vários cues em sequência.
    Espremer é o que fazia o texto sair pela borda do quadro.
    """
    lines = _split_lines(text, max_chars)
    return ["\\N".join(lines[i:i + max_lines])
            for i in range(0, len(lines), max_lines)] or [""]


ASS_HEADER = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,DejaVu Sans,68,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,6,3,2,60,60,320,1
Style: Hook,DejaVu Sans,80,&H0000F0FF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,100,100,0,0,1,7,4,8,70,70,300,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""


def build_ass(segments: list[Segment], hook: str | None, clip_len: float,
              hook_seconds: float = 2.6) -> str:
    """Monta o arquivo .ass com legendas + gancho no topo."""
    lines = [ASS_HEADER]
    if hook:
        hook_txt = "\\N".join(_split_lines(_ass_escape(hook), HOOK_CHARS_PER_LINE))
        lines.append(
            f"Dialogue: 1,{_ass_time(0)},{_ass_time(min(hook_seconds, clip_len))},"
            f"Hook,,0,0,0,,{hook_txt}"
        )
    for s in segments:
        end = min(s.end, clip_len)
        if end <= s.start:
            continue
        chunks = _chunk_text(_ass_escape(s.text), CAP_CHARS_PER_LINE, CAP_MAX_LINES)
        chunks = [c for c in chunks if c.strip()]
        if not chunks:
            continue
        # Reparte a duração do segmento entre os blocos, proporcional ao tamanho.
        total = sum(len(c) for c in chunks) or 1
        t = s.start
        for c in chunks:
            share = (end - s.start) * (len(c) / total)
            c_end = min(end, t + share)
            if c_end - t > 0.05:
                lines.append(
                    f"Dialogue: 0,{_ass_time(t)},{_ass_time(c_end)},Cap,,0,0,0,,{c}"
                )
            t = c_end
    return "\n".join(lines) + "\n"


def _filtergraph(style: str, has_subs: bool) -> str:
    if style == "crop":
        base = (f"[0:v]scale=-2:{H}:flags=lanczos,crop={W}:{H}:(iw-{W})/2:0,"
                f"setsar=1[base]")
    else:  # blur — não perde nada do enquadramento original
        base = (
            f"[0:v]scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,"
            f"crop={W}:{H},boxblur=28:2[bg];"
            f"[0:v]scale={W}:-2:flags=lanczos[fg];"
            f"[bg][fg]overlay=(W-w)/2:(H-h)/2,setsar=1[base]"
        )
    if has_subs:
        # 'subs.ass' é relativo ao cwd do processo — evita inferno de escape
        return base + ";[base]ass=subs.ass[v]"
    return base + ";[base]null[v]"


@dataclass
class RenderResult:
    path: Path
    duration: float
    style: str
    captions: bool


def render_clip(
    source: str | Path,
    out_path: str | Path,
    start_s: float,
    end_s: float,
    *,
    segments: list[Segment] | None = None,
    hook: str | None = None,
    style: str = "blur",
    captions: bool = True,
    workdir: str | Path | None = None,
) -> RenderResult:
    """Corta [start_s, end_s] da fonte e entrega um MP4 vertical pronto a publicar."""
    source, out_path = Path(source).resolve(), Path(out_path).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    clip_len = round(end_s - start_s, 3)
    if clip_len <= 0:
        raise ValueError(f"janela inválida: {start_s} -> {end_s}")

    wd = Path(workdir) if workdir else out_path.parent / f".work_{out_path.stem}"
    wd.mkdir(parents=True, exist_ok=True)

    has_subs = False
    if captions and segments:
        local = window(segments, start_s, end_s)
        if local:
            (wd / "subs.ass").write_text(
                build_ass(local, hook, clip_len), encoding="utf-8")
            has_subs = True
    if captions and not has_subs and hook:
        (wd / "subs.ass").write_text(build_ass([], hook, clip_len), encoding="utf-8")
        has_subs = True

    cmd = [
        ffmpeg_bin(), "-y", "-hide_banner", "-loglevel", "error",
        # -ss antes do -i faz seek rápido; -accurate_seek garante o frame certo
        "-accurate_seek", "-ss", f"{start_s:.3f}", "-t", f"{clip_len:.3f}",
        "-i", str(source),
        "-filter_complex", _filtergraph(style, has_subs),
        "-map", "[v]", "-map", "0:a?",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
        "-profile:v", "high", "-pix_fmt", "yuv420p",
        "-r", "30", "-g", "60",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        # -14 LUFS é o alvo que TikTok/YouTube/IG normalizam
        "-af", "loudnorm=I=-14:TP=-1.5:LRA=11",
        "-movflags", "+faststart",
        str(out_path),
    ]
    proc = subprocess.run(cmd, cwd=wd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(
            f"ffmpeg falhou ({proc.returncode}):\n{proc.stderr[-2500:]}"
        )
    if not out_path.exists() or out_path.stat().st_size < 1024:
        raise RuntimeError(f"ffmpeg terminou mas {out_path} está vazio")

    return RenderResult(path=out_path, duration=clip_len, style=style,
                        captions=has_subs)

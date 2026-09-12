"""Obtém o vídeo-fonte licenciado pela campanha + a legenda, se existir."""
from __future__ import annotations

import glob
import json
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

from .transcript import Segment, parse_subtitles, transcribe_local


#: Uma pasta partilhada do Drive, em qualquer das formas que o Google usa.
PASTA_DRIVE = re.compile(r"drive\.google\.com/drive/(?:u/\d+/)?folders/", re.I)


@dataclass
class Materiais:
    """O que a pasta do brief deu, e o que não deu.

    Uma pasta de materiais tem vídeo, mas também tem PDF, imagem e Google Doc.
    Falhar a pasta inteira porque um PDF não é vídeo seria trocar o trabalho
    todo por um ficheiro que nunca ia servir — por isso o que não se baixa fica
    anotado em `ignorados` e a execução continua.
    """

    fontes: list["SourceMedia"]
    ignorados: list[tuple[str, str]]


@dataclass
class SourceMedia:
    video: Path
    segments: list[Segment]
    transcript_origin: str          # "legenda-da-fonte" | "whisper-local"
    url: str = ""                   # de onde veio, para o ledger saber dizer


def _ytdlp(args: list[str]) -> None:
    exe = shutil.which("yt-dlp")
    cmd = [exe, *args] if exe else ["python3", "-m", "yt_dlp", *args]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"yt-dlp falhou:\n{p.stderr[-1500:]}")


def _ytdlp_json(args: list[str]) -> dict:
    exe = shutil.which("yt-dlp")
    cmd = [exe, *args] if exe else ["python3", "-m", "yt_dlp", *args]
    p = subprocess.run(cmd, capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError(f"yt-dlp falhou:\n{p.stderr[-1500:]}")
    return json.loads(p.stdout or "{}")


def expandir(entrada: str) -> list[str]:
    """Uma pasta do Drive são muitas fontes. Tudo o resto é uma só."""
    if not PASTA_DRIVE.search(entrada or ""):
        return [entrada]
    dados = _ytdlp_json(["--flat-playlist", "-J", "--no-warnings", entrada])
    urls = []
    for e in dados.get("entries") or []:
        u = e.get("url") or e.get("id")
        if not u:
            continue
        u = str(u)
        urls.append(u if u.startswith("http")
                    else f"https://drive.google.com/file/d/{u}/view")
    if not urls:
        raise RuntimeError(
            "A pasta do Drive não devolveu ficheiro nenhum. Costuma ser partilha: "
            "tem de estar em 'qualquer pessoa com o link'."
        )
    return urls


def fetch_sources(entradas, workdir: str | Path,
                  sub_langs: str = "en,pt,es") -> Materiais:
    """Baixa todas as fontes do brief, cada uma na sua pasta."""
    wd = Path(workdir)
    todas: list[str] = []
    for e in entradas or []:
        todas.extend(expandir(e))

    vistas, ordenadas = set(), []
    for u in todas:                       # a mesma URL duas vezes é um clipe pago uma
        if u not in vistas:
            vistas.add(u)
            ordenadas.append(u)

    fontes, ignorados = [], []
    for i, u in enumerate(ordenadas):
        try:
            fontes.append(fetch_source(u, wd / f"{i:02d}", sub_langs))
        except Exception as e:            # PDF, imagem, Doc: não é vídeo, segue
            ignorados.append((u, str(e)[:200]))
    if not fontes:
        raise RuntimeError(
            "Nenhuma das fontes do brief deu vídeo.\n  "
            + "\n  ".join(f"{u} → {m}" for u, m in ignorados[:5])
        )
    return Materiais(fontes, ignorados)


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
                return SourceMedia(video, segs, "legenda-da-fonte", url_or_path)
        except Exception:
            continue

    return SourceMedia(video, transcribe_local(video), "whisper-local",
                       url_or_path)

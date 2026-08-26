"""Pré-voo: diz exatamente o que falta antes de gastar CPU ou tokens."""
from __future__ import annotations

import os
import shutil


def _ok(b): return "OK  " if b else "FALTA"


def run(verbose: bool = True) -> dict:
    checks: dict[str, tuple[bool, str]] = {}

    # ffmpeg
    try:
        from .render import ffmpeg_bin
        checks["ffmpeg"] = (True, ffmpeg_bin())
    except Exception as e:
        checks["ffmpeg"] = (False, str(e))

    checks["yt-dlp"] = (
        shutil.which("yt-dlp") is not None or _importable("yt_dlp"),
        "necessário para baixar a fonte da campanha",
    )
    checks["anthropic"] = (_importable("anthropic"), "pip install anthropic")
    checks["google-api-client"] = (_importable("googleapiclient"),
                                   "pip install google-api-python-client")

    checks["ANTHROPIC_API_KEY"] = (
        bool(os.environ.get("ANTHROPIC_API_KEY")),
        "sem ela a seleção cai para heurística (pior)",
    )
    yt = all(os.environ.get(k) for k in
             ("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"))
    checks["YouTube OAuth"] = (yt, "rode tools/youtube_oauth.py")
    ig = all(os.environ.get(k) for k in ("IG_USER_ID", "IG_ACCESS_TOKEN"))
    checks["Instagram (opcional)"] = (ig, "só se publish.instagram.enabled=true")
    checks["GITHUB_TOKEN (opcional)"] = (
        bool(os.environ.get("GITHUB_TOKEN")), "só necessário para Instagram")

    if verbose:
        print("\n── Pré-voo do clipfactory ──")
        for name, (ok, note) in checks.items():
            print(f"  [{_ok(ok)}] {name:26} {'' if ok else '← ' + note}")
        blockers = [n for n, (ok, _) in checks.items()
                    if not ok and "opcional" not in n
                    and n not in ("ANTHROPIC_API_KEY",)]
        print()
        if blockers:
            print(f"  Bloqueiam a execução: {', '.join(blockers)}")
        else:
            print("  Nada bloqueia. Pode rodar `clipfactory run`.")
        print()
    return {k: v[0] for k, v in checks.items()}


def _importable(mod: str) -> bool:
    import importlib.util
    return importlib.util.find_spec(mod) is not None

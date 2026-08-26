"""Publicação de Reels pela Graph API — conta Business/Creator ligada a Página.

Fluxo obrigatório da Meta: criar container -> esperar ficar FINISHED -> publicar.
Limite prático: dezenas de posts por conta por 24h (a Meta varia o número).
"""
from __future__ import annotations

import os
import time

import requests

GRAPH = "https://graph.facebook.com/v21.0"


def _creds() -> tuple[str, str]:
    missing = [k for k in ("IG_USER_ID", "IG_ACCESS_TOKEN") if not os.environ.get(k)]
    if missing:
        raise RuntimeError("Faltam credenciais do Instagram: " + ", ".join(missing))
    return os.environ["IG_USER_ID"], os.environ["IG_ACCESS_TOKEN"]


def publish_reel(video_url: str, caption: str, *, share_to_feed: bool = True,
                 timeout_s: int = 480) -> str:
    ig_user, token = _creds()

    r = requests.post(
        f"{GRAPH}/{ig_user}/media",
        data={"media_type": "REELS", "video_url": video_url,
              "caption": caption[:2200],
              "share_to_feed": "true" if share_to_feed else "false",
              "access_token": token},
        timeout=60,
    )
    r.raise_for_status()
    container = r.json()["id"]

    # A Meta baixa e transcodifica de forma assíncrona.
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        s = requests.get(f"{GRAPH}/{container}",
                         params={"fields": "status_code,status",
                                 "access_token": token}, timeout=30)
        s.raise_for_status()
        code = s.json().get("status_code")
        if code == "FINISHED":
            break
        if code == "ERROR":
            raise RuntimeError(f"Instagram rejeitou o vídeo: {s.json().get('status')}")
        time.sleep(10)
    else:
        raise TimeoutError("container do Instagram não ficou pronto a tempo")

    p = requests.post(f"{GRAPH}/{ig_user}/media_publish",
                      data={"creation_id": container, "access_token": token},
                      timeout=60)
    p.raise_for_status()
    return p.json()["id"]


def fetch_reel_views(media_ids: list[str]) -> dict[str, int]:
    if not media_ids:
        return {}
    _, token = _creds()
    out: dict[str, int] = {}
    for mid in media_ids:
        try:
            r = requests.get(f"{GRAPH}/{mid}/insights",
                             params={"metric": "plays,reach",
                                     "access_token": token}, timeout=30)
            r.raise_for_status()
            for m in r.json().get("data", []):
                if m["name"] == "plays":
                    out[mid] = int(m["values"][0]["value"])
        except Exception:
            continue          # métrica indisponível não pode derrubar o run
    return out

"""Publicação de Shorts pela YouTube Data API v3 — caminho oficial.

Por que isto importa: é o único canal de distribuição desta operação que pode
ser 100% automatizado hoje sem violar termos. TikTok exige auditoria do
Content Posting API (semanas, e antes disso todo post sai SELF_ONLY), e o
Instagram exige conta Business ligada a uma Página. O YouTube não pede nada
disso — OAuth do próprio dono e pronto.
"""
from __future__ import annotations

import os
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly"]


def _service():
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    missing = [k for k in ("YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET",
                           "YOUTUBE_REFRESH_TOKEN") if not os.environ.get(k)]
    if missing:
        raise RuntimeError(
            "Faltam credenciais do YouTube: " + ", ".join(missing) +
            "\nRode: python tools/youtube_oauth.py (uma vez, ~10 minutos)."
        )
    creds = Credentials(
        token=None,
        refresh_token=os.environ["YOUTUBE_REFRESH_TOKEN"],
        client_id=os.environ["YOUTUBE_CLIENT_ID"],
        client_secret=os.environ["YOUTUBE_CLIENT_SECRET"],
        token_uri="https://oauth2.googleapis.com/token",
        scopes=SCOPES,
    )
    return build("youtube", "v3", credentials=creds, cache_discovery=False)


def upload_short(
    video_path: str | Path,
    *,
    title: str,
    description: str,
    tags: list[str],
    privacy: str = "public",
    category_id: str = "24",
    synthetic_content: bool = False,
    made_for_kids: bool = False,
) -> str:
    """Sobe um Short e devolve o videoId. Upload retomável (aguenta rede ruim)."""
    from googleapiclient.http import MediaFileUpload

    yt = _service()
    body = {
        "snippet": {
            "title": title[:100],
            "description": description[:5000],
            "tags": tags[:15],
            "categoryId": category_id,
        },
        "status": {
            "privacyStatus": privacy,
            "selfDeclaredMadeForKids": made_for_kids,
            # Política do YouTube: conteúdo sintético realista precisa ser
            # declarado. Declarar a mais não custa nada; a menos custa o canal.
            "containsSyntheticMedia": bool(synthetic_content),
        },
    }
    media = MediaFileUpload(str(video_path), chunksize=4 * 1024 * 1024,
                            resumable=True, mimetype="video/mp4")
    req = yt.videos().insert(part="snippet,status", body=body, media_body=media)

    response = None
    while response is None:
        _, response = req.next_chunk()
    return response["id"]


def fetch_view_counts(video_ids: list[str]) -> dict[str, int]:
    """Views públicas dos vídeos. 1 unidade de quota por lote de até 50."""
    if not video_ids:
        return {}
    yt = _service()
    out: dict[str, int] = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        r = yt.videos().list(part="statistics,status",
                             id=",".join(batch)).execute()
        for item in r.get("items", []):
            stats = item.get("statistics", {})
            out[item["id"]] = int(stats.get("viewCount", 0))
    return out


def check_strikes(video_ids: list[str]) -> dict[str, str]:
    """Vídeos que sumiram ou foram rejeitados — sinal antecipado de strike."""
    if not video_ids:
        return {}
    yt = _service()
    alive, problems = set(), {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        r = yt.videos().list(part="status", id=",".join(batch)).execute()
        for item in r.get("items", []):
            alive.add(item["id"])
            st = item.get("status", {})
            if st.get("uploadStatus") == "rejected":
                problems[item["id"]] = f"rejeitado: {st.get('rejectionReason','?')}"
            elif st.get("privacyStatus") == "private":
                problems[item["id"]] = "virou privado sem você mandar"
    for vid in video_ids:
        if vid not in alive:
            problems[vid] = "sumiu da API — removido ou derrubado"
    return problems

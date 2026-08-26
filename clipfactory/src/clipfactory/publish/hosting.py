"""Hospedagem pública temporária do MP4 usando GitHub Releases como CDN.

Existe porque a Graph API do Instagram não aceita upload direto de arquivo:
ela exige uma URL pública que os servidores da Meta possam baixar. Em vez de
pagar por um bucket, usamos um release do próprio repositório — gratuito,
já autenticado pelo GITHUB_TOKEN que o Actions injeta sozinho.
"""
from __future__ import annotations

import os
from pathlib import Path

import requests

API = "https://api.github.com"
TAG = "clipfactory-assets"


def _headers() -> dict:
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        raise RuntimeError("GITHUB_TOKEN ausente — necessário para hospedar o MP4.")
    return {"Authorization": f"Bearer {token}",
            "Accept": "application/vnd.github+json"}


def _repo() -> str:
    r = os.environ.get("GITHUB_REPO") or os.environ.get("GITHUB_REPOSITORY")
    if not r or "/" not in r:
        raise RuntimeError("GITHUB_REPO precisa estar no formato dono/repositorio")
    return r


def _ensure_release() -> dict:
    repo = _repo()
    r = requests.get(f"{API}/repos/{repo}/releases/tags/{TAG}",
                     headers=_headers(), timeout=30)
    if r.status_code == 200:
        return r.json()
    r = requests.post(
        f"{API}/repos/{repo}/releases", headers=_headers(), timeout=30,
        json={"tag_name": TAG, "name": "clipfactory assets",
              "body": "Hospedagem temporária de MP4 para publicação no Instagram. "
                      "Apagável a qualquer momento.",
              "draft": False, "prerelease": True},
    )
    r.raise_for_status()
    return r.json()


def publish_temp_url(path: str | Path) -> tuple[str, int]:
    """Sobe o arquivo e devolve (url_publica, asset_id)."""
    path = Path(path)
    rel = _ensure_release()
    upload_url = rel["upload_url"].split("{")[0]
    # Remove asset homônimo de execução anterior
    for a in rel.get("assets", []):
        if a["name"] == path.name:
            requests.delete(f"{API}/repos/{_repo()}/releases/assets/{a['id']}",
                            headers=_headers(), timeout=30)
    with path.open("rb") as fh:
        r = requests.post(
            f"{upload_url}?name={path.name}",
            headers={**_headers(), "Content-Type": "video/mp4"},
            data=fh, timeout=600,
        )
    r.raise_for_status()
    asset = r.json()
    return asset["browser_download_url"], asset["id"]


def remove_temp(asset_id: int) -> None:
    """Apaga o asset depois que a Meta já baixou. Mantém o repo limpo."""
    requests.delete(f"{API}/repos/{_repo()}/releases/assets/{asset_id}",
                    headers=_headers(), timeout=30)

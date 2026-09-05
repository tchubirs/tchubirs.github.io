#!/usr/bin/env python3
"""Gera o YOUTUBE_REFRESH_TOKEN. Roda UMA vez, na sua máquina. ~10 minutos.

Antes de rodar, no Google Cloud Console (console.cloud.google.com):
  1. Criar projeto (qualquer nome).
  2. APIs e serviços → Biblioteca → ativar "YouTube Data API v3".
  3. APIs e serviços → Tela de permissão OAuth → tipo "Externo" → preencher
     nome do app e e-mail → em "Usuários de teste", adicionar SEU e-mail.
     (Não precisa publicar o app nem passar por verificação: você é o único
     usuário. App em modo de teste tem refresh token de 7 dias — por isso,
     ao terminar, volte e clique em "Publicar app". Aí o token não expira.)
  4. Credenciais → Criar credenciais → ID do cliente OAuth →
     tipo "App para computador" → baixar o JSON.
  5. Rodar:  python tools/youtube_oauth.py caminho/do/client_secret.json
"""
import json
import sys
from pathlib import Path

SCOPES = ["https://www.googleapis.com/auth/youtube.upload",
          "https://www.googleapis.com/auth/youtube.readonly"]


def main() -> int:
    try:
        from google_auth_oauthlib.flow import InstalledAppFlow
    except ImportError:
        print("Instale primeiro:  pip install -r requirements.txt")
        return 1

    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    secret = Path(sys.argv[1])
    if not secret.exists():
        print(f"Arquivo não encontrado: {secret}")
        return 1

    flow = InstalledAppFlow.from_client_secrets_file(str(secret), SCOPES)
    # access_type=offline + prompt=consent é o que faz o Google devolver
    # refresh_token. Sem os dois, ele devolve só o access token de 1 hora.
    creds = flow.run_local_server(port=0, access_type="offline",
                                  prompt="consent")

    data = json.loads(secret.read_text())
    inst = data.get("installed") or data.get("web") or {}

    print("\n" + "=" * 62)
    print("Cadastre estes 3 valores como Secrets do repositório no GitHub")
    print("(Settings → Secrets and variables → Actions → New secret):")
    print("=" * 62)
    print(f"YOUTUBE_CLIENT_ID={inst.get('client_id','')}")
    print(f"YOUTUBE_CLIENT_SECRET={inst.get('client_secret','')}")
    print(f"YOUTUBE_REFRESH_TOKEN={creds.refresh_token}")
    print("=" * 62)
    if not creds.refresh_token:
        print("\n! Sem refresh_token. Revogue o acesso do app em")
        print("  myaccount.google.com/permissions e rode de novo.")
        return 1
    print("\nGuarde também num gerenciador de senhas. Se este token vazar,")
    print("quem tiver ele publica no seu canal.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

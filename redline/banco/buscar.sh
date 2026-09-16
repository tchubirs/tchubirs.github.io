#!/bin/sh
# Traz os pares de documentos contra os quais o Redline foi medido. Nenhum e
# meu, e nenhum foi inventado: sao versoes verdadeiras do mesmo documento,
# revistas por pessoas — dois artigos cientificos com revisoes publicadas, e
# dois formularios fiscais em anos diferentes.
set -e
DESTINO="${1:-./pares}"
mkdir -p "$DESTINO"
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'

buscar() {
  nome="$1"; url="$2"
  if [ -s "$DESTINO/$nome" ]; then echo "ja ca esta: $nome"; return; fi
  curl -s -A "$UA" -L --max-time 90 -o "$DESTINO/$nome" "$url" || true
  if head -c 4 "$DESTINO/$nome" 2>/dev/null | grep -q '%PDF'; then
    echo "ok: $nome ($(wc -c < "$DESTINO/$nome") bytes)"
  else
    rm -f "$DESTINO/$nome"; echo "FALHOU: $nome  <- $url"
  fi
}

# Artigos com revisoes verdadeiras: a v1 e a versao final do mesmo texto
buscar attention-v1.pdf "https://arxiv.org/pdf/1706.03762v1"
buscar attention-v5.pdf "https://arxiv.org/pdf/1706.03762v5"
buscar bert-v1.pdf      "https://arxiv.org/pdf/1810.04805v1"
buscar bert-v2.pdf      "https://arxiv.org/pdf/1810.04805v2"

# Formularios fiscais em anos diferentes: mudancas pequenas e cirurgicas,
# que e o caso dificil — um contrato revisto mexe em duas linhas, nao em cem
buscar f941-2026.pdf    "https://www.irs.gov/pub/irs-pdf/f941.pdf"
buscar f941-2025.pdf    "https://www.irs.gov/pub/irs-prior/f941--2025.pdf"
buscar f1040sb-2026.pdf "https://www.irs.gov/pub/irs-pdf/f1040sb.pdf"
buscar f1040sb-2024.pdf "https://www.irs.gov/pub/irs-prior/f1040sb--2024.pdf"

echo
echo "documentos: $(ls "$DESTINO"/*.pdf 2>/dev/null | wc -l) de 8"

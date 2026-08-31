#!/usr/bin/env bash
# Publicar site/ em replay/, com as caches vencidas.
#
# O GitHub Pages responde com `cache-control: max-age=600` e não há como mudar
# isso. Um telemóvel que carregou a página guarda o app.js durante dez minutos
# — e como os módulos se importam uns aos outros por nome fixo, um refresh
# normal traz o HTML novo a chamar o JavaScript velho.
#
# A cura é o nome mudar quando o conteúdo muda: cada import leva ?v=<hash do
# conteúdo>. Igual em duas publicações iguais, diferente assim que algo muda.
set -euo pipefail
cd "$(dirname "$0")"
DESTINO="${1:-../replay}"

V=$(cat site/*.js site/*.css site/index.html | sha1sum | cut -c1-10)
mkdir -p "$DESTINO"
cp site/*.html site/*.js site/*.css "$DESTINO/"

for f in "$DESTINO"/*.js "$DESTINO"/index.html; do
  # `from './x.js'` e `src="app.js"` -> mesmos ficheiros, endereço novo.
  # Chavetas a serio nas referencias: `$1` seguido do hash, que comeca por um
  # digito, e lido pelo perl como UMA variavel `$15183...` — o grupo capturado
  # desaparece em silencio e a linha sai vazia. Aconteceu.
  perl -pi -e "s{(from\s+['\"])\./([a-z0-9-]+\.js)(['\"])}{\${1}./\${2}?v=$V\${3}}g" "$f"
  perl -pi -e "s{(src=\")(app\.js)(\")}{\${1}\${2}?v=$V\${3}}g" "$f"
done
perl -pi -e "s{(<span id=\"versao\">)[^<]*(</span>)}{\${1}$V\${2}}" "$DESTINO/index.html"

echo "publicado em $DESTINO  ·  versao $V"
grep -o "v=$V" "$DESTINO/app.js" | head -1

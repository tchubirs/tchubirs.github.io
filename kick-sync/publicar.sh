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
# Resolver o destino ANTES do cd. Com `cd` primeiro, um caminho relativo passa
# a ser relativo a esta pasta: um `./publicar.sh replay` a partir da raiz do
# repositorio escrevia em kick-sync/replay/ e ninguem dava por nada — o script
# dizia "publicado" e o site ficava igual.
DESTINO="$(mkdir -p "${1:-replay}" && cd "${1:-replay}" && pwd)"
cd "$(dirname "$0")"

V=$(cat site/*.js site/*.css site/index.html | sha1sum | cut -c1-10)
cp site/*.html site/*.js site/*.css "$DESTINO/"

for f in "$DESTINO"/*.js "$DESTINO"/*.html; do
  # `from './x.js'` e `src="app.js"` -> mesmos ficheiros, endereço novo.
  # Chavetas a serio nas referencias: `$1` seguido do hash, que comeca por um
  # digito, e lido pelo perl como UMA variavel `$15183...` — o grupo capturado
  # desaparece em silencio e a linha sai vazia. Aconteceu.
  perl -pi -e "s{(from\s+['\"])\./([a-z0-9-]+\.js)(['\"])}{\${1}./\${2}?v=$V\${3}}g" "$f"
  # Qualquer script local, e nao so o app.js: ha duas paginas agora, e a
  # segunda ficava presa na cache do telemovel durante dez minutos.
  perl -pi -e "s{(src=\")([a-z0-9-]+\.js)(\")}{\${1}\${2}?v=$V\${3}}g" "$f"
done
perl -pi -e "s{(<span id=\"versao\">)[^<]*(</span>)}{\${1}$V\${2}}" "$DESTINO"/*.html

echo "publicado em $DESTINO  ·  versao $V"
# Provar que o carimbo entrou mesmo, em vez de confiar. Cada pagina e cada
# ficheiro de codigo tem de o ter — foi assim que uma vez publiquei para a
# pasta errada e o script disse "publicado".
for f in "$DESTINO"/index.html "$DESTINO"/twitch.html "$DESTINO"/app.js "$DESTINO"/twitch-app.js; do
  grep -q "v=$V" "$f" || { echo "SEM CARIMBO: $f" >&2; exit 1; }
done
echo "carimbo v=$V em todas as paginas" 

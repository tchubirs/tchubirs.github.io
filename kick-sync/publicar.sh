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
# A letra vive connosco e nao num CDN (ver a nota em estilo.css). Sem esta
# linha o site sai publicado a apontar para cinco ficheiros que nao estao la,
# e a pagina inteira cai para a letra do sistema — que e exactamente o que
# esta montagem existe para evitar.
mkdir -p "$DESTINO/letra"
cp site/letra/* "$DESTINO/letra/"

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
# A versao tambem num ficheiro so dela, para a pagina se poder comparar com o
# servidor. O index.html sai daqui com `cache-control: max-age=600` e nao ha
# como mudar isso: durante dez minutos o browser serve o HTML antigo sem sequer
# perguntar, e quem esta a olhar ve a versao de ontem e diz "cade as mudancas".
# Este ficheiro e lido com `no-store`, por isso chega sempre do servidor.
printf '%s' "$V" > "$DESTINO/versao.txt"

echo "publicado em $DESTINO  ·  versao $V"
# O hls.js leva a versao NO NOME e nao pode levar carimbo: sao 414 KB, e um
# endereco novo a cada publicacao obriga a descarrega-los outra vez. Sem
# carimbo o browser revalida e recebe um 304 sem corpo. Se algum dia a
# expressao la de cima passar a apanha-lo, isto para a publicacao e diz porque.
if grep -q 'hls-[0-9.]*\.js?v=' "$DESTINO"/index.html; then
  echo "::error::o hls levou carimbo — sao 414 KB a mais por publicacao" >&2
  exit 1
fi
# Provar que o carimbo entrou mesmo, em vez de confiar. Cada pagina e cada
# ficheiro de codigo tem de o ter — foi assim que uma vez publiquei para a
# pasta errada e o script disse "publicado".
for f in "$DESTINO"/index.html "$DESTINO"/twitch.html "$DESTINO"/app.js "$DESTINO"/twitch-app.js; do
  grep -q "v=$V" "$f" || { echo "SEM CARIMBO: $f" >&2; exit 1; }
done
# E que a letra foi mesmo junto: cinco caras, e todas com corpo.
[ -s "$DESTINO/versao.txt" ] || { echo "SEM versao.txt" >&2; exit 1; }
for f in site/letra/*.woff2; do
  n=$(basename "$f")
  [ -s "$DESTINO/letra/$n" ] || { echo "FALTA A LETRA: $n" >&2; exit 1; }
done
echo "carimbo v=$V em todas as paginas  ·  $(ls "$DESTINO"/letra/*.woff2 | wc -l) caras de letra" 

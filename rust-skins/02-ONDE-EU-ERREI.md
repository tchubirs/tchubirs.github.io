# Onde eu errei — 27/08/2026

Ele olhou as skins que estão sendo aceitas no Rust e disse:
*"olhando isso você não tem a menor chance"*. Ele estava certo.

---

## O que eu fiz

Medi o mercado inteiro: taxa de aceitação, prazo, votos, concentração de
criadores, faturamento por item, quais itens têm poucas skins. Tudo confere.

Depois li a página oficial da Facepunch sobre como ser aceito
(https://wiki.facepunch.com/rust/Getting_Skin_Accepted) e construí um gerador
procedural de madeira envelhecida em cima destas duas frases:

> *"To fit in the game items should look dirty and worn."*
> *"Although we do sometimes accept highly colourful, even glowing items,
> we'd advise against it."*

## O que eu não fiz

**Nunca olhei uma skin aceita.**

Aquela página tem escrito **"Updated: A Long Time Ago"** no rodapé. Eu li isso
na hora de extrair o texto e passei batido.

## O que está sendo aceito de verdade (agosto/2026)

Ver `aceitas-agosto-2026.png` — 16 skins aceitas nas últimas rotações:

- runas demoníacas **acesas** numa Metal Shop Front
- vitral com o personagem do jogo, em vermelho e dourado
- AK rosa/azul pastel de anime
- machado com caveira e mangueira vermelha
- balde monstro verde com olhos de desenho
- máscara de metal vazada em abóbora de Halloween
- fornalha com uma paisagem de inferno dentro
- Python teal e preto
- moletom black metal com corrente, calça com pentagrama
- churrasqueira roxa neon
- **porta blindada com setas laranja acesas**
- barril com garota de anime hiper-saturada

**Nenhuma é suja e realista. Quase todas são coloridas, temáticas, com
personagem, e várias brilham** — exatamente o que a wiki desaconselha.

## A lição

**Medi os números do mercado e nunca olhei o produto do mercado.**

Fonte primária desatualizada é pior que fonte secundária atual, porque ela
carrega a autoridade de ser oficial. O output aceito estava a um download de
distância — os `iconUrl` já estavam no mesmo conjunto de dados que eu usei
para calcular tudo o resto.

## O que morreu e o que sobrou

**Morreu:** o gerador em `gerador/`. Ruído procedural e desgaste não fazem
vitral, anime ou caveira. Fica no repositório como registro do erro, não como
ferramenta. E não existe gerador de imagem neste ambiente — só código.

**Sobrou intacto:** todos os números medidos em `00-O-PLANO.md`. O mercado é
aberto (maior criador com 6,9%, 48% dos criadores com uma skin só), paga bem
e é rápido (mediana de 10 dias). O gargalo não é o mercado — **é arte**.

E arte ali é ofício: quem emplaca são ilustradores e artistas 3D pintando
sobre o UV sabendo o que fazem.

## Estado do caminho

**BLOQUEADO EM ARTE.** Perguntei a ele se conhece algum artista de skin —
ele está numa cena com 150 criadores do Rust Kick Off. Se existir artista bom
sem audiência, a divisão é natural: o artista faz a arte, ele entra com os
43 mil votos e a conta do Steam, e dividem.

Se não houver, o caminho morre e a varredura segue.

# Estudo: voz em texto no navegador (palavras faladas e legendas)

Data: 10 de outubro de 2026. Para: dono do Povix. Responde às duas notas da FILA: "Palavras ditas pelo streamer" (detecção) e "legendas no clipe, igual CapCut".

Como ler: **medido** é o que rodei aqui; **dito** é o que a fonte afirma e eu não medi. As fontes estão numeradas no fim.

## 1. Resposta curta

- Dá para fazer, sem servidor, com o Whisper rodando no navegador pelo transformers.js. É o único caminho que junta português, espanhol e inglês, tempo de cada palavra (para a legenda) e arquivos que cabem no GitHub Pages.
- Modelo recomendado: `whisper-base` com tempo por palavra (`onnx-community/whisper-base_timestamped`), versão quantizada (q8). O `whisper-tiny` é mais leve, mas erra demais em português.
- Custo para a pessoa: uns 105 MB baixados uma vez (o navegador guarda). Depois, a legenda de um clipe de 30 s leva perto de 25 s num processador comum.
- Legenda de clipe: viável. Detecção por palavra falada numa live inteira: não. Só em trechos curtos em volta dos picos que o Povix já acha (chat, gritos, tiros).
- Limite sério: grito e barulho de jogo. Com ruído forte o Whisper inventa frases. A legenda precisa sempre de revisão antes de exportar.

## 2. As opções

| Opção | Download (pt, es, en) | Tempo por palavra | Idiomas | Licença | Mesmo domínio no Pages | Navegadores |
|---|---|---|---|---|---|---|
| Whisper tiny, transformers.js | 41 MB modelo + 27 MB motor | sim | 99, com pt e es | Apache-2.0 | sim, maior arquivo 31 MB | qualquer um com WebAssembly; WebGPU opcional |
| Whisper base, transformers.js | 77 MB modelo + 27 MB motor | sim | 99 | Apache-2.0 | sim, maior arquivo 54 MB | igual |
| Whisper small, transformers.js | 249 MB | sim | 99 | Apache-2.0 | não sem partir: arquivo de 157 MB passa os 100 MB do GitHub | igual, mais lento |
| whisper.cpp em wasm (transcribe.js) | 32 MB (tiny q5_1), 60 MB (base q5_1) | por pedaço de palavra | 99 | MIT | sim | precisa de `SharedArrayBuffer`, que o Pages não liga |
| Vosk (vosk-browser) | 32 MB pt, 40 MB es, 41 MB en | sim | um modelo por idioma | Apache-2.0 | sim | blob worker, barrado pela nossa política de segurança |
| Moonshine | 28 MB (tiny en) | não | tiny e base só inglês; espanhol à parte; sem português | MIT (en); licença comunitária (es) | sim | igual ao Whisper |
| Web Speech API | 0 | não | depende do Chrome | do navegador | não se aplica | só Chrome; tempo real |
| Parakeet v3, Cohere Transcribe | 670 MB a mais de 1,5 GB | sim (Parakeet) | pt, es, en | CC-BY-4.0, Apache-2.0 | não | pesado demais |

Notas sobre cada uma:

- **Whisper pelo transformers.js.** Versão 4.3.0 no npm (16/09/2026); a 4.3.1 saiu em 06/10/2026, ainda nova [1]. Usa o onnxruntime-web 1.31.0-dev.20260914 [1][2]. O pedido `return_timestamps: 'word'` devolve cada palavra com início e fim; precisa dos modelos `_timestamped` [3][4]. O motor (`ort-wasm-simd-threaded.asyncify.wasm`) tem 26,9 MB (6,7 MB comprimido) e o código 0,6 MB (**medido**). Tamanhos dos modelos q8 no Hugging Face: tiny 10,1 + 30,7 MB, base 23,2 + 53,7 MB, small 92,3 + 156,8 MB [4][5][6]. O Whisper só traduz para inglês; para outra língua seria outro modelo (opus-mt es-en, 113 MB por par, e não há par com português nos modelos prontos) [7].
- **whisper.cpp em wasm.** Os modelos são menores (q5_1) [8]. O pacote pronto mais usado, `@transcribe/shout` 1.0.7 com `@transcribe/transcriber` 3.0.1 (MIT), exige `SharedArrayBuffer`, que só existe com os cabeçalhos `COOP` e `COEP` [9]. O GitHub Pages não deixa pôr cabeçalhos. O `@remotion/whisper-web` está marcado como sem licença livre no npm [10]. Aqui ficou mais lento que o transformers.js (abaixo).
- **Vosk.** Leve, rápido, tempo por palavra nativo, sem pontuação nem maiúsculas. O modelo pequeno de português tem 68,92% de erro em fala espontânea brasileira (`CORAA`) e 32,6% no Common Voice, segundo a própria Vosk [11]. O pacote do navegador está parado desde dezembro de 2022 (0.0.8) [12] e cria o worker a partir de um blob: com a política de segurança do Povix (`script-src 'self'`, sem `wasm-unsafe-eval`) o WebAssembly não compila, como o `ler-tela.js` já explica. Teria de ser remendado.
- **Moonshine.** `moonshine-tiny` e `moonshine-base` são só inglês (MIT) [13]. Há espanhol (`moonshine-streaming-tiny-es`, MIT, só em PyTorch; e `moonshine-es` em onnx, com licença para quem fatura menos de 1 milhão de dólares por ano) [14][15]. Não há português. No transformers.js o Moonshine devolve só o texto, sem tempo (conferido no código, `_call_moonshine`) [3].
- **Web Speech API.** A especificação já aceita uma faixa de áudio (`start(MediaStreamTrack)`) e reconhecimento no aparelho (`processLocally`) [16]. O chromestatus marca a faixa no Chrome 135 e o reconhecimento no aparelho no Chrome 139; o tempo por palavra ainda é só proposta [17]. Mesmo assim: só Chrome, o áudio precisa tocar em tempo real (1 min de áudio leva 1 min), o resultado não traz tempo por palavra (só texto e confiança) e, sem `processLocally`, o Chrome manda o áudio para o servidor do Google. Não serve para legenda nem para varrer VOD.
- **Mais novos.** Parakeet v3 da Nvidia (pt, es, en, tempo por palavra) tem 670 MB em int8, com um arquivo de 652 MB [18]. Cohere Transcribe 03-2026 (Apache-2.0, pt e es) passa de 1,5 GB e o acesso é com cadastro [19]. Os dois ficam fora.

## 3. O que medi

Máquina: servidor com 4 núcleos Intel Xeon 2,8 GHz, 16 GB, Chromium 141 sem tela e **sem placa de vídeo**. Um notebook comum recente deve dar números parecidos ou melhores por núcleo. WebGPU não deu para medir aqui (só havia o emulador de CPU). Áudio: 60 s de LibriVox em domínio público (fábulas de Esopo em português e em espanhol) [20]. O ruído é sintético (rosa mais estalos curtos, imitando tiros), misturado à voz.

Transformers.js 4.3.0, modelos q8, tempo por palavra ligado. "1 fio" é o que o GitHub Pages dá; "4 fios" precisa dos cabeçalhos que o Pages não tem.

| Modelo | Áudio | Fios | Tempo para 60 s | Texto |
|---|---|---|---|---|
| tiny | pt limpo | 1 | 28,6 s | ruim: "gravação de Xbox" no lugar de LibriVox |
| tiny | pt limpo | 4 | 22,4 s | igual |
| base | pt limpo | 1 | 51,4 s | bom: "as pombas perseguidas do milhano que as maltratavam de quando em quando" |
| base | pt limpo | 4 | 37,8 s | igual |
| tiny | es limpo | 1 | 19,4 s | razoável |
| base | es limpo | 1 | 37,0 s | bom |
| tiny | pt, ruído 5 dB | 1 | 85,8 s | inventa e repete frases |
| base | pt, ruído 5 dB | 1 | 78,4 s | pega o sentido, erra nomes |
| tiny | pt, ruído 0 dB | 1 | 17,8 s | texto todo inventado |
| base | pt, ruído 0 dB | 1 | 107,6 s | quase tudo errado |

- Abrir o modelo já baixado: 3 a 5 s (**medido**).
- Pedir tempo por palavra custa uns 20% a mais: tiny pt, 23,7 s só com frases contra 28,6 s com palavras (**medido**).
- Os tempos por palavra saíram coerentes, por exemplo "volume" de 3,04 a 3,60 s e "traduzido" de 4,46 a 4,92 s (**medido**, conferido de ouvido só por amostra).

whisper.cpp em wasm (`@transcribe/shout` 1.0.7), 4 fios: tiny q5_1 pt levou 101,6 s para 87,8 s de áudio; base q5_1 es levou 52,8 s para 47,5 s (**medido**). Mais lento que o transformers.js com 1 fio, e o tempo vem por pedaço de palavra ("fá", "b", "oles"). A opção que corta por palavra (`split_on_word`) quebrou com erro de JSON dentro da biblioteca.

Vosk 0.0.8, 1 fio: pt pequeno levou 32,5 s para 60 s, es pequeno 15,8 s (**medido**). Texto em pt sem pontuação, com erros do tipo "sessão de fadas jesus" onde o Whisper base ouviu "fábulas de Esopo". Com lista fechada de palavras (só "pombas", "falcão", "milhano", "voluntário"), achou "pombas" 4 vezes e não achou "falcão" nenhuma vez (**medido**).

## 4. Recomendação

1. **Legenda do clipe:** Whisper base com tempo por palavra, pelo transformers.js 4.3.0 fixado, rodando num worker que é arquivo nosso (igual ao leitor de texto do `ler-tela.js`). O idioma vem da escolha da pessoa, sem detecção automática, que erra em clipe curto e barulhento.
2. **Palavras faladas na detecção:** o mesmo modelo, mas só nos trechos que o modo esperto já escolhe (por exemplo 1 min em volta de cada pico de chat ou de grito). Nunca a live inteira: 10 h dariam umas 8 a 9 h de processamento com 1 fio.
3. **Tradução:** só para inglês, com o próprio Whisper (`task: 'translate'`). Sem tempo por palavra no caso traduzido (**inferência**: as palavras em inglês não casam com o áudio). Tradução para outras línguas fica para depois.
4. **Não usar** Vosk, whisper.cpp em wasm, Moonshine nem Web Speech API, pelos motivos da seção 2.

## 5. Custo para quem usa

- **Download:** 77 MB do modelo base, mais 27 MB do motor e 3 MB de configuração. Uns 105 MB, uma vez só; fica guardado no navegador. Avisar antes, como na detecção longa, e sugerir Wi-Fi.
- **Espera, legenda de clipe** (base, 1 fio, **medido** 0,86 s por segundo de áudio): clipe de 15 s, uns 13 s; 30 s, uns 26 s; 60 s, uns 52 s. Mais 3 a 5 s para abrir o modelo. Com WebGPU deve cair, mas não medi.
- **Espera, detecção:** 20 trechos de 1 min, uns 17 min com o base (ou 10 min com o tiny, que erra mais). Precisa de barra de progresso e de botão para parar.
- **Celular:** não medi. Esperar bem mais lento e pouca memória; deixar só para computador no começo.

## 6. Limites

- **Ruído e grito.** Com o ruído no mesmo volume da voz (0 dB), os dois modelos falham, e o tiny inventa texto. Live de Rust tem tiro, explosão e grito por cima da fala. Mitigar: transcrever só onde há voz, mostrar a legenda para corrigir antes de exportar e marcar palavras de baixa confiança.
- **Gíria e nomes** (nomes de jogador, itens do Rust): o Whisper erra. Para a detecção, comparar palavras de forma aproximada, sem exigir igualdade exata.
- **GitHub Pages:** arquivo máximo de 100 MiB, site publicado até 1 GB, banda de 100 GB por mês "soft" [21][22]. O base cabe (maior arquivo 54 MB). O repositório já tem 573 MB em `.git`, e o limite recomendado é 1 GB: cada versão nova do modelo soma uns 105 MB para sempre. Com 100 GB de banda, cerca de 950 primeiros downloads por mês (**aritmética**: 100 GB / 105 MB). Se passar disso, baixar o modelo do Hugging Face (redireciona para `us.aws.cdn.hf.co`), o que pede abrir esses domínios na política de segurança.
- **Não sei** se o Pages comprime `.wasm` e `.onnx` na entrega; o motor cai de 27 para 7 MB comprimido, o modelo quase não comprime (77 para 51 MB). Medir depois de publicar.
- **Navegadores:** precisa de WebAssembly com `simd` (Chrome, Edge, Firefox, Safari 16.4 ou mais novo), o mesmo teste que o `ler-tela.js` já faz.

## 7. Plano de implementação

1. Copiar para `site/vendor/whisper/`: `transformers.min.js` 4.3.0, `ort-wasm-simd-threaded.asyncify.mjs` e `.wasm` do onnxruntime-web que vem com ele, e os arquivos do `whisper-base_timestamped` (configs, `tokenizer.json`, `onnx/encoder_model_quantized.onnx`, `onnx/decoder_model_merged_quantized.onnx`). Conferir o sha512 do npm e anotar em `VERSOES.txt`, como no Tesseract.
2. `ouvir-voz.js` como worker de arquivo próprio: `env.allowRemoteModels = false`, `env.localModelPath` e `env.backends.onnx.wasm.wasmPaths` apontando para o vendor. Recebe áudio mono a 16 kHz e devolve `[{texto, inicio, fim}]`.
3. Áudio do clipe: reaproveitar o caminho do `audio-ts.js`, reamostrar para 16 kHz com `OfflineAudioContext`.
4. Tela da legenda (ao lado de Início e Fim): idioma, botão "Gerar legenda", aviso do download na primeira vez, progresso, lista de palavras para corrigir texto e tempo.
5. Desenho no export: agrupar 2 a 4 palavras por tela, destacar a palavra falada naquele instante, cor, tamanho, posição e contorno escolhidos; desenhar no mesmo canvas que já monta o clipe.
6. Detecção: filtro "palavras faladas" que roda o worker só nos trechos do modo esperto e procura a lista de palavras com comparação aproximada.
7. Testes: worker com um áudio curto conhecido no Chromium sem tela (o banco de teste deste estudo serve de base); medir num notebook real com e sem WebGPU antes de prometer tempos na tela.

## 8. Medido na implementação (12/10)

A legenda do clipe foi feita como na seção 7, com quatro mudanças:

- O modelo e o motor não entram no repositório. Vêm do Hugging Face (commit `608c49e`) e do jsDelivr
  (onnxruntime-web `1.31.0-dev.20260914-8d85527a0`), em versão fixa, e só são aceitos com o SHA-256
  certo (`site/legenda-arquivos.js`). No `site/vendor/whisper/` fica só o `transformers.min.js` 4.3.0
  (582 KB). O Worker é arquivo nosso: a política de segurança da página não se aplica a ele, e não foi
  preciso mexer nela.
- O som sai do degrau de 480p: em dois VODs reais (Gaules e tatarel) o áudio do 1080p, do 720p e do 480p
  é o mesmo, byte a byte (AAC 160 kb/s, 48 kHz). O 480p pesa 1,8 MB por 10 s, contra 10,6 MB do 1080p.
  O 360p e o 160p têm outro áudio, mais pobre.
- O áudio é lido em janelas de 30 s com 5 s de sobra, uma de cada vez. Com a costura do transformers.js
  e tempo por palavra, as palavras da sobra saíam repetidas ("é, é, né? né?").
- `repetition_penalty: 1,1`. Sem isso, 30 s de Rust com tiros viraram "o que é o que é..." e 40 s de
  conta; com isso, a frase certa em 5 s.

Tempos (Chrome for Testing 153 sem tela, que traz AAC; 4 núcleos Xeon 2,8 GHz; um fio; rede de servidor):

| Clipe | Primeira vez (baixar 106,5 MB + abrir + ler) | Com o leitor guardado | Só a leitura |
|---|---|---|---|
| Gaules, 60 s de fala corrida | 42,1 s (download 5 s) | | 36,6 s |
| Gaules, 60 s | | 31,1 s | 27,0 s |
| Gaules, 30 s | | 19,7 s | 15,3 s |
| Rust (tatarel, zezinhou), 30 s | | 9,8 a 18,1 s | 4,9 a 14,7 s |

Abrir o modelo guardado leva uns 4 s. Numa casa com 50 Mb/s o download leva uns 20 s.

Acertos em português (o Whisper base contra a legenda que a própria Kick gera para o Gaules, que também
é automática e repete trechos, por isso a conta é só indicativa): das palavras que o Whisper escreveu,
80% e 66% estão na legenda da Kick nos dois trechos de narração; num trecho com torcida e música, 35%,
com uma frase inventada e repetida três vezes. Em Rust as falas são curtas e o texto saiu plausível
("Nossa, ele se mexeu no que eu carreguei. Não estou vendo mais"), mas sem referência para medir.
A deteção automática de idioma ouviu inglês num clipe de Rust em português; por isso o Automático usa o
idioma que a live declara na Kick. A tradução para inglês funcionou ("Where? Oh, if he's moving...").

## Fontes

1. npm, `@huggingface/transformers` (versões e datas): https://registry.npmjs.org/@huggingface/transformers
2. npm, `onnxruntime-web`: https://registry.npmjs.org/onnxruntime-web
3. Código do pipeline de voz do transformers.js 4.3.0, `src/pipelines/automatic-speech-recognition.js` (no pacote do npm)
4. https://huggingface.co/onnx-community/whisper-tiny_timestamped (arquivos em `onnx/`)
5. https://huggingface.co/onnx-community/whisper-base_timestamped
6. https://huggingface.co/onnx-community/whisper-small_timestamped ; licença e idiomas em https://huggingface.co/openai/whisper-tiny
7. https://huggingface.co/Xenova/opus-mt-es-en
8. https://huggingface.co/ggerganov/whisper.cpp (tamanhos dos `ggml-*.bin`)
9. npm, `@transcribe/shout` e `@transcribe/transcriber` (README)
10. npm, `@remotion/whisper-web` (campo de licença `UNLICENSED`)
11. https://alphacephei.com/vosk/models
12. npm, `vosk-browser` (0.0.8, 25/12/2022)
13. https://huggingface.co/moonshine-ai/moonshine-tiny ; `https://huggingface.co/onnx-community/moonshine-tiny-ONNX`
14. https://huggingface.co/moonshine-ai/moonshine-streaming-tiny-es
15. https://huggingface.co/moonshine-ai/moonshine-es
16. Especificação Web Speech API, versão de 18/09/2026: https://webaudio.github.io/web-speech-api/
17. chromestatus, itens 5178378197139456, 6090916291674112 e 5811907077472256: https://chromestatus.com/feature/5178378197139456
18. https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx
19. `https://huggingface.co/onnx-community/cohere-transcribe-03-2026-ONNX`
20. LibriVox no archive.org: `fabula2_esopo_1104_librivox` e `fabulas_esopo_05`
21. https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits
22. https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github

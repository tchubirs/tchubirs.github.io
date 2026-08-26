# clipfactory

Fábrica de clipes verticais a partir de conteúdo **licenciado por uma campanha
de content rewards**, publicando sozinha no YouTube Shorts (e opcionalmente no
Instagram Reels), rodando no GitHub Actions — sem servidor, sem seu computador
ligado.

**De onde vem o dinheiro, na visão de quem paga:** uma marca/criador tem um
VOD longo e quer alcance curto. Ela põe orçamento numa campanha (Vyro, Whop,
Ssemble) e paga **por mil views verificadas** dos clipes que outras pessoas
publicam. Você é uma dessas pessoas. Não existe requisito de inscritos, não
existe espera de monetização: o pagador é a campanha, não o algoritmo.

---

## O que é automático e o que não é

| Etapa | Automático? | Observação |
|---|---|---|
| Baixar a fonte licenciada | ✅ | `yt-dlp`, ou arquivo local do brief |
| Transcrever | ✅ | usa a legenda da fonte; whisper local só se faltar |
| Escolher os trechos | ✅ | Claude, com validador mecânico por cima |
| Cortar 9:16 + legenda + gancho | ✅ | ffmpeg, custo zero de API |
| Escrever título/descrição/tags | ✅ | Claude, no idioma do mercado |
| **Publicar no YouTube Shorts** | ✅ | Data API v3 oficial, cota própria de ~100 uploads/dia |
| **Publicar no Instagram Reels** | ✅ | Graph API, exige conta Business + Página |
| **Publicar no TikTok** | ❌ | Content Posting API exige auditoria; até passar, todo post sai `SELF_ONLY` |
| Medir views e mover o dinheiro | ✅ | `clipfactory track` |
| **Submeter o link do clipe à campanha** | ❌ | painel da plataforma, feito por humano |
| **Criar contas, KYC, sacar** | ❌ | é você, com seu CPF |

---

## Seus minutos, contados um a um

### Instalação — uma vez só: **48 minutos**

| # | O quê | Min | Onde |
|---|---|---|---|
| 1 | Criar conta na plataforma de campanha e aceitar um brief | 12 | vyro.com / whop.com |
| 2 | Ligar PayPal na plataforma (saque mínimo US$ 10, semanal) | 6 | painel da plataforma |
| 3 | Criar projeto no Google Cloud + ativar YouTube Data API v3 | 10 | console.cloud.google.com |
| 4 | Tela de consentimento OAuth + credencial "App para computador" | 8 | idem |
| 5 | Rodar `python tools/youtube_oauth.py client_secret.json` | 4 | seu computador |
| 6 | Colar 4 secrets no GitHub e o `CLIPFACTORY_CONFIG` | 8 | Settings → Secrets → Actions |

Depois disso a máquina roda sozinha, todo dia, às 09h10 de Brasília.

### Rotina — **4 a 6 minutos por dia, no celular**

1. Abrir o e-mail do GitHub Actions (só chega se algo quebrar). — 1 min
2. Copiar os links dos Shorts publicados e colar no painel da campanha. — 3 min
   *(este é o minuto incompressível: nenhuma campanha aceita submissão por API)*
3. Uma vez por semana: sacar quando passar de US$ 10. — 2 min

**Isso dá ~150 minutos no primeiro mês e ~120 min/mês depois.**

---

## Custo por clipe — números, não "barato"

Não geramos vídeo com IA. Por isso o custo é quase todo de texto:

| Item | Custo | Como |
|---|---|---|
| Download da fonte | US$ 0,00 | yt-dlp |
| Transcrição | US$ 0,00 | legenda da fonte, ou whisper local |
| Render (ffmpeg) | US$ 0,00 | ~30 s de CPU por clipe, dentro da cota grátis do Actions |
| Seleção (Claude) | ~US$ 0,03–0,10 por **lote** | 1 chamada para N clipes |
| Metadados (Claude) | ~US$ 0,01–0,02 por clipe | 1 chamada por clipe |
| Publicação | US$ 0,00 | APIs oficiais gratuitas |

**Com 4 clipes por execução em `claude-opus-5`: ≈ US$ 0,03–0,05 por clipe.**
Trocando `production.model` para `claude-sonnet-5` cai para cerca de 40% disso;
para `claude-haiku-4-5`, cerca de 20%. A escolha é sua — o modelo mais forte
acerta mais o trecho, e o trecho é exatamente o que a campanha paga.

Ponto de equilíbrio: a US$ 1,50 de CPM, **~30 views pagam um clipe.**

---

## Uso

```bash
pip install -r requirements.txt && pip install -e .
cp config.example.yaml config.yaml   # preencha com o brief aceito
cp .env.example .env                 # preencha os segredos

clipfactory doctor                   # o que ainda falta
clipfactory run --dry-run            # renderiza e escreve, não publica
clipfactory run                      # produz e publica
clipfactory track                    # views, dinheiro, regras de morte
clipfactory money --list             # onde está cada centavo
```

Quando a plataforma confirmar pagamento, você registra — a máquina **nunca**
inventa que recebeu:

```bash
clipfactory money --clip <id> --to ELEGIVEL  --usd 4.20
clipfactory money --clip <id> --to LIQUIDADO --usd 4.20
clipfactory money --clip <id> --to SACADO    --usd 4.20
```

---

## Os sete estados do dinheiro

```
GERADO ──► PENDENTE ──► ELEGIVEL ──► LIQUIDADO ──► SACADO
   │           │            │             │
   └───────────┴────────────┴─────────────┴──► ESTORNADO
                            └──► RETIDO ──► ELEGIVEL
```

`clipfactory` só chama de **dinheiro** o que está em `SACADO`. Tudo antes
disso é promessa, e o resumo separa as duas coisas em linhas diferentes de
propósito — é o que impede você de comemorar receita que a plataforma ainda
pode estornar.

---

## Regras de morte (numéricas, em `config.yaml`)

| Regra | Padrão | O que fazer quando bater |
|---|---|---|
| Qualquer strike | 1 | Pare tudo. Não publique mais nada nessa conta. |
| Mediana de views após 12 posts | < 400 | O formato não pega. Troque de campanha ou de ângulo. |
| Custo de API ÷ receita prevista | > 60% | Baixe o modelo ou pare a campanha. |

`clipfactory track` sai com código 3 quando alguma bate, o job do Actions fica
vermelho e o GitHub te manda e-mail. É o alarme de celular sem app nenhum.

---

## Riscos, e o que no código já defende deles

| Risco | Defesa presente |
|---|---|
| **Direito autoral / DMCA** | O programa **se recusa a rodar** sem `license_note` preenchido, e carimba a licença na descrição de todo vídeo. Só cortamos fonte licenciada pelo brief — nunca conteúdo de terceiro "na tolerância". |
| **Repressão do YouTube a conteúdo inautêntico** | A fonte é vídeo humano real, não vídeo gerado por IA — o padrão exato que o YouTube vem derrubando em 2026 é o oposto disto. `clips_per_run: 4` mantém volume longe do padrão de spam. |
| **Falta de disclosure de IA** | Campo `synthetic_content_disclosure` é enviado à API como `containsSyntheticMedia`. |
| **Gancho que promete o que o clipe não entrega** | Regra explícita no prompt + validador que corta o gancho em 42 caracteres. |
| **Conta principal cair e levar tudo** | O ledger vive num branch separado; recriar a operação em outra conta é só trocar 3 secrets. |
| **Views estornadas** | Estado `ESTORNADO` zera o valor; `check_strikes` detecta vídeo removido/rejeitado e estorna sozinho. |
| **Vazamento de credencial** | Nada de segredo em arquivo: tudo por variável de ambiente/secret. `config.yaml` e `.env` estão no `.gitignore`. |

---

## Detalhes técnicos que custaram tempo para descobrir

- O ffmpeg estático do `imageio-ffmpeg` **não traz o filtro `drawtext`**. Todo o
  texto (legenda e gancho) é desenhado via **libass/ASS**, que existe nos dois
  builds. Se você trocar por `drawtext`, quebra no GitHub Actions.
- Legenda automática do YouTube repete a mesma linha em cascata; `transcript.py`
  deduplica fundindo as durações, senão a legenda queimada pisca.
- Cabem **21 caracteres por linha** de legenda e 18 no gancho, nos corpos atuais.
  Esses números foram **medidos renderizando frames**, não estimados. Texto longo
  vira vários cues em sequência — nunca é espremido em duas linhas largas
  (era o bug que jogava texto para fora do quadro).
- `-14 LUFS` é o alvo de loudness que YouTube/TikTok/Instagram normalizam.

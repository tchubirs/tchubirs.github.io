# kick-engage — o que é e por que existe

## O problema, nas palavras dele

> *"Minha live na kick da dois dólar por hora, só não da mais porque teria que
> ter mais gente nova entrando, seguindo e falando na live, porque eu tenho
> média de viewer porém eles não interagem."*

Ele já identificou a alavanca certa. O que falta não é saber o que fazer —
é **saber onde está**. Hoje ele transmite no escuro: não sabe se está em 137
ou em 240 chatters únicos no mês, então não consegue decidir nada.

## O que já está pronto

**`src/webhook.js`** — verifica que o evento veio mesmo da Kick.
Sem isso, qualquer um que descubra a URL do endpoint inventa seguidor e
mensagem, e a medição vira ficção. Regra oficial da Kick:
`RSA-SHA256("<message-id>.<timestamp>.<corpo bruto>")` em base64.

**`src/metrics.js`** — janela móvel de 30 dias contando:
- **chatters únicos** — pessoas, não mensagens. Quem manda 400 mensagens conta 1.
- **quem falou pela primeira vez** — rosto novo, que é exatamente o que ele disse faltar
- **seguidores novos**
- **assinantes ativos**
- **horas transmitidas** — por par de início/fim, com transmissão em curso contando até agora

16 testes, sem nenhuma dependência externa.

## O que está VERIFICADO e o que é SUPOSTO

**VERIFICADO — documentação oficial da Kick (docs.kick.com):**
- a API pública existe, com `POST /public/v1/chat` para o bot postar
- webhooks entregam `chat.message`, `channel.followed`,
  `channel.subscription.created`, `livestream.status.updated` e outros
- o esquema de assinatura acima, e a chave pública RSA da Kick
- OAuth 2.1 em `id.kick.com`

**SUPOSTO — veio de blog, NÃO da Kick:**
- a faixa de US$ 16 a 32 por hora do programa de parceiro
- os limiares de 250 chatters únicos, 25 assinantes ativos, 75 de média de
  espectadores, 30 horas e 3 VODs numa janela de 30 dias

A Kick **não publica tabela de valores**. Por isso os limiares **não estão
fixos no código**: `new Medidor({ chattersUnicos: 250, ... })` recebe as metas
de fora. Quem confirma os números de verdade é o painel do próprio canal dele.
Fixar número de blog no código seria repetir o erro de tratar suposição como
medida — erro que já custou caro neste projeto.

## O que falta

1. Ele confirma os limiares reais no painel da Kick
2. Servidor que recebe o webhook e alimenta o medidor
3. Bot de chat com mecânicas que façam gente **de verdade** querer falar

## O que este projeto NUNCA vai fazer

Inflar número. Nada de bot fingindo espectador, chatter ou seguidor.
Isso é fraude contra a Kick, derruba o canal, e o canal é o ativo que se
está tentando fazer render. Todo número aqui é de pessoa real.

# Pôr o Povix no ar (06/10/2026)

O que foi verificado para tirar o site do endereço do GitHub e pô-lo num nome próprio. Nada foi comprado.

## O nome e o domínio

Disponibilidade e preço consultados em 06/10/2026 no registrador da Vercel (preço do primeiro ano, depois a
renovação, em dólares):

| domínio | livre | 1º ano | renovação |
|---|---|---|---|
| povix.com | não | | |
| povix.co | não | | |
| **povix.app** | sim | 9,99 | 15,00 |
| povix.io | sim | 14,99 | 46,00 |
| getpovix.com | sim | 11,25 | 11,25 |
| povix.tv | sim | 35,00 | 35,00 |
| povix.live | sim | 3,99 | 28,00 |
| povix.gg | sim | 129,99 | 129,99 |
| povix.com.br | sim | | |

**Recomendado: `povix.app`.** É o mais barato que se mantém barato, e o `.app` só funciona com HTTPS (o
próprio domínio obriga), o que é uma camada de segurança a menos para esquecer. `getpovix.com` é a reserva
com `.com`.

**A marca, conferida em 06/10/2026:** pode usar, com um risco moderado a saber.

- Nos EUA, "POVIX" foi pedida por uma empresa chinesa (Hunan Weilichi) para móveis, eletrodomésticos e
  brinquedos; o pedido dos brinquedos foi abandonado. Nenhum pedido em software ou vídeo
  ([Trademarkia](https://www.trademarkia.com/povix-98966556),
  [Justia](https://trademark.justia.com/989/55/povix-98955552.html)).
- O mais perto do nosso ramo: uma loja tcheca vende óculos com câmera de ponto de vista chamados
  "MyPovix™" ([mypovix.store](https://mypovix.store/products/mypovix)), e existe uma empresa tcheca
  POVIX PLUS s.r.o. ([D&B](https://www.dnb.com/business-directory/company-profiles.povix_plus_sro.1dee8f1181d713d4826af40b0ab81313.html)).
  É vídeo em primeira pessoa, perto o bastante para um advogado de um comprador perguntar.
- "Povix" também é marca de um antisséptico em Bangladesh (outro ramo, sem conflito).
- O `povix.com` tem dono.

As alternativas do estudo de nome não saíram melhores: "Vizync" (todos os domínios livres) soa quase igual a
"ViZiSync", um app de manutenção de bombas de incêndio; "Synorama" tem o `.com` ocupado; "Flankcam" lê-se como
uma câmera física. Mantém-se Povix. Se a Kick comprar, o mais provável é virar um recurso com o nome dela, e o
valor está no produto e nos números do piloto, não no nome.

## Onde hospedar

O site é estático: a página, os scripts e as letras somam pouco mais de 1 MB por visita. O vídeo **não passa
pela hospedagem**: vai do CDN da Kick direto para o navegador de quem usa. Por isso a conta da hospedagem
fica perto de zero mesmo com um evento inteiro a usar ao mesmo tempo.

| opção | custo | cabeçalhos de segurança | repositório privado | observação |
|---|---|---|---|---|
| GitHub Pages (hoje) | grátis | não (só a política no `<meta>`) | só em plano pago | o que já está no ar |
| Cloudflare Pages | grátis | sim (`_headers`) | sim | uso comercial permitido no plano grátis |
| Netlify | grátis para começar | sim (`_headers`) | sim | |
| Vercel | Hobby grátis, Pro pago | sim | sim | o plano Hobby é para uso pessoal, não comercial |

**Recomendado: Cloudflare Pages com `povix.app`.** Lê o mesmo `site/_headers` que já está pronto, aceita
repositório privado (o que a `SEGURANCA.md` pede antes de mostrar o código a um comprador) e não cobra pelo
tráfego.

## O que já está pronto no código

- **A política de segurança na página** (`<meta http-equiv="Content-Security-Policy">` em `index.html`):
  scripts só do próprio site; dados e vídeo só de `kick.com`, `stream.kick.com` e `clips.kick.com`
  (conferido na Kick real em 06/10: os VODs vêm de `stream.kick.com`, os clipes de `clips.kick.com`). Os
  testes de página correm com ela ligada, e a Kick fingida dos testes usa o mesmo endereço do CDN real.
- **`site/_headers`**, para quando houver domínio: a mesma política em cabeçalho (com `frame-ancestors`,
  que o `<meta>` não aceita), HSTS, `nosniff`, `Referrer-Policy` e `Permissions-Policy`. O
  `publicar.sh` copia-o junto com o resto.

## Passos, quando o dono decidir

1. ~~Conferir a marca "Povix".~~ Feito em 06/10 (acima).
2. Comprar `povix.app` (dono).
3. Criar o projeto no Cloudflare Pages ligado ao repositório, pasta `kick-sync/replay` (dono, 5 min; o
   resto eu faço).
4. Apontar o domínio e conferir os cabeçalhos com `curl -I https://povix.app/` (eu).

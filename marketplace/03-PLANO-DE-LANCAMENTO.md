# Plano de lançamento — de 26.851 linhas paradas para dinheiro

## Por que isto substituiu o plano de ontem

Ontem eu não sabia que você tinha inventário. Com o clipfactory, você precisava
**produzir** algo novo e torcer para views chegarem. Aqui o produto **já existe,
já rodou em produção e já está em inglês**. A diferença é a distância até o
primeiro euro.

| | clipfactory (ontem, #1) | RustArena no Codefling (hoje, #1) |
|---|---|---|
| O produto | ainda não existe | **9.087 linhas, v1.0.8, testado em produção** |
| Quem paga | campanha, por mil views | dono de servidor, por licença |
| Pagamento | US$ 10 mín., semanal, ≥72 h | **instantâneo no momento da compra** |
| Taxa | — | 10% (você fica com 90%) |
| Contato humano | 3 min/dia submetendo links | comentários de suporte |
| Receita por unidade | ~US$ 1,50 por mil views | **US$ 31,49 líquidos por venda** |
| Vendas enquanto dorme | não (precisa postar) | **sim** |

O clipfactory continua válido — mas como **canal de distribuição para isto**,
não como negócio principal. Clipe de 1v1 épico no seu servidor → TikTok/Shorts →
gente descobre o servidor → dono de servidor descobre o plugin. Você já tinha
essa máquina desenhada na sua própria landing (serviço 03).

## Os seus minutos — instalação

| # | O quê | Min |
|---|---|---|
| 1 | Criar conta no Codefling e enviar RustArena.cs para revisão | 15 |
| 2 | Colar título/descrição/tags do arquivo `01-rustarena-listing-EN.md` | 8 |
| 3 | Anexar `02-rustarena-DOCS-EN.md` como documentação | 3 |
| 4 | **Gravar 60–90 s de vídeo do plugin rodando no seu servidor** | 20 |
| 5 | Tirar 4–6 prints: painel, editor de kits, holograma, scoreboard | 10 |
| 6 | Configurar método de saque + dados fiscais | 12 |
| | **Total, uma vez só** | **68 min** |

O passo 4 é o que mais converte e o único que **só você pode fazer** — eu não
tenho o servidor rodando. Um GIF do holograma sobre a arena vale mais que
qualquer parágrafo que eu escreva. Grave com o servidor cheio, se der.

Depois: **~10 min/semana** respondendo comentários de suporte.

## Sequência das 3 primeiras semanas

1. **Semana 1 — RustArena sozinho.** Publique só ele. Não lance seis coisas de
   uma vez: você precisa descobrir se o mercado responde antes de gastar horas
   desacoplando os outros.
2. **Semana 2 — NetworkIsolation de graça.** Publique gratuito, no seu nome,
   como dependência. Todo servidor que instala vira lead dos seus plugins pagos.
3. **Semana 3 — o segundo pago.** `GamemodeFast1v1` é o mais barato de
   desacoplar (só GearCore). Se RustArena vendeu, faça. Se não vendeu, pare e
   me chame — o problema é posicionamento, não catálogo.

## Números para decidir

- **Preço:** US$ 34,99 → **US$ 31,49 líquidos** por venda (taxa de 10%).
- **Ponto de referência:** 41.100 membros registrados no Codefling.
- **Meta honesta do 1º mês:** 3 a 12 vendas = **US$ 94 a 378**. `estimativa`
- **Regra de kill:** se em 45 dias com listagem publicada, vídeo e 5+ prints
  você tiver **menos de 3 vendas**, o problema não é preço — é que o nicho de
  arena está saturado. Nesse caso pivote para serviço customizado (sua landing
  já vende a US$ 150–200) e pare de investir em catálogo.

## O que a UE muda para você

Isto vale mais que qualquer plugin: **cidadania portuguesa + residência na
França remove o gargalo de recebimento** que limitava metade do mapa de ontem.

- **Recebimento:** Não confirmei o método de saque do Codefling — o help center
  não expõe. Mas com IBAN da UE, PayPal e Stripe europeus, qualquer método que
  eles usem funciona para você. Um brasileiro sem conta na UE teria que torcer.
- **Faturar o serviço customizado legalmente:** a **micro-entreprise
  (auto-entrepreneur)** na França é registro online, gratuito, e sai em poucos
  dias. É o que transforma os US$ 150–200 da sua landing de "bico" em receita
  faturável — e sem isso você não emite fatura para um cliente europeu.
- **Tebex:** já está instalado no seu servidor (`TebexPlugin.cs` + config).
  Ele resolve o IVA/MOSS europeu sozinho. Vender VIP/kits no **seu próprio
  servidor** é um segundo canal que você já tem meio montado e não está usando.
- **Não sou seu contador.** Registro, IVA e enquadramento fiscal FR/PT você
  confirma com um profissional antes do primeiro recebimento relevante.
  A parte que eu afirmo é técnica: os trilhos de pagamento deixam de ser o
  obstáculo.

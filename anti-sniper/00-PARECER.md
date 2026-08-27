# Anti stream-sniping — parecer medido, 27/08/2026

16 agentes, 8 frentes, cada achado sem fonte primária contestado por um cético
antes de entrar aqui. **[M]** = medido em fonte primária. **[S]** = suposto.
**[N/M]** = não medido.

---

## O que mata partes da ideia

### 1. Nenhuma plataforma entrega lista de espectadores. Nenhuma. **[M]**

- **Twitch:** 149 rotas na API Helix. **Zero** devolvem quem está assistindo.
  Só `viewer_count`, um número inteiro. O EventSub não tem evento de entrada
  nem de saída de espectador.
- **Kick:** 10 eventos de webhook, 27 operações de API. Nenhuma de espectador.
- **YouTube:** só `concurrentViewers`.
- **Quem só assiste é estruturalmente invisível nas três.**

**Consequência direta:** aquele sistema que ele viu na Twitch **não podia estar
rastreando espectadores**. Só dá para ver quem **escreve no chat** — e o
`Get Chatters` da Twitch nem timestamp devolve. Sniper que fica calado é
invisível, e sniper que fica calado é a regra.

### 2. O risco jurídico é penal, e é pessoal. **[M]**

Eu tinha dito que o risco vinha da divulgação. **Estava errado.**

- **Art. 226-18 do Code pénal** pune a **coleta** por meio desleal ou ilícito:
  **5 anos e 300 000 EUR**. Não publicar nada **não** protege.
- **Ser "subcontratante" do streamer não transfere a exposição** — art. 28(10)
  do RGPD, e responsabilidade penal francesa é pessoal, não se contratualiza.
- **Manter humano decidindo não resolve.** Acórdão SCHUFA (C-634/21): calcular
  um valor de probabilidade já é decisão automatizada quando quem recebe se
  apoia fortemente nele.
- **Precedente:** a CNIL multou a KASPR em **240 000 EUR** em 05/12/2024 por
  exatamente este padrão — cruzar dados públicos para montar perfil.
- IP é dado pessoal na UE: Recital 30 + acórdão Breyer C-582/14.
- AIPD obrigatória em França para qualquer variante com fonte externa.

**A camada de descobrir Discord, Twitter, e-mail e IP está morta.** Não é
"arriscado": é crime, e ele responde pessoalmente.

### 3. Evasão custa zero. **[M, em simulação]**

O sinal de correlação com o atraso — que eu tinha vendido como a solução —
tem potência ~100% contra quem não se protege, **mas:**

| Sniper injeta atraso aleatório de | Potência do detector cai para |
|---|---|
| ±2 s | **44%** |
| ±4 s | **8%** |

**Você pega o descuidado. Só.** É o mesmo teto que a Valve admitiu no VACNet.

### 4. O mercado não mostra um único sinal de demanda paga. **[M]**

- Único produto pago explicitamente anti-stream-sniping: plugin de **US$ 19,99,
  pagamento único, 0 avaliações**.
- Melhor ferramenta defensiva do GitHub: **5 estrelas**. A mais conhecida
  (SniperHunter) foi **apagada**.
- O incumbente já vende a defesa: **BattleMetrics tem mascaramento de perfil
  lançado e pago**, dentro da assinatura que ele já cobra.
- Substitutos **grátis**: Streamer Mode nativo do Rust desde 2015, delay do OBS,
  delay da Twitch de até 900 s para parceiro.
- Onde o dinheiro está de verdade: **no lado atacante**. RUST DMA cobra
  **US$ 33,33/mês**.
- Marketplace inteiro de plugins de Rust (Codefling): US$ 3,7 mi acumulados
  desde sempre, 11,9 mil clientes.

**US$ 5/mês como produto avulso não é sustentado por nenhum dado.**

### 5. BattleMetrics está fechado por contrato e por API. **[M]**

Cláusula 5 do ToS (vigente 08/12/2025) proíbe vender, licenciar, exibir
publicamente ou derivar o conteúdo deles para fim comercial sem autorização
escrita. E a API devolve 403 sem assinatura — medido ao vivo.

---

## O que sobrevive, e é um produto de verdade

**A virada:** o cliente não quer saber **quem** é o sniper. Quer que ele
**não esteja na partida**. Isso troca *detecção e acusação* por
**controle de entrada** — e controle de entrada não precisa de identidade
nenhuma fora do jogo.

É o que os grandes já fazem, e é a única defesa comprovadamente eficaz:
**fila de entrada com atraso aleatório durante a live.**
R6 Siege (Ubisoft, 22/02/2021), CoD Cold War (3/5/10/15/20/aleatório),
Fortnite (aleatório entre 0 e um teto). **[M]**

**Forma do produto:**

1. **Plugin no servidor + companion RCON, vendido ao DONO DO SERVIDOR**, não ao
   streamer. Não é escolha estética: sem RCON não há dado, e sem ser dono do
   servidor não há RCON.
2. **Só SteamID64 e horário de conexão do próprio servidor.** Nunca IP — é
   desnecessário e é dado pessoal explícito. SteamID guardado em hash com sal,
   retenção curta e declarada.
3. **Saída: score privado para o admin.** Nunca dossiê, nunca nome fora do jogo.
4. **Ação dentro do servidor que o cliente controla:** fila com atraso
   aleatório durante a live, whitelist temporária, ou marcação para o admin.
5. **Base legal:** interesse legítimo com relação prévia (Recital 47) e
   finalidade antiabuso (EDPB 1/2024 §126), avisado nas regras do servidor,
   com AIPD feita antes.
6. **Nunca agregar entre servidores.** É aí que vira tratamento de larga escala.

**O que o RCON do Rust realmente entrega [M]:** `DisplayName`, `SteamID64`,
`Address`, `Ping`, `ConnectedSeconds` via `playerlist`; mais `sv stats`,
`printpos` e `combatlog <steamid>` de terceiros. Demos server-side **são**
desserializáveis — a própria Facepunch publica `Facepunch/Rust.Polyfill` — mas
não existe parser pronto.

### O sinal certo para começar

Não é o atraso. É **"entrou no servidor logo depois do streamer ficar ao
vivo"** — só precisa de log de conexão e do evento `stream.online` do EventSub.

Três exigências que quase todo mundo erra **[M]**:
- **O nulo tem que ser o histórico do próprio suspeito**, não uma taxa média.
  O sinal "só joga quando o streamer está ao vivo" perde **12 ordens de
  grandeza** quando se controla o horário habitual da pessoa.
- **Correção de multiplicidade** (Benjamini-Hochberg). Sem isso a taxa de falso
  positivo declarada não significa nada.
- **Nunca veredito de sessão única.** Acumular ao longo de sessões.

E a matemática do falso positivo, que é o produto inteiro: com prevalência de
0,1% e 1 milhão de testes, **taxa de 1e-4 ainda produz 100 acusações falsas**.
Para banir automaticamente teria que ser 1e-6. **Ninguém bane automático — a
norma do setor é score + humano.**

---

## O primeiro passo, e ele é de graça

**Passo 0 — sem código, e mata a tese mais rápido que qualquer coisa.**

20 conversas no Discord com donos de servidor de Rust e streamers. Uma pergunta:

> **"Quanto você já gastou tentando resolver stream sniping?"**

**Critério de morte: se menos de 3 em 20 já gastaram dinheiro, para.**

Ele tem contato direto com todos eles. Isso custa uma tarde e decide tudo.
E o prévio é negativo — 0 avaliações no único produto do nicho, 5 estrelas na
melhor ferramenta livre, repositório mais famoso apagado.

**Passo 1 — teste técnico de 30 minutos que nunca foi feito.**
Rodar `A2S_PLAYER` contra servidores públicos de Rust. O ambiente da pesquisa
tinha UDP bloqueado, então isso ficou **[N/M]**. Sabe-se que a Facepunch criou
`server.censorplayerlist` (padrão `false`) justamente para mascarar essa lista
**[M]** — forte indício de que os nomes vêm por padrão. Se o pacote trouxer
tempo de conexão, existe um caminho sem RCON e o cliente muda.

**Passo 2 — a taxa-base real, que ninguém tem.**
7 dias num servidor parceiro: logar conexões (SteamID em hash, retenção 7 dias,
aviso nas regras) + `stream.online` do próprio canal. Entregável: **quantos
falsos positivos aparecem em jogadores reais.** Toda a potência medida até aqui
é simulação com nulo de Poisson; gente real tem hábito e reage aos mesmos
eventos. Se a taxa real estourar, o produto morre aqui, e morre barato.

Nenhum dos três exige gastar com BattleMetrics, tocar em identidade fora do
jogo, ou escrever uma linha de visão computacional.

---

## Onde este parecer pode estar errado

1. **Cinco dos oito blocos não sobreviveram ao cético.** Usei as versões
   corrigidas, mas a base é mais frágil do que a etiqueta sugere.
2. **Não existe verdade conhecida em lugar nenhum.** Toda a potência do
   detector é simulação própria. É exatamente o Passo 2.
3. **`A2S_PLAYER` nunca foi testado.** Se devolver tempo de conexão, muda o
   cliente e o tamanho de mercado inteiro deste parecer.
4. **Ferramenta privada não é mensurável.** Se existe algo a ~US$10/mês
   circulando em Discord fechado, o diagnóstico de "mercado vazio" está medindo
   só a parte visível. **Ele tem acesso a esses Discords. Só ele consegue medir isto.**
5. **As patentes da Amazon medidas são americanas.** Se há família europeia é
   **[N/M]**. Vendendo só na UE o risco pode ser bem menor.
6. **Isto não é aconselhamento jurídico.** E a primeira versão continha uma
   recomendação acionável falsa — a de que só a divulgação gerava risco.

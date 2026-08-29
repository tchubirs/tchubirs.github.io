#!/usr/bin/env node
'use strict';
/**
 * Os nomes que uma conta já usou — lidos da PÁGINA, no teu navegador.
 *
 *   npm run nomes -- 76561198155380495
 *   npm run nomes -- https://steamcommunity.com/id/kjljkjkjk6753
 *   npm run nomes -- 76561198155380495 --ver     (abre a janela para tu veres)
 *
 * Por que pela página e não por API: nenhuma API entrega os nomes.
 * Medido em 28/08/2026 —
 *   steamid.uk v2      → devolve a CONTAGEM ("name_history_count": "343"),
 *                        nunca a lista
 *   steamhistory.net   → /api/names responde "Insufficient API Permissions"
 *   BattleMetrics      → assinatura paga, e só dentro do próprio servidor
 *   Steam (ajaxaliases)→ teto de 10 nomes; 0–1 quando o perfil é privado
 *
 * E a página tem. Ele viu 343, 196, 133 e 61 nomes na tela. A pergunta que
 * ele fez — *"se eu consigo usar, por que você não consegue?"* — está
 * certa: quem não alcança sou eu, do meu ambiente, sem rede no navegador e
 * com o IP bloqueado. Na máquina dele a página abre, e é lá que isto roda.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { resolverEntrada } = require('../src/steam');
const { lerNomesDaPagina, lerAgrupadoPorAno, lerSteamidUk } = require('../src/nomes-pagina');
const { nomesQueValem, raizesRepetidas } = require('../src/nome-principal');
const { chaveDoDia } = require('../src/data');

const RAIZ = path.join(__dirname, '..');
const PERFIL = process.env.DETETIVE_PERFIL_NOMES
  || path.join(os.homedir(), '.detetive-navegador-nomes');
const SAIDA = path.join(RAIZ, 'dados');

const args = process.argv.slice(2);
const VISIVEL = args.includes('--ver') || process.env.DETETIVE_VISIVEL === '1';
// `--tudo` consulta as duas fontes e junta. Sem ele, para na primeira
// que responder — que é o que serve no dia a dia.
const TUDO = args.includes('--tudo');
// Vários alvos numa corrida só: `npm run nomes -- ID1 ID2 ID3 --ver`.
const ALVOS = args.filter((a) => !a.startsWith('-'));
const alvo = ALVOS[0];

if (!alvo) {
  console.error('\n  uso: npm run nomes -- <SteamID64 | link do perfil> [mais IDs] [--ver]\n');
  process.exit(2);
}

// Bandeira que eu não conheço é ERRO, não coisa para ignorar.
//
// Aconteceu de verdade: no PowerShell dele o comando colou-se ao texto que
// já estava na linha e saiu `--vergit pull`. Isso não é `--ver` — a janela
// nunca abriu, o Chrome correu escondido, o Cloudflare barrou, e a saída
// disse "nada" como se a conta não tivesse nomes. Sete minutos à espera de
// um erro de digitação. Um aviso aqui apanha isso no primeiro segundo.
//
// Já os IDs a mais são bem-vindos: `npm run nomes -- ID1 ID2 ID3 --ver` corre
// as três com um só login. Antes eu recusava o segundo ID como se fosse erro,
// e ele ficou a mandar um de cada vez — a repetir o login a cada corrida.
const CONHECIDAS = new Set(['--ver', '--tudo']);
const estranha = args.find((a) => a.startsWith('-') && !CONHECIDAS.has(a));
if (estranha) {
  console.error(`\n  não conheço "${estranha}".`);
  console.error('  As únicas são --ver (abre a janela) e --tudo (consulta as duas fontes).');
  if (estranha && estranha.startsWith('--ver') && estranha !== '--ver') {
    console.error(`\n  Parece "--ver" com texto colado atrás: "${estranha}".`);
    console.error('  No PowerShell, carrega Esc para limpar a linha ANTES de colar.');
  }
  console.error(`\n  uso: npm run nomes -- ${alvo} --ver\n`);
  process.exit(2);
}

/** As páginas que mostram histórico de nomes, na ordem em que vale tentar. */
const FONTES = process.env.DETETIVE_NOMES_URL
  // Endereço fixo para eu poder provar o caminho do navegador contra uma
  // página local, sem depender de alcançar o site de fora.
  // Aceita vários endereços separados por vírgula, na mesma ordem em que o
  // comando os tentaria. É assim que eu provo, com um servidor local, que
  // ele fica com o melhor dos dois e não com o primeiro que respondeu.
  ? [{ nome: 'teste',
    urls: (id) => process.env.DETETIVE_NOMES_URL.split(',')
      .map((u) => u.trim().replace('{id}', id)).filter(Boolean) }]
  // Duas fontes, porque UMA prova diz que uma só não chega.
  //
  // MEDIDO por mim, na API do steamid.uk com o plano dele ativo:
  //
  //     76561198155380495   optout=0 · 343 nomes na base
  //     76561198145264799   optout=1 · 0        ← cego
  //     76561198178303493   optout=1 · 0        ← cego
  //     76561198856715171   optout=1 · 0        ← cego (dilanzito)
  //
  // `optout=1` é remoção a pedido do titular, e pagar não desfaz: o Silver
  // está ativo (`patreon: 1`) e continua a devolver zero. Ou seja, o
  // steamid.uk sozinho é cego em três de quatro casos reais dele — e ISSO
  // é o que justifica uma segunda fonte.
  //
  // ⚠️ O que NÃO é medido: eu nunca vi uma página do steamhistory.net. O
  // Cloudflare barra-me em tudo (403 "Just a moment") e a API deles recusa
  // por permissão. Escrevi aqui, num commit anterior, que o steamhistory
  // tinha 196 e 61 nomes nessas contas — esses números vieram das capturas
  // de ecrã dele, e eu nem sei se as capturas eram desse site: presumi pelo
  // desenho ser diferente do steamid.uk. Apresentar isso como medição foi
  // erro meu, e ele apanhou.
  //
  // Então o steamhistory entra como TENTATIVA, não como fonte conhecida:
  // não sei o formato do endereço nem se a página mostra a lista. Se der,
  // ótimo; se não, o comando diz o que encontrou em vez de fingir.
  //
  // steamhistory.net primeiro, e a ordem mudou por MEDIÇÃO dele, não por
  // gosto. Ele mandou o retrato da página com o endereço certo:
  //
  //     /id/<steamid>            → 133 nomes, mas 10 por página (14 páginas)
  //     /history/0/<steamid>     → a lista inteira, é para onde o "View All" vai
  //
  // Eu tinha adivinhado o `/id/` — e por isso vinham só 10. O `/history/0/`
  // eu não teria descoberto: não é derivável do primeiro.
  //
  // Por que passa à frente do steamid.uk, apesar de ele pagar o steamid.uk:
  //
  //   - dá o DIA E A HORA ("28/08/2026, 05:52:04"), não só o ano. Isso muda
  //     a qualidade do sinal: "voltou ao nome" passa a ser datável.
  //   - não pede login para mostrar a lista inteira.
  //   - o steamid.uk devolve `optout=1` em 3 das 4 contas de teste dele, e
  //     pagar não desfaz isso. Nessas contas ele é cego, e esta não é.
  //
  // O steamid.uk continua a ser consultado — ver `incompleto()` abaixo: uma
  // lista cortada não conta como resposta, e o comando segue para a outra
  // fonte em vez de parar contente com metade.
  //
  // A ORDEM voltou atrás, e desta vez com medição das duas, na mesma conta,
  // na máquina dele:
  //
  //     steamid.uk (logado)          344 nomes, com o DIA
  //     steamhistory /history/0/     100 nomes  (o site anuncia 133)
  //     steamhistory /id/             10 nomes  (paginado)
  //
  // Eu tinha posto o steamhistory à frente com o argumento de que dava o dia
  // e não pedia login. O primeiro argumento caiu quando o HTML dele mostrou
  // que o steamid.uk LOGADO também dá o dia; o segundo caiu quando o
  // /history/0/ parou nos 100. Uma fonte que entrega 100 de 133 não é a mais
  // completa — e ele paga o Silver justamente para destrancar a outra.
  //
  // Deslogado o steamid.uk esconde tudo, e aí `incompleto()` manda seguir
  // para o steamhistory na mesma. Ou seja, pôr o pago à frente não perde
  // nada: perde-se sim quando o teto de 100 encerra a busca.
  : [
    { nome: 'steamid.uk', urls: (id) => [`https://steamid.uk/profile/${id}`] },
    { nome: 'steamhistory.net',
      urls: (id) => [
        // O "View All" da página dele aponta para aqui. Ir direto poupa o
        // clique e não depende do botão estar escrito em inglês.
        `https://steamhistory.net/history/0/${id}`,
        `https://steamhistory.net/id/${id}`,
      ] },
  ];

/**
 * A resposta chegou pela metade?
 *
 * Isto existe porque "achei nomes" não é o mesmo que "achei os nomes". O
 * steamid.uk deslogado devolve 3 de 344 e, sem esta verificação, o comando
 * dava-se por satisfeito e nunca tentava a segunda fonte — que tinha a lista
 * inteira. Meia resposta que interrompe a busca é pior que resposta nenhuma.
 */
// Tamanhos de página que os sites usam. Uma lista que acaba EXATAMENTE num
// destes é quase sempre um teto, não o fim dos dados.
const TETOS = new Set([10, 20, 25, 50, 100, 150, 200, 250, 500, 1000]);

function incompleto(r) {
  if (!r?.nomes?.length) return true;
  if (r.cortados > 0) return true;
  // A própria página anuncia quantos são. Ler menos que isso é paginação
  // que eu não segui, ou lista cortada — nos dois casos, falta.
  if (r.total && r.nomes.length < r.total) return true;
  // Contagem redonda sem total anunciado: desconfia.
  //
  // Na corrida dele o /history/0/ devolveu exatamente 100 quando o site
  // anuncia 133, e o total do cabeçalho era impróprio (o SteamID). Sem esta
  // linha o comando dava-se por satisfeito com 100 e nunca chegava aos 344
  // do steamid.uk. Consultar a outra fonte custa segundos; ficar 244 nomes
  // abaixo custa o caso. Na dúvida, olha-se as duas.
  if (!r.total && TETOS.has(r.nomes.length)) return true;
  return false;
}

(async () => {
  // Antes de tudo: esta cópia está em dia?
  //
  // Ele correu o comando cinco commits atrasado e recebeu uma saída ERRADA
  // sem um único aviso — a ordem das fontes trocada e 10 nomes em vez de 133,
  // que eram exatamente os defeitos já corrigidos no repositório. Passou tempo
  // a desconfiar do programa quando o programa já estava certo. Um comando que
  // sabe estar velho e não diz nada está a mentir por omissão.
  //
  // Puxa sozinho quando é seguro, porque "faz git pull" é um passo que a
  // máquina faz melhor — e que ele não tem de carregar.
  // A PRIMEIRA coisa: dizer que arrancou.
  //
  // Ele escreveu "nada acontece". E não estava enganado — a primeira linha que
  // eu imprimia vinha depois da verificação de versão e do arranque do
  // navegador, o que pode ser meia dúzia de segundos de ecrã vazio. Um comando
  // que arranca em silêncio é indistinguível de um comando que não arrancou.
  console.log(`\n  a ler ${ALVOS.length} ${ALVOS.length === 1 ? 'conta' : 'contas'}…`);

  if (process.env.DETETIVE_JA_ATUALIZEI !== '1') {
    process.stdout.write('  ⟳ a ver se há versão nova… ');
    const { verificarAtualizacao } = require('../src/atualizar');
    const v = verificarAtualizacao();
    console.log(v.estado === 'trouxe' ? '' : v.estado === 'atualizado' ? 'em dia.'
      : v.estado === 'sem-git' ? 'não deu para saber — sigo.' : '');
    if (v.estado === 'trouxe') {
      console.log(`\n  ⟳ atualizei sozinho: ${v.atras} ${v.atras === 1 ? 'versão nova' : 'versões novas'}. A correr com o código novo.`);
      // Recomeçar é obrigatório, não é zelo: os módulos já foram carregados
      // para a memória ANTES do merge. Sem isto o código velho é que corria,
      // e a mensagem em cima seria uma promessa por cumprir.
      const { spawnSync } = require('node:child_process');
      const r = spawnSync(process.execPath, [__filename, ...args], {
        stdio: 'inherit',
        env: { ...process.env, DETETIVE_JA_ATUALIZEI: '1' },
      });
      process.exit(r.status ?? 0);
    }
    if (v.estado === 'sujo') {
      console.log(`\n  ⚠ há ${v.atras} ${v.atras === 1 ? 'versão nova' : 'versões novas'}, mas tens ${v.detalhe} por gravar.`);
      console.log('    Não mexo no teu trabalho. O que vais ver a seguir é da versão VELHA.');
      console.log('    Para atualizar:  git stash  &&  git pull');
    }
    if (v.estado === 'divergiu') {
      console.log(`\n  ⚠ estás ${v.atras} atrás e o teu ramo seguiu outro caminho — não puxo por cima.`);
      console.log('    O que vais ver a seguir pode ser da versão VELHA.');
    }
  }

  let chromium;
  try { ({ chromium } = require('playwright')); }
  catch {
    console.error('\n  Falta o navegador. Rode:\n    npm install\n    npx playwright install chromium\n');
    process.exit(3);
  }

  const op = {
    headless: !VISIVEL,
    viewport: { width: 1280, height: 1000 },
    // O Chromium do Playwright anuncia que é automatizado, e o Cloudflare
    // recusa por isso — foi o que travou a primeira tentativa dele, com o
    // desafio a nunca resolver em 45s. Esta bandeira tira o sinal mais
    // óbvio (`navigator.webdriver`).
    args: ['--disable-blink-features=AutomationControlled'],
  };
  if (process.env.DETETIVE_CHROME) op.executablePath = process.env.DETETIVE_CHROME;
  // Perfil próprio: o Chromium recusa duas aberturas da mesma pasta, e
  // partilhar com o agente faria um dos dois nunca subir.

  // O Chrome INSTALADO na máquina passa onde o Chromium do Playwright é
  // barrado: tem as mesmas impressões digitais de um navegador de pessoa,
  // e o Cloudflare trata-o como tal. Se não existir, cai no Chromium.
  let ctx = null;
  if (!process.env.DETETIVE_CHROME) {
    try { ctx = await chromium.launchPersistentContext(PERFIL, { ...op, channel: 'chrome' }); }
    catch { /* sem Chrome instalado */ }
  }
  if (!ctx) ctx = await chromium.launchPersistentContext(PERFIL, op);

  // Reaproveita a aba que o navegador JÁ abriu, em vez de abrir outra.
  //
  // Ele reparou: "tem sempre uma aba sem nada". Tinha. Um contexto persistente
  // nasce com uma página em branco, e `newPage()` acrescentava uma segunda —
  // ficava o about:blank órfão ao lado. Não estragava a leitura, mas na janela
  // dele parecia defeito. E era: quando a ferramenta abre coisas que não usa,
  // ele deixa de saber o que é normal e o que é problema.
  const p = ctx.pages()[0] || await ctx.newPage();

  /** Uma tentativa numa URL. Devolve o que a página deu, sem julgar. */
  async function tentar(url) {
    await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Esperar o Cloudflare sair — detetado pelo CONTEÚDO, não pelo título.
    //
    // Olhava o título antes, procurando "just a moment". Na máquina dele o
    // Windows está em português e o título vinha "Um momento…": a condição
    // não bateu, o código achou que já tinha passado e leu a página do
    // desafio. O retrato que ele colou dizia, em português, "Verificação
    // bem-sucedida. Esperando a resposta de steamid.uk" — tinha passado
    // mesmo, eu é que li cedo.
    //
    // `window._cf_chl_opt` é o objeto que o Cloudflare injeta na página do
    // desafio. Existe igual em qualquer idioma, e some quando a página real
    // chega. Título é tradução; isto é mecanismo.
    const naVerificacao = () => p.evaluate(`Boolean(
      window._cf_chl_opt
      || document.getElementById('challenge-error-text')
      || document.querySelector('#cf-chl-widget, [id^="cf-chl"], #challenge-running')
    )`).catch(() => false);

    // Até 45s: o desafio pode demorar, e desistir cedo é o erro que já
    // aconteceu. Sair assim que a página real chega mantém o caso normal
    // rápido.
    // Com a janela aberta vale esperar: o desafio resolve-se. Escondido, ele
    // quase nunca passa — e 45s × 5 endereços são quase quatro minutos à
    // espera de um "não". Foi o que aconteceu na máquina dele.
    const paciencia = VISIVEL ? 45 : 12;
    for (let i = 0; i < paciencia; i++) {
      if (!(await naVerificacao())) break;
      await p.waitForTimeout(1000);
    }

    // Ainda no desafio com a janela aberta? Então peço ajuda em vez de
    // desistir. É UMA vez: a verificação e o login ficam guardados no
    // perfil, e as próximas execuções correm sozinhas.
    if (VISIVEL && await naVerificacao()) {
      console.log('\n  ⏸  O Cloudflare está a pedir verificação na janela que abriu.');
      console.log('     Resolve lá (costuma ser uma caixa para marcar) e, se for');
      console.log('     a primeira vez, faz login no site também.');
      console.log('     Não precisas de voltar aqui — eu vejo quando passar.\n');
      // Também aqui: espero, não prendo. Ver o comentário longo na pausa do
      // login, mais abaixo — o motivo é o mesmo e o estrago era o mesmo.
      for (let i = 0; i < 120 && await naVerificacao(); i++) {
        await p.waitForTimeout(1000);
        if (i % 10 === 0 && i && process.stdout.isTTY) {
          process.stdout.write(`\r     … ainda na verificação (${120 - i}s)   `);
        }
      }
      if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(46) + '\r');
    }

    await p.waitForTimeout(3000);

    /** Uma leitura da página como ela está agora. */
    const ler = async () => {
      // Se a página pagina a lista, peço tudo antes de ler.
      for (const texto of ['View All', 'Ver tudo', 'Show all']) {
        const b = p.locator(`text="${texto}"`).first();
        if (await b.count().catch(() => 0)) {
          await b.click({ timeout: 5000 }).catch(() => {});
          await p.waitForTimeout(2500);
          break;
        }
      }
      // As TRÊS funções vão para dentro da página. `lerNomesDaPagina` chama
      // `lerSteamidUk` e `lerAgrupadoPorAno`, e `toString()` não leva as
      // dependências junto: sai o corpo da função e mais nada.
      //
      // Esquecer uma aqui não dá erro nenhum à vista. A página estoura com
      // "lerSteamidUk is not defined" lá dentro, o `catch` de fora engole, e
      // a fonte sai como "— nada". O leitor ficava escrito no repositório e
      // nunca corria uma única vez.
      //
      // E `evaluate` com texto quer uma EXPRESSÃO, daí o embrulho.
      return p.evaluate(`(() => {
        ${lerSteamidUk.toString()}
        ${lerAgrupadoPorAno.toString()}
        ${lerNomesDaPagina.toString()}
        return lerNomesDaPagina(document);
      })()`);
    };

    let r = await ler();

    // Deslogado? Então a janela está aberta à toa.
    //
    // Este era um buraco real: a pausa só acontecia se o Cloudflare ainda
    // estivesse a desafiar. Só que a verificação fica GUARDADA no perfil —
    // da segunda vez em diante o desafio não aparece, o script não pausa, e
    // lê a página de visitante em três segundos. Ou seja, `--ver` existia
    // para ele poder fazer login e não dava tempo nenhum de o fazer.
    //
    // Agora quem manda é o resultado: se a lista veio cortada ou escondida e
    // a janela está aberta, paro, peço o login e leio OUTRA VEZ. Se já
    // estiver logado, nada disto acontece e o comando corre direto.
    const faltaLogin = Boolean(r && (r.limitado || r.cortados > 0));
    // UMA vez por corrida, não uma por conta.
    //
    // Com três SteamIDs de seguida isto podia parar três vezes — e nas contas
    // com `optout=1` o site continua a esconder a lista MESMO logado, portanto
    // ele voltaria a ver o pedido de login já estando logado. Pedir o que já
    // foi feito ensina a ignorar o pedido.
    if (VISIVEL && faltaLogin && !jaPediuLogin) {
      jaPediuLogin = true;
      console.log('');
      if (r.cortados) {
        console.log(`  ⏸  O site cortou ${r.cortados} nomes ("Gat..", "Pl..") — é o que ele faz com visitante.`);
      } else {
        console.log('  ⏸  O site está a esconder a lista — é o que ele faz com visitante.');
      }
      console.log('     Na janela que abriu: faz login no steamid.uk (botão "Login" / "Sign in');
      console.log('     through Steam", no topo). É o teu plano Silver que destranca a lista.');
      console.log('     Não precisas de voltar aqui: eu vou espreitando a página sozinho.\n');

      // NÃO toco no teclado. E é de propósito.
      //
      // Antes eu esperava por um ENTER (`process.stdin.once('data')`). O
      // resultado, na máquina dele: o processo ficava a segurar a entrada, tudo
      // o que ele escrevia era engolido, e quando o processo acabava o
      // PowerShell despejava a fila e corria as linhas todas de uma vez. O
      // terminal encheu-se de comandos que nunca correram — e um deles era um
      // `curl` de outra tarefa qualquer. Pedir uma tecla para continuar
      // transformou-se num alçapão.
      //
      // A pergunta "ele já fez login?" tem resposta na PÁGINA. Então pergunto à
      // página, de dez em dez segundos, e calo-me. Ele faz o login quando puder;
      // eu noto sozinho. É a diferença entre esperar e prender.
      // 4 minutos dá para fazer login com calma. Encurtável por ambiente para
      // eu poder PROVAR esta espera a correr, em vez de a afirmar.
      const ESPERA_MAX = Number(process.env.DETETIVE_ESPERA_LOGIN) || 240;
      const DE_CADA = Math.min(10, Math.max(2, Math.floor(ESPERA_MAX / 4)));
      let depois = null;
      for (let esperou = 0; esperou < ESPERA_MAX; esperou += DE_CADA) {
        await p.waitForTimeout(DE_CADA * 1000);
        // Recarrega: o login muda a sessão, e a página velha continua a ser a
        // do visitante mesmo depois de autenticado noutro separador.
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await p.waitForTimeout(2000);
        depois = await ler();
        if (depois?.nomes?.length && !depois.cortados) break;
        const faltam = ESPERA_MAX - esperou - DE_CADA;
        // Só num terminal a sério. O `\r` reescreve a linha quando há ecrã;
        // canalizado para um ficheiro, empilha tudo numa linha ilegível.
        if (faltam > 0 && process.stdout.isTTY) {
          process.stdout.write(`\r     … ainda escondida — volto a espreitar (${faltam}s)   `);
        }
      }
      if (process.stdout.isTTY) process.stdout.write('\r' + ' '.repeat(58) + '\r');
      // Só troco se melhorou. Se o login não pegou, ficar com a leitura pior
      // seria perder o pouco que eu já tinha.
      const melhor = (a, b) => (a?.nomes?.length || 0) >= (b?.nomes?.length || 0) ? a : b;
      r = melhor(depois, r);
      if (depois?.nomes?.length && !depois.cortados) {
        console.log('  ✓ o login pegou — a lista veio inteira.\n');
      } else if ((depois?.cortados || 0) > 0) {
        console.log(`  ⚠ ainda vieram ${depois.cortados} cortados — o login pode não ter pegado.\n`);
      } else {
        // Sem isto o comando seguia calado e ele ficava sem saber se falhou o
        // login ou se a conta é daquelas que o site esconde de qualquer forma.
        const quanto = ESPERA_MAX >= 90 ? `${Math.round(ESPERA_MAX / 60)} min` : `${ESPERA_MAX}s`;
        console.log(`  ⚠ passaram ${quanto} e a página continua a esconder a lista.`);
        console.log('    Ou o login não pegou, ou esta conta pediu remoção ao site');
        console.log('    (optout) — e aí pagar não desfaz. Sigo para a outra fonte.\n');
      }
    }

    return r;
  }

  // O pedido de login é uma vez por corrida, não uma por conta — a bandeira
  // vive aqui fora de propósito, para atravessar todos os SteamIDs.
  let jaPediuLogin = false;

  // Várias contas numa corrida só.
  //
  // Ele estava a mandar-me um SteamID de cada vez e a correr o comando outra
  // vez para cada um. Com `--ver` isso é pior do que parece: cada corrida abre
  // uma janela nova e ele teria de confirmar o login de novo. Uma janela, um
  // login, todas as contas — é o mesmo trabalho da máquina e nenhum dele.
  let pior = 0;
  for (const [i, alvo] of ALVOS.entries()) {
    if (i > 0) console.log(`\n${'─'.repeat(64)}`);
    const codigo = await umaConta(alvo);
    if (codigo > pior) pior = codigo;
  }
  await ctx.close().catch(() => {});
  process.exit(pior);

  /** Uma conta, do SteamID à saída. Devolve o código de saída dela. */
  async function umaConta(alvo) {
  const id = await resolverEntrada(alvo).catch(() => null);
  if (!id) { console.error(`\n  não consegui virar "${alvo}" em SteamID.\n`); return 2; }
  console.log(`\n  SteamID: ${id}`);

  const achados = [];
  let ultimoRetrato = null;

  for (const fonte of FONTES) {
    process.stdout.write(`  ${fonte.nome.padEnd(18)} `);
    let ok = null;
    for (const url of fonte.urls(id)) {
      let r = null;
      try { r = await tentar(url); }
      catch (e) { continue; }                    // endereço errado: próximo
      if (r?.nomes?.length) {
        const este = { fonte: fonte.nome, url, ...r };
        // Fico com o melhor entre os endereços da mesma fonte. O `/id/` do
        // steamhistory dá 10 nomes paginados e o `/history/0/` dá os 133 —
        // parar no primeiro que responde ficaria com os 10.
        if (!ok || este.nomes.length > ok.nomes.length) ok = este;
        if (!incompleto(ok)) break;              // completo: não há melhor
        continue;                                 // incompleto: tenta o próximo
      }
      if (r?.cloudflare) { ultimoRetrato = { fonte: fonte.nome, url, ...r }; break; }
      if (r?.limitado) { ultimoRetrato = { fonte: fonte.nome, url, ...r }; break; }
      if (r?.retrato) ultimoRetrato = ultimoRetrato || { fonte: fonte.nome, url, ...r };
    }
    if (ok) {
      console.log(`✓ ${ok.nomes.length} nomes${ok.total ? ` (a página diz ${ok.total})` : ''}${
        ok.cortados ? ` · ${ok.cortados} vieram cortados` : ''}`);
      achados.push(ok);
      // Sem --tudo, a primeira que responder INTEIRA basta. Uma lista
      // cortada não encerra a busca: é justamente quando a segunda fonte
      // vale mais. Com --tudo sigo sempre, para juntar os dois bancos.
      if (!TUDO && !incompleto(ok)) break;
      if (!TUDO) console.log('    (veio incompleta — vou tentar a outra fonte)');
    } else if (ultimoRetrato?.fonte === fonte.nome && ultimoRetrato.limitado) {
      console.log(`⚠ ${ultimoRetrato.erro}${ultimoRetrato.totalDito ? ` — admite ${ultimoRetrato.totalDito} nomes` : ''}`);
    } else if (ultimoRetrato?.fonte === fonte.nome && ultimoRetrato.cloudflare) {
      // "nada" aqui era mentira por omissão: dizia o mesmo que "esta conta
      // não tem nomes", quando o que houve foi um muro à porta. São coisas
      // opostas, e a linha tem de as separar.
      console.log(`⚠ o Cloudflare barrou${VISIVEL ? '' : ' — escondido ele barra quase sempre; usa --ver'}`);
    } else {
      console.log('— nada');
    }
  }

  // Junta as fontes. Mesmo nome no mesmo ano é a mesma coisa; o resto soma.
  let resultado = null;
  if (achados.length === 1) resultado = achados[0];
  else if (achados.length > 1) {
    const vistos = new Map();
    for (const a of achados) {
      for (const n of a.nomes) {
        // A chave usa a data NORMALIZADA, não o texto do site.
        //
        // Era aqui o buraco: o steamid.uk escreve "29 Oct 2016" e o
        // steamhistory escreve "29/10/2016" para o MESMO dia. As duas linhas
        // nunca batiam certo, o evento entrava duas vezes, e a partir daí o
        // sinal REPETIU dizia "usou 2×" sobre quase todos os nomes — não
        // porque a pessoa voltou ao nome, mas porque eu li a mesma coisa em
        // dois sítios. O sinal mais forte do programa a medir quantas fontes
        // consultei em vez de medir a pessoa.
        const k = `${String(n.nome).toLowerCase()}|${chaveDoDia(n)}`;
        if (!vistos.has(k)) vistos.set(k, { ...n, fonte: a.fonte });
      }
    }
    resultado = {
      fonte: achados.map((a) => a.fonte).join(' + '),
      url: achados.map((a) => a.url).join(' , '),
      nomes: [...vistos.values()],
      total: achados.reduce((t, a) => Math.max(t, a.total || 0), 0) || null,
      cortados: achados.reduce((t, a) => t + (a.cortados || 0), 0),
      // A precisão do conjunto é a PIOR das partes, nunca a melhor: juntar
      // uma fonte com o dia e outra só com o ano dá uma lista onde metade
      // tem dia. Chamar isso de "dia" seria prometer o que a coluna não tem.
      // Precisão AUSENTE é a pior de todas, não é "não conta".
      //
      // O `.filter(Boolean)` deitava fora a fonte que não declara precisão, e
      // então uma fonte com dia mais uma sem declaração davam "dia" — a
      // promessa da coluna vinha de quem falou, não de quem tem menos.
      precisao: (() => {
        const ps = new Set(achados.map((a) => a.precisao ?? 'desconhecida'));
        if (ps.size === 1) return [...ps][0];
        return 'mista';
      })(),
      comData: achados.reduce((t, a) => t + (a.comData || 0), 0),
      soAno: achados.reduce((t, a) => t + (a.soAno || 0), 0),
      semData: achados.reduce((t, a) => t + (a.semData || 0), 0),
      porFonte: achados.map((a) => `${a.fonte}: ${a.nomes.length}`),
    };
    console.log(`\n  juntando as fontes → ${resultado.nomes.length} nomes distintos (${resultado.porFonte.join(' · ')})`);
  } else {
    resultado = ultimoRetrato;
  }



  if (resultado?.nomes?.length) {
    console.log(`\n  ${resultado.nomes.length} nomes de ${id} — via ${resultado.fonte}`);
    // O que a coluna da esquerda é, de facto.
    //
    // Eu andei a imprimir "a página dá o ano, não o dia" como se fosse
    // sempre verdade. Não é — era o site DESLOGADO. O HTML da sessão dele
    // mostrou "(seen) Wed, 05 Aug 2026": logado, o steamid.uk dá o dia. A
    // linha antiga tirava precisão real da vista dele.
    //
    // Agora a linha diz o que veio, e "ano" passa a ser um sinal útil: se
    // aparecer numa leitura do steamid.uk, é porque a sessão não está logada.
    if (resultado.precisao === 'ano') {
      console.log('  (a coluna é o ANO — sem login o site não dá o dia)');
    } else if (resultado.precisao === 'mista' || resultado.precisao === 'desconhecida') {
      // Diz o que ESTÁ lá, contado.
      //
      // A linha antiga dizia "uns com o dia, outros com o ano" mesmo quando
      // nenhum nome tinha só o ano — os sem-dia eram as duas secções do fim,
      // que não têm data nenhuma. Descrever o que não está lá é do mesmo
      // tamanho que esconder o que está.
      const partes = [];
      if (resultado.comData) partes.push(`${resultado.comData} com a data`);
      if (resultado.soAno) partes.push(`${resultado.soAno} só com o ano`);
      if (resultado.semData) partes.push(`${resultado.semData} sem data`);
      console.log(partes.length > 1
        ? `  (a coluna mistura: ${partes.join(', ')})`
        : '  (a coluna mistura precisões)');
    }
    console.log('');
    // Nem todo nome tem data, e escrever "null" na coluna é o pior de dois
    // mundos: parece defeito e não diz nada. Os dois casos sem data têm
    // nome próprio na página — "First name seen by SteamID" e "Unknown" — e
    // o primeiro deles é informação forte, não buraco. Então diz-se o que é.
    const quando = (n) => {
      if (n.em) return String(n.em);
      if (n.secao === 'primeiro-nome') return '1º da conta';
      if (n.secao === 'sem-data') return 'sem data';
      return '—';
    };
    for (const n of resultado.nomes.slice(0, 60)) {
      console.log(`    ${quando(n).padEnd(22)} ${n.nome}`);
    }
    if (resultado.nomes.length > 60) console.log(`    … e mais ${resultado.nomes.length - 60}`);
    // Aviso quando peguei menos do que a própria página anuncia: metade da
    // lista entregue como se fosse inteira é pior que erro nenhum.
    if (resultado.total && resultado.nomes.length < resultado.total) {
      console.log(`\n  ⚠ a página diz ${resultado.total} e eu li ${resultado.nomes.length} — ${
        resultado.cortados ? 'o site cortou a lista' : 'falta paginação'}`);
    }
    // Nomes que o site entregou pela metade ("Gat..", "Pl..").
    //
    // Isto não é detalhe de leitura: é o sinal de que a sessão não está
    // logada. O steamid.uk corta a lista para visitante, e o plano que ele
    // pagou promete exatamente o contrário — "Unrestricted Previous names
    // (Not cut short)" — mas só dentro da sessão. Sem este aviso a saída
    // mostra 2 nomes num ano que declara 18 e parece que a conta teve 2.
    // São coisas opostas, e calar a diferença é o pior dos dois.
    if (resultado.cortados) {
      console.log(`\n  ⚠ ${resultado.cortados} nomes vieram cortados pelo site ("Gat..", "Pl..") e eu descartei:`);
      console.log('    meio nome casaria com meia palavra no cruzamento.');
      console.log('    É assim que o steamid.uk trata quem NÃO está logado. O teu plano Silver');
      console.log('    ("Unrestricted Previous names") só vale dentro da sessão. Loga uma vez:\n');
      console.log(`      npm run nomes -- ${id} --ver`);
      console.log('\n    Faz login na janela que abrir e carrega ENTER aqui.');
      console.log('    Fica guardado no perfil — nas próximas já corre sozinho.');
    }

    // Qual destes é o nome DA PESSOA — pela regra dele:
    //
    //   *"normalmente o nome principal da pessoa é o que ela usa mais de uma
    //   vez e uns dos primeiros da conta"*
    //
    // Sem este passo a saída são 344 nomes achatados, todos com o mesmo peso,
    // e o nome verdadeiro afoga no meio de trezentas piadas. É esta lista
    // curta que vai cruzar com a audiência da Kick, não a lista inteira:
    // cruzar 344 nomes é garantir um acerto por acaso.
    // A raiz vem primeiro porque é a resposta; a lista por nome é o detalhe.
    //
    // Sem este bloco a saída mostrava nove linhas a dizer o mesmo — "Recrutáxi",
    // "[BDM]Senhor recruta", "[YT]Senhor recruta"… — quando o que ele quer
    // saber cabe numa: a pessoa volta sempre a "Recruta".
    const raizes = raizesRepetidas(resultado.nomes);
    if (raizes.length) {
      console.log('\n  a raiz que se repete — é o sinal mais forte que estes nomes dão\n');
      for (const r of raizes.slice(0, 3)) {
        const periodo = r.anos.length >= 2 ? `, de ${r.anos[0]} a ${r.anos[r.anos.length - 1]}`
          : r.anos.length === 1 ? `, em ${r.anos[0]}` : '';
        console.log(`    "${r.raiz}" — em ${r.quantos} nomes${periodo}`);
        const mostra = r.nomes.slice(0, 8).join(' · ');
        console.log(`        ${mostra}${r.nomes.length > 8 ? ` … e mais ${r.nomes.length - 8}` : ''}`);
      }
    }

    // `porRaiz`: as nove variações de "recruta" são um candidato, não nove.
    const provaveis = nomesQueValem(resultado.nomes, { teto: 8, porRaiz: true });
    const comSinal = provaveis.filter((n) => n.pontos > 0);
    if (comSinal.length) {
      // Sinal FORTE é o que aponta para uma pessoa: a raiz que se repete, o
      // nome retomado anos depois, o nome usado mais de uma vez. Estar em
      // primeiro na lista NÃO é sinal forte — numa conta com quatro nomes
      // soltos, alguém tem de ser o primeiro, e esse alguém não é ninguém.
      //
      // Foi assim que a saída chegou a apontar "Juice Fruit". O erro não foi
      // só de contagem: foi pôr um palpite fraco debaixo de um título forte.
      // Título e prova têm de dizer a mesma coisa.
      const forte = comSinal.some((n) => n.raiz || n.voltou || n.repetiu);
      if (forte) {
        console.log('\n  provável nome da pessoa — pela tua regra (volta ao nome + está no começo da conta)\n');
      } else {
        console.log('\n  sinal fraco — nenhum nome se repete nem partilha raiz com outro.');
        console.log('  O que há é só posição na conta, e isso sozinho não nomeia ninguém:\n');
      }
      for (const n of comSinal.slice(0, 5)) {
        console.log(`    ${String(n.pontos).padStart(2)} pt  ${String(n.nome).padEnd(24)} ${n.porque.join(', ')}`);
      }
      // Sem este aviso o topo da lista lê-se como veredito. Não é: é o melhor
      // palpite. Quem confunde as duas coisas acusa inocente.
      console.log(forte
        ? '\n  ⚠ isto é probabilidade, não identidade.'
        : '\n  ⚠ com este material eu não apontaria para ninguém.');
    } else {
      console.log('\n  nenhum nome se destaca: nenhum foi repetido nem retomado anos depois.');
      console.log('  Sem sinal, escolher um seria escolher a esmo — então não escolho.');
    }
    resultado.provaveis = provaveis;

    fs.mkdirSync(SAIDA, { recursive: true });
    const arq = path.join(SAIDA, `nomes-${id}.json`);
    fs.writeFileSync(arq, JSON.stringify(resultado, null, 2));
    console.log(`\n  gravado em ${arq}\n`);
    return 0;
  }

  if (resultado?.cloudflare) {
    console.log('\n  A página ainda estava na verificação do Cloudflare quando eu li.');
    console.log('  Não é bloqueio — é demora. Corre outra vez:\n');
    console.log(`    npm run nomes -- ${id} --ver`);
    console.log('\n  O navegador guarda a verificação, então a segunda vez costuma passar.\n');
    return 1;
  }
  if (resultado?.limitado) {
    console.log(`\n  A página tem os nomes mas não os mostra${
      resultado.totalDito ? ` (admite ${resultado.totalDito})` : ''}.`);
    console.log(`  ${resultado.dica}\n`);
    console.log(`    npm run nomes -- ${id} --ver`);
    console.log('\n  A janela abre; faz login no site e deixa a janela aberta.');
    console.log('  O login fica guardado — nas próximas vezes já roda sozinho.\n');
    return 1;
  }
  console.log('\n  Não consegui ler a lista. O retrato da página, para eu acertar o extrator:\n');
  console.log(JSON.stringify(resultado?.retrato ?? { nada: 'nenhuma fonte respondeu' }, null, 2));
  console.log('\n  Cola isto aqui e eu corrijo.\n');
  return 1;
  }
})().catch((e) => { console.error('\n  erro:', e.message, '\n'); process.exit(1); });

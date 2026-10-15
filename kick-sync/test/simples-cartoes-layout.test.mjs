// Layout REAL dos cartões do modo simples, com o CSS do produto (tokens.css + estilo.css) num Chrome de verdade.
// A página é uma fixture com o MESMO markup das classes que simples.js monta (li.simplesCartao > foto, prévia,
// .simplesInfo com fala/resumo/avisos/botões, .simplesPovs). Não é teste de reprodução nem E2E: só mede layout.
// Não chama nada pago nem a Kick, e não corre a suíte inteira.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const SITE = fileURLToPath(new URL('../site/', import.meta.url));
const temPlaywright = await import('playwright').then(() => true, () => false);
const CHROME = process.env.DETETIVE_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const podeCorrer = temPlaywright && fs.existsSync(CHROME);
const semNavegador = { skip: !podeCorrer && 'sem navegador (DETETIVE_CHROME)' };

const LONGO = 'Momento de combate com um título comprido sem espaços para forçar a quebra: ' + 'x'.repeat(90);

/** Um cartão com o mesmo markup de simples.js. Opções: fala, resumo, aviso de falha, pov, status, semFoto, prévia. */
function cartao(i, o = {}) {
  const nota = o.nota ? `<b class="simplesNota nota-${o.nota}">bom</b> ` : '';
  const foto = o.semFoto
    ? '<span class="simplesSemFoto">21:14<small>sem imagem</small></span>'
    : '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="">';
  const fala = o.fala ? `<p class="simplesFala">“${o.fala}”</p>` : '';
  const povs = o.pov
    ? '<div class="simplesPovs"><p class="simplesPovsTitulo">Quem mais estava no lance?</p><div class="simplesPovOpcoes"><button type="button" class="simplesPovBotao">Eu, na frente</button><button type="button" class="simplesPovBotao">Outro jogador</button></div><button type="button" class="simplesPovBuscar">Buscar</button><p class="simplesPovEstado" role="status">Ainda não procurei.</p></div>'
    : '';
  return `<li class="simplesCartao${o.previa ? ' comPrevia' : ''}" data-i="${i}">`
    + `<button type="button" class="simplesFoto" aria-label="Assistir">${foto}</button>`
    + `<div class="simplesPrevia" hidden></div>`
    + '<div class="simplesInfo"><div class="simplesDetalhes">'
    + (o.doEvento ? '<p class="simplesStreamer">De tchubi</p>' : '')
    + `<p class="simplesMotivo">${nota}${o.titulo}</p>`
    + (o.resumo ? `<p class="simplesResumo">${o.resumo}</p>` : '')
    + (o.analise ? '<p class="simplesAnaliseEstado">Análise por imagem e fala</p>' : '')
    + `<div class="simplesFalaCaixa">${fala}</div>`
    + (o.outros ? '<p class="simplesTambem">Também estavam: fulano e beltrano</p>' : '')
    + (o.falha ? '<p class="simplesTalvezFalha">Talvez a imagem falhe nesse trecho.</p>' : '')
    + '<p class="simplesQuando">Há 2 min · 12 s</p>'
    + '</div><div class="simplesRodape">'
    + '<div class="simplesBotoes">'
    + '<button type="button" class="principal simplesTiktok"><svg class="ic" aria-hidden="true"></svg><span class="longo">Baixar para TikTok</span><span class="curto" aria-hidden="true">TikTok</span></button>'
    + '<button type="button" class="simplesSecundario simplesDeitado"><svg class="ic" aria-hidden="true"></svg><span class="longo">Baixar deitado</span><span class="curto" aria-hidden="true">Deitado</span></button>'
    + '<button type="button" class="simplesSecundario simplesEditar"><svg class="ic" aria-hidden="true"></svg>Editar</button>'
    + '<button type="button" class="simplesSecundario simplesNao" aria-label="Não quero"><svg class="ic" aria-hidden="true"></svg><span>Não quero</span></button>'
    + '</div>'
    + `<p class="simplesBaixando" role="status">${o.status ?? ''}</p>`
    + '<progress class="simplesBarraClipe" max="1" hidden></progress>'
    + `<button type="button" class="simplesSecundario simplesPartilhar"${o.partilhar ? '' : ' hidden'}>Partilhar</button>`
    + '</div></div>' + povs + '</li>';
}

// Seis cartões com textos variados (fala/resumo presentes e ausentes, título comprido, pov, falha, exportação).
// O sétimo, com comPrevia, guarda o transform de .comPrevia (não é medido no alinhamento).
const CARTOES = [
  cartao(0, { doEvento: true, nota: 'muitoBom', titulo: LONGO, fala: 'Vamos lá, esse é o momento!', resumo: 'O jogador reage enquanto procura abrigo, sem combate visível no trecho.', analise: true, outros: true, pov: true }),
  cartao(1, { titulo: 'Tiros curtos' }),
  cartao(2, { titulo: 'Explosão perto da base', fala: 'Cuidado, cuidado, cuidado, olha lá!' }),
  cartao(3, { titulo: 'Morte com fala longa e sem espaços ' + 'y'.repeat(60), fala: 'Eu não acredito que isso aconteceu de novo com a gente hoje, de verdade, de verdade mesmo', falha: true, semFoto: true }),
  cartao(4, { doEvento: true, titulo: 'Luta', nota: 'bom', pov: true, status: 'Pronto para compartilhar', partilhar: true, outros: true }),
  cartao(5, { titulo: 'Clipe da tela', status: 'Pronto: arquivo gerado para TikTok, guardado na pasta de downloads com o nome completo do momento.' }),
  cartao(6, { titulo: 'Com prévia aberta', previa: true, fala: 'Teste' }),
];

const PAGINA = (cards) => `<!doctype html><html lang="pt" data-modo="simples"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="https://povix.teste/tokens.css"><link rel="stylesheet" href="https://povix.teste/estilo.css">
</head><body><main><section class="simples" id="simples">
<div class="simplesTrabalho"><p class="simplesQuem">Procurando momentos de tchubi</p><div class="simplesAcoes"><button type="button">Parar</button></div></div>
<ul class="simplesLista">${cards}</ul>
</section></main></body></html>`;

let navegador = null;
before(async () => {
  if (!podeCorrer) return;
  const { chromium } = await import('playwright');
  navegador = await chromium.launch({ executablePath: CHROME });
});
after(async () => { await navegador?.close(); });

/** Abre a fixture com o CSS real do produto (servido por rota, sem rede). */
async function abrir(largura, cards = CARTOES) {
  const p = await navegador.newPage({ viewport: { width: largura, height: 900 } });
  await p.route('https://povix.teste/**', (r) => {
    const url = new URL(r.request().url());
    if (url.pathname === '/') return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGINA(cards) });
    const ficheiro = SITE + url.pathname.slice(1);
    if (!fs.existsSync(ficheiro)) return r.fulfill({ status: 404, body: 'nao' });
    const tipo = ficheiro.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    return r.fulfill({ status: 200, contentType: `${tipo}; charset=utf-8`, body: fs.readFileSync(ficheiro) });
  });
  await p.goto('https://povix.teste/');
  await p.evaluate(() => document.fonts.ready);
  return p;
}

/** Medidas de cada cartão: caixas, botões, fala e avisos, e se algo sai do cartão. */
function medir(p) {
  return p.evaluate(() => [...document.querySelectorAll('.simplesCartao')].map((li) => {
    const r = (el) => el.getBoundingClientRect();
    const foto = li.querySelector('.simplesFoto');
    const botoes = [...li.querySelectorAll('.simplesBotoes button')];
    const fala = li.querySelector('.simplesFala');
    const cardR = r(li);
    return {
      comPrevia: li.classList.contains('comPrevia'),
      transform: getComputedStyle(li).transform,
      top: cardR.top, largura: cardR.width, altura: cardR.height,
      fotoRatio: r(foto).width / r(foto).height,
      fotoLargura: r(foto).width,
      botoesTop: botoes.map((b) => r(b).top), botoesBottom: botoes.map((b) => r(b).bottom),
      botoesAlturas: botoes.map((b) => r(b).height),
      botoesVisiveis: botoes.every((b) => getComputedStyle(b).display !== 'none' && r(b).height > 0),
      falaVisivel: !fala || getComputedStyle(fala).display !== 'none',
      motivoVisivel: getComputedStyle(li.querySelector('.simplesMotivo')).display !== 'none',
      estouroCartao: li.scrollWidth > li.clientWidth + 1 || li.scrollHeight > li.clientHeight + 1,
      estouroBotoes: li.querySelector('.simplesBotoes').scrollWidth > li.querySelector('.simplesBotoes').clientWidth + 1,
      minBotao: Math.min(...botoes.map((b) => r(b).height)),
      baixando: li.querySelector('.simplesBaixando').textContent.trim(),
      focoNaOrdemVisual: [...li.querySelectorAll('button:not([hidden])')].every((b, i, todos) => {
        if (!i) return true;
        const atual = r(b), anterior = r(todos[i - 1]);
        return atual.top >= anterior.top - 1;
      }),
    };
  }));
}

const LARGURAS_PC = [1366, 1920];

for (const largura of LARGURAS_PC) {
  test(`PC ${largura}px: miniaturas 16:9, cartões da mesma linha com a mesma altura, ações alinhadas`, semNavegador, async () => {
    const p = await abrir(largura);
    try {
      const medidas = await medir(p);
      assert.ok(medidas.length >= 6, 'precisa de pelo menos 6 cartões');
      for (const [i, m] of medidas.entries()) {
        assert.ok(Math.abs(m.fotoRatio - 16 / 9) < 0.02, `cartão ${i}: miniatura ${m.fotoRatio.toFixed(3)} não é 16:9`);
        assert.ok(!m.estouroCartao, `cartão ${i}: sai do cartão`);
        assert.ok(!m.estouroBotoes, `cartão ${i}: botões estouram`);
        assert.ok(m.botoesVisiveis, `cartão ${i}: botão escondido`);
        assert.ok(m.motivoVisivel, `cartão ${i}: título escondido`);
        assert.ok(m.minBotao >= 34, `cartão ${i}: botão menor que 34 px`);
        assert.ok(m.focoNaOrdemVisual, `cartão ${i}: ordem do teclado difere da ordem visual`);
      }
      // Escada de linhas: agrupa pelo topo e compara altura e posição dos botões dentro de cada linha.
      const linhas = [];
      for (const [i, m] of medidas.entries()) {
        if (m.comPrevia) continue;
        const linha = linhas.find((g) => Math.abs(g[0].top - m.top) < 4);
        if (linha) linha.push({ i, ...m }); else linhas.push([{ i, ...m }]);
      }
      for (const grupo of linhas) {
        const alturas = grupo.map((m) => m.altura);
        assert.ok(Math.max(...alturas) - Math.min(...alturas) < 1, `linha com alturas ${alturas.map((a) => a.toFixed(1))}`);
        const fundos = grupo.map((m) => Math.max(...m.botoesBottom));
        assert.ok(Math.max(...fundos) - Math.min(...fundos) < 1, `botões desalinhados na linha: ${fundos.map((f) => f.toFixed(1))}`);
      }
      // Guarda do transform de .comPrevia: não pode ter sumido.
      const previa = medidas.find((m) => m.comPrevia);
      assert.ok(previa && previa.transform !== 'none', 'o transform de .comPrevia sumiu');
      // Documento sem rolagem horizontal.
      const estouroPagina = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      assert.equal(estouroPagina, false, 'a página rola de lado');
    } finally { await p.close(); }
  });
}

test('celular 390px: a disposição de celular continua (miniatura à esquerda, 40%) e sem estouro', semNavegador, async () => {
  const p = await abrir(390);
  try {
    const medidas = await medir(p);
    for (const [i, m] of medidas.entries()) {
      assert.ok(Math.abs(m.fotoRatio - 16 / 9) < 0.02, `cartão ${i}: miniatura ${m.fotoRatio.toFixed(3)} não é 16:9`);
      // Com prévia aberta o cartão vira uma coluna (regra existente de .comPrevia); os outros ficam em 40%.
      if (!m.comPrevia) assert.ok(Math.abs(m.fotoLargura / m.largura - 0.4) < 0.05, `cartão ${i}: miniatura não é ~40% do cartão`);
      assert.ok(!m.estouroCartao, `cartão ${i}: sai do cartão`);
      assert.ok(!m.estouroBotoes, `cartão ${i}: botões estouram`);
      assert.ok(m.minBotao >= 44, `cartão ${i}: botão menor que 44 px (touch)`);
    }
    const estouroPagina = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    assert.equal(estouroPagina, false, 'a página rola de lado no celular');
  } finally { await p.close(); }
});


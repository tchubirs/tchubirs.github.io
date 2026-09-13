'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { extrairCartao, lerCampanha } = require('../src/ler.js');

/** Uma página como a verdadeira: JSON escapado no meio de HTML. */
const pagina = (cartao) =>
  `<html><body><script>self.push(["x",{"card":${JSON.stringify(cartao).replace(/"/g, '\\"')}}])</script></body></html>`;

const base = {
  id: 'abc', title: 'Campanha X | $2 CPM', status: 'active',
  organizationName: 'Agência', organizationVerified: true,
  budgetCents: 100000, cpmMinRateCents: 200, cpmMaxRateCents: 200,
  platforms: ['tiktok'], requiresApplication: false, private: false,
  listedAt: '2026-09-01T00:00:00.000Z',
  payouts: [{ minPayoutCents: 1000, maxPayoutCents: 50000, rateCents: 200 }],
  metrics: { budgetSpentCents: 25000, budgetProgressBps: 2500, creatorCount: 10,
             approvedSubmissionCount: 40, totalViews: 500000, chartPoints: [] },
};

test('lê os números de uma campanha e passa cêntimos a dólares', () => {
  const c = lerCampanha(pagina(base));
  assert.equal(c.orcamento, 1000);
  assert.equal(c.gasto, 250);
  assert.equal(c.restante, 750);
  assert.equal(c.cpmMin, 2);
  assert.equal(c.pagamentoMin, 10);
  assert.equal(c.progresso, 0.25);
  assert.equal(c.clippers, 10);
});

// Este é o defeito que rebentou a primeira leitura da campanha verdadeira.
// A descrição do Rex Stax cita `\"What Is Love\"` e vem escapada DUAS vezes:
// depois do primeiro desescape sobra `\\"`, que não é JSON válido. Uma
// campanha inteira ficava por ler por causa de um par de aspas numa frase.
test('aspas escapadas duas vezes na descricao nao derrubam a leitura', () => {
  const html = '<script>{"card":{"budgetCents":5000,'
    + '"description":"remix de \\\\\\"What Is Love\\\\\\" para TikTok",'
    + '"metrics":{"budgetSpentCents":1000}}}</script>';
  const c = lerCampanha(html);
  assert.ok(c, 'a campanha tem de ser lida apesar das aspas');
  assert.equal(c.orcamento, 50);
});

// Contar chavetas sem saber o que é texto parte-se aqui, e o recorte sai a meio.
//
// A chaveta tem de estar DESEMPARELHADA. Com `{nome}` e `{hook}` a conta
// ingénua acerta por sorte — abre e fecha o mesmo número de vezes — e o teste
// passa a testar nada. Foi o que aconteceu à primeira versão deste teste.
test('uma chaveta solta na descricao nao fecha o objecto cedo demais', () => {
  const c = lerCampanha(pagina({ ...base, description: 'desconto de 50% } e mais' }));
  assert.equal(c.orcamento, 1000, 'o recorte parou na chaveta solta do texto');
  assert.equal(c.restante, 750);
});

test('pagina sem cartao nenhum nao inventa campanha', () => {
  assert.equal(extrairCartao('<html>nada aqui</html>'), null);
  assert.equal(lerCampanha('<html>nada aqui</html>'), null);
  assert.equal(lerCampanha(''), null);
  assert.equal(lerCampanha(null), null);
});

// Sem orçamento não há campanha. Devolver zeros faria uma página de erro passar
// por "campanha com $0 gastos" — que é exactamente a que parece melhor de todas.
test('cartao sem orcamento e recusado, em vez de virar zeros', () => {
  assert.equal(lerCampanha(pagina({ id: 'x', status: 'active' })), null);
});

test('gasto maior que o orcamento nao da restante negativo', () => {
  const c = lerCampanha(pagina({ ...base, metrics: { ...base.metrics, budgetSpentCents: 150000 } }));
  assert.equal(c.restante, 0);
});

// As regras e os materiais são o que o site só mostra a quem entra na campanha.
// Se isto deixar de ser lido, volta-se a ter de aceitar antes de saber ao que.
test('le as regras e os links dos materiais, que o site esconde antes de entrar', () => {
  const c = lerCampanha(pagina({
    ...base,
    contentRequirements: { items: ['Link na bio', 'Mínimo 10s'] },
    referenceMaterials: [{ url: 'https://drive.google.com/drive/folders/AAA' }, { naoTemUrl: 1 }],
  }));
  assert.deepEqual(c.regras, ['Link na bio', 'Mínimo 10s']);
  assert.deepEqual(c.materiais, ['https://drive.google.com/drive/folders/AAA']);
});

test('campanha sem regras nem materiais da listas vazias, e nao rebenta', () => {
  const c = lerCampanha(pagina(base));
  assert.deepEqual(c.regras, []);
  assert.deepEqual(c.materiais, []);
  assert.deepEqual(c.porDia, []);
});

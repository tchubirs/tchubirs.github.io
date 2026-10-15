// O assistente da faixa (Ler chat ou Detectar lances; um trecho ou tudo; o trecho nas alças; o botão
// final), andado pelos testes como uma pessoa o anda: pelos botões, e com Voltar quando está noutro passo.

/**
 * Abrir o menu Ferramentas (o <details> fechado por omissão) pelo seu botão visível, como uma pessoa faz,
 * para que o botão de dentro — Detectar lances — fique visível. Se o menu já está aberto, não se mexe nele.
 * O app fecha o menu sozinho depois de um clique num item.
 */
export async function abrirFerramentas(p) {
  if (!await p.locator('#procurarKills').isVisible()) await p.click('.ferramentasBotao');
  await p.waitForSelector('#procurarKills', { state: 'visible' });
}

/**
 * Levar o assistente ao passo final de Detectar lances, na faixa de `quem` (pelo nome; '*' é Todos) ou,
 * sem `quem`, pelo botão Detectar lances, por baixo do transporte. `quanto` é 'tudo' ou 'trecho' (as alças
 * como estiverem). Não carrega no Detectar.
 */
export async function passo4Detetar(p, { quem = null, quanto = 'tudo' } = {}) {
  if (quem) {
    const nome = p.locator(`#faixas button.nome[data-quem="${quem}"]`);
    if (await nome.getAttribute('aria-expanded') !== 'true') await nome.click();
  } else if (await p.locator('#acoesFaixa').isHidden()) {
    await abrirFerramentas(p);
    await p.click('#procurarKills');
  }
  await p.waitForSelector('#acoesFaixa:not([hidden])');
  for (let k = 0; k < 6; k++) {
    if (await p.locator('#escolherTrecho').isVisible() && /^Detectar/.test(await p.locator('#acoesResumo').innerText())) break;
    if (await p.locator('#escolherDetetar').isVisible()) await p.click('#escolherDetetar');
    else await p.click('#voltarAcoes');
  }
  if (quanto === 'tudo') await p.click('#escolherTudo');
  else {
    await p.click('#escolherTrecho');
    await p.click('#usarTrecho');
  }
  await p.waitForSelector('#detetarTrecho', { state: 'visible' });
}

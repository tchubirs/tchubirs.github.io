'use strict';
/**
 * Cruza tudo automaticamente: cada jogador no servidor contra cada pessoa
 * que assistiu. Sem digitar SteamID, sem colar tabela.
 */
const N = Detetive.Nomes;
const MINUTOS = 60 * 1000;

function idade(ms) {
  const m = Math.round((Date.now() - ms) / MINUTOS);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  return `há ${Math.round(m / 60)} h`;
}

function caixa(id, pacote, rotulo) {
  const el = document.getElementById(id);
  if (!pacote) { el.innerHTML = `<b>—</b><span>${rotulo}: abra a página</span>`; return; }
  // Dado velho tem que PARECER velho. Acusar com informação de ontem é o
  // erro mais fácil de cometer e o mais difícil de perceber.
  const velho = Date.now() - pacote.lidoEm > 15 * MINUTOS;
  el.className = 'fonte' + (velho ? ' velho' : '');
  el.innerHTML = `<b>${pacote.dados.length}</b><span>${rotulo} · ${idade(pacote.lidoEm)}</span>`;
}

chrome.storage.local.get(['servidor', 'audiencia'], (r) => {
  const srv = r.servidor;
  const aud = r.audiencia;
  caixa('f-servidor', srv, 'servidor');
  caixa('f-audiencia', aud, 'audiência');

  const saida = document.getElementById('saida');
  if (!srv || !aud) {
    saida.innerHTML = '<div class="vazio">Abra a página do servidor no BattleMetrics ' +
      'e a lista de fidelidade no BotRix. A extensão lê as duas sozinha.</div>';
    return;
  }

  const achados = [];
  for (const j of srv.dados) {
    let melhor = null;
    for (const e of aud.dados) {
      const c = N.comparar(j.nome, e.nome);
      if (c.confianca >= 0.7 && (!melhor || c.confianca > melhor.confianca)) {
        melhor = { ...c, espectador: e.nome, minutosAssistidos: e.minutosAssistidos };
      }
    }
    if (melhor) achados.push({ ...melhor, jogador: j.nome, minutosNoServidor: j.minutosNoServidor });
  }
  achados.sort((a, b) => b.confianca - a.confianca);

  if (achados.length === 0) {
    saida.innerHTML = '<div class="vazio">Ninguém no servidor bate com quem assistiu.<br><br>' +
      '<b>Isso não inocenta</b> — a pessoa pode usar nome diferente nos dois lados.</div>';
    return;
  }

  saida.innerHTML = achados.map((a) => {
    const nome = (s) => String(s).replace(/[<>&"]/g, (c) =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const h = a.minutosAssistidos != null
      ? `${Math.floor(a.minutosAssistidos / 60)}h${String(a.minutosAssistidos % 60).padStart(2, '0')} assistidos`
      : 'tempo desconhecido';
    const j = a.minutosNoServidor != null ? ` · ${a.minutosNoServidor} min no servidor` : '';
    return `<div class="achado">
      <div class="par">${nome(a.jogador)} <span style="color:#6f7a84">↔</span> ${nome(a.espectador)}</div>
      <div class="det"><span class="pc">${Math.round(a.confianca * 100)}%</span> · ${a.motivo} · ${h}${j}</div>
    </div>`;
  }).join('');
});

'use strict';
/**
 * Lê "Active players" da página do servidor que VOCÊ já abriu, logado.
 *
 * Isto não consulta a API do BattleMetrics e não redistribui nada: é a
 * página que já está na sua tela, e só você a vê. A extensão apenas evita
 * que você tenha que copiar a tabela na mão no meio de uma raid.
 */
(function () {
  const CHAVE = 'servidor';

  function ler() {
    const achado = Detetive.acharTabela(['name', 'play time'])
                || Detetive.acharTabela(['nome', 'tempo']);
    if (!achado) return null;

    const jogadores = Detetive.lerLinhas(achado).map((l) => ({
      nome: l.name ?? l.nome,
      minutosNoServidor: Detetive.paraMinutos(l['play time'] ?? l.tempo),
    })).filter((j) => j.nome);

    if (jogadores.length === 0) return null;
    return jogadores;
  }

  function atualizar() {
    const j = ler();
    if (!j) return;
    Detetive.guardar(CHAVE, j);
    marcar(j.length);
  }

  let selo;
  function marcar(n) {
    if (!selo) {
      selo = document.createElement('div');
      selo.style.cssText =
        'position:fixed;right:14px;bottom:14px;z-index:2147483647;' +
        'background:#0f1113;color:#7fe3a1;border:1px solid #2a3138;' +
        'border-radius:10px;padding:9px 13px;font:13px/1.4 ui-sans-serif,system-ui;' +
        'box-shadow:0 6px 22px rgba(0,0,0,.45);pointer-events:none';
      document.body.appendChild(selo);
    }
    selo.textContent = `Detetive · ${n} jogadores lidos`;
  }

  atualizar();
  // A lista muda sozinha enquanto a página fica aberta. Sem observar, o
  // dado congela no primeiro instante e a consulta usa informação velha.
  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    obs._t = setTimeout(atualizar, 800);
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();

'use strict';
/** Lê a tabela de fidelidade do BotRix — nome e tempo de visualização. */
(function () {
  const CHAVE = 'audiencia';

  function ler() {
    const achado = Detetive.acharTabela(['nome', 'tempo de visualiza'])
                || Detetive.acharTabela(['name', 'watch time'])
                || Detetive.acharTabela(['name', 'viewing time']);
    if (!achado) return null;

    const chaves = Object.keys(achado.indices);
    const chaveNome = chaves.find((k) => /nome|name/i.test(k));
    const chaveTempo = chaves.find((k) => /tempo|time/i.test(k));

    const gente = Detetive.lerLinhas(achado).map((l) => ({
      nome: l[chaveNome],
      minutosAssistidos: Detetive.paraMinutos(l[chaveTempo]),
    })).filter((x) => x.nome);
    return gente.length ? gente : null;
  }

  function atualizar() {
    const a = ler();
    if (!a) return;
    // Acumula entre páginas: a tabela é paginada, e cada página que você
    // abre acrescenta gente em vez de substituir a anterior.
    chrome.storage.local.get([CHAVE], (r) => {
      const antes = r[CHAVE]?.dados ?? [];
      const mapa = new Map(antes.map((x) => [x.nome.toLowerCase(), x]));
      for (const x of a) {
        const anterior = mapa.get(x.nome.toLowerCase());
        if (!anterior || (x.minutosAssistidos ?? 0) > (anterior.minutosAssistidos ?? 0)) {
          mapa.set(x.nome.toLowerCase(), x);
        }
      }
      const juntos = [...mapa.values()];
      Detetive.guardar(CHAVE, juntos);
      marcar(juntos.length, a.length);
    });
  }

  let selo;
  function marcar(total, nesta) {
    if (!selo) {
      selo = document.createElement('div');
      selo.style.cssText =
        'position:fixed;right:14px;bottom:14px;z-index:2147483647;' +
        'background:#0f1113;color:#53fc18;border:1px solid #2a3138;' +
        'border-radius:10px;padding:9px 13px;font:13px/1.4 ui-sans-serif,system-ui;' +
        'box-shadow:0 6px 22px rgba(0,0,0,.45);pointer-events:none';
      document.body.appendChild(selo);
    }
    selo.textContent = `Detetive · ${total} espectadores (${nesta} nesta página)`;
  }

  atualizar();
  const obs = new MutationObserver(() => {
    clearTimeout(obs._t);
    obs._t = setTimeout(atualizar, 800);
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();

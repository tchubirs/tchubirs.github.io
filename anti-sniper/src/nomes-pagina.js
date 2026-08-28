'use strict';
/**
 * Ler o histórico de nomes DA PÁGINA, com o navegador dele.
 *
 * Ele fez a pergunta que desmonta a minha desculpa: *"se eu consigo usar
 * todos, por que você não consegue? Você vai fazer pra mim usar, não é a
 * mesma coisa?"*
 *
 * É a mesma coisa, e eu estava a confundir duas máquinas. O que eu não
 * alcanço é daqui — este ambiente não dá rede ao navegador e o meu IP leva
 * bloqueio do Cloudflare. O produto não roda aqui: roda na máquina dele,
 * com o navegador dele, o IP dele e a sessão dele. Lá a página abre.
 *
 * O agente já faz exatamente isto para ler o servidor no BattleMetrics.
 * Este arquivo é a mesma técnica apontada para o histórico de nomes.
 *
 * Por que a API não serve, medido em 28/08/2026:
 *   - steamid.uk (v2): devolve `name_history_count: "343"` e a contagem por
 *     ano. Os nomes não saem por API, só na tela.
 *   - steamhistory.net: `/api/names` responde "Insufficient API Permissions".
 *   - BattleMetrics: assinatura paga, e só dentro do próprio servidor.
 *   - Steam: teto de 10 nomes, e 0–1 em perfil privado.
 *
 * A função abaixo roda DENTRO da página. Ela não sabe o desenho exato do
 * HTML — eu não consigo abrir o site para olhar —, então procura o bloco
 * pelo TÍTULO e, quando não acha, devolve o que viu. Um extrator que
 * explica o que encontrou vale mais que um que eu ajustei no escuro.
 */

/**
 * Acha a lista de nomes na página aberta.
 *
 * Estratégia, da mais firme para a mais frouxa:
 *   1. o bloco cujo título contém "Persona History" / "Name History"
 *   2. dentro dele, linhas com um nome e uma data
 *   3. se nada bater, devolve um retrato da página para eu corrigir
 *
 * @param {Document} doc
 * @returns {{nomes:Array<{nome:string,em:string}>, total:number|null, comoAchei:string}
 *          |{erro:string, retrato:object}}
 */
function lerNomesDaPagina(doc) {
  const TITULO = /(persona|name|alias|nick)\s*(history|history\s*\(|s?\b)/i;
  const DATA = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/;

  const texto = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();

  // 1. O cabeçalho do bloco. O total costuma vir entre parênteses ao lado:
  //    "Persona History (61)" — e esse número é a conferência de que peguei
  //    a lista inteira, não só a primeira página.
  let cabecalho = null;
  for (const el of doc.querySelectorAll('h1,h2,h3,h4,h5,legend,caption,[class*="title"],[class*="header"]')) {
    const t = texto(el);
    if (t.length < 60 && TITULO.test(t)) { cabecalho = el; break; }
  }

  const totalDito = cabecalho
    ? Number((texto(cabecalho).match(/\((\d+)\)/) || [])[1] ?? NaN)
    : NaN;

  // 2. A partir do cabeçalho, sobe até o container que realmente tem as
  //    linhas. Subir é mais confiável que adivinhar a classe do container.
  const candidatos = [];
  if (cabecalho) {
    let no = cabecalho;
    for (let i = 0; i < 6 && no; i++) {
      no = no.parentElement;
      if (no) candidatos.push(no);
    }
  }
  candidatos.push(doc.body);

  // As PARTES da linha, não o texto colado.
  //
  // `textContent` de um <tr> junta as células sem separador nenhum:
  // "nome0" + "20/08/2026" vira "nome020/08/2026", e aí a data não casa
  // mais porque `\b` não existe entre dois dígitos. Medido — era isto que
  // fazia a leitura falhar em página de tabela, que é justamente o desenho
  // do site.
  const partes = (el) => {
    const filhos = [...el.children];
    if (!filhos.length) return [texto(el)];
    return filhos.map(texto).filter(Boolean);
  };

  const linhaEhNome = (el) => {
    const ps = partes(el);
    if (!ps.length || ps.join(' ').length > 200) return null;
    const iData = ps.findIndex((x) => DATA.test(x));
    if (iData < 0) return null;
    // O nome é a parte anterior à data. Nome de Steam pode ser qualquer
    // coisa, inclusive só emoji — não filtro por formato, só exijo que
    // exista.
    const nome = ps.slice(0, iData).join(' ').trim().replace(/[\s|·,-]+$/, '');
    if (!nome) return null;
    return { nome, em: (ps[iData].match(DATA) || [ps[iData]])[0] };
  };

  for (const cont of candidatos) {
    for (const seletor of ['tr', 'li', '[class*="row"]', 'div']) {
      const achados = [];
      const vistos = new Set();
      for (const el of cont.querySelectorAll(seletor)) {
        // Só folhas: um container pai repetiria os filhos todos numa linha.
        if (el.querySelector(seletor)) continue;
        const r = linhaEhNome(el);
        if (!r) continue;
        const chave = `${r.nome}|${r.em}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        achados.push(r);
      }
      // Duas linhas podem ser coincidência; cinco já é uma lista.
      if (achados.length >= 5) {
        return {
          nomes: achados,
          total: Number.isFinite(totalDito) ? totalDito : null,
          comoAchei: `${cabecalho ? 'título' : 'body'} → ${seletor}`,
        };
      }
    }
  }

  // 3. Não achei lista. Antes de desistir: a página pode estar ESCONDENDO,
  //    e esconder não é não ter.
  //
  //    O steamid.uk deslogado mostra "344 persona's. Results limited." e os
  //    nomes cortados ao meio ("Gat..", "Pl.."), com a maioria dos anos
  //    vazia. Devolver esses 18 pedaços como se fossem a lista seria o pior
  //    resultado possível: uma resposta que parece completa e não é.
  const corpo = (doc.body?.textContent || '').replace(/\s+/g, ' ');
  const limite = corpo.match(/(\d[\d,]*)\s*(?:persona'?s?|stored names|names?)\b[^.]*\.\s*Results limited/i)
    || corpo.match(/Results limited/i);
  const pedeLogin = /log\s*in to view|login to view|please log in/i.test(corpo);
  if (limite || pedeLogin) {
    const total = Number(String(limite?.[1] ?? '').replace(/,/g, '')) || null;
    return {
      erro: pedeLogin
        ? 'a página esconde a lista para quem não está logado'
        : 'a página diz "Results limited" — a lista vem cortada',
      limitado: true,
      totalDito: total,
      // Sem isto, quem lê a saída não sabe se a conta tem poucos nomes ou
      // se o site é que não mostrou. São coisas opostas.
      dica: pedeLogin
        ? 'rode com --ver e faça login no site nessa janela; o perfil fica guardado'
        : 'tente outra fonte, ou logue-se para ver a lista inteira',
      retrato: { titulo: doc.title, amostraTexto: corpo.trim().slice(0, 600) },
    };
  }

  //    Sem sinal de bloqueio: devolvo o que a página tem, para eu acertar
  //    o extrator com o desenho real em vez de com o meu palpite.
  return {
    erro: 'não achei a lista de nomes nesta página',
    retrato: {
      titulo: doc.title,
      url: doc.location ? String(doc.location.href) : null,
      cabecalhos: [...doc.querySelectorAll('h1,h2,h3,h4')].slice(0, 25).map(texto).filter(Boolean),
      tabelas: doc.querySelectorAll('table').length,
      linhasTabela: doc.querySelectorAll('tr').length,
      itensLista: doc.querySelectorAll('li').length,
      // As classes mais repetidas dizem onde está a repetição — é aí que
      // mora uma lista, mesmo quando o HTML não usa <table> nem <li>.
      classesRepetidas: (() => {
        const conta = new Map();
        for (const el of doc.querySelectorAll('[class]')) {
          for (const c of String(el.className).split(/\s+/)) {
            if (c) conta.set(c, (conta.get(c) || 0) + 1);
          }
        }
        return [...conta].filter(([, n]) => n >= 8)
          .sort((a, b) => b[1] - a[1]).slice(0, 20)
          .map(([c, n]) => `${c} ×${n}`);
      })(),
      amostraTexto: (doc.body?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 600),
    },
  };
}

module.exports = { lerNomesDaPagina };

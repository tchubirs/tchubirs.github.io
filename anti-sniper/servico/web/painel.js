'use strict';
/** Painel do site. Lê do serviço e se atualiza sozinho. */
const CANAL = new URLSearchParams(location.search).get('canal') || 'c1';
document.getElementById('canal').textContent = CANAL;

const esc = (s) => String(s).replace(/[<>&"]/g,
  (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
/**
 * O fuso do CANAL, não o do navegador.
 *
 * O resumo do log escrevia "horários em Europe/Paris" enquanto os horários
 * saíam no fuso de quem abriu a página. Com o painel aberto no celular em
 * viagem, ou num navegador com fuso errado, a etiqueta afirmava uma coisa e
 * os números diziam outra — e num produto cuja resposta É a hora, isso não
 * é detalhe. Preenchido pela primeira resposta do serviço.
 */
let FUSO = null;
const relogio = (op) => new Intl.DateTimeFormat('pt-BR', FUSO ? { ...op, timeZone: FUSO } : op);
const hora = (ms) => ms == null ? '—'
  : relogio({ hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const hhmm = (m) => m == null ? 'tempo desconhecido'
  : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;

/**
 * Quanto tempo assistiu — e de onde saiu esse número.
 *
 * As duas fontes têm resoluções muito diferentes, e trocar uma pela outra
 * mente. O contador da fidelidade anda de 10 em 10 min: 4min22s virava
 * "0h10". A presença tem o segundo exato. Aqui o número vem com a régua
 * junto, para ninguém ler bloco como medida.
 */
function assistiu(a) {
  if (a.exato && a.segundosAssistidos != null) {
    const s = a.segundosAssistidos;
    const t = s < 60 ? `${s}s`
      : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`;
    return `<b>${t}</b> <span class="regua">ao segundo${
      a.visitas > 1 ? ` · ${a.visitas} visitas` : ''}</span>`;
  }
  return `<b>${hhmm(a.minutosAssistidos)}</b> <span class="regua">bloco de ~10 min</span>`;
}

/** As duas fontes que sabem a hora da SAÍDA. Todas as outras só têm pontos
 *  soltos, e para elas "ainda está lá" é palpite. */
const PRESENCA = (f) => f === 'presenca' || f === 'presenca-parcial';

function cartao(id, valor, velho) {
  const el = document.getElementById(id);
  el.className = 'cartao' + (velho ? ' velho' : '');
  el.querySelector('b').textContent = valor;
}

/**
 * O par de nomes. Muita gente usa o MESMO nome na Kick e no Rust, e aí a
 * seta não liga duas coisas — repete uma. Mostrar "X ↔ X · 100%" faz uma
 * identidade parecer uma coincidência descoberta.
 */
const normalizado = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
const mesmoNome = (a) => normalizado(a.jogador) === normalizado(a.espectador);

function par(a) {
  // Nome idêntico: a seta não liga duas coisas, repete uma — e a
  // porcentagem ao lado dizia a mesma coisa uma terceira vez. Quando os
  // nomes DIFEREM (D1per ↔ diper), a porcentagem é a informação toda.
  if (mesmoNome(a)) return `${esc(a.jogador)} <span class="mesmo">mesmo nome nos dois</span>`;
  return `${esc(a.jogador)} <span class="seta">↔</span> ${esc(a.espectador)}`
    + ` <span class="pc">${Math.round(a.confianca * 100)}%</span>`;
}

function desenharAlertas(lista, onde, jaEmDestaque = []) {
  // Quem já está no bloco vermelho de cima não se repete aqui embaixo: a
  // lista de cima é subconjunto desta, e ver a mesma pessoa duas vezes na
  // mesma tela é parte do "muito bagunçado, não dá pra entender nada".
  const emCima = new Set(jaEmDestaque.map((a) => `${a.jogador}|${a.espectador}`));
  const tinha = lista.length;
  lista = lista.filter((a) => !emCima.has(`${a.jogador}|${a.espectador}`));
  if (!lista.length) {
    // Duas ausências diferentes. Dizer "ninguém bate" com um par vermelho
    // logo acima seria a tela se contradizendo na mesma rolagem.
    onde.innerHTML = tinha
      ? '<div class="vazio">Ninguém <b>além</b> de quem já está em destaque acima.</div>'
      : '<div class="vazio">Ninguém no servidor bate com quem assistiu.<br><br>'
        + '<b>Isso não inocenta</b> — a pessoa pode usar nome diferente nos dois lados.</div>';
    return;
  }
  onde.innerHTML = lista.map((a) => `<div class="alerta">
      <div class="par">${par(a)}</div>
      <div class="det">${esc(a.motivo)} · assistiu ${assistiu(a)}${
          a.minutosNoServidor != null ? ` · ${a.minutosNoServidor} min no servidor` : ''}</div>
    </div>`).join('');
}

/**
 * Nos dois AO MESMO TEMPO. É a linha que merece destaque.
 *
 * Cruza só os nomes de AGORA, sem histórico — histórico é uma ida à rede
 * por pessoa, e com 1.500 jogadores seriam ~18 min por leitura. Por isso a
 * lista aqui é uma pista, e o log completo vem ao clicar.
 */
/**
 * O estado da pessoa na linha vermelha — a que mais importa da página.
 *
 * Tinha o mesmo defeito do cartão: dizia "calado há 12 min" de alguém que a
 * presença está vendo com a live ABERTA neste instante. A presença não
 * escuta o chat; ficar calado nela não é sinal de nada.
 */
function estadoDois(a) {
  if (PRESENCA(a.naLiveFonte)) {
    if (a.naLiveAberta) return '<span class="agora">live aberta agora</span>';
    // A linha mais pesada da página: fechou a live e está no servidor. É o
    // padrão que ele descreveu — assiste, fecha, ataca.
    return `<span class="fechou">fechou a live há ${a.saiuHa} min</span>`;
  }
  return `<span class="${a.caladaHa <= 2 ? 'agora' : ''}">${
    a.caladaHa <= 2 ? 'falando agora' : `calado há ${a.caladaHa} min`}</span>`;
}

/**
 * O quanto dá para confiar na linha, na cor.
 *
 * `certo` só para nome que bate depois de normalizar — aí não é semelhança,
 * é o mesmo nome escrito de outro jeito. Abaixo disso é palpite, e palpite
 * pintado de vermelho vira acusação.
 */
const grau = (c) => (c >= 0.95 ? 'certo' : 'talvez');

function desenharDois(lista, onde) {
  document.getElementById('qtd-dois').textContent = lista.length ? `· ${lista.length}` : '';
  if (!lista.length) {
    onde.innerHTML = '<div class="vazio">Ninguém no servidor bate, <b>pelo nome de agora</b>, '
      + 'com quem está na live.<br><br>Isso <b>não inocenta</b>: aqui eu comparo só o nome atual. '
      + 'Para conferir todos os nomes antigos de alguém, procure a pessoa acima.</div>';
    return;
  }
  // Certeza primeiro. Um palpite de 70% pintado do mesmo vermelho de uma
  // identidade certa é o que faz a tela virar barulho: quem lê não tem como
  // saber em qual das duas linhas acreditar.
  const ordenada = [...lista].sort((x, y) => y.confianca - x.confianca);
  onde.innerHTML = ordenada.map((a) => `<div class="dois ${grau(a.confianca)}"
      data-nome="${esc(a.espectador)}">
      <div class="par">${par(a)}</div>
      <div class="det">${esc(a.espectador)} ${a.naLiveAberta === false && a.saiuHa != null
        ? 'esteve' : 'está'} na live desde <b>${hora(a.naLiveDesde)}</b>
        (${a.naLiveMinutos} min, ${estadoDois(a)}) · no servidor desde
        <b>${hora(a.noServidorDesde)}</b> (${a.noServidorMinutos} min)</div>
      ${a.naLiveVisitas > 1 ? `<div class="duvida vaievem">Entrou e saiu
        <b>${a.naLiveVisitas}×</b> nos últimos 15 min.</div>` : ''}
      ${a.confianca < 0.95 ? `<div class="duvida">Nome <b>parecido</b>, não idêntico —
        ${esc(a.motivo)}. Pode ser outra pessoa.</div>` : ''}
      ${quemE(a)}
    </div>`).join('');
  for (const b of onde.querySelectorAll('.dois')) b.onclick = () => abrirLog(b.dataset.nome);
}

/**
 * "Quem é esse cara no servidor?"
 *
 * O nome do chat não abre perfil nenhum, e nome de Rust se troca em dez
 * segundos. O que identifica é o perfil no BattleMetrics — de lá saem o
 * histórico de nomes e a SteamID. Sem esta linha o painel acusa uma
 * coincidência e deixa quem lê sem saber de quem está falando.
 */
function quemE(a) {
  if (!a.perfil) {
    return '<div class="quem sem">Sem link do perfil nesta leitura — '
      + 'a tabela do BattleMetrics veio sem ele.</div>';
  }
  return `<div class="quem">no jogo: <b>${esc(a.jogador)}</b>${
    a.servidor ? ` · ${esc(a.servidor)}` : ''} · <a href="${esc(a.perfil)}" target="_blank"
    rel="noopener noreferrer">ver quem é no BattleMetrics ↗</a></div>`;
}

/** O selo diz de ONDE veio a linha — e cada fonte enxerga uma coisa diferente. */
function seloDe(p) {
  if (PRESENCA(p.fonte)) return '<span class="selo ao-segundo">ao segundo</span>';
  if (p.fonte === 'tempo') return '<span class="selo tempo">calado</span>';
  if (p.fonte === 'ambos') return '<span class="selo">msg + tempo</span>';
  return '<span class="selo">falou</span>';
}

/**
 * A segunda linha do cartão.
 *
 * "calado há 12 min" só faz sentido para uma fonte que vê MENSAGEM. Para a
 * presença o silêncio não quer dizer nada: ela não escuta o chat, ela vê a
 * janela abrir e fechar. Alguém entrou há 12 minutos e não falou nada não
 * está "calado há 12 min" — está assistindo há 12 min, que é exatamente o
 * caso que este produto existe para enxergar.
 */
function estadoDe(p) {
  if (PRESENCA(p.fonte)) {
    return p.aberta
      ? '<span class="viva">com a live aberta agora</span>'
      : `<span>fechou a live às ${hora(p.ultimoSinal)}</span>`;
  }
  return `<span class="${p.calada <= 2 ? 'viva' : ''}">${
    p.calada <= 2 ? 'falando agora' : `calado há ${p.calada} min`}</span>`;
}

/**
 * O que esta tela ESTÁ vendo, e o que continua invisível.
 *
 * A frase dele muda o produto inteiro: "nenhum stream sniper fala no chat".
 * Deixar a cobertura implícita seria vender cegueira como cobertura.
 *
 * São três estados, não dois. O aviso laranja de "só aparece quem escreveu"
 * continuava aparecendo com a presença ligada — dizendo que a tela está cega
 * bem na hora em que ela é mais precisa que nunca.
 */
function desenharCobertura(coleta, agoraMs, cob) {
  const p = coleta?.presenca;
  // Presença parada não é presença: o gravador caiu e o painel tem que
  // dizer isso, não fingir cobertura que já não existe.
  //
  // Quem manda é o AVISO DE VIDA, não o último evento: numa live com
  // público estável ninguém entra nem sai por dezenas de minutos, e olhar
  // só para o evento anunciaria "parou" no meio de uma live funcionando.
  // Sem aviso nenhum (arquivo reenviado com --enviar), cai no evento.
  const viva = p && (p.vivoEm != null
    ? (agoraMs - p.vivoEm) < 5 * 60000
    : p.em != null && (agoraMs - p.em) < 20 * 60000);
  const parouEm = p?.vivoEm ?? p?.em;

  if (viva) {
    cob.className = 'cobertura boa';
    cob.innerHTML = 'Gravando <b>entrada e saída ao segundo</b> pelo canal de presença da Kick — '
      + 'pega quem <b>nunca escreve</b>.'
      + (coleta.ligada ? ' Tempo assistido do StreamElements também ligado.' : '')
      + '<br>Ainda invisível: quem assiste <b>deslogado</b>. Isso nenhuma fonte vê.';
    return;
  }
  if (coleta?.ligada) {
    cob.className = 'cobertura';
    cob.innerHTML = 'Contando <b>quem assiste calado</b> pelo tempo assistido do StreamElements'
      + ` (<code>${esc(coleta.fonte)}</code>). Quem só aparece por mensagem vem marcado.`
      + '<br>Sem hora exata: o crédito vem em blocos de ~10 min. Para entrada e saída '
      + 'ao segundo, rode <code>npm run presenca</code>.'
      + (p ? `<br>A presença gravou até ${hora(parouEm)} e parou.` : '');
    return;
  }
  cob.className = 'cobertura cego';
  cob.innerHTML = '<b>Atenção:</b> aqui só aparece quem <b>escreveu</b> no chat — '
    + 'e sniper normalmente não escreve.<br>Para enxergar quem assiste calado, '
    + 'rode <code>npm run presenca</code> (entrada e saída ao segundo) ou '
    + 'ligue a Fidelidade no StreamElements.'
    + (p ? `<br>A presença gravou até ${hora(parouEm)} e parou.` : '');
}

/** Quem está na live agora — a resposta que a página dá sem ninguém perguntar. */
function desenharAgora(lista, onde, coleta) {
  document.getElementById('qtd-agora').textContent = lista.length ? `· ${lista.length}` : '';
  if (!lista.length) {
    onde.innerHTML = `<div class="vazio">${coleta?.presenca
      ? 'Ninguém com a live aberta neste momento.'
      : 'Ninguém escreveu no chat nos últimos 15 min.'}</div>`;
    return;
  }
  onde.innerHTML = `<div class="pessoas">${lista.map((p) => `
    <button class="pessoa" data-nome="${esc(p.nome)}">
      <b>${esc(p.nome)}${seloDe(p)}</b>
      <span>desde ${hora(p.desde)} · ${p.minutos} min</span><br>
      ${estadoDe(p)}
    </button>`).join('')}</div>`;
  for (const b of onde.querySelectorAll('.pessoa')) b.onclick = () => abrirLog(b.dataset.nome);
}

/** O log completo: abriu, fechou, abriu de novo, fechou. */
async function abrirLog(nome) {
  const onde = document.getElementById('resultado');
  onde.innerHTML = '<div class="vazio">carregando log…</div>';
  onde.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const d = await (await fetch(`/api/log?canal=${encodeURIComponent(CANAL)}&nome=${encodeURIComponent(nome)}`)).json();
    onde.innerHTML = desenharLog(d);
    onde.querySelector('.fechar').onclick = () => { onde.innerHTML = ''; };
  } catch { onde.innerHTML = '<div class="vazio">falhou ao carregar o log</div>'; }
}

/** O que sustenta aquele intervalo. Ver "8 msg" ou "6× tempo assistido"
 *  muda o quanto se confia na linha — e a segunda pega quem nunca fala. */
function rotuloFonte(l) {
  if (l.onde === 'servidor') return `${l.amostras} leituras`;
  // A presença sabe a entrada E a saída no segundo. Mostrar "N sinais" aqui
  // esconderia justamente a diferença de precisão entre as fontes.
  if (l.fonte === 'presenca') return 'ao segundo';
  if (l.fonte === 'presenca-parcial') return 'ao segundo (já estava)';
  if (l.fonte === 'tempo') return `${l.amostras}× tempo assistido`;
  if (l.fonte === 'ambos') return `${l.amostras} sinais (msg + tempo)`;
  return `${l.amostras} msg`;
}

/**
 * A duração só sai em segundos quando a FONTE tem segundos.
 *
 * Mostrar "4min 38s" para um dado que veio em blocos de 10 min seria
 * inventar precisão — o mesmo erro de inventar horário, com outra cara.
 */
function duracao(l) {
  const exata = PRESENCA(l.fonte);
  // Duração zero é uma leitura só, não uma visita de 0 segundos: dizer
  // "0min 00s" faria parecer que a pessoa entrou e saiu no mesmo instante.
  //
  // E na presença "zero" tem dois significados opostos. Aberta: acabou de
  // entrar. Fechada: a gravação parou antes de ver a saída — a hora de
  // saída não existe, e dizer "entrou agora" sobre uma visita de ontem
  // seria inventar o presente.
  if (l.segundos === 0) {
    if (!exata) return `visto ${l.amostras}×`;
    return l.aberta ? 'entrou agora' : 'saída não vista';
  }
  if (exata) return `${Math.floor(l.segundos / 60)}min ${String(l.segundos % 60).padStart(2, '0')}s`;
  return `${l.minutos} min`;
}

/**
 * O fim da linha — e uma visita aberta NÃO tem fim.
 *
 * Em visita aberta `ate` é "até agora", para a duração poder crescer. Mas
 * imprimir isso na coluna da saída afirmaria uma hora que ninguém observou:
 * "23:25:00 → 23:30:00" lê como "saiu às 23:30", e ela ainda está lá.
 */
function fim(l) {
  if (l.aberta) return '<span class="viva">ainda dentro</span>';
  if (PRESENCA(l.fonte) && l.segundos === 0) return '<span class="regua">saída não vista</span>';
  return horaFina(l.ate, l);
}

/** Com precisão de segundo, mostrar só HH:MM apagaria a resposta. */
function horaFina(ms, l) {
  const exata = PRESENCA(l.fonte);
  return relogio(exata
    ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
}

/**
 * O resumo do log, dito com a régua da fonte.
 *
 * "3 entradas" contava a linha do servidor junto com as da live — e uma
 * pessoa que entrou DUAS vezes na live lia como três. E o servidor não é
 * duração: é uma foto a cada 90s, então "0h01 no servidor" era um piso de
 * arredondamento se passando por medida.
 */
function resumoLog(d) {
  const p = [];
  if (d.entradasNaLive) {
    const s = d.segundosNaLive;
    const t = d.exatoNaLive && s < 3600
      ? `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, '0')}s`
      : hhmm(d.minutosNaLive);
    p.push(`<b>${d.entradasNaLive}</b> ${d.entradasNaLive === 1 ? 'entrada' : 'entradas'} na live`);
    p.push(`<b>${t}</b> assistindo${d.exatoNaLive ? ' <span class="regua">ao segundo</span>' : ''}`);
  }
  if (d.vezesNoServidor) {
    p.push(`visto <b>${d.vezesNoServidor}×</b> no servidor`);
  }
  return p.join(' · ');
}

function desenharLog(d) {
  if (!d.total) {
    return `<div class="log"><button class="fechar">×</button><h3>${esc(d.nome)}</h3>
      <div class="resumo">Nenhum registro. Isso <b>não inocenta</b> — quem assiste calado não aparece.</div></div>`;
  }
  const linhas = d.linhas.map((l) => `<tr>
      <td class="onde ${l.onde}">${l.onde === 'live' ? '● live' : '● servidor'}</td>
      <td>${horaFina(l.de, l)} <span class="seta">→</span> ${fim(l)}</td>
      <td class="dur">${duracao(l)}</td>
      <td class="dur">${l.perfil
        ? `<a href="${esc(l.perfil)}" target="_blank" rel="noopener noreferrer">quem é ↗</a>`
        : rotuloFonte(l)}</td>
    </tr>`).join('');
  return `<div class="log"><button class="fechar">×</button>
    <h3>${esc(d.nome)}</h3>
    <div class="resumo">${resumoLog(d)} · horários em ${esc(d.fuso)}</div>
    <table>${linhas}</table></div>`;
}

async function atualizar() {
  try {
    const [r, ra] = await Promise.all([
      fetch(`/api/alertas?canal=${encodeURIComponent(CANAL)}`),
      fetch(`/api/agora?canal=${encodeURIComponent(CANAL)}`),
    ]);
    if (!r.ok) throw new Error(r.status);
    const d = await r.json();
    const da = await ra.json();
    // Antes de desenhar qualquer hora: senão o primeiro quadro sai no fuso
    // do navegador e muda sozinho no segundo.
    if (da.fuso) FUSO = da.fuso;
    desenharAgora(da.naLive || [], document.getElementById('agora'), da.coleta);
    desenharDois(da.nosDois || [], document.getElementById('nosdois'));
    desenharCobertura(da.coleta, da.em, document.getElementById('cobertura'));
    document.getElementById('ponto').className = 'ponto vivo';
    document.getElementById('estado').textContent = 'ao vivo';
    cartao('c-servidor', d.noServidor ?? '—', d.servidorVelho);
    cartao('c-audiencia', d.audiencia ?? '—');
    cartao('c-alertas', d.alertas.length);
    desenharAlertas(d.alertas, document.getElementById('alertas'), da.nosDois || []);
  } catch {
    document.getElementById('ponto').className = 'ponto';
    document.getElementById('estado').textContent = 'sem conexão com o serviço';
  }
}

document.getElementById('ir').onclick = async () => {
  const q = document.getElementById('nome').value.trim();
  const onde = document.getElementById('resultado');
  if (!q) { onde.innerHTML = ''; return; }
  onde.innerHTML = '<div class="vazio">procurando…</div>';
  // Manda o instante ABSOLUTO, não "22:47": o navegador sabe o fuso de quem
  // está olhando, e o serviço não precisa adivinhar. Fuso errado aqui vira
  // duas horas de diferença e uma resposta trocada.
  let quando = '';
  const t = document.getElementById('quando').value.trim();
  if (t) {
    const rl = t.match(/^(\d{1,2})\s*[:h.]?\s*(\d{2})$/);
    if (rl) {
      const d = new Date();
      d.setHours(Number(rl[1]), Number(rl[2]), 0, 0);
      if (d.getTime() > Date.now() + 60000) d.setDate(d.getDate() - 1);  // live que virou a noite
      quando = String(d.getTime());
    } else { quando = t; }
  }
  try {
    const r = await fetch(`/api/procurar?canal=${encodeURIComponent(CANAL)}`
      + `&q=${encodeURIComponent(q)}${quando ? `&quando=${encodeURIComponent(quando)}` : ''}`);
    const d = await r.json();
    if (d.erro) { onde.innerHTML = `<div class="vazio">${esc(d.erro)}</div>`; return; }
    desenharBusca(d, onde);
  } catch { onde.innerHTML = '<div class="vazio">falhou ao consultar</div>'; }
};

for (const b of document.querySelectorAll('.atalhos button')) {
  b.onclick = () => {
    const d = new Date(Date.now() - Number(b.dataset.min) * 60000);
    document.getElementById('quando').value =
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    document.getElementById('ir').click();
  };
}

/** O veredito do instante: estava, ou não estava, naquele minuto. */
function desenharMomento(d) {
  if (d.quando == null) return '';
  const m = (d.evidencias || []).map((e) => e.momento).find(Boolean);
  const h = hora(d.quando);
  const srv = d.noServidor;
  const noServidor = srv?.estado === 'sim'
    ? `<div class="obs">E estava <b>no servidor</b> das ${hora(srv.estada.de)} às ${hora(srv.estada.ate)}.</div>` : '';

  let classe = ''; let texto;
  if (!m || m.estado === 'sem-registro') {
    texto = `<b>Às ${h}: sem registro dela na live.</b>`;
  } else if (m.estado === 'sim') {
    classe = ' sim';
    texto = `<b>Às ${h}: ESTAVA na sua live</b> — visto das ${hora(m.estada.de)} às ${hora(m.estada.ate)}.`;
  } else if (m.estado === 'provavel') {
    classe = ' provavel';
    const b = m.antes && m.antes.ate < d.quando ? m.antes : m.depois;
    texto = `<b>Às ${h}: provável</b> — visto ${m.minutosDaBorda} min ${m.antes === b ? 'antes' : 'depois'}`
      + ` (${hora(b.de)}–${hora(b.ate)}).`;
  } else {
    texto = `<b>Às ${h}: não visto na live nesse horário.</b>`
      + (m.minutosDaBorda != null ? ` A vez mais próxima foi ${m.minutosDaBorda} min de distância.` : '');
  }
  const naLive = (d.evidencias || []).flatMap((e) => e.naLive || []);
  return `<div class="veredito${classe}">${texto}${noServidor}
    <div class="obs">Quem assiste calado não gera mensagem — <b>ausência aqui não é prova de ausência</b>.</div>
    ${fita(naLive, srv?.estadas || [], d.quando)}</div>`;
}

/** Duas trilhas na mesma escala: na live, e no servidor. */
function fita(naLive, noServidor, quandoMs) {
  const todos = [...naLive, ...noServidor];
  if (!todos.length) return '';
  let de = Math.min(...todos.map((e) => e.de), quandoMs);
  let ate = Math.max(...todos.map((e) => e.ate), quandoMs);
  const folga = Math.max((ate - de) * 0.06, 5 * 60000);
  de -= folga; ate += folga;
  const pos = (t) => ((t - de) / (ate - de)) * 100;
  const trilha = (lista, cls) => lista.length ? `<div class="trilho ${cls}">${
    lista.map((e) => `<i style="left:${pos(e.de)}%;width:${Math.max(pos(e.ate) - pos(e.de), 0.8)}%"></i>`).join('')
  }<div class="marca" style="left:${pos(quandoMs)}%"></div></div>` : '';
  return `<div class="fita">
    ${naLive.length ? `<div class="rot">na sua live</div>${trilha(naLive, '')}` : ''}
    ${noServidor.length ? `<div class="rot">no servidor</div>${trilha(noServidor, 'srv')}` : ''}
    <div class="reguas"><span>${hora(de)}</span><span>↑ ${hora(quandoMs)}</span><span>${hora(ate)}</span></div>
  </div>`;
}

function desenharBusca(d, onde) {
  let topo = '';
  if (d.tipo === 'steamid') {
    // Mostrar QUAIS nomes foram conferidos é o que separa "não achei" de
    // "não olhei". Sem essa lista, as duas coisas ficam com a mesma cara.
    const bateram = new Set((d.evidencias || []).map((e) => e.nomeSteamQueBateu));
    const fichas = (d.historico || []).map((n) =>
      `<i class="${bateram.has(n) ? 'bateu' : ''}">${esc(n)}</i>`).join('');
    topo = `<div class="cabeca">
      <div class="quem">${esc(d.jogador)}</div>
      <div class="sub">SteamID ${esc(d.steamId)} · ${(d.historico || []).length} nomes conferidos</div>
      ${fichas ? `<div class="nomes">${fichas}</div>` : ''}
    </div>`;
    if (d.conclusao === 'inconclusivo') {
      onde.innerHTML = topo + `<div class="vazio">⚪ ${esc(d.motivo)}</div>`;
      return;
    }
  }
  const lista = (d.evidencias || []).map((e) => ({
    ...e,
    jogador: e.nomeSteamQueBateu ? `${d.jogador} (como "${e.nomeSteamQueBateu}")` : d.jogador,
  }));
  const alvo = document.createElement('div');
  desenharAlertas(lista, alvo);
  onde.innerHTML = topo + desenharMomento(d) + alvo.innerHTML;
}

for (const id of ['nome', 'quando']) {
  document.getElementById(id).addEventListener('keydown',
    (e) => { if (e.key === 'Enter') document.getElementById('ir').click(); });
}

atualizar();
setInterval(atualizar, 15000);

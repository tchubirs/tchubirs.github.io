const DADOS = /*DADOS*/;
const AGORA = Date.now();
const M = 60000;
const EX = exemplo(AGORA);

const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
const hora = (ms) => new Date(ms).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
const hhmm = (m) => `${Math.floor(m/60)}h${String(Math.round(m%60)).padStart(2,'0')}`;

/* ── MEDIDO: a audiência real, só com o que a BotRix entrega ──────────── */
function desenharAudiencia() {
  const l = [...DADOS.audiencia].sort((a,b) => (b.minutosAssistidos||0) - (a.minutosAssistidos||0));
  document.getElementById('q-aud').textContent = `· ${l.length}`;
  document.getElementById('audiencia').innerHTML =
    `<div class="pessoas">${l.map(p => `<div class="pessoa">
      <b>${esc(p.nome)}</b>
      <span class="mono">${p.minutosAssistidos ? hhmm(p.minutosAssistidos) : 'sem tempo'} assistidos</span>
      <span class="mono fraco">nível ${p.nivel} · ${p.pontos} pontos</span>
    </div>`).join('')}</div>`;
}

/* ── MEDIDO: o cruzamento, contra os nomes reais ──────────────────────── */
const idxReal = new Indice(DADOS.audiencia.map(p => ({ nome: p.nome, min: p.minutosAssistidos })));

function cruzar() {
  const q = document.getElementById('q').value.trim();
  const onde = document.getElementById('resultado');
  if (!q) { onde.innerHTML = ''; return; }
  const r = idxReal.procurar(q);
  if (!r) {
    onde.innerHTML = `<div class="vazio">Nenhum dos ${DADOS.audiencia.length} nomes da sua audiência
      bate com <b>${esc(q)}</b>.<br><br>Isso <b>não inocenta</b>. O nome no jogo quase nunca
      parece com o do chat — foi exatamente o que aconteceu quando você me corrigiu.
      Para esses casos, o serviço confere a <b>SteamID</b>: todos os nomes que a conta já usou,
      não só o de agora.</div>`;
    return;
  }
  onde.innerHTML = `<div class="achou">
    <div class="par">${esc(q)} <span class="seta">&#8596;</span> ${esc(r.entrada.nome)}
      <span class="pc mono">${Math.round(r.confianca*100)}%</span></div>
    <div class="det">${esc(r.motivo)} · assistiu
      <b class="mono">${r.entrada.min ? hhmm(r.entrada.min) : '?'}</b> no total</div>
    <div class="quem">Isto é tudo que eu sei hoje sobre essa pessoa: que ela está na sua
      audiência e o tempo <b>total</b>. <b>Não sei a que horas ela entrou nem saiu</b> — isso
      só existe depois que o serviço estiver gravando na sua máquina.</div>
  </div>`;
}

/* ── EXEMPLO: gente que não existe ────────────────────────────────────── */
function desenharExemplo() {
  const nomes = Object.keys(EX.naLive);
  document.getElementById('exemplo').innerHTML = nomes.map(n => {
    const faixas = EX.naLive[n];
    const srv = EX.noServidor[n] || [];
    const ultima = faixas[faixas.length-1];
    const dentro = srv.length && EX.morte >= srv[0].de && EX.morte <= srv[0].ate
      && faixas.some(f => EX.morte >= f.de && EX.morte <= f.ate);
    const total = faixas.reduce((a,f) => a + (f.ate-f.de)/M, 0);
    return `<button class="${dentro?'dois':'pessoa larga'}" type="button" data-n="${esc(n)}">
      <div class="par">${esc(n)}${srv.length ? ` <span class="seta">&#8596;</span> ${esc(srv[0].nome)}` : ''}
        ${dentro ? '<span class="pc">nos dois às ' + hora(EX.morte) + '</span>' : ''}</div>
      <div class="det">${faixas.length} ${faixas.length>1?'entradas':'entrada'} na live ·
        ${Math.round(total)} min no total · ${ultima.fonte==='tempo'?'nunca escreveu no chat':'escreveu no chat'}
        ${srv.length ? ' · esteve no servidor' : ' · não apareceu no servidor'}</div>
    </button>`;
  }).join('');
  for (const b of document.querySelectorAll('#exemplo [data-n]')) b.onclick = () => logEx(b.dataset.n);
}

function fita(naLive, srv, quando) {
  const todos = [...naLive, ...srv];
  let de = Math.min(...todos.map(x=>x.de), quando);
  let ate = Math.max(...todos.map(x=>x.ate), quando);
  const folga = Math.max((ate-de)*0.06, 5*M); de -= folga; ate += folga;
  const pos = (t) => ((t-de)/(ate-de))*100;
  const trilha = (l, cls) => l.length ? `<div class="trilho ${cls}">${
    l.map(x=>`<i style="left:${pos(x.de)}%;width:${Math.max(pos(x.ate)-pos(x.de),0.8)}%"></i>`).join('')
  }<div class="marca" style="left:${pos(quando)}%"></div></div>` : '';
  return `<div class="fita">
    ${naLive.length?`<div class="rot">na sua live</div>${trilha(naLive,'')}`:''}
    ${srv.length?`<div class="rot">no servidor</div>${trilha(srv,'srv')}`:''}
    <div class="reguas mono"><span>${hora(de)}</span><span>&#8593; ${hora(quando)}</span><span>${hora(ate)}</span></div>
  </div>`;
}

function logEx(n) {
  const faixas = EX.naLive[n];
  const srv = EX.noServidor[n] || [];
  const linhas = [...faixas.map(x=>({onde:'live',...x})), ...srv.map(x=>({onde:'servidor',...x}))]
    .sort((a,b) => b.de - a.de);
  const naHora = faixas.find(f => EX.morte >= f.de && EX.morte <= f.ate);
  const srvNaHora = srv.find(s => EX.morte >= s.de && EX.morte <= s.ate);

  let v;
  if (naHora && srvNaHora) v = { c:' sim', t:`<b>Às ${hora(EX.morte)}: ESTAVA na sua live</b> — visto das ${hora(naHora.de)} às ${hora(naHora.ate)}. E estava no servidor.` };
  else if (naHora) v = { c:' sim', t:`<b>Às ${hora(EX.morte)}: ESTAVA na sua live</b> — visto das ${hora(naHora.de)} às ${hora(naHora.ate)}.` };
  else {
    const perto = faixas.map(f => Math.min(Math.abs(EX.morte-f.ate), Math.abs(f.de-EX.morte))).sort((a,b)=>a-b)[0];
    v = { c: perto <= 15*M ? ' provavel' : '',
      t: perto <= 15*M
        ? `<b>Às ${hora(EX.morte)}: provável</b> — visto ${Math.round(perto/M)} min de distância.`
        : `<b>Às ${hora(EX.morte)}: não visto na live nesse horário.</b> A vez mais próxima foi ${Math.round(perto/M)} min de distância.` };
  }

  const onde = document.getElementById('logex');
  onde.innerHTML = `<div class="log"><button class="fechar" type="button">&times;</button>
    <h3>${esc(n)} <span class="marcaS">EXEMPLO</span></h3>
    <div class="resumo">${linhas.length} entradas · horários em
      ${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}</div>
    <div class="veredito${v.c}"><div class="t">${v.t}</div>
      <div class="obs">Quem assiste calado não gera mensagem — <b>ausência aqui não é prova de ausência</b>.</div></div>
    <table><tbody>${linhas.map(l => `<tr>
      <td class="onde ${l.onde}">&#9679; ${l.onde}</td>
      <td class="mono">${hora(l.de)} <span class="seta">&#8594;</span> ${hora(l.ate)}</td>
      <td class="dur mono">${Math.round((l.ate-l.de)/M)} min</td>
      <td class="dur">${l.onde==='servidor' ? esc(l.nome) : (l.fonte==='tempo' ? 'tempo assistido' : 'mensagens')}</td>
    </tr>`).join('')}</tbody></table>
    ${fita(faixas, srv, EX.morte)}
    <div class="quem">No serviço de verdade, a coluna do servidor traz o <b>nome no jogo</b> e um
      link para o perfil no BattleMetrics — de onde saem o histórico de nomes e a SteamID.</div>
  </div>`;
  onde.querySelector('.fechar').onclick = () => { onde.innerHTML = ''; };
  onde.scrollIntoView({ behavior:'smooth', block:'nearest' });
}

/* atalhos: disfarces reais aplicados a nomes reais da audiência */
const base = [...DADOS.audiencia].sort((a,b)=>(b.minutosAssistidos||0)-(a.minutosAssistidos||0))[0].nome;
const disfarces = [
  base,
  `[BR] ${base.toUpperCase().replace(/I/g,'1').replace(/O/g,'0')}`,
  `xX_${base}_Xx`,
  'tchubita',
];
document.getElementById('atalhos').innerHTML = disfarces.map(d =>
  `<button type="button" data-d="${esc(d)}">${esc(d)}</button>`).join('');
for (const b of document.querySelectorAll('.atalhos button')) {
  b.onclick = () => { document.getElementById('q').value = b.dataset.d; cruzar(); };
}

document.getElementById('ir').onclick = cruzar;
document.getElementById('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') cruzar(); });

const raiz = document.documentElement;
document.getElementById('tema').onclick = () => {
  const escuroAgora = raiz.dataset.theme
    ? raiz.dataset.theme === 'dark'
    : !window.matchMedia('(prefers-color-scheme: light)').matches;
  raiz.dataset.theme = escuroAgora ? 'light' : 'dark';
};

desenharAudiencia();
desenharExemplo();

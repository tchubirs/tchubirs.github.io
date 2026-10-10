// A janela dos atalhos: a lista por áreas, a busca, e gravar uma tecla nova carregando nela.
//
// É a janela de ajuda que já existia (o "?" e o botão do topo abrem-na), agora com cada linha
// editável, como o "Atalhos de teclado" dos editores de vídeo: carregar na linha, carregar nas
// teclas novas, e está feito. Esc cancela, Backspace ou Delete deixa a acção sem tecla. Uma tecla
// que já tem dono não é roubada às escondidas: a janela diz de quem é e pergunta se troca.

import {
  ACOES, ACAO, GRUPOS, comboDoEvento, pedacos, textoDe, ariaDe,
} from './atalhos.js';
import { escapar } from './escapar.js';

const tirarAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** As teclas de uma combinação como teclas: <kbd>Ctrl</kbd>+<kbd>K</kbd>. */
function htmlDaCombo(combo, t) {
  return `<span class="combo">${pedacos(combo, t).map((p) => `<kbd>${escapar(p)}</kbd>`).join('<span class="mais">+</span>')}</span>`;
}

/**
 * Pôr a tecla de cada acção nos botões que a fazem: na dica (`title`), no `aria-keyshortcuts` para o
 * leitor de ecrã, e na tecla pequena desenhada dentro do botão (o C do Clipar, o M do Marcar kill).
 * Corre-se depois de cada `aplicarIdioma`, que repõe as dicas sem a tecla.
 */
export function pintarDicas(atalhos, t, doc = document) {
  for (const a of ACOES) {
    if (!a.botao) continue;
    const el = doc.getElementById(a.botao);
    if (!el) continue;
    if (el.dataset.tituloBase == null) el.dataset.tituloBase = el.dataset.tTitulo ? '' : (el.getAttribute('title') || '');
    const base = el.dataset.tTitulo ? t(el.dataset.tTitulo) : el.dataset.tituloBase;
    const teclas = atalhos.teclas(a.id);
    if (teclas.length) {
      el.title = `${base || t(a.rotulo)} (${teclas.map((c) => textoDe(c, t)).join(', ')})`;
      el.setAttribute('aria-keyshortcuts', teclas.map(ariaDe).join(' '));
    } else {
      if (base) el.title = base;
      else el.removeAttribute('title');
      el.removeAttribute('aria-keyshortcuts');
    }
    const kbd = el.querySelector(':scope > kbd');
    if (kbd) {
      kbd.hidden = !teclas.length;
      kbd.textContent = teclas.length ? pedacos(teclas[0], t).join('+') : '';
    }
  }
}

/**
 * Montar a janela. `raiz` é o #modalAjuda. Devolve `{ pintar, ocupada }`: `ocupada()` diz se a
 * janela está a gravar uma tecla ou a perguntar por um conflito, e enquanto isso o teclado é dela.
 */
export function montarPainelAtalhos({ atalhos, t, raiz = document.getElementById('modalAjuda'), descarregar }) {
  const $ = (id) => raiz.querySelector(`#${id}`);
  const lista = $('listaAtalhos');
  const busca = $('procurarAtalho');
  const estado = $('estadoAtalhos');
  const conflito = $('conflitoAtalho');
  const conflitoTexto = $('conflitoTexto');
  const conflitoDepois = $('conflitoDepois');
  const semAtalho = $('semAtalho');
  const padraoTodos = $('padraoTodos');
  // O aviso de conflito muda de sítio: vai para debaixo da linha em causa, dentro de um <li>.
  const conflitoLinha = document.createElement('li');
  conflitoLinha.className = 'conflitoLinha';
  let gravar = null;      // { id, modo }
  let pendente = null;    // { id, combo, modo, outro }

  function dizer(texto) {
    estado.textContent = texto;
  }

  function nomeDe(id) { return t(ACAO[id].rotulo); }
  function teclasEmTexto(lista) { return lista.map((c) => textoDe(c, t)).join(t('atalhos.ou')); }

  function pintar() {
    const filtro = tirarAcentos(busca.value.trim());
    let algum = false;
    lista.innerHTML = GRUPOS.map((g) => {
      const linhas = ACOES.filter((a) => a.grupo === g).filter((a) => {
        if (!filtro) return true;
        const texto = `${t(a.rotulo)} ${atalhos.teclas(a.id).map((c) => textoDe(c, t)).join(' ')}`;
        return tirarAcentos(texto).includes(filtro);
      });
      if (!linhas.length) return '';
      algum = true;
      const nota = g === 'vista' ? `<p class="nota grupoNota" data-t="ajuda.zoom">${escapar(t('ajuda.zoom'))}</p>` : '';
      return `<section class="grupoAtalhos" aria-labelledby="grupo-${g}">`
        + `<h3 id="grupo-${g}" data-t="atalhos.grupo.${g}">${escapar(t(`atalhos.grupo.${g}`))}</h3>`
        + `<ul>${linhas.map(linhaDe).join('')}</ul>${nota}</section>`;
    }).join('');
    semAtalho.hidden = algum;
    padraoTodos.disabled = !atalhos.algumMudado();
    colocarConflito();
  }

  function colocarConflito() {
    const li = pendente && lista.querySelector(`li[data-id="${pendente.id}"]`);
    if (li) {
      conflitoLinha.append(conflito);
      li.after(conflitoLinha);
    } else {
      lista.before(conflito);
      conflitoLinha.remove();
    }
  }

  function linhaDe(a) {
    const teclas = atalhos.teclas(a.id);
    const aGravar = gravar?.id === a.id;
    const nome = t(a.rotulo);
    const mostrar = aGravar
      ? `<span class="aEspera">${escapar(t(gravar.modo === 'juntar' ? 'atalhos.apertaOutra' : 'atalhos.aperta'))}</span>`
      : teclas.length ? teclas.map((c) => htmlDaCombo(c, t)).join(`<span class="ou">${escapar(t('atalhos.ouCurto'))}</span>`)
        : `<span class="semTecla">${escapar(t('atalhos.semTecla'))}</span>`;
    const rotuloTeclas = aGravar ? t('atalhos.aGravarAria', { acao: nome })
      : t('atalhos.alterarAria', { acao: nome, teclas: teclas.length ? teclasEmTexto(teclas) : t('atalhos.semTecla') });
    const padrao = atalhos.ehPadrao(a.id);
    const marca = pendente?.id === a.id ? ' emConflito' : pendente?.outro === a.id ? ' donoConflito' : '';
    return `<li class="atalho${aGravar ? ' aGravar' : ''}${padrao ? '' : ' mudado'}${marca}" data-id="${a.id}">`
      + `<span class="atalhoNome" id="atalho-${a.id}" data-t="${a.rotulo}">${escapar(nome)}</span>`
      + `<button type="button" class="atalhoTeclas" data-acao="gravar" aria-label="${escapar(rotuloTeclas)}"`
      + `${aGravar ? ' aria-pressed="true"' : ''}>${mostrar}</button>`
      + `<button type="button" class="discreto so-icone atalhoBotao" data-acao="juntar" title="${escapar(t('atalhos.juntar'))}"`
      + ` aria-label="${escapar(t('atalhos.juntarAria', { acao: nome }))}"><svg class="ic ic-p" aria-hidden="true"><use href="#i-mais"/></svg></button>`
      + `<button type="button" class="discreto so-icone atalhoBotao" data-acao="padrao" title="${escapar(t('atalhos.padrao'))}"`
      + ` aria-label="${escapar(t('atalhos.padraoAria', { acao: nome }))}"${padrao ? ' disabled' : ''}>`
      + `<svg class="ic ic-p" aria-hidden="true"><use href="#i-anular"/></svg></button></li>`;
  }

  function focarLinha(id, acao = 'gravar') {
    lista.querySelector(`li[data-id="${id}"] [data-acao="${acao}"]`)?.focus({ preventScroll: false });
  }

  function comecar(id, modo = 'trocar') {
    fecharConflito();
    gravar = { id, modo };
    pintar();
    focarLinha(id);
    dizer(t('atalhos.aGravar', { acao: nomeDe(id) }));
  }

  function parar({ voltarFoco = true } = {}) {
    const id = gravar?.id;
    gravar = null;
    pintar();
    if (id && voltarFoco) focarLinha(id);
  }

  function fecharConflito() {
    const havia = pendente;
    pendente = null;
    conflito.hidden = true;
    if (havia) pintar();
  }

  function aplicar(id, combo, modo) {
    const r = atalhos.atribuir(id, combo, { modo });
    if (r.conflito) {
      pendente = { id, combo: r.combo, modo, outro: r.conflito };
      gravar = null;
      mostrarConflito();
      pintar();
      conflito.scrollIntoView({ block: 'nearest' });
      $('trocarAtalho').focus({ preventScroll: true });
      return;
    }
    if (r.erro) {
      dizer(t('atalhos.reservada', { tecla: textoDe(combo, t) }));
      return;
    }
    parar();
    dizer(t('atalhos.feito', { acao: nomeDe(id), teclas: teclasEmTexto(atalhos.teclas(id)) }));
  }

  function mostrarConflito() {
    const { id, combo, modo, outro } = pendente;
    const ficaria = [...atalhos.teclas(outro).filter((c) => c !== combo),
      ...(modo === 'juntar' ? [] : atalhos.teclas(id).filter((c) => c !== combo))];
    conflitoTexto.innerHTML = t('atalhos.conflito', {
      tecla: `<b>${escapar(textoDe(combo, t))}</b>`, outro: `<b>${escapar(nomeDe(outro))}</b>`,
    });
    conflitoDepois.textContent = ficaria.length
      ? t('atalhos.trocarDeixa', { outro: nomeDe(outro), teclas: teclasEmTexto([...new Set(ficaria)]), acao: nomeDe(id) })
      : t('atalhos.trocarSem', { outro: nomeDe(outro), acao: nomeDe(id) });
    conflito.hidden = false;
  }

  // O teclado enquanto se grava: apanhado antes de todos os outros (fase de captura, na janela),
  // senão o K gravado também pausava o vídeo por baixo e o Esc fechava a janela inteira.
  window.addEventListener('keydown', (e) => {
    if (raiz.hidden) return;
    if (pendente && e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      const id = pendente.id;
      fecharConflito();
      focarLinha(id);
      dizer(t('atalhos.cancelado'));
      return;
    }
    if (!gravar) return;
    if (e.key === 'Tab') { parar({ voltarFoco: false }); return; }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') { parar(); dizer(t('atalhos.cancelado')); return; }
    const combo = comboDoEvento(e);
    if (!combo) return;
    const { id, modo } = gravar;
    if (combo === 'Backspace' || combo === 'Delete') {
      if (modo === 'juntar') { parar(); dizer(t('atalhos.cancelado')); return; }
      atalhos.limpar(id);
      parar();
      dizer(t('atalhos.limpo', { acao: nomeDe(id) }));
      return;
    }
    aplicar(id, combo, modo);
  }, true);

  // Clicar fora da linha que está a gravar desiste dela.
  raiz.addEventListener('pointerdown', (e) => {
    if (gravar && !e.target.closest(`li[data-id="${gravar.id}"]`)) parar({ voltarFoco: false });
  });

  lista.addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    const id = li.dataset.id;
    const botao = e.target.closest('button[data-acao]');
    const acao = botao?.dataset.acao || 'gravar';
    if (acao === 'padrao') {
      const { presas } = atalhos.padrao(id);
      pintar();
      focarLinha(id);
      dizer(presas.length
        ? t('atalhos.padraoPreso', { acao: nomeDe(id), tecla: textoDe(presas[0].combo, t), outro: nomeDe(presas[0].outro) })
        : t('atalhos.padraoFeito', { acao: nomeDe(id) }));
      return;
    }
    if (gravar?.id === id && gravar.modo === (acao === 'juntar' ? 'juntar' : 'trocar')) { parar(); return; }
    comecar(id, acao === 'juntar' ? 'juntar' : 'trocar');
  });

  $('trocarAtalho').onclick = () => {
    if (!pendente) return;
    const { id, combo, modo, outro } = pendente;
    fecharConflito();
    atalhos.trocar(id, combo, { modo });
    pintar();
    focarLinha(id);
    dizer(t('atalhos.trocado', {
      acao: nomeDe(id), tecla: textoDe(combo, t), outro: nomeDe(outro),
      teclas: atalhos.teclas(outro).length ? teclasEmTexto(atalhos.teclas(outro)) : t('atalhos.semTecla'),
    }));
  };
  $('cancelarAtalho').onclick = () => {
    if (!pendente) return;
    const id = pendente.id;
    fecharConflito();
    focarLinha(id);
    dizer(t('atalhos.cancelado'));
  };

  busca.addEventListener('input', () => { if (gravar) gravar = null; pintar(); });

  $('padraoTodos').onclick = () => {
    fecharConflito();
    gravar = null;
    atalhos.padraoTudo();
    pintar();
    dizer(t('atalhos.tudoPadrao'));
  };

  $('exportarAtalhos').onclick = () => {
    const texto = atalhos.exportar();
    if (descarregar) descarregar(texto);
    else {
      const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'povix-atalhos.json';
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    dizer(t('atalhos.exportado'));
  };
  $('importarAtalhos').onclick = () => $('ficheiroAtalhos').click();
  $('ficheiroAtalhos').onchange = async () => {
    const f = $('ficheiroAtalhos').files?.[0];
    $('ficheiroAtalhos').value = '';
    if (!f) return;
    let texto = '';
    try { texto = f.size > 64_000 ? '' : await f.text(); } catch { texto = ''; }
    const ok = texto && atalhos.importar(texto);
    fecharConflito();
    gravar = null;
    pintar();
    dizer(t(ok ? 'atalhos.importado' : 'atalhos.naoImportado'));
  };

  atalhos.aoMudar(() => pintar());

  return {
    pintar,
    ocupada: () => Boolean(gravar || pendente),
    /** Ao fechar a janela, o que estava a meio fica como estava. */
    largar() { gravar = null; fecharConflito(); dizer(''); },
  };
}

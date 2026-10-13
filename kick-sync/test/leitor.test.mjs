// A regra que decide se um quadrado toca ou para.
//
// Sao tres linhas, e uma delas esteve errada desde o principio: quando o leitor
// ja estava no mesmo video, a pagina acertava o instante e saia sem mandar
// tocar. Num computador nao se via — o primeiro play() passa e o video nunca
// mais para. Num telemovel via-se em cheio: o iOS recusa o primeiro play()
// porque nao veio de um toque, e a partir dai nada voltava a andar.
//
// Por isso a regra saiu de dentro das cem linhas que mexem no DOM e veio para
// aqui, onde se pode escrever a tabela toda.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { queFazerComOLeitor, limitarSaltos } from '../site/leitor.js';

const q = (correr, parado, pausado) => queFazerComOLeitor({ correr, parado, pausado });

// A linha que faltava. Este era o caso do telemovel dele.
test('um leitor parado que devia estar a andar tem de arrancar', () => {
  assert.equal(q(true, false, true), 'tocar');
});

test('um leitor que ja anda e devia andar fica como esta', () => {
  assert.equal(q(true, false, false), 'nada');
});

test('um angulo que nao devia andar para', () => {
  assert.equal(q(false, false, false), 'parar');
  assert.equal(q(false, false, true), 'nada', 'ja esta parado, nao ha nada a fazer');
});

// A pausa da pagina ganha a tudo: o botao dizer parado e o quadrado andar e a
// pior das duas coisas, e ja aconteceu uma vez.
test('com a pagina em pausa, nada anda — nem o angulo principal', () => {
  assert.equal(q(true, true, true), 'nada');
  assert.equal(q(true, true, false), 'parar');
  assert.equal(q(false, true, false), 'parar');
  assert.equal(q(false, true, true), 'nada');
});

// A tabela inteira, para que nenhum caso fique por dizer.
test('as oito combinacoes estao todas decididas', () => {
  const vistos = new Set();
  for (const correr of [true, false]) {
    for (const parado of [true, false]) {
      for (const pausado of [true, false]) {
        const r = q(correr, parado, pausado);
        assert.ok(['tocar', 'parar', 'nada'].includes(r), `${correr}/${parado}/${pausado} deu ${r}`);
        vistos.add(`${correr}${parado}${pausado}`);
      }
    }
  }
  assert.equal(vistos.size, 8);
});

// Arrastar a agulha: no máximo uns 4 saltos por segundo, o último pedido ganha, e ao largar salta-se certo.
function relogioFalso() {
  let agora = 0;
  let fila = [];
  return {
    relogio: () => agora,
    agendar: (f, ms) => { const t = { f, em: agora + ms }; fila.push(t); return t; },
    cancelar: (t) => { fila = fila.filter((x) => x !== t); },
    avancar(ms) {
      agora += ms;
      for (const t of fila.filter((x) => x.em <= agora)) { fila = fila.filter((x) => x !== t); t.f(); }
    },
  };
}

test('arrastando: o primeiro pedido salta já, os seguintes esperam e só o último corre', () => {
  const r = relogioFalso();
  const feitos = [];
  const s = limitarSaltos((ms) => feitos.push(ms), { minimoMs: 250, ...r });
  s.pedir(1000);
  s.pedir(2000);
  s.pedir(3000);
  assert.deepEqual(feitos, [1000]);
  r.avancar(100);
  s.pedir(4000);
  r.avancar(149);
  assert.deepEqual(feitos, [1000]);
  r.avancar(1);
  assert.deepEqual(feitos, [1000, 4000]);
});

test('sessenta pedidos num segundo viram uns 4 saltos', () => {
  const r = relogioFalso();
  let n = 0;
  const s = limitarSaltos(() => { n++; }, { minimoMs: 250, ...r });
  for (let i = 0; i < 60; i++) { s.pedir(i * 100); r.avancar(1000 / 60); }
  r.avancar(300);
  assert.ok(n >= 4 && n <= 6, `saltos: ${n}`);
});

test('ao largar salta ao ponto exato e cancela o que estava à espera', () => {
  const r = relogioFalso();
  const feitos = [];
  const s = limitarSaltos((ms) => feitos.push(ms), { minimoMs: 250, ...r });
  s.pedir(1000);
  s.pedir(2000);
  s.fechar(2500);
  assert.deepEqual(feitos, [1000, 2500]);
  r.avancar(1000);
  assert.deepEqual(feitos, [1000, 2500], 'o pedido pendente não corre depois de largar');
});

test('largar no mesmo ponto que já saltou não repete o salto', () => {
  const r = relogioFalso();
  const feitos = [];
  const s = limitarSaltos((ms) => feitos.push(ms), { minimoMs: 250, ...r });
  s.pedir(1000);
  s.fechar(1000);
  assert.deepEqual(feitos, [1000]);
});

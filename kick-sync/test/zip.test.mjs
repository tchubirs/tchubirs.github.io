// O ZIP que a pagina gera tem de ser aceite por um programa a serio.
//
// Um teste em que eu escrevo o ZIP e depois o leio com codigo meu nao prova
// nada: os dois enganam-se da mesma maneira. Por isso aqui o ficheiro vai para
// o disco e quem o abre e o `unzip` do sistema e o `zipfile` do Python — duas
// implementacoes que nao sabem que este codigo existe.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { crc32, crc32Total, criarZip, LIMITE } from '../site/zip.js';

const bytes = (s) => new TextEncoder().encode(s);
const QUANDO = new Date('2026-08-31T22:10:30Z');

const escreverZip = async (ficheiros) => {
  const blob = criarZip(ficheiros, QUANDO);
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'zip-')), 'montagem.zip');
  fs.writeFileSync(f, Buffer.from(await blob.arrayBuffer()));
  return f;
};

const ficheiro = (nome, texto) => {
  const b = bytes(texto);
  return { nome, blob: new Blob([b]), crc: crc32(b), tamanho: b.length };
};

// O valor de referencia do CRC-32 e o mesmo em todo o lado: a norma diz que a
// soma de "123456789" e 0xCBF43926. Se esta linha falhar, todos os ZIP que
// saem daqui estao errados e nenhum programa os aceita.
test('o CRC-32 bate com o valor de referencia', () => {
  assert.equal(crc32(bytes('123456789')), 0xCBF43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

// Os clipes chegam em segmentos. Se o CRC aos bocados nao der o mesmo que de
// uma vez, o ZIP sai com somas erradas e o `unzip` recusa-o.
test('o CRC aos bocados da o mesmo que de uma vez', () => {
  const todo = bytes('o mesmo texto, partido de varias maneiras');
  assert.equal(crc32Total([todo]), crc32(todo));
  assert.equal(crc32Total([todo.slice(0, 1), todo.slice(1)]), crc32(todo));
  assert.equal(crc32Total([todo.slice(0, 17), todo.slice(17, 18), todo.slice(18)]), crc32(todo));
  assert.equal(crc32Total([new Uint8Array(0), todo, new Uint8Array(0)]), crc32(todo));
});

test('o unzip do sistema aceita o ficheiro e tira de la o mesmo que la foi posto', async () => {
  const conteudos = {
    '01-tchubi.ts': 'a POV dele, longa',
    '01-vitima1.ts': 'a POV de quem morreu, curta',
    '02-tchubi.ts': 'a kill seguinte',
  };
  const f = await escreverZip(Object.entries(conteudos).map(([n, t]) => ficheiro(n, t)));

  // -t verifica todos os CRC. E aqui que um ZIP mal escrito cai.
  assert.match(execFileSync('unzip', ['-t', f], { encoding: 'utf8' }), /No errors detected/);

  const pasta = path.dirname(f);
  execFileSync('unzip', ['-q', f, '-d', path.join(pasta, 'fora')]);
  for (const [nome, texto] of Object.entries(conteudos)) {
    assert.equal(fs.readFileSync(path.join(pasta, 'fora', nome), 'utf8'), texto, nome);
  }
});

// Um segundo leitor, que nao e o mesmo programa. O `unzip` e o `zipfile` do
// Python discordam em ficheiros mal formados, e concordar com os dois e uma
// garantia diferente de concordar so com um.
test('o Python tambem le, e ve os nomes e as datas certas', async () => {
  const f = await escreverZip([ficheiro('01-tchubi.ts', 'x'), ficheiro('02-tchubi.ts', 'yy')]);
  const saida = execFileSync('python3', ['-c', `
import zipfile, json
z = zipfile.ZipFile(${JSON.stringify(f)})
print(json.dumps({
  'mau': z.testzip(),
  'nomes': z.namelist(),
  'tamanhos': [i.file_size for i in z.infolist()],
  'data': list(z.infolist()[0].date_time),
}))`], { encoding: 'utf8' });
  const r = JSON.parse(saida);
  assert.equal(r.mau, null, 'nenhum ficheiro com CRC errado');
  assert.deepEqual(r.nomes, ['01-tchubi.ts', '02-tchubi.ts']);
  assert.deepEqual(r.tamanhos, [1, 2]);
  assert.deepEqual(r.data.slice(0, 3), [2026, 8, 31], 'a data dentro do ZIP nao pode ser lixo');
});

// Dois canais com o mesmo nome de ficheiro na mesma montagem: alguns programas
// extraem um por cima do outro e ele perde metade sem dar por nada.
test('nomes repetidos sao desempatados, e nao escritos um por cima do outro', async () => {
  const f = await escreverZip([
    ficheiro('01-tchubi.ts', 'o primeiro'),
    ficheiro('01-tchubi.ts', 'o segundo'),
    ficheiro('01-tchubi.ts', 'o terceiro'),
  ]);
  const pasta = path.dirname(f);
  execFileSync('unzip', ['-q', f, '-d', path.join(pasta, 'fora')]);
  const saiu = fs.readdirSync(path.join(pasta, 'fora')).sort();
  assert.deepEqual(saiu, ['01-tchubi-2.ts', '01-tchubi-3.ts', '01-tchubi.ts']);
  assert.equal(fs.readFileSync(path.join(pasta, 'fora', '01-tchubi-3.ts'), 'utf8'), 'o terceiro');
});

// Um ZIP com um so ficheiro e o caso mais provavel do dia a dia dele: uma kill,
// so a POV dele.
test('um ficheiro so tambem da um ZIP valido', async () => {
  const f = await escreverZip([ficheiro('01-tchubi.ts', 'sozinho')]);
  assert.match(execFileSync('unzip', ['-t', f], { encoding: 'utf8' }), /No errors detected/);
});

// Acima de 4 GB o formato precisa das extensoes ZIP64. Devolver na mesma um
// ficheiro dava um ZIP partido que so falha na maquina dele, uma hora depois
// de a montagem ter comecado a descarregar.
test('recusa o que nao consegue escrever, em vez de escrever mal', () => {
  assert.throws(() => criarZip([]), /ZIP-VAZIO/);
  assert.throws(
    () => criarZip([{ nome: 'a.ts', blob: new Blob([]), crc: 0, tamanho: LIMITE + 1 }]),
    /ZIP-GRANDE-DEMAIS/,
  );
});

// O tamanho de cada ficheiro esta escrito em DOIS sitios (cabecalho local e
// directorio central) e o deslocamento de cada um no terceiro. Uma conta
// errada num deles so aparece a partir do segundo ficheiro — por isso o teste
// tem de ter varios, e de tamanhos diferentes.
test('os deslocamentos aguentam ficheiros de tamanhos diferentes', async () => {
  const f = await escreverZip(
    [1, 500, 3, 70000, 12].map((n, i) => ficheiro(`${String(i + 1).padStart(2, '0')}-c.ts`, 'x'.repeat(n))),
  );
  assert.match(execFileSync('unzip', ['-t', f], { encoding: 'utf8' }), /No errors detected/);
  const l = execFileSync('unzip', ['-l', f], { encoding: 'utf8' });
  for (const n of [1, 500, 3, 70000, 12]) assert.match(l, new RegExp(`\\s${n}\\s`), `faltou ${n}`);
});

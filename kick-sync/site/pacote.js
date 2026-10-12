// O pacote do lance para o editor (IDEIAS.md, item 6): o trecho de cada ângulo, um projeto multicâmera
// em FCPXML que o DaVinci Resolve e o Final Cut abrem com os ângulos já alinhados, e um texto com nomes,
// horários e links.
//
// O FCPXML segue a versão 1.9 (Final Cut 10.5 em diante; o Resolve 17 e 18 importam): os ficheiros vão em
// `media-rep` dentro de cada `asset`, e não no atributo `src` das versões antigas. A estrutura:
//
//   fcpxml > resources > format (um por tamanho e cadência), asset (um por ângulo, com media-rep),
//                        media > multicam > mc-angle (um por ângulo: gap, se começa depois, e asset-clip)
//   fcpxml > library > event > project > sequence > spine > mc-clip (com um mc-source por ângulo)
//
// O nome de cada ângulo é o slug do canal, tal e qual, e é também o `angleID`: o fórum da Blackmagic tem
// relatos de nomes trocados ao importar multicâmera, e um nome que é o próprio canal não deixa dúvida.
//
// Os tempos vão em frações de segundo com base 6000 (100/6000s é um quadro a 60 fps, 200/6000s a 30),
// arredondados ao quadro, como o Final Cut escreve. Sem testar ainda no DaVinci e no Final Cut de verdade.

const BASE = 6000;

/** Quadros por segundo inteiros e que dividem a base; o resto cai para 30, que é o degrau baixo da Kick. */
export function cadencia(fps) {
  const f = Math.round(Number(fps) || 0);
  return f > 0 && BASE % f === 0 ? f : 30;
}

/** Um tempo em segundos como o FCPXML o quer: "0s" ou "N/6000s", arredondado ao quadro. */
export function tempoFcp(segundos, fps) {
  const f = cadencia(fps);
  const quadros = Math.max(0, Math.round(segundos * f));
  if (!quadros) return '0s';
  const n = quadros * (BASE / f);
  return n % BASE === 0 ? `${n / BASE}s` : `${n}/${BASE}s`;
}

const xml = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** O caminho relativo de um ficheiro no ZIP, como URL: o editor procura-o ao lado do .fcpxml. */
const srcRelativo = (nome) => `./${nome.split('/').map(encodeURIComponent).join('/')}`;

/**
 * Onde cada ângulo começa, em segundos, contado do primeiro que começa. É isto que alinha os ângulos:
 * os ficheiros já saem cortados no relógio comum (com o atraso medido de cada canal), e o que sobra é o
 * que cada um tem a mais ou a menos no início.
 *
 * @param {{inicioMs:number}[]} angulos
 * @returns {number[]}
 */
export function deslocamentos(angulos) {
  const zero = Math.min(...angulos.map((a) => a.inicioMs));
  return angulos.map((a) => (a.inicioMs - zero) / 1000);
}

/**
 * O projeto multicâmera.
 *
 * @param {object} o
 * @param {string} o.titulo o nome do projeto e do clipe multicâmera
 * @param {{canal:string, ficheiro:string, inicioMs:number, duracaoS:number, largura?:number,
 *   altura?:number, fps?:number}[]} o.angulos `inicioMs` é onde o ficheiro começa no relógio comum
 * @returns {string}
 */
export function fcpxmlMulticam({ titulo, angulos }) {
  if (!angulos?.length) throw new Error('sem ângulos');
  const desl = deslocamentos(angulos);
  // Um formato por combinação de tamanho e cadência; o do multicâmera e da sequência é o do primeiro.
  const formatos = new Map();
  const formatoDe = (a) => {
    const largura = Math.round(a.largura) || 1920;
    const altura = Math.round(a.altura) || 1080;
    const fps = cadencia(a.fps);
    const chave = `${largura}x${altura}@${fps}`;
    if (!formatos.has(chave)) formatos.set(chave, { id: `r${formatos.size + 1}`, largura, altura, fps });
    return formatos.get(chave);
  };
  const fAng = angulos.map(formatoDe);
  const fSeq = fAng[0];
  const nFormatos = formatos.size;
  const idAsset = (i) => `r${nFormatos + 1 + i}`;
  const idMedia = `r${nFormatos + 1 + angulos.length}`;
  const totalS = Math.max(...angulos.map((a, i) => desl[i] + a.duracaoS));
  const t = (s) => tempoFcp(s, fSeq.fps);

  const linhas = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE fcpxml>',
    '<fcpxml version="1.9">',
    '  <resources>',
  ];
  for (const f of formatos.values()) {
    linhas.push(`    <format id="${f.id}" name="FFVideoFormat${f.altura}p${f.fps}" frameDuration="${tempoFcp(1 / f.fps, f.fps)}"`
      + ` width="${f.largura}" height="${f.altura}" colorSpace="1-1-1 (Rec. 709)"/>`);
  }
  angulos.forEach((a, i) => {
    linhas.push(
      `    <asset id="${idAsset(i)}" name="${xml(a.canal)}" start="0s" duration="${tempoFcp(a.duracaoS, fAng[i].fps)}"`
        + ` hasVideo="1" format="${fAng[i].id}" hasAudio="1" audioSources="1" audioChannels="2" audioRate="48000">`,
      `      <media-rep kind="original-media" src="${xml(srcRelativo(a.ficheiro))}"/>`,
      '    </asset>',
    );
  });
  linhas.push(
    `    <media id="${idMedia}" name="${xml(titulo)}">`,
    `      <multicam format="${fSeq.id}" tcStart="0s" tcFormat="NDF">`,
  );
  angulos.forEach((a, i) => {
    linhas.push(`        <mc-angle name="${xml(a.canal)}" angleID="${xml(a.canal)}">`);
    const posicao = t(desl[i]);
    if (posicao !== '0s') linhas.push(`          <gap name="Gap" offset="0s" start="0s" duration="${posicao}"/>`);
    linhas.push(`          <asset-clip ref="${idAsset(i)}" name="${xml(a.canal)}" offset="${posicao}" start="0s"`
      + ` duration="${tempoFcp(a.duracaoS, fAng[i].fps)}" format="${fAng[i].id}" tcFormat="NDF"/>`);
    linhas.push('        </mc-angle>');
  });
  linhas.push(
    '      </multicam>',
    '    </media>',
    '  </resources>',
    '  <library>',
    '    <event name="Povix">',
    `      <project name="${xml(titulo)}">`,
    `        <sequence format="${fSeq.id}" duration="${t(totalS)}" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">`,
    '          <spine>',
    `            <mc-clip ref="${idMedia}" name="${xml(titulo)}" offset="0s" start="0s" duration="${t(totalS)}">`,
    // O ângulo ativo é o primeiro (o de quem marcou o lance), com imagem e som.
    `              <mc-source angleID="${xml(angulos[0].canal)}" srcEnable="all"/>`,
    '            </mc-clip>',
    '          </spine>',
    '        </sequence>',
    '      </project>',
    '    </event>',
    '  </library>',
    '</fcpxml>',
    '',
  );
  return linhas.join('\n');
}

const doisDigitos = (n) => String(n).padStart(2, '0');

/** "21:14:07" em UTC, que é o relógio que serve para todos os streamers do evento. */
export function horaUtc(ms) {
  const d = new Date(ms);
  return `${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}:${doisDigitos(d.getUTCSeconds())}`;
}

/** "1:02:03" a partir de segundos. */
export function duracaoLonga(s) {
  const n = Math.max(0, Math.round(s));
  return `${Math.floor(n / 3600)}:${doisDigitos(Math.floor((n % 3600) / 60))}:${doisDigitos(n % 60)}`;
}

/**
 * O texto do pacote: o lance, e por ângulo o ficheiro, onde começa, quanto dura, o atraso medido e onde
 * está no VOD da Kick. As frases vêm de quem chama (já traduzidas); aqui só se arruma.
 *
 * @param {object} o
 * @param {string} o.titulo
 * @param {number} o.instanteMs o instante do lance
 * @param {{canal:string, ficheiro:string, inicioMs:number, duracaoS:number, atrasoMs:number,
 *   link:string|null, noVodS:number|null}[]} o.angulos
 * @param {(chave:string, vars?:object) => string} o.t
 */
export function textoDoPacote({ titulo, instanteMs, angulos, t }) {
  const desl = deslocamentos(angulos);
  const linhas = [
    titulo,
    t('pacote.txtLance', { data: new Date(instanteMs).toISOString().slice(0, 10), hora: horaUtc(instanteMs) }),
    t('pacote.txtComo'),
    '',
  ];
  angulos.forEach((a, i) => {
    linhas.push(
      `${i + 1}. ${a.canal}`,
      `   ${t('pacote.txtFicheiro')}: ${a.ficheiro}`,
      `   ${t('pacote.txtComeca', { hora: horaUtc(a.inicioMs), s: desl[i].toFixed(2) })}`,
      `   ${t('pacote.txtDura', { s: a.duracaoS.toFixed(2) })}`,
      `   ${t('pacote.txtAtraso', { s: ((a.atrasoMs || 0) / 1000).toFixed(2) })}`,
      `   ${a.link ? `${t('pacote.txtVod')}: ${a.link}${a.noVodS != null ? ` (${t('pacote.txtNoVod', { tempo: duracaoLonga(a.noVodS) })})` : ''}`
        : t('pacote.txtSemLink')}`,
      '',
    );
  });
  return linhas.join('\r\n');
}

/** O endereço do VOD na Kick, pelo `uuid` do vídeo. Sem ele, nada: um link inventado leva a lado nenhum. */
export function linkDoVod(slug, vod) {
  const uuid = vod?.uuid;
  if (!slug || typeof uuid !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(uuid)) return null;
  return `https://kick.com/${encodeURIComponent(slug)}/videos/${uuid}`;
}

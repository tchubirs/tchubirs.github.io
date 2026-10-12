// Vários 9:16 gravados (MediaRecorder) num ficheiro só, sem recodificar.
//
// O "Um vídeo só" da montagem (FILA.md, correções de 12/10): o 16:9 junta-se no mp4.js, a partir do H.264
// da Kick. O 9:16 é gravado no browser, um ficheiro por clipe, e o gravador do Chrome dá MP4 fragmentado
// (moof + mdat) ou WebM, conforme o que o browser sabe gravar (ver `formatoQueFunciona`). Todos os clipes
// de uma montagem saem do mesmo gravador com as mesmas opções e a mesma tela, por isso as faixas são
// iguais: basta pôr os fragmentos uns a seguir aos outros e acertar o relógio de cada um.
//
// Quando as faixas não batem (um clipe sem som, um formato diferente), dá erro com nome, e quem chama
// entrega os ficheiros soltos, a dizer porquê.

const erro = (nome, msg) => Object.assign(new Error(msg), { name: nome });

// ── MP4 fragmentado ──────────────────────────────────────────────────────

const tipoDe = (b, o) => String.fromCharCode(b[o + 4], b[o + 5], b[o + 6], b[o + 7]);
const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

function filhos(b, de, ate) {
  const out = [];
  const d = dv(b);
  for (let o = de; o + 8 <= ate;) {
    let n = d.getUint32(o);
    let cab = 8;
    if (n === 1) { n = Number(d.getBigUint64(o + 8)); cab = 16; }
    if (n === 0) n = ate - o;
    if (n < cab || o + n > ate) break;
    out.push({ tipo: tipoDe(b, o), o, n, dentro: o + cab });
    o += n;
  }
  return out;
}
const um = (b, pai, tipo) => filhos(b, pai.dentro, pai.o + pai.n).find((c) => c.tipo === tipo);

/**
 * A descrição de uma faixa para comparar: a entrada do stsd sem a caixa `btrt`, que traz o débito médio
 * daquela gravação e muda sempre (medido no Chromium 141: o resto é igual de gravação para gravação).
 */
function descricao(b, stsd) {
  const entrada = filhos(b, stsd.dentro + 8, stsd.o + stsd.n)[0];
  if (!entrada) return b.subarray(stsd.o, stsd.o + stsd.n);
  const video = ['avc1', 'avc3', 'vp08', 'vp09', 'av01', 'hvc1', 'hev1'].includes(entrada.tipo);
  const fixo = entrada.dentro + (video ? 78 : 28);
  const partes = [...b.subarray(entrada.o + 4, fixo)];
  for (const c of filhos(b, fixo, entrada.o + entrada.n)) if (c.tipo !== 'btrt') partes.push(...b.subarray(c.o, c.o + c.n));
  return partes;
}

/** As faixas do moov: escala de tempo, duração por omissão e a descrição (para comparar). */
function faixasDoMoov(b, moov) {
  const d = dv(b);
  const faixas = new Map();
  for (const trak of filhos(b, moov.dentro, moov.o + moov.n).filter((c) => c.tipo === 'trak')) {
    const tkhd = um(b, trak, 'tkhd');
    const mdia = um(b, trak, 'mdia');
    const mdhd = mdia && um(b, mdia, 'mdhd');
    if (!tkhd || !mdhd) continue;
    const v1 = b[tkhd.dentro] === 1;
    const id = d.getUint32(tkhd.dentro + (v1 ? 20 : 12));
    const escala = d.getUint32(mdhd.dentro + (b[mdhd.dentro] === 1 ? 20 : 12));
    const minf = um(b, mdia, 'minf');
    const stbl = minf && um(b, minf, 'stbl');
    const stsd = stbl && um(b, stbl, 'stsd');
    const hdlr = um(b, mdia, 'hdlr');
    const tipo = hdlr ? tipoDe(b, hdlr.dentro + 4) : '?';
    faixas.set(id, { escala, durOmissao: 0, stsd: stsd ? descricao(b, stsd) : null, tipo });
  }
  const mvex = um(b, moov, 'mvex');
  for (const trex of mvex ? filhos(b, mvex.dentro, mvex.o + mvex.n).filter((c) => c.tipo === 'trex') : []) {
    const f = faixas.get(d.getUint32(trex.dentro + 4));
    if (f) f.durOmissao = d.getUint32(trex.dentro + 12);
  }
  return faixas;
}

function lerFragmentado(b) {
  const topo = filhos(b, 0, b.length);
  const moov = topo.find((c) => c.tipo === 'moov');
  if (!moov || !topo.some((c) => c.tipo === 'moof')) throw erro('JUNTAR-FORMATO', 'não é MP4 fragmentado');
  const faixas = faixasDoMoov(b, moov);
  const d = dv(b);
  // Cada moof com o seu mdat a seguir, e por faixa o tfdt e o fim.
  const fragmentos = [];
  for (const [i, c] of topo.entries()) {
    if (c.tipo !== 'moof') continue;
    const trafs = [];
    for (const traf of filhos(b, c.dentro, c.o + c.n).filter((x) => x.tipo === 'traf')) {
      const tfhd = um(b, traf, 'tfhd');
      const tfdt = um(b, traf, 'tfdt');
      if (!tfhd || !tfdt) continue;
      const id = d.getUint32(tfhd.dentro + 4);
      const fl = d.getUint32(tfhd.dentro) & 0xffffff;
      let p = tfhd.dentro + 8;
      if (fl & 1) p += 8;
      if (fl & 2) p += 4;
      const durTfhd = fl & 8 ? d.getUint32(p) : null;
      const v1 = b[tfdt.dentro] === 1;
      const base = v1 ? Number(d.getBigUint64(tfdt.dentro + 4)) : d.getUint32(tfdt.dentro + 4);
      let soma = 0;
      for (const trun of filhos(b, traf.dentro, traf.o + traf.n).filter((x) => x.tipo === 'trun')) {
        const tf = d.getUint32(trun.dentro) & 0xffffff;
        const n = d.getUint32(trun.dentro + 4);
        let q = trun.dentro + 8 + (tf & 1 ? 4 : 0) + (tf & 4 ? 4 : 0);
        const passo = (tf & 0x100 ? 4 : 0) + (tf & 0x200 ? 4 : 0) + (tf & 0x400 ? 4 : 0) + (tf & 0x800 ? 4 : 0);
        for (let k = 0; k < n; k++) {
          soma += tf & 0x100 ? d.getUint32(q) : (durTfhd ?? faixas.get(id)?.durOmissao ?? 0);
          q += passo;
        }
      }
      trafs.push({ id, tfhd, tfdt, v1, base, fim: base + soma });
    }
    const mdat = topo[i + 1]?.tipo === 'mdat' ? topo[i + 1] : null;
    fragmentos.push({ moof: c, mdat, trafs });
  }
  return { b, inicio: b.subarray(0, moov.o + moov.n), faixas, fragmentos };
}

function juntarFragmentados(listas) {
  const lidos = listas.map(lerFragmentado);
  const p = lidos[0];
  const igual = (x, y) => x && y && x.length === y.length && x.every((v, i) => v === y[i]);
  // As faixas de cada gravação, ligadas às da primeira pelo tipo (vide, soun). O número de cada faixa
  // não serve: medido no Chromium 141, a ordem do som e da imagem muda de gravação para gravação.
  for (const l of lidos) {
    if (l.faixas.size !== p.faixas.size) throw erro('JUNTAR-FAIXAS', 'faixas diferentes');
    l.paraPrimeira = new Map();
    for (const [id, g] of l.faixas) {
      const alvo = [...p.faixas].find(([, f]) => f.tipo === g.tipo);
      if (!alvo || alvo[1].escala !== g.escala || !igual(g.stsd, alvo[1].stsd)) throw erro('JUNTAR-FAIXAS', 'faixas diferentes');
      l.paraPrimeira.set(id, alvo[0]);
    }
  }
  const partes = [p.inicio];
  let seq = 1;
  let desvioS = 0;
  for (const l of lidos) {
    const primeiro = new Map();
    const ultimo = new Map();
    for (const f of l.fragmentos) {
      for (const t of f.trafs) {
        if (!primeiro.has(t.id)) primeiro.set(t.id, t.base);
        ultimo.set(t.id, Math.max(ultimo.get(t.id) ?? 0, t.fim));
      }
    }
    for (const f of l.fragmentos) {
      const moof = l.b.slice(f.moof.o, f.moof.o + f.moof.n);
      const d = dv(moof);
      const mfhd = filhos(moof, 8, moof.length).find((c) => c.tipo === 'mfhd');
      if (mfhd) d.setUint32(mfhd.dentro + 4, seq++);
      for (const t of f.trafs) {
        d.setUint32(t.tfhd.dentro + 4 - f.moof.o, l.paraPrimeira.get(t.id));
        const novo = t.base - primeiro.get(t.id) + Math.round(desvioS * l.faixas.get(t.id).escala);
        const o = t.tfdt.dentro - f.moof.o + 4;
        if (t.v1) d.setBigUint64(o, BigInt(novo));
        else if (novo <= 0xffffffff) d.setUint32(o, novo);
        else throw erro('JUNTAR-RELOGIO', 'relógio grande demais');
      }
      partes.push(moof);
      if (f.mdat) partes.push(l.b.subarray(f.mdat.o, f.mdat.o + f.mdat.n));
    }
    let fimS = 0;
    for (const [id, fim] of ultimo) fimS = Math.max(fimS, (fim - primeiro.get(id)) / l.faixas.get(id).escala);
    desvioS += fimS;
  }
  return { partes, duracaoS: desvioS };
}

// ── WebM ─────────────────────────────────────────────────────────────────

const ID = { EBML: 0x1a45dfa3, SEGMENTO: 0x18538067, INFO: 0x1549a966, FAIXAS: 0x1654ae6b, CLUSTER: 0x1f43b675,
  TEMPO: 0xe7, BLOCO: 0xa3, GRUPO: 0xa0, DURACAO: 0x4489, ESCALA: 0x2ad7b1 };

function lerId(b, o) {
  const p = b[o];
  const n = p >= 0x80 ? 1 : p >= 0x40 ? 2 : p >= 0x20 ? 3 : p >= 0x10 ? 4 : 0;
  if (!n) return null;
  let v = 0;
  for (let i = 0; i < n; i++) v = v * 256 + b[o + i];
  return { id: v, n };
}
function lerTamanho(b, o) {
  const p = b[o];
  let n = 1;
  while (n <= 8 && !(p & (0x80 >> (n - 1)))) n++;
  if (n > 8) return null;
  let v = p & (0xff >> n);
  let tudo1 = v === (0xff >> n);
  for (let i = 1; i < n; i++) { v = v * 256 + b[o + i]; if (b[o + i] !== 0xff) tudo1 = false; }
  return { v: tudo1 ? -1 : v, n };
}
function elemento(b, o) {
  const i = lerId(b, o);
  if (!i) return null;
  const t = lerTamanho(b, o + i.n);
  if (!t) return null;
  return { id: i.id, o, dentro: o + i.n + t.n, n: t.v };
}
const ehDeTopo = (id) => id === ID.CLUSTER || id === 0x1c53bb6b || id === 0x1254c367 || id === 0x114d9b74
  || id === ID.INFO || id === ID.FAIXAS || id === 0x1941a469 || id === 0x1043a770;

function bytesId(id) {
  const out = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) out.unshift(v & 255);
  return out;
}
function tamanho8(n) {
  const out = [0x01];
  for (let i = 6; i >= 0; i--) out.push(Math.floor(n / 2 ** (8 * i)) & 255);
  return out;
}
function uint(id, v) {
  const out = [];
  for (let i = 7; i >= 0; i--) out.push(Math.floor(v / 2 ** (8 * i)) & 255);
  return [...bytesId(id), 0x88, ...out];
}

function lerWebm(b) {
  const ebml = elemento(b, 0);
  if (!ebml || ebml.id !== ID.EBML) throw erro('JUNTAR-FORMATO', 'não é WebM');
  const seg = elemento(b, ebml.dentro + ebml.n);
  if (!seg || seg.id !== ID.SEGMENTO) throw erro('JUNTAR-FORMATO', 'WebM sem segmento');
  const fimSeg = seg.n < 0 ? b.length : Math.min(b.length, seg.dentro + seg.n);
  let info = null;
  let faixas = null;
  let escala = 1e6;
  const clusters = [];
  for (let o = seg.dentro; o < fimSeg;) {
    const e = elemento(b, o);
    if (!e) break;
    if (e.id === ID.CLUSTER) {
      // O gravador do Chrome escreve clusters sem tamanho: acabam onde começa o elemento de topo seguinte.
      let fim = e.n < 0 ? fimSeg : e.dentro + e.n;
      let tempo = 0;
      const blocos = [];
      let q = e.dentro;
      while (q < fim) {
        const f = elemento(b, q);
        if (f && e.n < 0 && ehDeTopo(f.id)) { fim = q; break; }
        if (!f || f.n < 0) break;
        if (f.id === ID.TEMPO) { tempo = 0; for (let k = 0; k < f.n; k++) tempo = tempo * 256 + b[f.dentro + k]; } else {
          blocos.push(b.subarray(f.o, f.dentro + f.n));
          if (f.id === ID.BLOCO || f.id === ID.GRUPO) {
            let r = f.dentro;
            if (f.id === ID.GRUPO) { const bl = elemento(b, f.dentro); r = bl ? bl.dentro : f.dentro; }
            const trilha = lerTamanho(b, r);
            const rel = dv(b).getInt16(r + trilha.n);
            blocos.at(-1).rel = rel;
          }
        }
        q = f.dentro + f.n;
      }
      clusters.push({ tempo, blocos });
      o = fim;
      continue;
    }
    if (e.n < 0) break;
    if (e.id === ID.INFO) {
      info = e;
      for (let q = e.dentro; q < e.dentro + e.n;) {
        const f = elemento(b, q);
        if (!f) break;
        if (f.id === ID.ESCALA) { escala = 0; for (let k = 0; k < f.n; k++) escala = escala * 256 + b[f.dentro + k]; }
        q = f.dentro + f.n;
      }
    }
    if (e.id === ID.FAIXAS) faixas = b.subarray(e.o, e.dentro + e.n);
    o = e.dentro + e.n;
  }
  if (!faixas || !clusters.length) throw erro('JUNTAR-FORMATO', 'WebM sem faixas');
  return { b, cabecalho: b.subarray(0, seg.o), seg, info, faixas, escala, clusters };
}

/** As faixas sem o TrackUID, que o gravador sorteia a cada gravação: o resto tem de ser igual. */
function semUid(b) {
  const out = [];
  const passar = (de, ate) => {
    for (let q = de; q < ate;) {
      const f = elemento(b, q);
      if (!f || f.n < 0) break;
      if (f.id === 0xae) { out.push(0xae); passar(f.dentro, f.dentro + f.n); } else if (f.id !== 0x73c5) {
        for (let k = f.o; k < f.dentro + f.n; k++) out.push(b[k]);
      }
      q = f.dentro + f.n;
    }
  };
  const t = elemento(b, 0);
  passar(t.dentro, t.dentro + t.n);
  return out;
}

function juntarWebm(listas) {
  const lidos = listas.map(lerWebm);
  const p = lidos[0];
  const igual = (x, y) => x.length === y.length && x.every((v, i) => v === y[i]);
  const faixasP = semUid(p.faixas);
  for (const l of lidos.slice(1)) {
    if (!igual(semUid(l.faixas), faixasP) || l.escala !== p.escala) throw erro('JUNTAR-FAIXAS', 'faixas diferentes');
  }
  // O Info sem a duração do primeiro ficheiro (seria a dele, e não a do vídeo inteiro).
  const info = [];
  if (p.info) {
    for (let q = p.info.dentro; q < p.info.dentro + p.info.n;) {
      const f = elemento(p.b, q);
      if (!f) break;
      if (f.id !== ID.DURACAO) info.push(p.b.subarray(f.o, f.dentro + f.n));
      q = f.dentro + f.n;
    }
  }
  const corpoInfo = info.reduce((t, x) => t + x.length, 0);
  const partes = [p.cabecalho, new Uint8Array([...bytesId(ID.SEGMENTO), 0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff])];
  partes.push(new Uint8Array([...bytesId(ID.INFO), ...tamanho8(corpoInfo)]), ...info, p.faixas);
  let desvio = 0;
  const umQuadro = Math.round(1e9 / 30 / p.escala);
  for (const l of lidos) {
    const t0 = l.clusters[0].tempo + Math.min(0, ...l.clusters[0].blocos.map((x) => x.rel ?? 0));
    let fim = 0;
    for (const c of l.clusters) {
      const tempo = c.tempo - t0 + desvio;
      const corpo = c.blocos.reduce((t, x) => t + x.length, 0) + 10;
      partes.push(new Uint8Array([...bytesId(ID.CLUSTER), ...tamanho8(corpo), ...uint(ID.TEMPO, tempo)]), ...c.blocos);
      for (const x of c.blocos) if (x.rel != null) fim = Math.max(fim, c.tempo - t0 + x.rel);
    }
    desvio += fim + umQuadro;
  }
  return { partes, duracaoS: (desvio * p.escala) / 1e9 };
}

/**
 * Juntar os bytes de vários gravados do mesmo gravador, pela ordem.
 * @param {Uint8Array[]} listas
 * @returns {{partes: Uint8Array[], duracaoS: number}} as partes vão direto para um `Blob`
 */
export function juntarGravados(listas) {
  if (!listas.length) throw erro('JUNTAR-VAZIO', 'nada para juntar');
  const b = listas[0];
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return juntarWebm(listas);
  return juntarFragmentados(listas);
}

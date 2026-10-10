// Os quadros de Rust pintados para os "nomes na tela", e o evento com um lance escolhido. Vive à parte
// porque os testes (nomes-tela.test.mjs) e as fotos do painel (.arena/prints/ocr-prints.test.mjs) usam
// exatamente os mesmos.

import { kickFalsa, T } from './falsa.mjs';

export const CANAIS = ['tchubi', 'newtrc', 'lontrafeliz', 'gatomia', 'zebra99', 'outrocara'];
export const PLANILHA = [
  'kick_url,seguidores,origem',
  'https://kick.com/tchubi,,dono',
  'https://kick.com/newtrc,,seguido por voce [Discord: Newt]',
  'https://kick.com/lontrafeliz,38000,nick igual',
  'https://kick.com/gatomia,1200,"lista do Discord, canal #geral"',
  'https://kick.com/zebra99,7,nada',
  'https://kick.com/outrocara,7,nada',
].join('\n');

/** Os quadros pintados: o mesmo jogo com um pouco de mudança de quadro para quadro. */
export async function pintarQuadros(p) {
  await p.evaluate(() => {
    function quadro(i) {
      const c = document.createElement('canvas');
      c.width = 1920; c.height = 1080;
      const g = c.getContext('2d');
      const ceu = g.createLinearGradient(0, 0, 0, 600);
      ceu.addColorStop(0, '#6f8fae'); ceu.addColorStop(1, '#d9c7a0');
      g.fillStyle = ceu; g.fillRect(0, 0, 1920, 1080);
      g.fillStyle = '#5d6b3c'; g.fillRect(0, 600, 1920, 480);
      g.fillStyle = '#4a5530';
      for (let k = 0; k < 40; k++) g.fillRect((k * 97 + i * 13) % 1920, 640 + (k * 53) % 400, 60, 8);
      // Dois jogadores perto, com o nome em cima (branco, pequeno).
      g.fillStyle = '#2b2b2b'; g.fillRect(820 + i * 4, 420, 40, 120); g.fillRect(1040 - i * 4, 430, 40, 110);
      g.font = 'bold 22px sans-serif'; g.fillStyle = '#f2f2f2';
      g.fillText('lontrafeliz', 770 + i * 4, 405);
      // A webcam no canto, tapando o topo da lista.
      g.fillStyle = '#3a2c25'; g.fillRect(0, 640, 520, 290);
      g.fillStyle = '#c99a7c'; g.beginPath(); g.arc(260, 780, 80, 0, Math.PI * 2); g.fill();
      // A lista do time, em duas colunas: bolinha verde e nome verde; o morto a vermelho com um x.
      g.font = 'bold 26px sans-serif';
      const lista = [['Newt', 40, 975], ['HOOLIGAN', 40, 1015], ['tchubi', 300, 975], ['brent', 300, 1015, true]];
      for (const [nome, x, y, morto] of lista) {
        g.fillStyle = morto ? '#a6340a' : '#9ccf3c';
        if (morto) g.fillText('x', x, y); else { g.beginPath(); g.arc(x + 8, y - 9, 7, 0, Math.PI * 2); g.fill(); }
        g.fillText(nome, x + 26, y);
      }
      // O Discord na lateral direita: fundo escuro meio transparente, avatar, nome a branco.
      g.fillStyle = 'rgba(20,20,24,.72)'; g.fillRect(1630, 200, 270, 150);
      for (const [nome, y, fala] of [['GatoMia', 250, i % 2 === 0], ['tchubi', 315, false]]) {
        g.fillStyle = fala ? '#3ba55c' : '#555'; g.beginPath(); g.arc(1665, y - 9, 20, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffffff'; g.font = 'bold 28px sans-serif'; g.fillText(nome, 1700, y);
      }
      return c;
    }
    window.__quadrosPedidos = [];
    window.__povixQuadros = async (vod, opcoes) => ({
      degrau: { altura: 1080 },
      async quadro(ms) {
        window.__quadrosPedidos.push({ ms, qualidade: opcoes.qualidade, master: vod.master });
        const tela = quadro(window.__quadrosPedidos.length % 3);
        return { tela, largura: tela.width, altura: tela.height };
      },
      fechar() {},
    });
  });
}

export async function abrirEventoComLance(p, PORTA) {
  await kickFalsa(p, { canais: CANAIS });
  await p.goto(`http://127.0.0.1:${PORTA}/`, { waitUntil: 'networkidle' });
  await p.fill('#elenco', PLANILHA);
  await p.click('#abrirElenco');
  await p.waitForFunction(() => window.__evento?.mapa && window.__evento.vista, null, { timeout: 15000 });
  // Escolher o lance de tchubi aos 5 minutos, como um clique no mapa.
  const alvo = await p.evaluate((ms) => {
    const ev = window.__evento;
    const rolo = document.getElementById('mapaRolo');
    const l = ev.mapa.linhas.find((x) => x.canal === 'tchubi');
    const caixa = rolo.getBoundingClientRect();
    const x = ((ms - ev.vista.deMs) / (ev.vista.ateMs - ev.vista.deMs)) * rolo.clientWidth;
    return { x: caixa.left + x, y: caixa.top + l.y - ev.topo + l.altura / 2 };
  }, T + 5 * 60_000);
  await p.mouse.click(alvo.x, alvo.y);
  await p.waitForFunction(() => window.__evento.escolha?.canal === 'tchubi');
}


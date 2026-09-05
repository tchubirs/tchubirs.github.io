'use strict';
/**
 * Supervisor de canais.
 *
 * Manter 1 transmissão viva é fácil. Manter 50 vivas por meses é outro
 * problema: rede cai, a plataforma derruba a conexão, o arquivo acaba, e o
 * limite de 48h da Twitch corta no meio. Sem supervisor, um canal cai de
 * madrugada e ninguém percebe até o dono reclamar.
 *
 * O lançador de processo é INJETADO. Assim o teste roda sem ffmpeg e sem
 * rede — teste que precisa de rede é teste que falha por motivo errado.
 */

const { argumentos, ocultarChave, PLATAFORMAS } = require('./canal');

const BACKOFF_INICIAL_MS = 2000;
const BACKOFF_MAXIMO_MS = 5 * 60 * 1000;

/** Queda em menos disto conta como falha; mais que isto, o canal rodou bem
 *  e o contador de backoff zera. Sem essa distinção, um canal que roda 40h e
 *  cai uma vez seria punido como se estivesse quebrado. */
const RODOU_BEM_MS = 60 * 1000;

class Supervisor {
  /**
   * @param {object} opcoes
   * @param {(cmd:string,args:string[])=>object} opcoes.lancar cria o processo
   * @param {()=>number} [opcoes.agora] relógio, injetável para teste
   * @param {(ms:number,fn:Function)=>any} [opcoes.agendar]
   */
  constructor({ lancar, agora = Date.now, agendar = setTimeout, ffmpeg = 'ffmpeg', log = () => {} }) {
    if (typeof lancar !== 'function') throw new Error('lancar é obrigatório');
    this.lancar = lancar;
    this.agora = agora;
    this.agendar = agendar;
    this.ffmpeg = ffmpeg;
    this.log = log;
    this.canais = new Map();
  }

  /** @param {{id:string,fonte:string|string[],plataforma:string,chave:string}} cfg */
  adicionar(cfg) {
    if (!cfg?.id) throw new Error('canal precisa de id');
    if (this.canais.has(cfg.id)) throw new Error(`canal duplicado: ${cfg.id}`);
    const fontes = Array.isArray(cfg.fonte) ? cfg.fonte : [cfg.fonte];
    if (fontes.length === 0) throw new Error('canal precisa de ao menos uma fonte');

    this.canais.set(cfg.id, {
      cfg, fontes, indiceFonte: 0,
      processo: null, iniciadoEm: null, contiguoDesde: null,
      falhasSeguidas: 0, reinicios: 0, estado: 'parado', ultimoMotivo: null,
      // Sem esta marca, `pararTodos` mata o processo, o evento `exit`
      // dispara o reinício, e o sistema inteiro ressuscita sozinho.
      // Um teste pegou exatamente isso.
      encerrado: false,
    });
    return this;
  }

  iniciarTodos() {
    for (const id of this.canais.keys()) this._iniciar(id);
    return this;
  }

  _iniciar(id) {
    const c = this.canais.get(id);
    if (!c || c.processo || c.encerrado) return;

    const fonte = c.fontes[c.indiceFonte % c.fontes.length];
    const args = argumentos({ ...c.cfg, fonte });
    const agoraMs = this.agora();

    const proc = this.lancar(this.ffmpeg, args);
    c.processo = proc;
    c.iniciadoEm = agoraMs;
    // `contiguoDesde` mede a transmissão contínua vista pela plataforma, e
    // não se altera ao trocar de vídeo da playlist — é isso que o limite de
    // 48h da Twitch conta.
    if (c.contiguoDesde === null) c.contiguoDesde = agoraMs;
    c.estado = 'no ar';
    this.log(`[${id}] no ar — ${ocultarChave(fonte, c.cfg.chave)}`);

    proc.on?.('exit', (codigo) => this._aoSair(id, codigo));
    this._agendarRotacao(id);
  }

  /** Reinicia sozinho antes do limite da plataforma. Ser cortado no meio de
   *  um vídeo é pior do que emendar entre dois. */
  _agendarRotacao(id) {
    const c = this.canais.get(id);
    const limite = PLATAFORMAS[c.cfg.plataforma]?.limiteContinuoMs;
    if (!limite) return;
    const falta = c.contiguoDesde + limite - this.agora();
    this.agendar(Math.max(0, falta), () => {
      const atual = this.canais.get(id);
      if (!atual?.processo || atual.estado !== 'no ar') return;
      this.log(`[${id}] rotação preventiva antes do limite da plataforma`);
      atual.contiguoDesde = null;
      atual.ultimoMotivo = 'rotação preventiva';
      atual.processo.kill?.('SIGTERM');
    });
  }

  _aoSair(id, codigo) {
    const c = this.canais.get(id);
    if (!c) return;
    if (c.encerrado) { c.processo = null; c.estado = 'parado'; return; }
    const durou = this.agora() - (c.iniciadoEm ?? this.agora());
    c.processo = null;
    c.estado = 'reiniciando';
    c.reinicios += 1;
    c.indiceFonte += 1; // próximo vídeo da playlist — rerun não é loop do mesmo

    if (durou >= RODOU_BEM_MS) {
      c.falhasSeguidas = 0;
    } else {
      c.falhasSeguidas += 1;
      c.ultimoMotivo = c.ultimoMotivo ?? `saiu com código ${codigo} em ${Math.round(durou / 1000)}s`;
    }

    const espera = Math.min(
      BACKOFF_INICIAL_MS * 2 ** Math.max(0, c.falhasSeguidas - 1),
      BACKOFF_MAXIMO_MS,
    );
    if (c.falhasSeguidas > 0) {
      this.log(`[${id}] caiu (${c.ultimoMotivo}) — nova tentativa em ${espera / 1000}s`);
    }
    c.ultimoMotivo = null;
    this.agendar(espera, () => this._iniciar(id));
  }

  pararTodos() {
    for (const [id, c] of this.canais) {
      c.encerrado = true;
      c.estado = 'parado';
      if (c.processo) { c.processo.kill?.('SIGTERM'); c.processo = null; this.log(`[${id}] parado`); }
    }
  }

  /** Reabre um supervisor parado. Sem isto, `pararTodos` seria definitivo e
   *  o processo precisaria ser reiniciado do zero para voltar ao ar. */
  retomar() {
    for (const [id, c] of this.canais) {
      if (!c.encerrado) continue;
      c.encerrado = false;
      c.falhasSeguidas = 0;
      c.contiguoDesde = null;
      this._iniciar(id);
    }
    return this;
  }

  estado() {
    return [...this.canais.values()].map((c) => ({
      id: c.cfg.id,
      plataforma: c.cfg.plataforma,
      estado: c.estado,
      noArHa: c.iniciadoEm && c.estado === 'no ar'
        ? Math.round((this.agora() - c.iniciadoEm) / 1000) : 0,
      contiguoHoras: c.contiguoDesde
        ? Math.round(((this.agora() - c.contiguoDesde) / 3600000) * 10) / 10 : 0,
      reinicios: c.reinicios,
      falhasSeguidas: c.falhasSeguidas,
      fonteAtual: c.fontes[c.indiceFonte % c.fontes.length],
    }));
  }
}

module.exports = { Supervisor, BACKOFF_INICIAL_MS, BACKOFF_MAXIMO_MS, RODOU_BEM_MS };

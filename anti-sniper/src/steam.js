'use strict';
/**
 * Histórico de nomes da Steam.
 *
 * Esta é a peça que faz o cruzamento funcionar, e a razão é simples:
 * **ninguém usa o mesmo nome na Steam e na Twitch.** Comparar só o nome de
 * hoje não acha quase nada.
 *
 * Mas a pessoa trocou de nome muitas vezes ao longo dos anos, e a Steam
 * guarda tudo num endereço público do próprio perfil. **Basta UM desses
 * nomes bater.** O nome de hoje é só a linha mais recente do histórico.
 *
 * Escopo, de propósito: só o perfil público da Steam. Nada de Discord,
 * Twitter, e-mail ou IP — isso é o art. 226-18 do código penal francês, e
 * além de ilegal não é necessário para responder a pergunta.
 */

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

function ehSteamId64(v) {
  return typeof v === 'string' && /^7656119\d{10}$/.test(v);
}

/**
 * @param {string} steamId64
 * @param {(url:string,op:object)=>Promise<Response>} [buscar] injetável para teste
 * @returns {Promise<{steamId:string, nomes:string[], trocas:Array<{nome:string,em:string}>}>}
 */
async function historicoDeNomes(steamId64, buscar = globalThis.fetch) {
  if (!ehSteamId64(steamId64)) {
    throw new Error(`SteamID64 inválido: ${steamId64}`);
  }
  const url = `https://steamcommunity.com/profiles/${steamId64}/ajaxaliases`;
  const r = await buscar(url, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam respondeu ${r.status}`);

  const bruto = await r.json();
  if (!Array.isArray(bruto)) throw new Error('resposta da Steam em formato inesperado');

  const trocas = bruto
    .filter((x) => x && typeof x.newname === 'string')
    .map((x) => ({ nome: x.newname, em: x.timechanged ?? null }));

  // Perfil privado ou sem trocas devolve lista vazia. Isso não é erro — é
  // informação: não dá para cruzar histórico de quem não tem histórico.
  return {
    steamId: steamId64,
    nomes: [...new Set(trocas.map((t) => t.nome))],
    trocas,
  };
}

/**
 * Perfil público em XML — sem chave de API e sem login.
 *
 * A peça que vale mais aqui é o `customURL`, a URL personalizada. O nome de
 * exibição de um jogador muda centenas de vezes (medi um perfil com ~200
 * trocas), mas a URL personalizada é **escolhida uma vez e quase nunca
 * mexida** — e costuma ser o mesmo apelido que a pessoa usa na Twitch, no
 * Discord e no Kick. Como chave de cruzamento ela vale mais que o histórico
 * inteiro de nomes.
 *
 * Bônus medido: fontes diferentes guardam a URL de épocas diferentes. O
 * `steamid.io` devolveu uma URL antiga de um perfil cuja URL atual já era
 * outra — juntas viram um pequeno histórico que nenhuma delas tem sozinha.
 */
async function perfilPublico(steamId64, buscar = globalThis.fetch) {
  if (!ehSteamId64(steamId64)) throw new Error(`SteamID64 inválido: ${steamId64}`);
  const r = await buscar(`https://steamcommunity.com/profiles/${steamId64}?xml=1`,
    { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(`Steam respondeu ${r.status}`);
  const xml = await r.text();

  const campo = (nome) => {
    const m = xml.match(new RegExp(`<${nome}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${nome}>`));
    if (!m) return null;
    const v = m[1].replace(/<[^>]+>/g, '').trim();
    return v || null;
  };

  const bio = campo('summary') || '';
  // Redes que a própria pessoa publicou no perfil. É dado autopublicado,
  // não investigação: se está escrito na bio, ela quis que fosse visto.
  const redes = [...new Set(
    (bio.match(/https?:\/\/(?:www\.)?(?:twitch\.tv|kick\.com|youtube\.com|twitter\.com|x\.com)\/[A-Za-z0-9_\-]+/g) || []),
  )];

  return {
    steamId: steamId64,
    nome: campo('steamID'),
    vanity: campo('customURL'),
    privado: campo('privacyState') !== 'public',
    criadoEm: campo('memberSince'),
    vacBanido: campo('vacBanned') === '1',
    redes,
  };
}

/**
 * Junta tudo que dá para saber do perfil, sem chave e sem login:
 * histórico de nomes (teto de 5 na Steam) + URL personalizada + redes que a
 * própria pessoa publicou. É a lista de chaves para cruzar com a audiência.
 */
async function chavesDeIdentidade(steamId64, buscar = globalThis.fetch) {
  const [hist, perfil] = await Promise.all([
    historicoDeNomes(steamId64, buscar).catch(() => ({ nomes: [] })),
    perfilPublico(steamId64, buscar).catch(() => null),
  ]);
  const chaves = new Set(hist.nomes);
  if (perfil?.nome) chaves.add(perfil.nome);
  if (perfil?.vanity) chaves.add(perfil.vanity);
  for (const u of perfil?.redes ?? []) {
    const apelido = u.split('/').pop();
    if (apelido) chaves.add(apelido);
  }
  return { steamId: steamId64, chaves: [...chaves], perfil, historico: hist.nomes };
}

/**
 * Aceita o que a pessoa tiver na mão e devolve a SteamID64.
 *
 * Ninguém tem a SteamID decorada. O que se tem é o link do perfil, copiado
 * do Steam ou do BattleMetrics — e exigir "só os 17 dígitos" transformaria
 * o produto num quebra-cabeça antes da primeira pergunta.
 *
 * Aceita: 17 dígitos · /profiles/<id> · /id/<apelido> (resolve pelo XML).
 */
async function resolverEntrada(texto, buscar = globalThis.fetch) {
  const t = String(texto || '').trim();
  if (ehSteamId64(t)) return t;

  const porPerfil = t.match(/steamcommunity\.com\/profiles\/(7656119\d{10})/);
  if (porPerfil) return porPerfil[1];

  // /id/<apelido> não tem a SteamID no link; o XML do próprio perfil tem.
  const m = t.match(/steamcommunity\.com\/id\/([A-Za-z0-9_.\-]+)/);
  const apelido = m ? m[1] : (/^[A-Za-z0-9_.\-]{2,32}$/.test(t) && !/^\d+$/.test(t) ? null : null);
  if (!apelido) return null;
  const r = await buscar(`https://steamcommunity.com/id/${encodeURIComponent(apelido)}?xml=1`,
    { headers: { 'User-Agent': UA } });
  if (!r.ok) return null;
  const id = (await r.text()).match(/<steamID64>(7656119\d{10})<\/steamID64>/);
  return id ? id[1] : null;
}

module.exports = { ehSteamId64, resolverEntrada, historicoDeNomes, perfilPublico, chavesDeIdentidade };

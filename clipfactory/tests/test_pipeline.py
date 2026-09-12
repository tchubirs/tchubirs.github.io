"""Testes que protegem o dinheiro: bugs aqui viram clipe quebrado publicado."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import pytest

from clipfactory.ledger import Ledger
from clipfactory.render import (CAP_CHARS_PER_LINE, CAP_MAX_LINES,
                                HOOK_CHARS_PER_LINE, build_ass, _chunk_text,
                                _split_lines)
from clipfactory.select import ClipPick, _validate
from clipfactory.transcript import Segment, parse_subtitles, window


# ── Regressão do bug que estourava a legenda para fora do quadro ──
def test_nenhuma_linha_de_legenda_estoura_a_largura():
    longa = ("I called twenty customers who had asked for a refund and I asked "
             "them one single question about what they actually wanted")
    segs = [Segment(0.0, 8.0, longa)]
    ass = build_ass(segs, "A hook that is quite long indeed", 8.0)
    for line in ass.splitlines():
        if not line.startswith("Dialogue"):
            continue
        estilo = line.split(",")[3]
        limite = CAP_CHARS_PER_LINE if estilo == "Cap" else HOOK_CHARS_PER_LINE
        texto = line.split(",,0,0,0,,", 1)[1]
        partes = texto.split("\\N")
        assert len(partes) <= CAP_MAX_LINES, f"mais de {CAP_MAX_LINES} linhas: {texto}"
        for parte in partes:
            assert len(parte) <= limite, f"linha de {len(parte)}ch (max {limite}): {parte}"


def test_texto_longo_vira_varios_cues_e_nao_some():
    longa = " ".join(f"palavra{i}" for i in range(24))
    chunks = _chunk_text(longa, CAP_CHARS_PER_LINE, CAP_MAX_LINES)
    assert len(chunks) > 1
    recomposto = " ".join(c.replace("\\N", " ") for c in chunks)
    assert recomposto.split() == longa.split(), "perdeu palavra na divisão"


def test_split_lines_nunca_parte_palavra():
    for linha in _split_lines("antidisestablishmentarianism e outras", 10):
        for palavra in linha.split():
            assert palavra in "antidisestablishmentarianism e outras".split()


# ── Transcrição ──
def test_dedup_de_legenda_automatica_em_cascata(tmp_path):
    vtt = tmp_path / "a.vtt"
    vtt.write_text(
        "WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nmesma linha\n\n"
        "00:00:03.000 --> 00:00:05.000\nmesma linha\n\n"
        "00:00:05.000 --> 00:00:07.000\noutra linha\n", encoding="utf-8")
    segs = parse_subtitles(vtt)
    assert [s.text for s in segs] == ["mesma linha", "outra linha"]
    assert segs[0].end == 5.0, "não fundiu a duração das duplicatas"


def test_window_recorta_e_rebaseia_em_zero():
    segs = [Segment(10, 20, "a"), Segment(20, 30, "b"), Segment(50, 60, "c")]
    w = window(segs, 15, 35)
    assert [s.text for s in w] == ["a", "b"]
    assert w[0].start == 0.0 and w[0].end == 5.0


# ── Seleção: o validador que conserta alucinação do modelo ──
def _segs():
    return [Segment(0, 30, "x"), Segment(30, 120, "y"), Segment(120, 200, "z")]


def test_validador_descarta_sobreposicao():
    picks = [ClipPick(start_s=10, end_s=50, hook="a", why="", score=9),
             ClipPick(start_s=40, end_s=80, hook="b", why="", score=8)]
    out = _validate(picks, _segs(), 18, 58)
    assert len(out) == 1 and out[0].score == 9


def test_validador_prende_tempos_dentro_da_fonte():
    picks = [ClipPick(start_s=-50, end_s=9999, hook="h", why="", score=9)]
    out = _validate(picks, _segs(), 18, 58)
    assert out[0].start_s >= 0 and out[0].end_s <= 200
    assert 18 <= out[0].end_s - out[0].start_s <= 58


def test_validador_corta_gancho_em_42_caracteres():
    picks = [ClipPick(start_s=0, end_s=40, hook="x" * 200, why="", score=9)]
    assert len(_validate(picks, _segs(), 18, 58)[0].hook) == 42


# ── Dinheiro: a parte que não pode errar ──
def test_transicao_ilegal_de_dinheiro_e_bloqueada(tmp_path):
    L = Ledger(tmp_path / "l.db")
    L.add_clip("c", "camp", source_url="u", start_s=0, end_s=30, hook="h")
    with pytest.raises(ValueError):
        L.advance_money("c", "SACADO", usd=100)


def test_estorno_zera_o_valor(tmp_path):
    L = Ledger(tmp_path / "l.db")
    L.add_clip("c", "camp", source_url="u", start_s=0, end_s=30, hook="h")
    L.advance_money("c", "PENDENTE", usd=42.0)
    L.advance_money("c", "ESTORNADO", reason="views invalidadas")
    assert L.money_by_state("camp")["ESTORNADO"] == 0.0


def test_so_sacado_conta_como_dinheiro_real(tmp_path):
    L = Ledger(tmp_path / "l.db")
    for i, estado in enumerate(["PENDENTE", "ELEGIVEL", "LIQUIDADO"]):
        cid = f"c{i}"
        L.add_clip(cid, "camp", source_url="u", start_s=0, end_s=30, hook="h")
        L.set_clip(cid, state="PUBLICADO", views=5000)
        for passo in ["PENDENTE", "ELEGIVEL", "LIQUIDADO"]:
            L.advance_money(cid, passo, usd=10.0)
            if passo == estado:
                break
    s = L.summary("camp")
    assert s["sacado_usd"] == 0.0, "dinheiro não sacado nunca é 'real'"
    assert s["prometido_nao_sacado_usd"] == 30.0


def test_estimativa_respeita_piso_e_teto():
    from clipfactory.config import Campaign, Source
    c = Campaign(id="x", platform="vyro", name="", cpm_usd=2.0,
                 min_views_to_pay=1000, max_payout_per_post_usd=5.0,
                 source=Source(url="u", license_note="n"))
    assert c.estimated_usd(999) == 0.0          # abaixo do piso não paga nada
    assert c.estimated_usd(1000) == 2.0
    assert c.estimated_usd(10_000_000) == 5.0   # teto do brief


# ── Pasta de materiais: uma campanha de UGC não dá um vídeo, dá uma pasta ──

def test_pasta_do_drive_e_reconhecida_e_um_ficheiro_solto_nao_e():
    from clipfactory.ingest import PASTA_DRIVE
    assert PASTA_DRIVE.search("https://drive.google.com/drive/folders/1a2B3c")
    assert PASTA_DRIVE.search("https://drive.google.com/drive/u/0/folders/1a2B3c")
    assert not PASTA_DRIVE.search("https://drive.google.com/file/d/1a2B3c/view")
    assert not PASTA_DRIVE.search("https://youtube.com/watch?v=x")


def test_o_que_nao_e_pasta_passa_intacto_e_nao_chama_a_rede(monkeypatch):
    from clipfactory import ingest
    monkeypatch.setattr(ingest, "_ytdlp_json",
                        lambda *a, **k: pytest.fail("não devia consultar a rede"))
    assert ingest.expandir("https://youtube.com/watch?v=x") == \
        ["https://youtube.com/watch?v=x"]


def test_a_pasta_vira_um_link_por_ficheiro(monkeypatch):
    from clipfactory import ingest
    monkeypatch.setattr(ingest, "_ytdlp_json", lambda *a, **k: {"entries": [
        {"url": "https://drive.google.com/file/d/AAA/view"},
        {"id": "BBB"},                       # às vezes vem só o id
        {"title": "sem nada"},               # e às vezes não vem nada
    ]})
    assert ingest.expandir("https://drive.google.com/drive/folders/X") == [
        "https://drive.google.com/file/d/AAA/view",
        "https://drive.google.com/file/d/BBB/view",
    ]


def test_pasta_vazia_diz_que_o_problema_e_a_partilha(monkeypatch):
    from clipfactory import ingest
    monkeypatch.setattr(ingest, "_ytdlp_json", lambda *a, **k: {"entries": []})
    with pytest.raises(RuntimeError, match="partilha"):
        ingest.expandir("https://drive.google.com/drive/folders/X")


# Uma pasta de materiais tem PDF, imagem e Google Doc ao lado do vídeo. Se um
# PDF derrubasse a execução, a pasta certa nunca chegaria a produzir um clipe.
def test_um_pdf_no_meio_da_pasta_nao_derruba_o_resto(monkeypatch, tmp_path):
    from clipfactory import ingest

    def falso(u, wd, *a, **k):
        if u.endswith(".pdf"):
            raise RuntimeError("Unsupported URL")
        return ingest.SourceMedia(tmp_path / "v.mp4", [], "legenda-da-fonte", u)

    monkeypatch.setattr(ingest, "fetch_source", falso)
    m = ingest.fetch_sources(["a.mp4", "b.pdf", "c.mp4"], tmp_path)
    assert [f.url for f in m.fontes] == ["a.mp4", "c.mp4"]
    assert [u for u, _ in m.ignorados] == ["b.pdf"]


def test_pasta_so_de_pdfs_falha_e_diz_quais(monkeypatch, tmp_path):
    from clipfactory import ingest
    monkeypatch.setattr(ingest, "fetch_source",
                        lambda *a, **k: (_ for _ in ()).throw(RuntimeError("nope")))
    with pytest.raises(RuntimeError, match="b.pdf"):
        ingest.fetch_sources(["a.pdf", "b.pdf"], tmp_path)


def test_a_mesma_fonte_repetida_e_baixada_uma_vez(monkeypatch, tmp_path):
    from clipfactory import ingest
    vistas = []

    def falso(u, wd, *a, **k):
        vistas.append(u)
        return ingest.SourceMedia(tmp_path / "v.mp4", [], "legenda-da-fonte", u)

    monkeypatch.setattr(ingest, "fetch_source", falso)
    ingest.fetch_sources(["a.mp4", "a.mp4", "b.mp4"], tmp_path)
    assert vistas == ["a.mp4", "b.mp4"], "baixar duas vezes é pagar duas vezes"


# ── O id do clipe ──

# Este é o defeito que a mudança para muitas fontes criou. Dois vídeos da mesma
# pasta com um bom trecho aos 0→30s são o caso normal, não o raro.
def test_mesmo_minuto_em_videos_diferentes_da_ids_diferentes():
    from clipfactory.cli import _clip_id
    a = _clip_id("camp", 0.0, 30.0, "https://drive/AAA")
    b = _clip_id("camp", 0.0, 30.0, "https://drive/BBB")
    assert a != b, "um clipe reescreveria o outro no ledger"
    assert _clip_id("camp", 0.0, 30.0, "https://drive/AAA") == a


# ── A configuração ──

def test_config_aceita_uma_url_ou_uma_lista():
    from clipfactory.config import Source, _fontes
    assert _fontes({"url": "u"}) == ("u",)
    assert _fontes({"urls": ["a", "b"]}) == ("a", "b")
    assert _fontes({"urls": "a"}) == ("a",)
    assert _fontes({"urls": [" a ", "", "b"]}) == ("a", "b")
    # quem já usava .url continua a poder
    assert Source(url="u", license_note="n").urls == ("u",)
    assert Source(url="", urls=("a", "b"), license_note="n").url == "a"


def test_config_sem_fonte_nenhuma_explica_o_que_falta():
    from clipfactory.config import ConfigError, _fontes
    with pytest.raises(ConfigError, match="urls"):
        _fontes({"license_note": "x"})
    with pytest.raises(ConfigError):
        _fontes({"urls": []})

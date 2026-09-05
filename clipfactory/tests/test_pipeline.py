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

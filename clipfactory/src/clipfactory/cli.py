"""Orquestrador. É isto que o GitHub Actions executa sozinho todo dia."""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import traceback
from pathlib import Path

from . import config as cfgmod
from .ledger import Ledger


def _clip_id(campaign_id: str, start: float, end: float) -> str:
    h = hashlib.sha1(f"{campaign_id}|{start:.2f}|{end:.2f}".encode()).hexdigest()[:10]
    return f"{campaign_id}-{h}"


def cmd_doctor(args) -> int:
    from . import doctor
    doctor.run()
    return 0


def cmd_run(args) -> int:
    from .ingest import fetch_source
    from .metadata import write_metadata, youtube_description
    from .render import render_clip
    from .select import select_clips, select_heuristic

    cfg = cfgmod.load(args.config)
    camp = cfg.campaign
    ledger = Ledger(args.ledger)
    work = Path(args.workdir)

    print(f"▶ Campanha: {camp.name or camp.id}  (CPM US$ {camp.cpm_usd})")
    print(f"  Licença registrada: {camp.source.license_note[:80]}")

    print("▶ Baixando fonte licenciada…")
    media = fetch_source(camp.source.url, work / "source")
    print(f"  vídeo: {media.video.name}  |  transcrição: {media.transcript_origin}"
          f"  |  {len(media.segments)} segmentos")

    print("▶ Selecionando trechos…")
    try:
        if args.heuristic:
            raise RuntimeError("modo heurístico forçado")
        sel = select_clips(
            media.segments, n=cfg.production.clips_per_run,
            min_s=cfg.production.clip_seconds_min,
            max_s=cfg.production.clip_seconds_max,
            language=cfg.market_language, model=cfg.production.model,
            must_include=camp.must_include, must_avoid=camp.must_avoid,
        )
        ledger.add_cost(camp.id, "claude.select", sel.cost_usd,
                        f"{sel.input_tokens}in/{sel.output_tokens}out")
    except Exception as e:
        print(f"  ! seleção por IA indisponível ({e}). Caindo para heurística.")
        sel = select_heuristic(media.segments, n=cfg.production.clips_per_run,
                               min_s=cfg.production.clip_seconds_min,
                               max_s=cfg.production.clip_seconds_max)

    if not sel.clips:
        print("  Nenhum trecho utilizável. Fonte curta demais ou sem fala.")
        return 2
    print(f"  {len(sel.clips)} trechos  |  custo de seleção US$ {sel.cost_usd:.4f}")

    attribution = args.attribution or ""
    published, failed = 0, 0

    for i, pick in enumerate(sel.clips, 1):
        cid = _clip_id(camp.id, pick.start_s, pick.end_s)
        ledger.add_clip(cid, camp.id, source_url=camp.source.url,
                        start_s=pick.start_s, end_s=pick.end_s, hook=pick.hook)
        print(f"\n  [{i}/{len(sel.clips)}] {cid}  "
              f"{pick.start_s:.1f}→{pick.end_s:.1f}s  score {pick.score}")
        print(f"        gancho: {pick.hook}")
        try:
            out = work / "out" / f"{cid}.mp4"
            r = render_clip(media.video, out, pick.start_s, pick.end_s,
                            segments=media.segments,
                            hook=pick.hook if cfg.production.burn_hook else None,
                            style=cfg.production.style,
                            captions=cfg.production.captions)
            ledger.set_clip(cid, state="RENDERIZADO", file_path=str(r.path))
            print(f"        render OK ({r.duration:.1f}s, "
                  f"{r.path.stat().st_size/1e6:.1f} MB)")

            meta, mcost = write_metadata(
                pick, media.segments, language=cfg.market_language,
                model=cfg.production.model, must_include=camp.must_include,
                must_avoid=camp.must_avoid, attribution=attribution)
            ledger.add_cost(camp.id, "claude.metadata", mcost, cid)
            desc = youtube_description(meta, attribution, camp.source.license_note)
            ledger.set_clip(cid, title=meta.title, description=desc)
            print(f"        título: {meta.title}")

            if args.dry_run:
                print("        (dry-run: não publicado)")
                continue

            ycfg = (cfg.publish.get("youtube") or {})
            if ycfg.get("enabled", True):
                from .publish.youtube import upload_short
                vid = upload_short(
                    r.path, title=meta.title, description=desc,
                    tags=meta.hashtags,
                    privacy=ycfg.get("privacy", "public"),
                    category_id=str(ycfg.get("category_id", "24")),
                    synthetic_content=bool(
                        ycfg.get("synthetic_content_disclosure", False)),
                )
                ledger.set_clip(cid, state="PUBLICADO", youtube_video_id=vid,
                                published_at=__import__("datetime").datetime.now(
                                    __import__("datetime").timezone.utc
                                ).isoformat(timespec="seconds"))
                print(f"        YouTube: https://youtube.com/shorts/{vid}")
                published += 1

            icfg = (cfg.publish.get("instagram") or {})
            if icfg.get("enabled", False):
                from .publish.hosting import publish_temp_url, remove_temp
                from .publish.instagram import publish_reel
                url, asset_id = publish_temp_url(r.path)
                try:
                    caption = f"{meta.description}\n\n" + " ".join(
                        f"#{h}" for h in meta.hashtags)
                    mid = publish_reel(url, caption,
                                       share_to_feed=icfg.get("share_to_feed", True))
                    ledger.set_clip(cid, instagram_media_id=mid)
                    print(f"        Instagram: {mid}")
                finally:
                    remove_temp(asset_id)

        except Exception as e:
            failed += 1
            ledger.set_clip(cid, state="FALHOU", notes=str(e)[:500])
            ledger.event(cid, "erro", {"erro": str(e)[:800]})
            print(f"        ✗ FALHOU: {e}")
            if args.verbose:
                traceback.print_exc()

    print(f"\n▶ Resultado: {published} publicados, {failed} falhas")
    print(json.dumps(ledger.summary(camp.id), indent=2, ensure_ascii=False))
    return 0 if failed < len(sel.clips) else 1


def cmd_track(args) -> int:
    from .track import evaluate_kill_rules, refresh
    cfg = cfgmod.load(args.config)
    ledger = Ledger(args.ledger)
    summary = refresh(cfg, ledger)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    verdict = evaluate_kill_rules(cfg, ledger)
    if verdict.halt:
        print("\n╔═══ REGRA DE MORTE ACIONADA ═══╗")
        for r in verdict.reasons:
            print(f"  • {r}")
        print("╚═══════════════════════════════╝")
        return 3
    print("\nNenhuma regra de morte acionada.")
    return 0


def cmd_money(args) -> int:
    """Avanço manual do dinheiro — só o dono confirma o que a plataforma pagou."""
    cfg = cfgmod.load(args.config)
    ledger = Ledger(args.ledger)
    if args.list:
        for r in ledger.published(cfg.campaign.id):
            print(f"{r['id']}  {r['views']:>7} views  {r['money_state']:<10} "
                  f"US$ {r['money_usd']:.2f}  {r['youtube_video_id']}")
        print(json.dumps(ledger.summary(cfg.campaign.id), indent=2,
                         ensure_ascii=False))
        return 0
    if not (args.clip and args.to):
        print("Use: clipfactory money --list  |  --clip <id> --to <ESTADO> [--usd X]")
        return 1
    ledger.advance_money(args.clip, args.to.upper(), usd=args.usd,
                         reason=args.reason or "confirmado pelo dono")
    print(f"{args.clip} → {args.to.upper()}")
    return 0


def main(argv=None) -> int:
    p = argparse.ArgumentParser("clipfactory",
                                description="Fábrica de clipes licenciados.")
    p.add_argument("--config", default="config.yaml")
    p.add_argument("--ledger", default="state/ledger.db")
    p.add_argument("--workdir", default="work")
    p.add_argument("-v", "--verbose", action="store_true")
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("doctor", help="checa credenciais e dependências")

    r = sub.add_parser("run", help="produz e publica os clipes do dia")
    r.add_argument("--dry-run", action="store_true",
                   help="renderiza e escreve texto, mas não publica")
    r.add_argument("--heuristic", action="store_true",
                   help="não usa a API do Claude na seleção")
    r.add_argument("--attribution", default="",
                   help="linha de crédito à fonte, exigida por vários briefs")

    sub.add_parser("track", help="atualiza views, dinheiro e regras de morte")

    m = sub.add_parser("money", help="registra o que a plataforma confirmou")
    m.add_argument("--list", action="store_true")
    m.add_argument("--clip")
    m.add_argument("--to")
    m.add_argument("--usd", type=float)
    m.add_argument("--reason")

    args = p.parse_args(argv)
    fn = {"doctor": cmd_doctor, "run": cmd_run,
          "track": cmd_track, "money": cmd_money}[args.cmd]
    try:
        return fn(args)
    except cfgmod.ConfigError as e:
        print(f"\n✗ Configuração: {e}\n", file=sys.stderr)
        return 2
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())

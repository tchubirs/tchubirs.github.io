"""Rule 14: find AI tells in what we sell and in the notes for the owner.

Checks .md files and the strings inside .py files (texts, formulas, labels).
Usage:  python3 tools/sem_ia.py            checks etsy/, fiverr/ and the root notes
        python3 tools/sem_ia.py FILE ...    checks only these files
A line with the comment "ia-ok" is skipped, for a symbol a parser really needs.
Exits with 1 when it finds something.
"""
import io
import pathlib
import re
import subprocess
import sys
import tokenize

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCOPE = ["etsy", "fiverr", "tools", "REGRAS.md", "PENDENTES.md", "FILA.md"]

SYMBOLS = {"—": "em dash", "–": "en dash", "•": "bullet", "★": "star", "☆": "star", "✓": "check mark",
           "✔": "check mark", "✅": "check mark", "⚠": "warning sign", "✗": "cross", "✘": "cross",
           "❌": "cross", "→": "arrow", "›": "arrow", "»": "arrow", "·": "middle dot", "…": "ellipsis",
           "“": "curly quote", "”": "curly quote", "‘": "curly quote", "’": "curly quote"}
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐]")
PHRASES = [
    # English
    "at a glance", "seamless", "effortless", "elevate", "streamline", "stress-free", "stress free",
    "peace of mind", "game-changer", "game changer", "whether you", "take control", "take charge",
    "say goodbye", "unlock", "empower", "journey", "hassle-free", "hassle free", "ultimate", "must-have",
    "delve", "robust", "comprehensive", "tailored", "look no further", "all in one place", "all-in-one",
    "never miss", "stay on top", "with ease", "at your fingertips", "simplif", "crafted", "meticulous",
    "boost", "transform your", "no more", "finally", "perfect for", "designed to help", "made easy",
    "level up", "powerful", "stunning", "sleek", "intuitive", "user-friendly", "beautifully",
    "overwhelm", "guesswork", "like magic", "in seconds", "clutter", "works with your brain",
    # Português
    "vale ressaltar", "vale destacar", "em resumo", "mergulh", "robusto", "abrangente", "não apenas",
    "jornada", "potencializ", "alavanc", "sem complicação", "de forma eficiente",
    # Français
    "coup d'œil", "coup d’œil", "sans stress", "tout-en-un", "ultime", "sans prise de tête",
]
PATTERNS = [
    (re.compile(r"\bnot (just|only)\b", re.I), "'not just / not only'"),
    (re.compile(r"[a-z], not [a-z]", re.I), "'X, not Y'"),
    (re.compile(r"[a-zé], pas (contre|seulement|juste)\b", re.I), "'X, pas Y'"),
    (re.compile(r"\w\(s\)"), "'(s)' plural"),
    (re.compile(r"[A-Za-zÀ-ÿ)]!(?=\s|$|<|\")"), "exclamation mark"),
]
CAPS_OK = set("""ADHD TDAH PDF PDFS XLSX CSV JSON HTML URL URLS USD EUR GBP SKU API IBAN RIB VAT TVA URSSAF
HMRC IRS BNP FAQ UTF ISO PNG JPG JPEG SEO CPF PIX OCR SVG HTTP HTTPS KYC EIN SIRET SIREN INSEE VBA
SUMIFS COUNTIFS VLOOKUP XLOOKUP INDEX MATCH QUERY FILTER SORT UNIQUE EDATE DATEDIF EOMONTH SUMPRODUCT
IMPORTRANGE ARRAYFORMULA IFERROR REPT FIXED TODAY DATE DISPATCH LISTING README REGRAS PENDENTES FILA
LICENCA KIT COMO ETSY IWSDK WEBXR MCP CLI ASCII UTC GMT""".split())
CAPS_RUN = re.compile(r"\b[A-ZÀ-Ý]{2,}(?:[ '][A-ZÀ-Ý]{2,})+\b")
CAPS_WORD = re.compile(r"\b[A-ZÀ-Ý]{4,}\b")


def issues_in(text, markdown):
    found = []
    for ch, name in SYMBOLS.items():
        if ch in text:
            found.append(f"{name} {ch}")
    extra = [c for c in EMOJI.findall(text) if c not in SYMBOLS]
    if extra:
        found.append("emoji or dingbat " + extra[0])
    low = text.lower()
    found += [f"phrase '{p}'" for p in PHRASES if p in low]
    found += [name for rx, name in PATTERNS if rx.search(text)]
    if markdown:
        plain = re.sub(r"`[^`]*`", "", text)
        for m in CAPS_RUN.finditer(plain):
            if not all(w in CAPS_OK for w in re.split(r"[ ']", m.group())):
                found.append(f"all caps '{m.group()}'")
        for m in CAPS_WORD.finditer(plain):
            if m.group() not in CAPS_OK and not CAPS_RUN.search(plain):
                found.append(f"all caps '{m.group()}'")
    return found


def check_file(path):
    rel = path.relative_to(ROOT) if path.is_absolute() else path
    src = path.read_text(encoding="utf-8")
    lines = src.splitlines()
    out = []
    if path.suffix == ".md":
        for n, line in enumerate(lines, 1):
            if "ia-ok" not in line:
                out += [(n, i) for i in issues_in(line, True)]
    elif path.suffix == ".py":
        for tok in tokenize.generate_tokens(io.StringIO(src).readline):
            if tok.type != tokenize.STRING:
                continue
            n = tok.start[0]
            if any("ia-ok" in lines[k - 1] for k in range(n, tok.end[0] + 1)):
                continue
            out += [(n, i) for i in issues_in(tok.string, False)]
    return [f"{rel}:{n}: {i}" for n, i in out]


def main(args):
    if args:
        files = [pathlib.Path(a).resolve() for a in args]
    else:
        listed = subprocess.run(["git", "ls-files", *SCOPE], cwd=ROOT, capture_output=True, text=True).stdout
        files = [ROOT / p for p in listed.split() if p.endswith((".md", ".py"))]
    problems = []
    for f in files:
        if f.name != "sem_ia.py":
            problems += check_file(f)
    print("\n".join(problems) if problems else "ok: nothing with an AI look")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

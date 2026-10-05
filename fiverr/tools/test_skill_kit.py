"""Build good and broken skill folders and check what skill_kit.py says about each, then pack the good one."""
import contextlib
import io
import os
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import skill_kit  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
import sem_ia  # noqa: E402

GOOD = """---
name: invoice-writer
description: Writes invoices in the company format from a list of hours. Use when the user pastes hours
  or asks for an invoice.
---

# Invoice writer

Follow [the format](references/format.md) and fill the totals with `scripts/fill.py`.
"""


def make(root, name, files):
    folder = os.path.join(root, name)
    for rel, text in files.items():
        path = os.path.join(folder, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    return folder


def good_skill(root):
    folder = make(root, "invoice-writer", {"SKILL.md": GOOD, "references/format.md": "Lines and totals.",
                                           "scripts/fill.py": "print('ok')", "scripts/__pycache__/fill.pyc": "x",
                                           "evals/evals.json": "{}", ".DS_Store": "x"})
    assert skill_kit.check(folder) == ([], []), skill_kit.check(folder)
    with contextlib.redirect_stdout(io.StringIO()):
        assert skill_kit.main(["pack", folder, "-o", os.path.join(root, "dist"),
                               "--example", "Make the invoice for these hours"]) == 0
    with zipfile.ZipFile(os.path.join(root, "dist", "invoice-writer.zip")) as z:
        assert sorted(z.namelist()) == ["invoice-writer/SKILL.md", "invoice-writer/references/format.md",
                                        "invoice-writer/scripts/fill.py"], z.namelist()
    with open(os.path.join(root, "dist", "INSTALL-invoice-writer.md"), encoding="utf-8") as f:
        guide = f.read()
    for part in ["# Installing invoice-writer", "pick invoice-writer.zip", "`~/.claude/skills/invoice-writer/SKILL.md`",
                 '"Make the invoice for these hours"', "Use when the user pastes hours or asks for an invoice."]:
        assert part in guide, (part, guide)
    assert "{" not in guide and not [i for line in guide.splitlines() for i in sem_ia.issues_in(line, True)], guide
    print("good skill: no errors, packed with the folder at the root, without caches or evals, with its guide")


def inside(root):
    """Packed into its own folder twice, with a .env, a .git folder and --- inside the description: the zip
    holds only the skill, and the guide has the whole description."""
    text = GOOD.replace("name: invoice-writer", "name: own-folder").replace(
        "Writes invoices in the company format", "Writes invoices --- fast --- in the company format")
    folder = make(root, "own-folder", {"SKILL.md": text, "references/format.md": "Lines and totals.",
                                       "scripts/fill.py": "print('ok')", ".env": "API_KEY=secret",
                                       ".git/config": "[core]", "node_modules/x.js": "x"})
    for _ in range(2):
        with contextlib.redirect_stdout(io.StringIO()) as said:
            assert skill_kit.main(["pack", folder, "-o", folder]) == 0
        assert "with 3 files" in said.getvalue(), said.getvalue()
    with zipfile.ZipFile(os.path.join(folder, "own-folder.zip")) as z:
        assert z.testzip() is None and sorted(z.namelist()) == ["own-folder/SKILL.md", "own-folder/references/format.md",
                                                                "own-folder/scripts/fill.py"], z.namelist()
    with open(os.path.join(folder, "INSTALL-own-folder.md"), encoding="utf-8") as f:
        assert "Writes invoices --- fast --- in the company format" in f.read()
    _, warnings = skill_kit.check(folder)
    assert warnings == [".env stays out of the zip: it may hold passwords"], warnings

    text = GOOD.replace("name: invoice-writer", "name: pointers").replace(
        "references/format.md", "../shared/rules.md").replace("`scripts/fill.py`", "`node_modules/x.js`")
    folder = make(root, "pointers", {"SKILL.md": text, "node_modules/x.js": "x"})
    make(root, "shared", {"rules.md": "x"})
    _, warnings = skill_kit.check(folder)
    assert any("../shared/rules.md, which is outside the folder" in w for w in warnings), warnings
    assert any("node_modules/x.js, which is left out of the zip" in w for w in warnings), warnings
    print("own folder: packed twice into itself and still only the skill, .env and .git left out, the whole "
          "description in the guide; pointers outside the folder or left out of the zip warned about")


def broken(root):
    front = "---\nname: {name}\ndescription: {desc}\n{more}---\n\nBody.\n"
    cases = {
        "no-skill-md": ({"README.md": "x"}, "SKILL.md not found"),
        "no-front": ({"SKILL.md": "# Title\n"}, "must start with YAML frontmatter"),
        "caps": ({"SKILL.md": front.format(name="Invoice-Writer", desc="Writes.", more="")}, "lowercase letters"),
        "hyphen": ({"SKILL.md": front.format(name="invoice--writer", desc="Writes.", more="")}, "two in a row"),
        "long-name": ({"SKILL.md": front.format(name="a" * 65, desc="Writes.", more="")}, "the limit is 64"),
        "angle": ({"SKILL.md": front.format(name="angle", desc="Use for <b> tags.", more="")}, "cannot contain < or >"),
        "long-desc": ({"SKILL.md": front.format(name="long-desc", desc="w" * 1025, more="")}, "the limit is 1024"),
        "unknown": ({"SKILL.md": front.format(name="unknown", desc="Writes.", more="author: me\n")},
                    "unknown frontmatter keys: author"),
        "no-desc": ({"SKILL.md": "---\nname: no-desc\n---\n"}, "description is missing"),
        "two": ({"SKILL.md": front.format(name="two", desc="Writes.", more=""), "sub/SKILL.md": "x"},
                "more than one SKILL.md"),
        "other-folder": ({"SKILL.md": front.format(name="invoice-writer", desc="Writes.", more="")},
                         "must match the folder name"),
        "claude-helper": ({"SKILL.md": front.format(name="claude-helper", desc="Writes.", more="")},
                          "reserved words"),
    }
    for name, (files, said) in cases.items():
        errors, _ = skill_kit.check(make(root, name, files))
        assert any(said in e for e in errors), (name, errors)
    with contextlib.redirect_stdout(io.StringIO()):
        assert skill_kit.main(["pack", os.path.join(root, "caps"), "-o", os.path.join(root, "dist")]) == 1
    assert not os.path.exists(os.path.join(root, "dist", "caps.zip"))
    print("broken skills:", len(cases), "kinds of error found, and none of them gets packed")


def advice(root):
    text = GOOD.replace("name: invoice-writer", "name: advice").replace("references/format.md", "references/gone.md")
    folder = make(root, "advice", {"SKILL.md": text + "line\n" * 500, "scripts/fill.py": "x"})
    errors, warnings = skill_kit.check(folder)
    assert errors == [] and len(warnings) == 2, (errors, warnings)
    assert "lines" in warnings[0] and "gone.md" in warnings[1], warnings
    print("advice: SKILL.md too long, a file it points to is missing")


def windows(root):
    """A SKILL.md saved on Windows, with a byte order mark and CRLF line endings, as a client may send it."""
    folder = os.path.join(root, "win-skill")
    os.makedirs(folder)
    text = GOOD.replace("invoice-writer", "win-skill").replace("references/format.md", "https://example.com")
    with open(os.path.join(folder, "SKILL.md"), "wb") as f:
        f.write(("\ufeff" + text.replace("\n", "\r\n")).encode("utf-8"))
    errors, warnings = skill_kit.check(folder)
    assert errors == [] and len(warnings) == 1 and "Windows line endings" in warnings[0], (errors, warnings)
    with contextlib.redirect_stdout(io.StringIO()):
        assert skill_kit.main(["pack", folder, "-o", os.path.join(root, "dist")]) == 0
    with zipfile.ZipFile(os.path.join(root, "dist", "win-skill.zip")) as z:
        packed = z.read("win-skill/SKILL.md").decode("utf-8")
    assert packed.startswith("---\nname: win-skill") and "\r" not in packed, repr(packed[:40])
    print("Windows file: read despite the byte order mark and CRLF, packed with plain line endings")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        good_skill(tmp)
        inside(tmp)
        broken(tmp)
        advice(tmp)
        windows(tmp)
    print("all good")

"""Check a Claude skill folder and pack it for the client. Used for the Fiverr gig "custom Claude skill".

Usage: python3 skill_kit.py check my-skill/            the rules Claude applies on upload, plus advice
       python3 skill_kit.py pack my-skill/ [-o dist/] [--example "a request that should use it"]
              checks, then writes my-skill.zip with the folder inside and INSTALL-my-skill.md for the client
       (needs: pip install pyyaml)

The rules come from Anthropic's documentation, checked on 4 October 2026
(claude.com/docs/skills/how-to and platform.claude.com/docs/en/agents-and-tools/agent-skills/overview),
and from the skill-creator scripts Anthropic publishes: one SKILL.md at the top of the folder, YAML
frontmatter with only the known keys, a name of lowercase letters, digits and hyphens (64 at most,
without the reserved words anthropic and claude) that matches the folder name, and a description of 1024
characters at most without < or >. The zip holds the folder itself, as claude.ai expects. It also warns
about a SKILL.md over 500 lines and files the instructions point to that are not in the folder.
"""
import argparse
import fnmatch
import os
import re
import sys
import zipfile
from pathlib import Path

import yaml

KEYS = {"name", "description", "license", "allowed-tools", "metadata", "compatibility"}
SKIP_DIRS = {"__pycache__", "node_modules", ".git", ".venv", "venv"}      # left out at any depth
SKIP_TOP = {"evals"}                                 # left out only at the top of the folder
SKIP_FILES = {".DS_Store", ".env", "Thumbs.db"}      # .env may hold passwords
SKIP_GLOBS = ("*.pyc",)
LINK = re.compile(r"\]\((?!https?:|mailto:|#)([^)\s]+)\)")                  # [text](references/x.md)
CODE_PATH = re.compile(r"`((?:[\w.-]+/)+[\w.-]+\.\w+)`")                    # `scripts/fill.py`


def files(folder):
    """The files that go into the package, relative to the skill folder."""
    folder = Path(folder)
    out = []
    for path in sorted(folder.rglob("*")):
        rel = path.relative_to(folder)
        if not path.is_file() or any(p in SKIP_DIRS for p in rel.parts) or rel.parts[0] in SKIP_TOP:
            continue
        if rel.name in SKIP_FILES or any(fnmatch.fnmatch(rel.name, g) for g in SKIP_GLOBS):
            continue
        out.append(rel)
    return out


def clean(text):
    """SKILL.md as Claude's own tools expect it: no byte order mark, plain line endings."""
    return text.lstrip("\ufeff").replace("\r\n", "\n").replace("\r", "\n")


def check(folder):
    """(errors, warnings): errors stop an upload, warnings are advice."""
    folder = Path(folder)
    skill_md = folder / "SKILL.md"
    if not skill_md.is_file():
        return ["SKILL.md not found at the top of the folder"], []
    errors, warnings = [], []
    extra = [str(f) for f in files(folder) if f.name == "SKILL.md" and f != Path("SKILL.md")]
    if extra:
        errors.append(f"more than one SKILL.md ({', '.join(extra)}); rename the others, for example references/x.md")
    try:
        text = skill_md.read_bytes().decode("utf-8")
    except UnicodeDecodeError:
        return errors + ["SKILL.md is not UTF-8 text; save it as UTF-8"], warnings
    if clean(text) != text:
        warnings.append("SKILL.md has Windows line endings or a byte order mark; pack writes it without them")
        text = clean(text)
    m = re.match(r"^---\n(.*?)\n---(?:\n|$)", text, re.DOTALL)
    if not m:
        return errors + ["SKILL.md must start with YAML frontmatter between two --- lines"], warnings
    try:
        front = yaml.safe_load(m.group(1))
    except yaml.YAMLError as e:
        return errors + [f"the frontmatter is not valid YAML: {e}"], warnings
    if not isinstance(front, dict):
        return errors + ["the frontmatter must be a set of key: value lines"], warnings
    unknown = sorted(set(front) - KEYS)
    if unknown:
        errors.append(f"unknown frontmatter keys: {', '.join(unknown)} (allowed: {', '.join(sorted(KEYS))})")

    name = front.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("name is missing")
    else:
        name = name.strip()
        if not re.fullmatch(r"[a-z0-9-]+", name):
            errors.append(f"name '{name}' may only have lowercase letters, digits and hyphens")
        elif name.startswith("-") or name.endswith("-") or "--" in name:
            errors.append(f"name '{name}' cannot start or end with a hyphen or have two in a row")
        if len(name) > 64:
            errors.append(f"name is {len(name)} characters long; the limit is 64")
        if "anthropic" in name or "claude" in name:
            errors.append(f"name '{name}' cannot contain the reserved words anthropic or claude")
        if name != folder.resolve().name:
            errors.append(f"name '{name}' must match the folder name '{folder.resolve().name}'")

    description = front.get("description")
    if not isinstance(description, str) or not description.strip():
        errors.append("description is missing")
    else:
        if "<" in description or ">" in description:
            errors.append("description cannot contain < or >")
        if len(description.strip()) > 1024:
            errors.append(f"description is {len(description.strip())} characters long; the limit is 1024")
    compatibility = front.get("compatibility")
    if compatibility is not None and (not isinstance(compatibility, str) or len(compatibility) > 500):
        errors.append("compatibility must be text of 500 characters at most")

    body = text[m.end():]
    if len(text.splitlines()) > 500:
        warnings.append(f"SKILL.md has {len(text.splitlines())} lines; move details to files it points to")
    # A path in backticks counts only under a folder the skill has: `word/document.xml` in a skill about
    # Word files is a path inside a document, not one of the skill's files.
    pointed = {link.split("#")[0] for link in LINK.findall(body)}
    pointed |= {path for path in CODE_PATH.findall(body) if (folder / Path(path).parts[0]).is_dir()}
    packed, root = {f.as_posix() for f in files(folder)}, folder.resolve()
    for target in sorted(pointed):
        if not target or Path(target).parts[0] in SKIP_TOP:
            continue
        path = (folder / target).resolve()
        if not path.is_relative_to(root):
            warnings.append(f"SKILL.md points to {target}, which is outside the folder and does not go into the zip")
        elif not path.exists():
            warnings.append(f"SKILL.md points to {target}, which is not in the folder")
        elif path.is_file() and path.relative_to(root).as_posix() not in packed:
            warnings.append(f"SKILL.md points to {target}, which is left out of the zip")
    if (folder / ".env").exists():
        warnings.append(".env stays out of the zip: it may hold passwords")
    return errors, warnings


GUIDE = """# Installing {name}

You received {name}.zip. It holds one folder, {name}, which is the skill.

## In the Claude app (claude.ai or the desktop app)

Skills work on the Pro, Max, Team and Enterprise plans.

1. Turn on code execution: Settings > Capabilities > Code execution and file creation. On a Team or
   Enterprise plan, an Owner turns it on in Organization settings > Capabilities.
2. Open Customize > Skills: https://claude.ai/customize/skills
3. Select Add, choose to upload a skill and pick {name}.zip. Upload the zip as it is, without unzipping it.
4. Find {name} under Your skills and select Turn on.
5. In a new chat, {ask}. To call the skill by name, type / in the message box and select {name}.

## In Claude Code

1. Unzip {name}.zip.
2. Move the {name} folder into `~/.claude/skills/` for all your projects, or into `.claude/skills/` inside
   one project. The instructions should end up at `~/.claude/skills/{name}/SKILL.md`.
3. Start `claude` and ask for the task, or type `/{name}`.

## If Claude does not use the skill

- Check that it is turned on in Customize > Skills.
- Ask in words close to what the skill is for: {description}
- Send me on Fiverr what you typed and what Claude answered, and I will adjust the skill.
"""


def pack(folder, out_dir=".", example=None):
    """Write <folder name>.zip with the folder at its root, as Claude expects, and the install guide
    INSTALL-<folder name>.md. Returns the zip's path and how many files went in."""
    folder = Path(folder).resolve()
    os.makedirs(out_dir, exist_ok=True)
    target = (Path(out_dir) / f"{folder.name}.zip").resolve()
    # Listed before the zip exists: with -o inside the folder it would otherwise take itself in, and the zip
    # and guide of an earlier run stay out.
    made = {Path(f"{folder.name}.zip"), Path(f"INSTALL-{folder.name}.md")}
    entries = [rel for rel in files(folder) if rel not in made and (folder / rel).resolve() != target]
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in entries:
            if rel == Path("SKILL.md"):
                z.writestr(str(Path(folder.name) / rel), clean((folder / rel).read_text(encoding="utf-8")))
            else:
                z.write(folder / rel, str(Path(folder.name) / rel))
    text = clean((folder / "SKILL.md").read_text(encoding="utf-8"))
    front = re.match(r"^---\n(.*?)\n---(?:\n|$)", text, re.DOTALL).group(1)     # as check reads it
    description = " ".join(str(yaml.safe_load(front)["description"]).split())
    ask = f'ask for the task, for example: "{example}"' if example else "ask for the task the skill handles"
    guide = GUIDE.format(name=folder.name, ask=ask, description=description)
    (Path(out_dir) / f"INSTALL-{folder.name}.md").write_text(guide, encoding="utf-8")
    return target, len(entries)


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check a Claude skill folder and pack it as a zip.")
    ap.add_argument("action", choices=["check", "pack"])
    ap.add_argument("folder")
    ap.add_argument("-o", "--out", default=".", help="where pack writes the zip and the install guide")
    ap.add_argument("--example", help="a request that should use the skill, for the install guide")
    a = ap.parse_args(argv)
    errors, warnings = check(a.folder)
    for e in errors:
        print("error:", e)
    for w in warnings:
        print("warning:", w)
    if errors:
        return 1
    if a.action == "pack":
        target, count = pack(a.folder, a.out, a.example)
        print(f"wrote {target} with {count} files, and INSTALL-{target.stem}.md")
    else:
        print(f"ok: {len(files(a.folder))} files would be packed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

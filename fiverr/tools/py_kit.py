"""Check a Python script for the client and pack it so it runs on their computer. Used for the Fiverr gig
"Python scripts": the delivery is a zip the client unzips and double-clicks.

Usage: python3 py_kit.py check my-tool/                    what the client's computer will need, and problems
       python3 py_kit.py pack my-tool/ --run "main.py sales.xlsx" [-o dist/]
              [--title "Monthly sales report"] [--what "Reads sales.xlsx and writes report.xlsx."]
              [--require package ...]

check reads every .py file in the folder: it must parse as Python 3.10 (the gig promises 3.10 or newer),
its imports are sorted into the standard library, files of the folder and packages to install, with the
version tested here, and it warns about Windows-only or Mac-only modules, paths that only exist on one
computer (C:\\Users\\..., /home/...) and a .env file, which stays out of the zip. A package is required at
the major version tested here (openpyxl~=3.0), so pip picks the newest one that suits the client's Python:
numpy 2.4, tested here, no longer installs on Python 3.10, where numpy~=2.0 gives 2.2.

pack writes <folder>.zip with the folder inside: the code, requirements.txt, run-windows.bat,
run-mac.command and run-linux.sh, and HOW-TO-RUN.txt for the client. The first run of a launcher makes a
.venv folder next to the script and installs the requirements there; later runs start at once.
"""
import argparse
import ast
import fnmatch
import importlib.metadata as metadata
import os
import re
import shlex
import sys
import time
import zipfile
from pathlib import Path

SKIP_DIRS = {"__pycache__", ".venv", "venv", ".git", ".idea", ".vscode", "dist", "build"}
SKIP_FILES = {".DS_Store", ".env", "Thumbs.db"}
SKIP_GLOBS = ("*.pyc", "*.pyo", "*.log")
LAUNCHERS = ("run-windows.bat", "run-mac.command", "run-linux.sh", "HOW-TO-RUN.txt", "requirements.txt")
WINDOWS_ONLY = {"winreg", "msvcrt", "winsound", "_winapi", "win32com", "win32api", "win32con", "win32gui",
                "pythoncom", "pywintypes", "pywinauto", "wmi"}
MAC_ONLY = {"AppKit", "Foundation", "objc", "Quartz"}
NEWER = {"tomllib": "3.11"}                 # standard modules a client on Python 3.10 does not have
KNOWN = {"win32com": "pywin32", "win32api": "pywin32", "win32con": "pywin32", "win32gui": "pywin32",
         "pythoncom": "pywin32", "pywintypes": "pywin32", "cv2": "opencv-python", "sklearn": "scikit-learn",
         "bs4": "beautifulsoup4", "yaml": "PyYAML", "PIL": "pillow", "docx": "python-docx",
         "dotenv": "python-dotenv", "dateutil": "python-dateutil", "fitz": "pymupdf"}
LOCAL_PATH = re.compile(r"(?i)^(?:[a-z]:[\\/]|/home/|/Users/|/root/)")


def files(folder):
    """The files that go into the zip, relative to the folder."""
    folder = Path(folder)
    out = []
    for path in sorted(folder.rglob("*")):
        rel = path.relative_to(folder)
        if not path.is_file() or any(part in SKIP_DIRS for part in rel.parts):
            continue
        if rel.name in SKIP_FILES or any(fnmatch.fnmatch(rel.name, g) for g in SKIP_GLOBS) or str(rel) in LAUNCHERS:
            continue
        out.append(rel)
    return out


def imports(tree):
    """The top-level names of the modules a parsed file imports, with the line of each first import."""
    found = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                found.setdefault(alias.name.split(".")[0], node.lineno)
        elif isinstance(node, ast.ImportFrom) and node.module and not node.level:
            found.setdefault(node.module.split(".")[0], node.lineno)
    return found


def check(folder, extra=()):
    """(errors, warnings, requirements): errors stop pack; requirements are pip lines with the major version
    tested here (name~=3.0, or name~=0.9 below 1.0), or the bare name when it is not installed here."""
    folder = Path(folder)
    errors, warnings, packages = [], [], {}
    sources = [f for f in files(folder) if f.suffix == ".py"]
    if not sources:
        return ["no .py file in the folder"], [], []
    local = {f.stem for f in sources} | {f.parts[0] for f in sources if len(f.parts) > 1}
    owners = metadata.packages_distributions()
    for rel in sources:
        text = (folder / rel).read_text(encoding="utf-8", errors="replace")
        try:
            tree = ast.parse(text, filename=str(rel), feature_version=(3, 10))
        except SyntaxError as e:
            errors.append(f"{rel} line {e.lineno}: does not parse as Python 3.10 ({e.msg})")
            continue
        for name, line in imports(tree).items():
            where = f"{rel} line {line}"
            if name in local or name == "__future__":
                continue
            if name in NEWER:
                errors.append(f"{where}: {name} needs Python {NEWER[name]}, the gig promises 3.10")
            if name in WINDOWS_ONLY:
                warnings.append(f"{where}: {name} works on Windows only")
            elif name in MAC_ONLY:
                warnings.append(f"{where}: {name} works on a Mac only")
            if name in sys.stdlib_module_names:
                continue
            candidates = sorted(set(owners.get(name) or [])) or [KNOWN.get(name)]
            dist = candidates[0] if len(candidates) == 1 else None
            if dist:
                packages.setdefault(dist, name)
            elif len(candidates) > 1:
                warnings.append(f"{where}: {name} comes from several packages here ({', '.join(candidates)}); "
                                "give the right ones with --require")
            else:
                warnings.append(f"{where}: {name} is not installed here and its pip name is unknown; "
                                "give it with --require")
        for node in ast.walk(tree):
            if isinstance(node, ast.Constant) and isinstance(node.value, str) and LOCAL_PATH.match(node.value):
                warnings.append(f"{rel} line {node.lineno}: the path {node.value!r} is on one computer only; "
                                "use a path next to the script or ask for it")
    if (folder / ".env").exists():
        warnings.append(".env stays out of the zip: it may hold passwords. Tell the client which values to put in theirs")
    requirements = []
    for dist in sorted(packages, key=str.lower):
        try:
            major, minor = (metadata.version(dist).split(".") + ["0"])[:2]
            minor = re.match(r"\d*", minor).group() or "0"         # 0.9b1 is 0.9
            requirements.append(f"{dist}~={major}.0" if major != "0" else f"{dist}~=0.{minor}")
        except metadata.PackageNotFoundError:
            requirements.append(dist)
            warnings.append(f"{dist} is not installed here, so the script was not tested with it")
    requirements += [r for r in extra if r not in requirements]
    return errors, warnings, requirements


WINDOWS = r'''@echo off
rem Runs {script} with everything it needs, set up next to it the first time.
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    echo Setting up, the first time only. This needs internet and takes a minute...
    where py >nul 2>nul && (py -3 -m venv .venv) || (python -m venv .venv)
)
if not exist ".venv\Scripts\python.exe" goto nopython
if exist requirements.txt (
    ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r requirements.txt || goto failed
)
".venv\Scripts\python.exe" {command} %*
echo.
pause
exit /b

:nopython
echo Python was not found. Install it from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH" on the first screen of the installer. Then run this again.
pause
exit /b 1

:failed
echo The setup did not finish. Send me the text above on Fiverr.
pause
exit /b 1
'''

UNIX = '''#!/bin/bash
# Runs {script} with everything it needs, set up next to it the first time.
cd "$(dirname "$0")" || exit 1
stop() {{ echo "$1"; read -r -p "Press Enter to close. "; exit 1; }}
if [ ! -x .venv/bin/python ]; then
    echo "Setting up, the first time only. This needs internet and takes a minute..."
    python3 -m venv .venv || stop "Python 3 was not found. Install it from https://www.python.org/downloads/ and run this again."
fi
if [ -f requirements.txt ]; then
    .venv/bin/python -m pip install --disable-pip-version-check -q -r requirements.txt || stop "The setup did not finish. Send me the text above on Fiverr."
fi
.venv/bin/python {command} "$@"
echo
read -r -p "Press Enter to close. "
'''

GUIDE = '''{title}

{what}

How to run it
1. Install Python 3.10 or newer from https://www.python.org/downloads/
   On Windows, tick "Add python.exe to PATH" on the first screen of the installer.
2. Unzip {zip_name} into a folder of your choice.
3. Open the {folder} folder and start the script:
   - Windows: double-click run-windows.bat
   - Mac: double-click run-mac.command. The first time, the Mac may refuse to open it: right-click it,
     choose Open, then Open again.
   - Linux: in a terminal, ./run-linux.sh
   The first run sets up what the script needs in a .venv folder, which needs internet and takes a
   minute. Later runs start at once.
4. A window shows what the script does. Press Enter or any key to close it when it is done.

The script runs: python {command}
{needs}
If something goes wrong, send me on Fiverr the text shown in the window.
'''


def pack(folder, run, out_dir=".", title=None, what=None, extra=()):
    """Write <folder>.zip with the folder inside, its launchers and the guide. Returns the zip's path."""
    folder = Path(folder).resolve()
    errors, _, requirements = check(folder, extra)
    if errors:
        raise ValueError("; ".join(errors))
    parts = shlex.split(run)
    script = parts[0]
    if not (folder / script).is_file():
        raise ValueError(f"{script} is not in {folder.name}")
    command = " ".join(f'"{part}"' if " " in part else part for part in parts)
    made = {
        "run-windows.bat": WINDOWS.format(script=script, command=command).replace("\n", "\r\n"),
        "run-mac.command": UNIX.format(script=script, command=command),
        "run-linux.sh": UNIX.format(script=script, command=command),
    }
    if requirements:
        made["requirements.txt"] = "\n".join(requirements) + "\n"
    needs = ("It installs: " + ", ".join(r.split("~=")[0] for r in requirements) + ".\n") if requirements else ""
    zip_name = f"{folder.name}.zip"
    made["HOW-TO-RUN.txt"] = GUIDE.format(title=title or folder.name, what=what or "", zip_name=zip_name,
                                          folder=folder.name, command=command, needs=needs)
    made["HOW-TO-RUN.txt"] = re.sub(r"\n{3,}", "\n\n", made["HOW-TO-RUN.txt"])     # no blank lines left by an empty --what
    made["HOW-TO-RUN.txt"] = made["HOW-TO-RUN.txt"].replace("\n", "\r\n")      # readable in Notepad
    os.makedirs(out_dir, exist_ok=True)
    target = Path(out_dir) / zip_name
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in files(folder):
            z.write(folder / rel, f"{folder.name}/{rel.as_posix()}")
        for name, text in made.items():
            info = zipfile.ZipInfo(f"{folder.name}/{name}", date_time=time.localtime()[:6])
            info.compress_type = zipfile.ZIP_DEFLATED
            executable = name.endswith((".command", ".sh"))
            info.external_attr = (0o100755 if executable else 0o100644) << 16    # a Mac keeps it runnable
            z.writestr(info, text)
    return target


def main(argv=None):
    ap = argparse.ArgumentParser(description="Check a Python script and pack it to run on the client's computer.")
    ap.add_argument("action", choices=["check", "pack"])
    ap.add_argument("folder")
    ap.add_argument("--run", help='the script and its arguments, for example "main.py sales.xlsx"')
    ap.add_argument("-o", "--out", default=".", help="where pack writes the zip")
    ap.add_argument("--title", help="the first line of HOW-TO-RUN.txt")
    ap.add_argument("--what", help="what the script does, for HOW-TO-RUN.txt")
    ap.add_argument("--require", nargs="+", default=[], help="pip packages to add, for imports not installed here")
    a = ap.parse_args(argv)
    errors, warnings, requirements = check(a.folder, a.require)
    for e in errors:
        print("error:", e)
    for w in warnings:
        print("warning:", w)
    if errors:
        return 1
    print("requirements:", ", ".join(requirements) or "none, the standard library only")
    if a.action == "pack":
        if not a.run:
            ap.error("pack needs --run, the script to start and its arguments")
        try:
            target = pack(a.folder, a.run, a.out, a.title, a.what, a.require)
        except ValueError as e:
            print("error:", e)
            return 1
        print(f"wrote {target}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

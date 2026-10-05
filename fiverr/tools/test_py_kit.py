"""Check and pack small script folders, then run the packed Linux launcher as the client would."""
import contextlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import py_kit  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "tools"))
import sem_ia  # noqa: E402

MAIN = '''"""Adds up the sales in a CSV file and writes the total to report.xlsx."""
import csv
import sys

from openpyxl import Workbook

from helper import total

rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8")))
wb = Workbook()
wb.active.append(["Total", total(rows)])
wb.save("report.xlsx")
print("report.xlsx written")
'''
PLAIN = '''"""Adds up the sales in a CSV file and writes the total to total.txt, with the standard library only."""
import csv
import sys

rows = list(csv.DictReader(open(sys.argv[1], encoding="utf-8")))
with open("total.txt", "w", encoding="utf-8") as f:
    f.write(str(sum(float(r["amount"]) for r in rows)))
print("total.txt written:", sum(float(r["amount"]) for r in rows))
'''


def make(root, name, files):
    folder = os.path.join(root, name)
    for rel, text in files.items():
        path = os.path.join(folder, rel)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    return folder


def good(root):
    folder = make(root, "sales-report", {
        "main.py": MAIN, "helper.py": "def total(rows):\n    return sum(float(r['amount']) for r in rows)\n",
        "sales.csv": "item,amount\npen,2.5\npad,4\n", ".env": "API_KEY=secret\n", "__pycache__/main.cpython-311.pyc": "x"})
    errors, warnings, requirements = py_kit.check(folder)
    assert errors == [] and requirements == ["openpyxl~=3.0"], (errors, requirements)
    assert len(warnings) == 1 and ".env stays out of the zip" in warnings[0], warnings

    with contextlib.redirect_stdout(io.StringIO()):
        assert py_kit.main(["pack", folder, "--run", "main.py sales.csv", "-o", os.path.join(root, "dist"),
                            "--title", "Sales report", "--what", "Adds up sales.csv into report.xlsx."]) == 0
    with zipfile.ZipFile(os.path.join(root, "dist", "sales-report.zip")) as z:
        names = sorted(z.namelist())
        assert names == ["sales-report/" + n for n in ["HOW-TO-RUN.txt", "helper.py", "main.py", "requirements.txt",
                                                      "run-linux.sh", "run-mac.command", "run-windows.bat",
                                                      "sales.csv"]], names
        for name in ("run-linux.sh", "run-mac.command"):
            assert z.getinfo(f"sales-report/{name}").external_attr >> 16 & 0o111, f"{name} is not runnable"
        bat = z.read("sales-report/run-windows.bat").decode()
        guide = z.read("sales-report/HOW-TO-RUN.txt").decode()
        assert z.read("sales-report/requirements.txt").decode() == "openpyxl~=3.0\n"
    assert "\r\n" in bat and bat.count("\r\n") == bat.count("\n"), "run-windows.bat needs Windows line endings"
    assert '".venv\\Scripts\\python.exe" main.py sales.csv %*' in bat and ":nopython" in bat and ":failed" in bat, bat
    for part in ["Sales report", "Adds up sales.csv into report.xlsx.", "Unzip sales-report.zip",
                 "double-click run-windows.bat", "It installs: openpyxl.", "python main.py sales.csv"]:
        assert part in guide, (part, guide)
    assert not [i for line in guide.splitlines() for i in sem_ia.issues_in(line, False)], guide
    # Packed into the folder itself (-o inside it): the zip must not take itself in, and the next pack
    # elsewhere must not take that older zip in either.
    with contextlib.redirect_stdout(io.StringIO()):
        assert py_kit.main(["pack", folder, "--run", "main.py sales.csv", "-o", folder]) == 0
        assert py_kit.main(["pack", folder, "--run", "main.py sales.csv", "-o", os.path.join(root, "dist2")]) == 0
    for place in (folder, os.path.join(root, "dist2")):
        with zipfile.ZipFile(os.path.join(place, "sales-report.zip")) as z:
            assert z.testzip() is None and "sales-report/sales-report.zip" not in z.namelist(), z.namelist()
            assert len(z.namelist()) == 8, z.namelist()
    print("good folder: openpyxl required at its major version, the local module and the cache left out, .env "
          "kept out with a warning, launchers runnable, the Windows one with Windows line endings")


def problems(root):
    folder = make(root, "messy", {
        "new.py": "try:\n    pass\nexcept* ValueError:\n    pass\n",
        "conf.py": "import tomllib\n",
        "win.py": "import winreg\n",
        "paths.py": "DATA = r'C:\\Users\\ana\\Desktop\\data.xlsx'\nOTHER = '/home/ana/data.csv'\n",
        "mystery.py": "import notapackage123\n"})
    errors, warnings, _ = py_kit.check(folder)
    assert len(errors) == 2, errors
    assert any(e.startswith("new.py line") and "does not parse as Python 3.10 (Exception groups" in e
               for e in errors), errors
    assert any("conf.py line 1: tomllib needs Python 3.11" in e for e in errors), errors
    for said in ["win.py line 1: winreg works on Windows only", "paths.py line 1: the path", "paths.py line 2: the path",
                 "mystery.py line 1: notapackage123 is not installed here"]:
        assert any(said in w for w in warnings), (said, warnings)
    with contextlib.redirect_stdout(io.StringIO()):
        assert py_kit.main(["pack", folder, "--run", "new.py", "-o", os.path.join(root, "dist")]) == 1
    assert not os.path.exists(os.path.join(root, "dist", "messy.zip"))
    print("problems: Python 3.11 code and tomllib refused, winreg, two local paths and an unknown package warned "
          "about, nothing packed")


def launcher(root):
    """The packed Linux launcher, run as a client would: it sets up .venv the first time and runs the script."""
    folder = make(root, "plain-total", {"total.py": PLAIN, "sales.csv": "item,amount\npen,2.5\npad,4\n"})
    with contextlib.redirect_stdout(io.StringIO()):
        assert py_kit.main(["pack", folder, "--run", "total.py sales.csv", "-o", os.path.join(root, "dist")]) == 0
    client = os.path.join(root, "client")
    with zipfile.ZipFile(os.path.join(root, "dist", "plain-total.zip")) as z:
        z.extractall(client)
    here = os.path.join(client, "plain-total")
    os.chmod(os.path.join(here, "run-linux.sh"), 0o755)      # extractall does not keep the mode; a Mac does
    for run in (1, 2):
        done = subprocess.run([os.path.join(here, "run-linux.sh")], input="\n", capture_output=True, text=True,
                              timeout=180)
        assert done.returncode == 0 and "total.txt written: 6.5" in done.stdout, (run, done.stdout, done.stderr)
        assert ("Setting up" in done.stdout) == (run == 1), (run, done.stdout)
    with open(os.path.join(here, "total.txt"), encoding="utf-8") as f:
        assert f.read() == "6.5"
    assert os.path.isfile(os.path.join(here, ".venv", "bin", "python"))
    print("launcher: the first run made .venv and ran the script, the second started at once")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        good(tmp)
        problems(tmp)
        if shutil.which("bash"):
            launcher(tmp)
    print("all good")

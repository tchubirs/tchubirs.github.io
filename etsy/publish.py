"""Publish the Etsy listings through the Etsy Open API v3.

    python3 etsy/publish.py check                 no network: read every listing and check it against Etsy's rules
    python3 etsy/publish.py key KEYSTRING SECRET  keep the app's keys (or set ETSY_KEYSTRING and ETSY_SHARED_SECRET)
    python3 etsy/publish.py ping                  whether Etsy has switched the app's keys on yet
    python3 etsy/publish.py auth                  print the link the shop owner opens to let the app in
    python3 etsy/publish.py token ADDRESS         the address the browser landed on after that
    python3 etsy/publish.py taxonomy WORD         categories whose name has that word, with their numbers
    python3 etsy/publish.py publish [N ...] [--taxonomy ID] [--draft]
                                                  create, fill and publish the listings (all, or only numbers N)
    python3 etsy/publish.py sales                 orders of the last 30 days

The listings are the rows of the table in DISPATCH.md, with the euro prices. Their texts come from each
LISTING.md, the photos from its images folder and the files from its Type section.

Keys and tokens stay in .etsy-secret at the root of the repo, which git ignores. What was published is written to
etsy/published.json after every step, so a second run carries on where the first one stopped, and a listing that
is already in the shop with the same title is left alone.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import sys
import time
import unicodedata
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
SECRET = HERE.parent / ".etsy-secret"
DONE = HERE / "published.json"
CATS = HERE / "taxonomy.json"       # the Etsy category of each folder
API = "https://api.etsy.com/v3/application"
TOKEN_URL = "https://api.etsy.com/v3/public/oauth/token"
CONNECT = "https://www.etsy.com/oauth/connect"
REDIRECT = "https://tchubirs.github.io/"
SCOPES = "listings_r listings_w shops_r transactions_r"
MIME = {".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".pdf": "application/pdf",
        ".jpg": "image/jpeg"}
AI_NOTE = "with the help of AI tools"

# The kit is made of the files and photos of two other listings.
KIT = {
    "files": [("adhd-budget/ADHD-Friendly-Budget.xlsx", "ADHD-Friendly-Budget.xlsx"),
              ("adhd-budget/Start-Here-Guide.pdf", "Budget-Guide.pdf"),
              ("subscriptions/Subscription-Tracker.xlsx", "Subscription-Tracker.xlsx"),
              ("subscriptions/Start-Here-Guide.pdf", "Subscriptions-Guide.pdf")],
    "photos": ["bundle/images/01-bundle.jpg"] + [f"adhd-budget/images/{p}" for p in
               ("02-log.jpg", "03-bills.jpg", "04-impulse.jpg", "05-whats-inside.jpg")]
              + ["subscriptions/images/02-subscriptions.jpg"],
}


# ---------------------------------------------------------------- reading the listings
def block(text, heading):
    """The code block right under a '## heading' line."""
    m = re.search(r"^## " + re.escape(heading) + r"[^\n]*\n+```\n(.*?)\n```", text, re.M | re.S)
    return m.group(1) if m else ""


def section(text, heading):
    m = re.search(r"^## " + re.escape(heading) + r"[^\n]*\n(.*?)(?=^## |\Z)", text, re.M | re.S)
    return m.group(1) if m else ""


def alt(name, photo):
    what = photo.stem.split("-", 1)[-1].replace("-", " ")
    return f"{name}: what is inside the file" if what == "whats inside" else f"{name}: {what}"


# The older listings say "same as listing 1" for the fields they do not list, materials among them.
FIRST_MATERIALS = block((HERE / "adhd-budget" / "LISTING.md").read_text(), "Materials")


def read_listing(n, name, folder, price):
    text = (HERE / folder / "LISTING.md").read_text()
    if folder == "bundle":
        files = [(HERE / src, as_) for src, as_ in KIT["files"]]
        photos = [HERE / p for p in KIT["photos"]]
    else:
        names = re.findall(r"`([^`/]+\.(?:xlsx|pdf))`", section(text, "Type"))
        files = [(HERE / folder / f, f) for f in names]
        photos = sorted((HERE / folder / "images").glob("*.jpg"))
    return {"n": n, "name": name, "folder": folder, "price": price, "title": block(text, "Title").strip(),
            "description": block(text, "Description").strip(),
            "tags": [t.strip() for t in block(text, "Tags").split("\n") if t.strip()],
            "materials": [m.strip() for m in (block(text, "Materials") or FIRST_MATERIALS).split(",") if m.strip()],
            "files": files, "photos": photos, "alts": [alt(name, p) for p in photos]}


def listings():
    rows = re.findall(r"^\| (\d+) \| (.+?) \| `([\w-]+)/LISTING\.md` \| ([\d.]+) \|$",
                      (HERE / "DISPATCH.md").read_text(), re.M)
    return [read_listing(int(n), name, folder, float(eur)) for n, name, folder, eur in rows]


# ---------------------------------------------------------------- Etsy's rules
def kind(c):
    return unicodedata.category(c)


def ok_title(c):      # letters, digits, punctuation, maths symbols, spaces, and the three marks
    return kind(c)[0] in "LP" or kind(c) in ("Nd", "Sm", "Zs") or c in "™©®"


def ok_tag(c):
    return kind(c)[0] == "L" or kind(c) in ("Nd", "Zs") or c in "-'™©®"


def ok_material(c):
    return kind(c)[0] == "L" or kind(c) in ("Nd", "Zs")


def problems(li):
    out, t = [], li["title"]
    if not 1 <= len(t) <= 140:
        out.append(f"title has {len(t)} characters")
    if any(not ok_title(c) for c in t):
        out.append("title has characters Etsy refuses: " + "".join(sorted({c for c in t if not ok_title(c)})))
    out += [f"title has {t.count(c)} times '{c}'" for c in "%:&+" if t.count(c) > 1]
    tags = li["tags"]
    if len(tags) != 13:
        out.append(f"{len(tags)} tags")
    out += [f"tag '{g}' is longer than 20" for g in tags if len(g) > 20]
    out += [f"tag '{g}' has characters Etsy refuses" for g in tags if not all(ok_tag(c) for c in g)]
    if len({g.lower() for g in tags}) != len(tags):
        out.append("the same tag twice")
    if not li["materials"] or len(li["materials"]) > 13:
        out.append(f"{len(li['materials'])} materials")
    out += [f"material '{m}' is not letters and numbers" for m in li["materials"] if not all(ok_material(c) for c in m)]
    if not li["description"]:
        out.append("no description")
    elif AI_NOTE not in li["description"]:
        out.append("the description lost the sentence about AI tools")
    if li["price"] < 0.20:
        out.append(f"price {li['price']}")
    if not 1 <= len(li["files"]) <= 5:
        out.append(f"{len(li['files'])} files (Etsy takes 1 to 5)")
    for path, _ in li["files"]:
        if not path.exists():
            out.append(f"missing file {path.relative_to(HERE)}")
        elif path.stat().st_size > 20 * 1024 * 1024:
            out.append(f"{path.name} is over 20 MB")
    if not 1 <= len(li["photos"]) <= 20:
        out.append(f"{len(li['photos'])} photos")
    out += [f"missing photo {p.relative_to(HERE)}" for p in li["photos"] if not p.exists()]
    return out


def check():
    bad = 0
    for li in listings():
        found = problems(li)
        bad += bool(found)
        print(f"{li['n']:>2} {li['folder']:<15} {li['price']:>5.2f} EUR  title {len(li['title']):>3}  "
              f"photos {len(li['photos'])}  files {len(li['files'])}  " + ("; ".join(found) or "ok"))
    print("listings with problems:", bad)
    return 1 if bad else 0


# ---------------------------------------------------------------- keys and tokens
def load():
    s = json.loads(SECRET.read_text()) if SECRET.exists() else {}
    s.setdefault("keystring", os.environ.get("ETSY_KEYSTRING", ""))
    s.setdefault("shared_secret", os.environ.get("ETSY_SHARED_SECRET", ""))
    if not s["keystring"] or not s["shared_secret"]:
        sys.exit("no keys yet: python3 etsy/publish.py key KEYSTRING SHARED_SECRET")
    return s


def save(s):
    SECRET.write_text(json.dumps(s, indent=1))
    SECRET.chmod(0o600)


def ping():
    """Whether Etsy has switched the app's keys on. Needs no shop login."""
    import requests
    s = load()
    r = requests.request("GET", API + "/openapi-ping", timeout=60,
                         headers={"x-api-key": f"{s['keystring']}:{s['shared_secret']}"})
    if r.ok:
        print("active: the keys work")
        return 0
    print(f"not active yet: {r.status_code} {r.text[:200]}")
    return 1


def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def auth():
    s = load()
    if s.get("state"):     # an older link keeps working if its address comes back
        s["older"] = dict(list(s.get("older", {}).items())[-4:] + [(s["state"], s["code_verifier"])])
    s["code_verifier"] = b64(secrets.token_bytes(48))
    s["state"] = secrets.token_urlsafe(16)
    save(s)
    challenge = b64(hashlib.sha256(s["code_verifier"].encode()).digest())
    print(CONNECT + "?" + urllib.parse.urlencode({
        "response_type": "code", "redirect_uri": REDIRECT, "scope": SCOPES, "client_id": s["keystring"],
        "state": s["state"], "code_challenge": challenge, "code_challenge_method": "S256"}))


def keep_token(s, answer):
    if "access_token" not in answer:
        sys.exit(f"Etsy did not give a token: {answer}")
    s["access_token"] = answer["access_token"]
    s["refresh_token"] = answer["refresh_token"]
    s["expires_at"] = time.time() + int(answer.get("expires_in", 3600)) - 60
    save(s)


def token(address):
    import requests
    s = load()
    q = urllib.parse.parse_qs(urllib.parse.urlparse(address).query)
    if q.get("error"):
        sys.exit(f"Etsy said: {q['error'][0]} {q.get('error_description', [''])[0]}")
    state = q.get("state", [""])[0]
    verifier = s["code_verifier"] if state == s.get("state") else s.get("older", {}).get(state)
    if not verifier:
        sys.exit("this address belongs to a link I no longer know: run auth again")
    r = requests.post(TOKEN_URL, data={"grant_type": "authorization_code", "client_id": s["keystring"],
                                       "redirect_uri": REDIRECT, "code": q["code"][0],
                                       "code_verifier": verifier}, timeout=60)
    keep_token(s, r.json())
    me = call(s, "GET", "/users/me")
    s["user_id"], s["shop_id"] = me["user_id"], me.get("shop_id")
    save(s)
    print("ok, shop", s["shop_id"])


def bearer(s):
    if time.time() > s.get("expires_at", 0):
        import requests
        r = requests.post(TOKEN_URL, data={"grant_type": "refresh_token", "client_id": s["keystring"],
                                           "refresh_token": s["refresh_token"]}, timeout=60)
        keep_token(s, r.json())
    return s["access_token"]


def call(s, method, path, **kw):
    """One API request, again after a pause when Etsy is busy. Stops the run on any other error."""
    import requests
    for attempt in range(6):
        auth_header = "Bearer " + bearer(s)
        r = requests.request(method, API + path, timeout=180, **kw, headers={
            "x-api-key": f"{s['keystring']}:{s['shared_secret']}", "Authorization": auth_header})
        if r.status_code != 429 and r.status_code < 500:
            break
        time.sleep(2 ** attempt)
    if not r.ok:
        sys.exit(f"{method} {path}: {r.status_code} {r.text[:800]}")
    time.sleep(0.25)
    return r.json() if r.content else {}


# ---------------------------------------------------------------- shop
def taxonomy(word):
    s = load()

    def walk(nodes, path=()):
        for node in nodes:
            here = path + (node["name"],)
            yield node["id"], " > ".join(here)
            yield from walk(node.get("children") or [], here)

    for number, path in walk(call(s, "GET", "/seller-taxonomy/nodes")["results"]):
        if word.lower() in path.lower():
            print(number, path)


def shop_titles(s):
    titles = {}
    for state in ("active", "draft", "inactive"):
        offset = 0
        while True:
            page = call(s, "GET", f"/shops/{s['shop_id']}/listings",
                        params={"state": state, "limit": 100, "offset": offset})
            for item in page["results"]:
                titles[item["title"].strip().lower()] = (item["listing_id"], state)
            offset += 100
            if offset >= page["count"]:
                break
    return titles


def publish(numbers, taxonomy_id, draft):
    """With no taxonomy_id, each listing takes the category etsy/taxonomy.json gives its folder."""
    s = load()
    if not s.get("shop_id"):
        sys.exit("no shop yet: run auth and token first")
    chosen = [li for li in listings() if not numbers or li["n"] in numbers]
    cats = json.loads(CATS.read_text()) if CATS.exists() else {}
    if taxonomy_id is None:
        missing = [li["folder"] for li in chosen if li["folder"] not in cats]
        if missing:
            sys.exit(f"no category in {CATS.name} for: {missing} (or say --taxonomy ID)")
    broken = [(li["n"], problems(li)) for li in chosen if problems(li)]
    if broken:
        sys.exit(f"fix these first (python3 etsy/publish.py check): {broken}")
    done = json.loads(DONE.read_text()) if DONE.exists() else {}

    def note(n, rec):
        done[str(n)] = rec
        DONE.write_text(json.dumps(done, indent=1, sort_keys=True) + "\n")

    in_shop = shop_titles(s)
    shop = s["shop_id"]
    for li in chosen:
        rec = done.get(str(li["n"]), {})
        if not rec and li["title"].lower() in in_shop:
            lid, state = in_shop[li["title"].lower()]
            note(li["n"], {"listing_id": lid, "state": state, "made_by_hand": True})
            print(li["n"], li["name"], f"already in the shop ({state}), left alone")
            continue
        if rec.get("made_by_hand"):
            continue
        if not rec.get("listing_id"):
            made = call(s, "POST", f"/shops/{shop}/listings", data={
                "quantity": 999, "title": li["title"], "description": li["description"], "price": f"{li['price']:.2f}",
                "who_made": "i_did", "when_made": "2020_2026",
                "taxonomy_id": taxonomy_id if taxonomy_id is not None else cats[li["folder"]], "type": "download",
                "is_supply": "false", "should_auto_renew": "true", "tags": ",".join(li["tags"]),
                "materials": ",".join(li["materials"])})
            rec = {"listing_id": made["listing_id"], "photos": 0, "files": 0, "state": "draft"}
            note(li["n"], rec)
        lid = rec["listing_id"]
        for k in range(rec["photos"], len(li["photos"])):
            photo = li["photos"][k]
            call(s, "POST", f"/shops/{shop}/listings/{lid}/images", data={"rank": k + 1, "alt_text": li["alts"][k]},
                 files={"image": (photo.name, photo.read_bytes(), MIME[".jpg"])})
            rec["photos"] = k + 1
            note(li["n"], rec)
        for k in range(rec["files"], len(li["files"])):
            path, name = li["files"][k]
            call(s, "POST", f"/shops/{shop}/listings/{lid}/files", data={"name": name, "rank": k + 1},
                 files={"file": (name, path.read_bytes(), MIME[path.suffix])})
            rec["files"] = k + 1
            note(li["n"], rec)
        if not draft and rec["state"] != "active":
            call(s, "PATCH", f"/shops/{shop}/listings/{lid}", data={"state": "active"})
            rec["state"] = "active"
            note(li["n"], rec)
        print(li["n"], li["name"], rec["state"], f"https://www.etsy.com/listing/{lid}")


def sales():
    s = load()
    since = int(time.time()) - 30 * 86400
    page = call(s, "GET", f"/shops/{s['shop_id']}/receipts", params={"min_created": since, "limit": 100})
    total = sum(r["grandtotal"]["amount"] / r["grandtotal"]["divisor"] for r in page["results"])
    print(f"{page['count']} orders in 30 days, {total:.2f} {page['results'][0]['grandtotal']['currency_code']}"
          if page["count"] else "no orders in 30 days")


def main(args):
    if not args or args[0] == "check":
        return check()
    if args[0] == "key" and len(args) == 3:
        s = json.loads(SECRET.read_text()) if SECRET.exists() else {}
        s["keystring"], s["shared_secret"] = args[1], args[2]
        save(s)
        print("keys kept in", SECRET.name)
    elif args[0] == "ping":
        return ping()
    elif args[0] == "auth":
        auth()
    elif args[0] == "token" and len(args) == 2:
        token(args[1])
    elif args[0] == "taxonomy" and len(args) == 2:
        taxonomy(args[1])
    elif args[0] == "publish":
        rest = args[1:]
        tax = None
        if "--taxonomy" in rest:
            at = rest.index("--taxonomy")
            if at + 1 >= len(rest) or not rest[at + 1].isdigit():
                sys.exit("say which category: --taxonomy ID (python3 etsy/publish.py taxonomy planner)")
            tax = int(rest.pop(at + 1))
        numbers = {int(a) for a in rest if a.isdigit()}
        publish(numbers, tax, "--draft" in rest)
    elif args[0] == "sales":
        sales()
    else:
        print(__doc__)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

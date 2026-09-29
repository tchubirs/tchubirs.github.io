"""Run publish.py against a fake Etsy: auth, token, publish, a failure half way, the rerun, refresh, sales.

    python3 etsy/test_publish.py
"""
import hashlib
import json, re, sys, tempfile, time, urllib.parse
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import requests
import publish as P

T = Path(tempfile.mkdtemp())
P.SECRET, P.DONE = T / ".etsy-secret", T / "published.json"
time.sleep = lambda s: None

shop = {"listings": {}, "next": 900, "calls": [], "fail_image_call": None, "image_calls": 0, "tokens": 0,
        "active": False}
shop["listings"][555] = {"title": P.listings()[0]["title"], "state": "active", "images": [], "files": [], "data": {}}


class R:
    def __init__(self, code, body):
        self.status_code, self.ok = code, code < 400
        self.text = json.dumps(body)
        self.content = self.text.encode()
        self._b = body

    def json(self):
        return self._b


def fake_post(url, data=None, timeout=None):
    assert url == P.TOKEN_URL
    shop["tokens"] += 1
    if data["grant_type"] == "authorization_code":
        assert data["code"] == "THECODE" and data["redirect_uri"] == P.REDIRECT
        assert data["code_verifier"] and len(data["code_verifier"]) >= 43
        challenge = P.b64(hashlib.sha256(data["code_verifier"].encode()).digest())
        assert challenge in shop["challenges"], "verifier does not match any link"
        shop["used"].append(challenge)
    else:
        assert data["grant_type"] == "refresh_token" and data["refresh_token"].startswith("r")
    return R(200, {"access_token": f"77.tok{shop['tokens']}", "refresh_token": f"r{shop['tokens']}", "expires_in": 3600})


def fake_request(method, url, timeout=None, params=None, data=None, files=None, headers=None):
    assert headers["x-api-key"] == "KEY:SECRET", headers
    if url == P.API + "/openapi-ping":
        assert method == "GET" and "Authorization" not in headers
        return R(200, {"application_id": 1}) if shop["active"] else R(403, {"error": "API key not active"})
    assert headers["Authorization"].startswith("Bearer 77.tok")
    path = url[len(P.API):]
    shop["calls"].append((method, path))
    if path == "/users/me":
        return R(200, {"user_id": 77, "shop_id": 4242})
    m = re.fullmatch(r"/shops/4242/listings", path)
    if m and method == "GET":
        items = [{"listing_id": k, "title": v["title"]} for k, v in shop["listings"].items() if v["state"] == params["state"]]
        return R(200, {"count": len(items), "results": items[params["offset"]:params["offset"] + params["limit"]]})
    if m and method == "POST":
        for key in ("quantity", "title", "description", "price", "who_made", "when_made", "taxonomy_id"):
            assert key in data, key
        assert data["type"] == "download" and len(data["tags"].split(",")) == 13
        shop["next"] += 1
        shop["listings"][shop["next"]] = {"title": data["title"], "state": "draft", "images": [], "files": [], "data": data}
        return R(201, {"listing_id": shop["next"]})
    m = re.fullmatch(r"/shops/4242/listings/(\d+)/images", path)
    if m:
        shop["image_calls"] += 1
        if shop["fail_image_call"] and shop["image_calls"] >= shop["fail_image_call"]:
            return R(500, {"error": "server busy"})
        name, raw, mime = files["image"]
        assert mime == "image/jpeg" and raw[:2] == b"\xff\xd8" and data["alt_text"]
        shop["listings"][int(m.group(1))]["images"].append((data["rank"], name))
        return R(201, {"listing_image_id": 1})
    m = re.fullmatch(r"/shops/4242/listings/(\d+)/files", path)
    if m:
        name, raw, mime = files["file"]
        assert raw[:2] in (b"PK", b"%P"), name
        shop["listings"][int(m.group(1))]["files"].append((data["rank"], name))
        return R(201, {"listing_file_id": 1})
    m = re.fullmatch(r"/shops/4242/listings/(\d+)", path)
    if m and method == "PATCH":
        li = shop["listings"][int(m.group(1))]
        assert li["images"], "Etsy needs a photo before it goes live"
        li["state"] = data["state"]
        return R(200, {})
    if path == "/shops/4242/receipts":
        return R(200, {"count": 2, "results": [{"grandtotal": {"amount": 450, "divisor": 100, "currency_code": "EUR"}},
                                                {"grandtotal": {"amount": 790, "divisor": 100, "currency_code": "EUR"}}]})
    raise AssertionError(("unexpected", method, path))


requests.request, requests.post = fake_request, fake_post

# keys, auth link, token
P.main(["key", "KEY", "SECRET"])
assert P.main(["ping"]) == 1, "keys not switched on yet"
shop["active"] = True
assert P.main(["ping"]) == 0, "keys switched on"
import io, contextlib
out = io.StringIO()
with contextlib.redirect_stdout(out):
    P.main(["auth"])
link = out.getvalue().strip()
q = urllib.parse.parse_qs(urllib.parse.urlparse(link).query)
shop["challenges"], shop["used"] = [q["code_challenge"][0]], []
assert q["client_id"] == ["KEY"] and q["code_challenge_method"] == ["S256"] and q["redirect_uri"] == [P.REDIRECT]
assert set(q["scope"][0].split()) == {"listings_r", "listings_w", "shops_r", "transactions_r"}
try:
    P.main(["token", P.REDIRECT + "?code=THECODE&state=WRONG"])
    raise AssertionError("a wrong state went through")
except SystemExit as e:
    print("wrong state refused:", e)
# a second link: the address from the first one still works, with the first link's verifier
out = io.StringIO()
with contextlib.redirect_stdout(out):
    P.main(["auth"])
q2 = urllib.parse.parse_qs(urllib.parse.urlparse(out.getvalue().strip()).query)
assert q2["state"] != q["state"]
shop["challenges"].append(q2["code_challenge"][0])
P.main(["token", P.REDIRECT + f"?code=THECODE&state={q['state'][0]}"])
assert shop["used"][-1] == q["code_challenge"][0], "the first link's address used the wrong verifier"
P.main(["token", P.REDIRECT + f"?code=THECODE&state={q2['state'][0]}"])
assert shop["used"][-1] == q2["code_challenge"][0], "the second link's address used the wrong verifier"
assert json.loads(P.SECRET.read_text())["shop_id"] == 4242

# first run: listing 1 is already in the shop, 2 fails on its third photo
shop["fail_image_call"] = 3
try:
    P.main(["publish", "1", "2", "22", "--taxonomy", "1281"])
except SystemExit as e:
    print("stopped as expected:", str(e)[:60])
done = json.loads(P.DONE.read_text())
assert done["1"]["made_by_hand"] and done["1"]["listing_id"] == 555, done
assert done["2"]["photos"] == 2 and done["2"]["files"] == 0 and done["2"]["state"] == "draft", done
# second run carries on; the token has expired meanwhile
shop["fail_image_call"] = None
s = json.loads(P.SECRET.read_text()); s["expires_at"] = 0; P.SECRET.write_text(json.dumps(s))
P.main(["publish", "1", "2", "22", "--taxonomy", "1281"])
done = json.loads(P.DONE.read_text())
lis = {k: v for k, v in shop["listings"].items() if k != 555}
assert len(lis) == 2, "a listing was created twice"
for n in ("2", "22"):
    li = shop["listings"][done[n]["listing_id"]]
    want = P.listings()[int(n) - 1]
    assert [r for r, _ in li["images"]] == list(range(1, len(want["photos"]) + 1)), li["images"]
    assert [nm for _, nm in li["files"]] == [nm for _, nm in want["files"]], li["files"]
    assert li["state"] == "active" and li["data"]["price"] == f"{want['price']:.2f}" and li["data"]["taxonomy_id"] == 1281
    print(n, "photos", len(li["images"]), "files", [nm for _, nm in li["files"]], li["data"]["price"])
assert shop["tokens"] == 3, "the token was not refreshed once"  # two logins (old and new link) and one refresh
# a third run does nothing new
before = len(shop["calls"])
P.main(["publish", "--taxonomy", "1281", "2", "22"])
assert all(c[0] == "GET" for c in shop["calls"][before:]), shop["calls"][before:]
# no --taxonomy: the category comes from etsy/taxonomy.json, per folder
P.main(["publish", "3"])
done = json.loads(P.DONE.read_text())
cats = json.loads(P.CATS.read_text())
li = shop["listings"][done["3"]["listing_id"]]
assert li["data"]["taxonomy_id"] == cats[P.listings()[2]["folder"]], li["data"]["taxonomy_id"]
assert all(li["folder"] in cats for li in P.listings()), "a listing has no category"
P.main(["sales"])
print("all good")

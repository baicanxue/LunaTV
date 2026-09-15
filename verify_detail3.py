# -*- coding: utf-8 -*-
"""验证详情接口（去掉 detail 字段后走标准 API），正确解析 episodes 为字符串数组"""
import json
import urllib.request
import urllib.parse
import urllib.error
import http.cookiejar
import ssl

BASE = "https://lunatv-three-rosy.vercel.app"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ctx),
)
op.addheaders = [("User-Agent", "Mozilla/5.0")]

req = urllib.request.Request(
    BASE + "/api/login",
    data=json.dumps({"username": "baicanxue", "password": "pf2379417"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST")
op.open(req, timeout=40)

res = json.loads(op.open(BASE + "/api/search?q=" + urllib.parse.quote("庆余年"), timeout=90)
                 .read().decode("utf-8", "replace"))["results"]
res = [x for x in res if not str(x.get("source_name", "")).startswith("🔞")]

seen, ok, n = set(), 0, 0
for it in res:
    s = it.get("source")
    if s in seen:
        continue
    seen.add(s)
    u = f"{BASE}/api/detail?source={urllib.parse.quote(str(s))}&id={urllib.parse.quote(str(it['id']))}"
    try:
        d = json.loads(op.open(u, timeout=60).read().decode("utf-8", "replace"))
        eps = d.get("episodes") or []
        flat = [e for e in eps if isinstance(e, str)]
        print(f"OK   {it.get('source_name')}: 集数 {len(eps)} | 首集 {flat[0][:60] if flat else '-'}")
        ok += 1
    except urllib.error.HTTPError as e:
        print(f"FAIL {it.get('source_name')}: {e.read().decode('utf-8', 'replace')[:80]}")
    except Exception as e:
        print(f"FAIL {it.get('source_name')}: {type(e).__name__} {e}")
    n += 1
    if n >= 8:
        break
print(f"详情成功 {ok}/{n}")

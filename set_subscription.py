# -*- coding: utf-8 -*-
"""订阅改成自己的去 detail 版 feed，开自动更新，触发 cron 验证整条链路"""
import json
import urllib.request
import urllib.error
import http.cookiejar
import ssl

BASE = "https://lunatv-three-rosy.vercel.app"
WORKER = "https://lunatv-corsapi.baicanxue.workers.dev"
SUB = "https://lunatv-sub.baicanxue.workers.dev/"
ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def b58decode(s):
    n = 0
    for ch in s.strip():
        n = n * 58 + ALPHABET.index(ch)
    raw = n.to_bytes((n.bit_length() + 7) // 8, "big")
    return b"\x00" * (len(s) - len(s.lstrip("1"))) + raw


ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ctx),
)
op.addheaders = [("User-Agent", "Mozilla/5.0")]


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with op.open(req, timeout=90) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# 1. 新 feed 自检
raw = op.open(SUB + "?raw", timeout=60).read().decode("utf-8")
cfg = json.loads(raw)
sites = cfg["api_site"]
print("新feed 源数:", len(sites),
      "| 带代理:", sum(1 for v in sites.values() if str(v.get("api", "")).startswith(WORKER)),
      "| 残留detail:", sum(1 for v in sites.values() if v.get("detail")))
b58 = op.open(SUB, timeout=60).read().decode("utf-8")
dec = json.loads(b58decode(b58).decode("utf-8"))
print("Base58 解码 OK | 源数:", len(dec["api_site"]))

# 2. 登录 + 写订阅 + 开自动更新
print("登录:", post("/api/login", {"username": "baicanxue", "password": "pf2379417"})[1][:60])
with op.open(BASE + "/api/admin/config", timeout=60) as r:
    cur = json.loads(r.read().decode("utf-8"))["Config"]["ConfigFile"]
st, body = post("/api/admin/config_file", {
    "configFile": cur,
    "subscriptionUrl": SUB,
    "autoUpdate": True,
})
print("写订阅:", st, body[:150])

# 3. 触发 cron，验证自动更新会拉到新 feed
try:
    r = op.open(BASE + "/api/cron", timeout=180)
    print("cron:", r.status, r.read().decode("utf-8", "replace")[:150])
except Exception as e:
    print("cron err:", type(e).__name__, str(e)[:120])

# 4. 回读
with op.open(BASE + "/api/admin/config", timeout=60) as r:
    ac = json.loads(r.read().decode("utf-8"))["Config"]
cf = json.loads(ac["ConfigFile"])
apis = list(cf["api_site"].values())
print("站点配置 源数:", len(apis),
      "| 带代理:", sum(1 for a in apis if str(a.get("api", "")).startswith(WORKER)),
      "| 残留detail:", sum(1 for a in apis if a.get("detail")))
print("订阅:", ac.get("ConfigSubscribtion"))

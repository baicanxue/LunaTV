# -*- coding: utf-8 -*-
"""按 LunaTV-config README 的推荐做法：
把 CORSAPI(Cloudflare Worker) 代理前缀的完整配置写入站点，并把订阅地址设为
format=3(source=full) 的 Base58 代理订阅，开启自动更新。
"""
import json
import urllib.request
import urllib.error
import http.cookiejar
import ssl

BASE = "https://lunatv-three-rosy.vercel.app"
USERNAME = "baicanxue"
PASSWORD = "pf2379417"
WORKER = "https://lunatv-corsapi.baicanxue.workers.dev"
SUB_URL = WORKER + "/?format=3&source=full"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ctx),
)
opener.addheaders = [("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/122.0 Safari/537.36")]


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with opener.open(req, timeout=60) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


# 0. 从 Worker 拉取"带代理前缀"的完整配置
proxy_cfg_raw = opener.open(WORKER + "/?format=1&source=full", timeout=60).read().decode("utf-8")
cfg = json.loads(proxy_cfg_raw)
sites = cfg["api_site"]
prefixed = [k for k, v in sites.items() if str(v.get("api", "")).startswith(WORKER)]
print("配置源数:", len(sites), "已加代理前缀:", len(prefixed))

# 1. 登录
st, body = post("/api/login", {"username": USERNAME, "password": PASSWORD})
print("登录:", st, body[:200])
if st != 200:
    raise SystemExit("登录失败")

# 2. 写入配置 + 订阅
st, body = post("/api/admin/config_file", {
    "configFile": json.dumps(cfg, ensure_ascii=False),
    "subscriptionUrl": SUB_URL,
    "autoUpdate": True,
})
print("写入配置:", st, body[:400])

# 3. 回读确认
req = urllib.request.Request(BASE + "/api/admin/config")
with opener.open(req, timeout=60) as resp:
    data = json.loads(resp.read().decode("utf-8"))
ac = data.get("Config", data)
cf = json.loads(ac.get("ConfigFile") or "{}")
apis = list(cf.get("api_site", {}).values())
print("回读 源数:", len(apis),
      "| 带前缀:", sum(1 for a in apis if str(a.get("api", "")).startswith(WORKER)))
print("回读 订阅:", ac.get("ConfigSubscribtion"))

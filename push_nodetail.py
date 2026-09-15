# -*- coding: utf-8 -*-
"""去掉 config 里的 detail 字段（源站详情页爬取被 403 挡死，改用标准 API 取播放地址）
然后写入站点，并关闭订阅自动更新（防止每晚被作者带 detail 的 feed 覆盖回去）。"""
import json
import urllib.request
import urllib.error
import http.cookiejar
import ssl

BASE = "https://lunatv-three-rosy.vercel.app"
WORKER = "https://lunatv-corsapi.baicanxue.workers.dev"
USERNAME, PASSWORD = "baicanxue", "pf2379417"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ctx),
)
op.addheaders = [("User-Agent", "Mozilla/5.0")]

cfg = json.loads(op.open(WORKER + "/?format=1&source=full", timeout=60).read().decode("utf-8"))
sites = cfg["api_site"]
removed = 0
for k, v in sites.items():
    if v.pop("detail", None):
        removed += 1
print("源数:", len(sites), "| 去掉 detail 字段:", removed,
      "| 全部带代理前缀:", all(str(v.get("api", "")).startswith(WORKER) for v in sites.values()))


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with op.open(req, timeout=90) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


print("登录:", post("/api/login", {"username": USERNAME, "password": PASSWORD})[1][:60])
st, body = post("/api/admin/config_file", {
    "configFile": json.dumps(cfg, ensure_ascii=False),
    "subscriptionUrl": "",
    "autoUpdate": False,
})
print("写入:", st, body[:200])

with op.open(BASE + "/api/admin/config", timeout=60) as r:
    ac = json.loads(r.read().decode("utf-8")).get("Config", {})
cf = json.loads(ac.get("ConfigFile") or "{}")
apis = list(cf.get("api_site", {}).values())
print("回读 源数:", len(apis),
      "| 带代理:", sum(1 for a in apis if str(a.get("api", "")).startswith(WORKER)),
      "| 残留detail:", sum(1 for a in apis if a.get("detail")))
print("订阅:", ac.get("ConfigSubscribtion"))

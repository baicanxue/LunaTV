# -*- coding: utf-8 -*-
"""登录后验证搜索接口（正确的参数是 q，不是 wd）"""
import json
import urllib.request
import urllib.parse
import http.cookiejar
import ssl
import sys

BASE = "https://lunatv-three-rosy.vercel.app"
ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(
    urllib.request.HTTPCookieProcessor(cj),
    urllib.request.HTTPSHandler(context=ctx),
)
opener.addheaders = [("User-Agent", "Mozilla/5.0")]


def post(path, payload):
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(BASE + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with opener.open(req, timeout=40) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)


def get(path):
    req = urllib.request.Request(BASE + path, headers={"Content-Type": "application/json"})
    try:
        with opener.open(req, timeout=90) as resp:
            return resp.status, resp.read().decode("utf-8", "replace")
    except Exception as e:
        return 0, str(e)


st, body = post("/api/login", {"username": "baicanxue", "password": "pf2379417"})
print("登录:", st, body[:120])

for kw in ["狂飙", "庆余年"]:
    st, body = get("/api/search?q=" + urllib.parse.quote(kw))
    try:
        j = json.loads(body)
        res = j.get("results", []) if isinstance(j, dict) else []
        srcs = sorted({r.get("source_name") or r.get("source") or "?" for r in res})
        print(f"搜索[{kw}]: HTTP {st} 结果 {len(res)} 条 | 命中源 {len(srcs)} 个: {srcs[:12]}")
        for r in res[:3]:
            print("   -", r.get("title"), "|", r.get("source_name"), "|", r.get("year"))
    except Exception:
        print(f"搜索[{kw}]: HTTP {st} 返回: {body[:300]}")

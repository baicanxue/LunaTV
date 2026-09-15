// LunaTV 订阅中转（自给自足版）：
// 取作者配置 JSON -> 去掉 detail 字段(源站详情页爬取会 403) -> api 全部换成 CORSAPI 代理前缀 -> Base58 输出
// 用作 LunaTV 后台订阅地址，保持每日自动更新
const PROXY = 'https://lunatv-corsapi.baicanxue.workers.dev/?url='
const JSON_SOURCES = {
  jin18: 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jin18.json',
  jingjian: 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/jingjian.json',
  full: 'https://raw.githubusercontent.com/hafrey1/LunaTV-config/refs/heads/main/LunaTV-config.json',
}
const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

function base58Encode(str) {
  const bytes = new TextEncoder().encode(str)
  let intVal = 0n
  for (const b of bytes) intVal = (intVal << 8n) + BigInt(b)
  let result = ''
  while (intVal > 0n) {
    result = BASE58_ALPHABET[Number(intVal % 58n)] + result
    intVal = intVal / 58n
  }
  for (const b of bytes) {
    if (b === 0) result = BASE58_ALPHABET[0] + result
    else break
  }
  return result
}

export default {
  async fetch(request) {
    const url = new URL(request.url)
    const key = url.searchParams.get('source') || 'full'
    const src = JSON_SOURCES[key] || JSON_SOURCES.full
    try {
      const res = await fetch(src, { cf: { cacheTtl: 1800, cacheEverything: true } })
      if (!res.ok) {
        return new Response(JSON.stringify({ error: 'upstream ' + res.status }), {
          status: 502, headers: { 'content-type': 'application/json' },
        })
      }
      const cfg = await res.json()
      const sites = cfg.api_site || {}
      let stripped = 0
      let proxied = 0
      for (const k of Object.keys(sites)) {
        const s = sites[k]
        if (!s || typeof s !== 'object') continue
        if (s.detail !== undefined) { delete s.detail; stripped++ }
        let api = String(s.api || '')
        const i = api.indexOf('?url=')
        if (i >= 0) api = api.slice(0, i)
        if (api) { s.api = PROXY + api; proxied++ }
      }
      const body = JSON.stringify(cfg)
      const headers = { 'access-control-allow-origin': '*' }
      if (url.searchParams.has('raw')) {
        return new Response(body, { headers: { ...headers, 'content-type': 'application/json' } })
      }
      console.log('source=' + key + ' sites=' + Object.keys(sites).length + ' proxied=' + proxied + ' detail_removed=' + stripped)
      return new Response(base58Encode(body), {
        headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' },
      })
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 500, headers: { 'content-type': 'application/json' },
      })
    }
  },
}

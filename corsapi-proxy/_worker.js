// LunaTV 国内加速反代：用户 -> Cloudflare 边缘(国内电信/联通可直连) -> Vercel 源站
// 静态资源走 CF 缓存，动态 API 透传；Set-Cookie / Location 里的源站域名会改回访问域名
const ORIGIN = 'https://lunatv-three-rosy.vercel.app';
const ORIGIN_HOST = new URL(ORIGIN).host;

const STRIP_REQ = ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-host', 'x-forwarded-proto', 'x-real-ip'];
const STRIP_RES = ['content-security-policy', 'content-security-policy-report-only', 'x-frame-options', 'strict-transport-security', 'alt-svc'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/__proxy_health') {
      return new Response('ok', { headers: { 'content-type': 'text/plain' } });
    }

    const target = new URL(url.pathname + url.search, ORIGIN);

    // 静态资源用 CF 缓存兜住（首页/JS/CSS 秒开）
    const isStatic = url.pathname.startsWith('/_next/static/') || /\.(js|css|woff2?|png|jpe?g|svg|ico|webp|gif)$/i.test(url.pathname);
    const cache = caches.default;
    if (isStatic && request.method === 'GET') {
      const hit = await cache.match(request);
      if (hit) return hit;
    }

    const headers = new Headers(request.headers);
    for (const h of STRIP_REQ) headers.delete(h);
    headers.set('host', ORIGIN_HOST);

    let body;
    if (request.method !== 'GET' && request.method !== 'HEAD') body = request.body;

    let resp;
    try {
      resp = await fetch(target, {
        method: request.method,
        headers,
        body,
        redirect: 'manual',
        cf: { cacheEverything: false },
      });
    } catch (e) {
      return new Response('proxy error: ' + (e && e.message), { status: 502 });
    }

    const out = new Headers(resp.headers);
    for (const h of STRIP_RES) out.delete(h);

    // 源站域名的 Location 改回访问域名
    const loc = out.get('location');
    if (loc && loc.includes(ORIGIN_HOST)) out.set('location', loc.split(ORIGIN_HOST).join(url.host));

    // Set-Cookie 里带源站域名的 domain 去掉，否则浏览器拒收
    const cookies = resp.headers.getSetCookie ? resp.headers.getSetCookie() : [];
    if (cookies.length) {
      out.delete('set-cookie');
      for (const c of cookies) {
        out.append('set-cookie', c.replace(/;\s*Domain=[^;]+/gi, ''));
      }
    }

    const result = new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: out });

    if (isStatic && request.method === 'GET' && result.status === 200) {
      const cacheable = new Response(result.body, result);
      cacheable.headers.set('cache-control', 'public, max-age=31536000, immutable');
      ctx.waitUntil(cache.put(request, cacheable.clone()));
      return cacheable;
    }
    return result;
  },
};

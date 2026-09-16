/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";
import { getBaseUrl, resolveUrl } from "@/lib/live";

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  const allowCORS = searchParams.get('allowCORS') === 'true';
  const source = searchParams.get('moontv-source');
  if (!url) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }

  const config = await getConfig();
  const liveSource = source
    ? config.LiveConfig?.find((s: any) => s.key === source)
    : undefined;
  // 直播源会带 moontv-source；点播（影视）不带，用通用 UA 即可
  const ua = liveSource?.ua || 'AptvPlayer/1.4.10';

  let response: Response | null = null;
  let responseUsed = false;

  try {
    const decodedUrl = url;
    response = await fetch(decodedUrl, {
      cache: 'no-cache',
      redirect: 'follow',
      credentials: 'same-origin',
      headers: {
        'User-Agent': ua,
      },
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch m3u8' }, { status: 500 });
    }

    const contentType = response.headers.get('Content-Type') || '';
    // rewrite m3u8
    if (contentType.toLowerCase().includes('mpegurl') || contentType.toLowerCase().includes('octet-stream')) {
      // 获取最终的响应URL（处理重定向后的URL）
      const finalUrl = response.url;
      const m3u8Content = await response.text();
      responseUsed = true; // 标记 response 已被使用

      // 使用最终的响应URL作为baseUrl，而不是原始的请求URL
      const baseUrl = getBaseUrl(finalUrl);

      // 剥掉片头广告段（广告与正片之间用 #EXT-X-DISCONTINUITY 分隔，
      // 播放器切到正片时密钥方式变化容易断，表现为广告播完就从头重播、正片出不来）
      const strippedContent = stripPreRollAd(m3u8Content);

      // 重写 M3U8 内容
      const modifiedContent = rewriteM3U8Content(strippedContent, baseUrl, allowCORS);

      const headers = new Headers();
      headers.set('Content-Type', contentType);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept');
      // 点播 m3u8 内容稳定，交给 Vercel CDN 边缘缓存（免去每次唤醒函数 + 绕海外节点）；
      // 直播源的播放列表是滚动的，必须不缓存
      if (liveSource) {
        headers.set('Cache-Control', 'no-cache');
      } else {
        headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
        headers.set('CDN-Cache-Control', 'public, s-maxage=300');
        headers.set('Vercel-CDN-Cache-Control', 'public, s-maxage=300');
      }
      headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
      return new Response(modifiedContent, { headers });
    }
    // just proxy
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'application/vnd.apple.mpegurl');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Range, Origin, Accept');
    headers.set('Cache-Control',
      liveSource ? 'no-cache' : 'public, max-age=300, s-maxage=300');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range');

    // 直接返回视频流
    return new Response(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch m3u8' }, { status: 500 });
  } finally {
    // 确保 response 被正确关闭以释放资源
    if (response && !responseUsed) {
      try {
        response.body?.cancel();
      } catch (error) {
        // 忽略关闭时的错误
        console.warn('Failed to close response body:', error);
      }
    }
  }
}

/**
 * 去掉 HLS 片头广告段。
 *
 * 部分采集源把「广告段（不加密）+ #EXT-X-DISCONTINUITY + 正片（AES-128 加密）」
 * 拼在同一个 media playlist 里。播放器切到正片时要换密钥，容易在这里失败，
 * 于是认为视频提前结束，表现为「广告播完就从头重播、正片出不来」。
 * 这里把 DISCONTINUITY 之前的内容整段丢弃，只保留正片。
 */
function stripPreRollAd(content: string): string {
  const marker = '#EXT-X-DISCONTINUITY';
  const idx = content.indexOf(marker);
  if (idx < 0) {
    return content;
  }
  // 只有「片头段很短（像广告）且后面还有内容」时才剥。
  // 有些源是正片在前、广告夹在中间，盲剥会把正片前半段扔掉。
  const headSeconds = [...content.slice(0, idx).matchAll(/#EXTINF:([\d.]+)/g)]
    .map((m) => parseFloat(m[1]))
    .reduce((a, b) => a + b, 0);
  if (headSeconds <= 0 || headSeconds > 90) {
    return content;
  }
  const firstLineEnd = content.indexOf('\n');
  const head =
    firstLineEnd >= 0 ? content.slice(0, firstLineEnd + 1) : '#EXTM3U\n';
  const targetDuration =
    content.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1] ?? '6';
  const tail = content.slice(idx + marker.length);
  return (
    head +
    `#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${targetDuration}\n` +
    `#EXT-X-PLAYLIST-TYPE:VOD\n#EXT-X-MEDIA-SEQUENCE:0` +
    tail
  );
}

function rewriteM3U8Content(content: string, baseUrl: string, allowCORS: boolean) {
  // 使用站内相对路径，播放列表中的地址会相对于播放列表自身的 URL 解析。
  // 这样既不依赖可伪造的 Host 头，也不会在 HTTPS 站点下拼出 http:// 造成混合内容被拦截。
  const proxyBase = '/api/proxy';

  const lines = content.split('\n');
  const rewrittenLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();

    // 处理 TS 片段 URL 和其他媒体文件
    if (line && !line.startsWith('#')) {
      const resolvedUrl = resolveUrl(baseUrl, line);
      const proxyUrl = allowCORS ? resolvedUrl : `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}`;
      rewrittenLines.push(proxyUrl);
      continue;
    }

    // 处理 EXT-X-MAP 标签中的 URI
    if (line.startsWith('#EXT-X-MAP:')) {
      line = rewriteMapUri(line, baseUrl, proxyBase);
    }

    // 处理 EXT-X-KEY 标签中的 URI
    if (line.startsWith('#EXT-X-KEY:')) {
      line = rewriteKeyUri(line, baseUrl, proxyBase);
    }

    // 处理嵌套的 M3U8 文件 (EXT-X-STREAM-INF)
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      rewrittenLines.push(line);
      // 下一行通常是 M3U8 URL
      if (i + 1 < lines.length) {
        i++;
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#')) {
          const resolvedUrl = resolveUrl(baseUrl, nextLine);
          const proxyUrl = `${proxyBase}/m3u8?url=${encodeURIComponent(resolvedUrl)}${
            allowCORS ? '&allowCORS=true' : ''
          }`;
          rewrittenLines.push(proxyUrl);
        } else {
          rewrittenLines.push(nextLine);
        }
      }
      continue;
    }

    rewrittenLines.push(line);
  }

  return rewrittenLines.join('\n');
}

function rewriteMapUri(line: string, baseUrl: string, proxyBase: string) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    const originalUri = uriMatch[1];
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/segment?url=${encodeURIComponent(resolvedUrl)}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}

function rewriteKeyUri(line: string, baseUrl: string, proxyBase: string) {
  const uriMatch = line.match(/URI="([^"]+)"/);
  if (uriMatch) {
    const originalUri = uriMatch[1];
    const resolvedUrl = resolveUrl(baseUrl, originalUri);
    const proxyUrl = `${proxyBase}/key?url=${encodeURIComponent(resolvedUrl)}`;
    return line.replace(uriMatch[0], `URI="${proxyUrl}"`);
  }
  return line;
}
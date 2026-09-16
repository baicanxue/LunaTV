import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

/**
 * Bangumi 反向代理
 * 国内直连 api.bgm.tv 会被 RST，客户端统一走这里。
 *   /api/bgm/calendar          -> https://api.bgm.tv/calendar
 *   /api/bgm/v0/subjects/1234  -> https://api.bgm.tv/v0/subjects/1234
 */
export async function GET(
  request: NextRequest,
  context: { params: { path?: string[] } }
) {
  // Next 15 里 params 是 Promise，Next 14 是普通对象；await 对两者都成立
  const resolved = await context.params;
  const sub = (resolved?.path ?? []).join('/');
  if (!sub) {
    return NextResponse.json({ error: '缺少路径' }, { status: 400 });
  }

  const target = new URL(`https://api.bgm.tv/${sub}`);
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(target.toString(), {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
      },
    });
    clearTimeout(timeoutId);

    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'Content-Type':
          res.headers.get('content-type') || 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=1800, s-maxage=1800',
        'CDN-Cache-Control': 'public, s-maxage=1800',
      },
    });
  } catch (error) {
    clearTimeout(timeoutId);
    return NextResponse.json(
      { error: 'Bangumi 代理失败', details: (error as Error).message },
      { status: 502 }
    );
  }
}

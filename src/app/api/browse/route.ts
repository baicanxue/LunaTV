import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';
import { getAvailableApiSites } from '@/lib/config';

export const runtime = 'nodejs';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

/**
 * 分类浏览接口（按源站分类翻页）
 * ?sources=1                      -> 返回可用的源列表
 * ?source=<key>&classes=1         -> 返回该源的分类列表
 * ?source=<key>&t=<type_id>&pg=1  -> 返回该分类的影片列表
 */
export async function GET(request: NextRequest) {
  const authInfo = getAuthInfoFromCookie(request);
  if (!authInfo || !authInfo.username) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);

  if (searchParams.get('sources') === '1') {
    const sites = await getAvailableApiSites(authInfo.username);
    return NextResponse.json({
      sources: sites.map((s) => ({
        key: s.key,
        name: s.name,
        adult: /🔞/.test(s.name || ''),
      })),
    });
  }

  const sourceCode = searchParams.get('source');
  if (!sourceCode) {
    return NextResponse.json({ error: '缺少 source' }, { status: 400 });
  }

  const sites = await getAvailableApiSites(authInfo.username);
  const site = sites.find((s) => s.key === sourceCode);
  if (!site) {
    return NextResponse.json({ error: '无效的来源' }, { status: 400 });
  }

  const isClasses = searchParams.get('classes') === '1';
  const typeId = searchParams.get('t') || '';
  const page = searchParams.get('pg') || '1';
  const target = isClasses
    ? `${site.api}?ac=list`
    : `${site.api}?ac=videolist&t=${encodeURIComponent(typeId)}&pg=${page}`;

  try {
    const res = await fetch(target, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `上游返回 ${res.status}` },
        { status: 502 }
      );
    }
    const data: any = await res.json();

    if (isClasses) {
      const raw = data.class || data.classes || [];
      const classes = (Array.isArray(raw) ? raw : [])
        .map((c: any) => ({
          id: String(c.type_id ?? c.id ?? ''),
          name: String(c.type_name ?? c.name ?? ''),
        }))
        .filter((c: { id: string }) => c.id);
      return NextResponse.json({ classes });
    }

    const list = (Array.isArray(data.list) ? data.list : []).map((v: any) => ({
      id: String(v.vod_id ?? ''),
      title: String(v.vod_name ?? ''),
      poster: String(v.vod_pic ?? ''),
      remarks: String(v.vod_remarks ?? ''),
      year: String(v.vod_year ?? ''),
      source: site.key,
      source_name: site.name,
    }));
    return NextResponse.json({
      list,
      page: Number(page),
      pagecount: Number(data.pagecount || data.total_page || 1),
      total: Number(data.total || 0),
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    );
  }
}

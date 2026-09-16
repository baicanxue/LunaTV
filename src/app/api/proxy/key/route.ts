/* eslint-disable no-console,@typescript-eslint/no-explicit-any */

import { NextResponse } from "next/server";

import { getConfig } from "@/lib/config";

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
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

  try {
    const decodedUrl = url;
    console.log(decodedUrl);
    const response = await fetch(decodedUrl, {
      headers: {
        'User-Agent': ua,
      },
    });
    if (!response.ok) {
      return NextResponse.json({ error: 'Failed to fetch key' }, { status: 500 });
    }
    const keyData = await response.arrayBuffer();
    return new Response(keyData, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Cache-Control': 'public, max-age=3600'
      },
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch key' }, { status: 500 });
  }
}
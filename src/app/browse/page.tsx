/* eslint-disable @next/next/no-img-element, @typescript-eslint/no-explicit-any, no-console */
'use client';

import { Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

import PageLayout from '@/components/PageLayout';

interface SourceItem {
  key: string;
  name: string;
  adult: boolean;
}
interface ClassItem {
  id: string;
  name: string;
}
interface VideoItem {
  id: string;
  title: string;
  poster: string;
  remarks: string;
  year: string;
  source: string;
  source_name: string;
}

function BrowseClient() {
  const router = useRouter();
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [onlyAdult, setOnlyAdult] = useState(true);
  const [source, setSource] = useState('');
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [type, setType] = useState('');
  const [items, setItems] = useState<VideoItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // 源列表
  useEffect(() => {
    fetch('/api/browse?sources=1')
      .then((r) => r.json())
      .then((d) => {
        if (d.sources) {
          setSources(d.sources);
          const first = d.sources.find((s: SourceItem) => s.adult) || d.sources[0];
          if (first) setSource(first.key);
        }
      })
      .catch((e) => setError(String(e)));
  }, []);

  // 分类列表
  useEffect(() => {
    if (!source) return;
    setClasses([]);
    setType('');
    setItems([]);
    fetch(`/api/browse?source=${encodeURIComponent(source)}&classes=1`)
      .then((r) => r.json())
      .then((d) => {
        if (d.classes?.length) {
          setClasses(d.classes);
          setType(d.classes[0].id);
        } else {
          setError('该源没有返回分类');
        }
      })
      .catch((e) => setError(String(e)));
  }, [source]);

  const load = useCallback(
    async (typeId: string, pg: number, append: boolean) => {
      if (!source || !typeId) return;
      setLoading(true);
      setError('');
      try {
        const r = await fetch(
          `/api/browse?source=${encodeURIComponent(source)}&t=${encodeURIComponent(typeId)}&pg=${pg}`
        );
        const d = await r.json();
        if (d.error) {
          setError(d.error);
        } else {
          setItems((prev) => (append ? [...prev, ...d.list] : d.list));
          setPageCount(d.pagecount || 1);
        }
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    },
    [source]
  );

  useEffect(() => {
    if (type) {
      setPage(1);
      load(type, 1, false);
    }
  }, [type]);

  const shown = onlyAdult ? sources.filter((s) => s.adult) : sources;

  return (
    <PageLayout activePath='/browse'>
      <div className='px-4 py-6 md:px-8 md:py-10 max-w-[1400px] mx-auto'>
        <div className='flex items-center justify-between mb-4'>
          <h1 className='text-xl font-semibold'>分类浏览</h1>
          <button
            onClick={() => setOnlyAdult((v) => !v)}
            className='text-sm px-3 py-1 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
          >
            {onlyAdult ? '只看 18+ 源' : '显示全部源'}
          </button>
        </div>

        {/* 源选择 */}
        <div className='flex flex-wrap gap-2 mb-3'>
          {shown.map((s) => (
            <button
              key={s.key}
              onClick={() => setSource(s.key)}
              className={`text-sm px-3 py-1 rounded-full border transition-colors ${
                source === s.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* 分类选择 */}
        <div className='flex flex-wrap gap-2 mb-6 max-h-40 overflow-y-auto'>
          {classes.map((c) => (
            <button
              key={c.id}
              onClick={() => setType(c.id)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                type === c.id
                  ? 'bg-green-600 text-white border-green-600'
                  : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        {error && (
          <div className='mb-4 text-sm text-red-500 flex items-center gap-2'>
            <X size={14} /> {error}
          </div>
        )}

        {/* 影片网格 */}
        <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4'>
          {items.map((v) => (
            <div
              key={v.source + v.id}
              onClick={() =>
                router.push(
                  `/play?source=${encodeURIComponent(v.source)}&id=${encodeURIComponent(v.id)}&title=${encodeURIComponent(v.title)}`
                )
              }
              className='cursor-pointer group'
            >
              <div className='relative aspect-[2/3] rounded-lg overflow-hidden bg-gray-200 dark:bg-gray-800'>
                {v.poster ? (
                  <img
                    src={v.poster}
                    alt={v.title}
                    loading='lazy'
                    className='w-full h-full object-cover group-hover:scale-105 transition-transform'
                  />
                ) : null}
                {v.remarks && (
                  <span className='absolute bottom-1 left-1 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white'>
                    {v.remarks}
                  </span>
                )}
              </div>
              <div className='mt-1.5 text-xs line-clamp-2'>{v.title}</div>
              <div className='text-[10px] text-gray-400'>{v.source_name}</div>
            </div>
          ))}
        </div>

        {loading && (
          <div className='flex justify-center py-8'>
            <Loader2 className='animate-spin' />
          </div>
        )}

        {!loading && page < pageCount && items.length > 0 && (
          <div className='flex justify-center py-6'>
            <button
              onClick={() => {
                const next = page + 1;
                setPage(next);
                load(type, next, true);
              }}
              className='px-5 py-2 rounded-full border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800'
            >
              加载更多（{page}/{pageCount}）
            </button>
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className='text-center text-sm text-gray-400 py-10'>暂无内容</div>
        )}
      </div>
    </PageLayout>
  );
}

export default function BrowsePage() {
  return (
    <Suspense fallback={null}>
      <BrowseClient />
    </Suspense>
  );
}

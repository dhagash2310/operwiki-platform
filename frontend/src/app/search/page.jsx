'use client';
import { useState, useEffect, useRef } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { Search, FileText, ChevronRight, Loader2, Zap } from 'lucide-react';
import Link from 'next/link';

export default function SearchPage() {
  const [query, setQuery]     = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef  = useRef(null);
  const debounce  = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setSearched(false); return; }
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => runSearch(query), 350);
    return () => clearTimeout(debounce.current);
  }, [query]);

  const runSearch = async (q) => {
    setLoading(true);
    const token = localStorage.getItem('operwiki_token');
    const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    try {
      const res  = await fetch(`${base}/search?q=${encodeURIComponent(q)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
      setSearched(true);
    } catch {
      // fallback
      try {
        const res  = await fetch(`${base}/documents?search=${encodeURIComponent(q)}&limit=20`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setResults((data.data || []).map(d => ({ documentId: d.id, title: d.title, slug: d.slug, category: d.category_name })));
        setSearched(true);
      } catch { setResults([]); }
    } finally { setLoading(false); }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-mono text-lg font-600 text-zinc-100">Search</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">Full-text search across all documentation</p>
        </div>

        {/* Search input */}
        <div className="relative mb-3">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600" />
          {loading && <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-amber-400 animate-spin" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search documentation..."
            className="w-full bg-[#111113] border border-zinc-800 focus:border-amber-500/40 rounded-xl pl-11 pr-12 py-3.5 text-[14px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors"
          />
        </div>

        {/* AI suggestion */}
        {query.trim().length > 3 && (
          <div className="flex items-center gap-2 text-[11px] font-mono text-amber-500/60 mb-6">
            <Zap size={10} />
            For direct answers, try the{' '}
            <Link href="/chat" className="text-amber-500 hover:text-amber-400 underline underline-offset-2">AI assistant</Link>
          </div>
        )}

        {/* Results count */}
        {searched && !loading && (
          <p className="text-[11px] font-mono text-zinc-600 mb-3 uppercase tracking-wider">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </p>
        )}

        {/* No results */}
        {searched && !loading && results.length === 0 && (
          <div className="text-center py-16">
            <Search size={32} className="mx-auto mb-3 text-zinc-800" />
            <p className="font-mono text-[13px] text-zinc-600">Nothing found</p>
            <Link href="/chat" className="text-[12px] text-amber-500 hover:text-amber-400 font-mono mt-2 inline-block animated-underline">
              Ask the AI instead →
            </Link>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-1.5">
            {results.map((r, i) => (
              <Link key={i} href={`/docs/${r.slug || r.documentId}`}
                className="group flex items-start gap-3 p-4 bg-[#111113] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-all">
                <FileText size={14} className="text-zinc-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] text-zinc-200 font-medium group-hover:text-white transition-colors">{r.title}</p>
                  {r.excerpt && (
                    <p className="text-[11px] text-zinc-600 mt-1 line-clamp-2 leading-relaxed">
                      {r.excerpt.replace(/[#*`]/g, '')}
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    {r.category && <span className="text-[10px] font-mono text-zinc-700">{r.category}</span>}
                    {r.score    && <span className="text-[10px] font-mono text-zinc-700">{Math.round(r.score * 100)}% match</span>}
                  </div>
                </div>
                <ChevronRight size={14} className="text-zinc-700 group-hover:text-zinc-400 flex-shrink-0 mt-0.5 transition-colors" />
              </Link>
            ))}
          </div>
        )}

        {/* Empty start state */}
        {!query && (
          <div className="text-center py-16 text-zinc-800">
            <Search size={40} className="mx-auto mb-3" />
            <p className="font-mono text-[12px]">START TYPING TO SEARCH</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

'use client';
import { useState, useEffect } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import {
  Server, Layers, Activity, Code, BookOpen, Shield,
  FileText, ChevronRight, RefreshCw, AlertTriangle, Plus,
} from 'lucide-react';
import Link from 'next/link';

const CATEGORY_META = {
  'it-infrastructure': { icon: Server,   color: 'text-blue-400',   bg: 'bg-blue-500/10',   border: 'border-blue-500/20' },
  'citrix':            { icon: Layers,   color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  'monitoring':        { icon: Activity, color: 'text-green-400',  bg: 'bg-green-500/10',  border: 'border-green-500/20' },
  'app-support':       { icon: Code,     color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20' },
  'ops-processes':     { icon: BookOpen, color: 'text-cyan-400',   bg: 'bg-cyan-500/10',   border: 'border-cyan-500/20' },
  'security':          { icon: Shield,   color: 'text-red-400',    bg: 'bg-red-500/10',    border: 'border-red-500/20' },
};

const STATUS_DOT = {
  approved: 'bg-green-500', draft: 'bg-amber-500', in_review: 'bg-blue-500',
};
const STATUS_LABEL = {
  approved: 'Published', draft: 'Draft', in_review: 'In Review',
};

function DocRow({ doc }) {
  return (
    <Link href={`/docs/${doc.slug}`}
      className="group flex items-center gap-3 px-4 py-3 bg-[#111113] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-all">
      <span className={`status-dot ${STATUS_DOT[doc.status] || 'bg-zinc-600'} flex-shrink-0`} />
      <span className="flex-1 text-[13px] text-zinc-300 group-hover:text-white transition-colors truncate">{doc.title}</span>
      <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
        doc.status === 'approved' ? 'text-green-500/70' :
        doc.status === 'in_review' ? 'text-blue-400/70' : 'text-amber-500/70'
      }`}>{STATUS_LABEL[doc.status] || doc.status}</span>
      <span className="text-[11px] font-mono text-zinc-700 hidden sm:block">
        {new Date(doc.updated_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short' })}
      </span>
      <ChevronRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
    </Link>
  );
}

export default function DocsPage() {
  const [categories, setCategories]     = useState([]);
  const [docsByCategory, setDocsByCategory] = useState({});
  const [uncategorised, setUncategorised] = useState([]);
  const [allDocs, setAllDocs]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [view, setView]                 = useState('categories'); // 'categories' | 'all'

  const load = async () => {
    setLoading(true); setError('');
    const token = localStorage.getItem('operwiki_token');
    if (!token) { window.location.href = '/login'; return; }
    const base    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [catsRes, docsRes] = await Promise.all([
        fetch(`${base}/categories`, { headers }),
        fetch(`${base}/documents?limit=200`, { headers }),
      ]);
      if (catsRes.status === 401 || docsRes.status === 401) { window.location.href = '/login'; return; }
      const cats     = await catsRes.json();
      const docsJson = await docsRes.json();
      const docs     = Array.isArray(docsJson) ? docsJson : (docsJson.data || []);

      const grouped = {};
      const nocat   = [];
      for (const doc of docs) {
        if (doc.category_slug) {
          if (!grouped[doc.category_slug]) grouped[doc.category_slug] = [];
          grouped[doc.category_slug].push(doc);
        } else {
          nocat.push(doc);
        }
      }
      setCategories(Array.isArray(cats) ? cats : []);
      setDocsByCategory(grouped);
      setUncategorised(nocat);
      setAllDocs(docs);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const totalDocs = allDocs.length;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-mono text-lg font-600 text-zinc-100">Knowledge Base</h1>
            <p className="text-[13px] text-zinc-500 mt-0.5">
              {loading ? 'Loading…' : `${totalDocs} document${totalDocs !== 1 ? 's' : ''} across ${categories.length} categories`}
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={load} className="p-2 text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800 rounded-md transition-colors" title="Refresh">
              <RefreshCw size={14} />
            </button>
            <Link href="/migration"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-md text-[12px] font-mono font-600 transition-colors">
              <Plus size={13} /> Import
            </Link>
          </div>
        </div>

        {/* View tabs */}
        <div className="flex gap-1 mb-6 border-b border-zinc-800">
          {[
            { id: 'categories', label: 'Categories' },
            { id: 'all',        label: `All Documents ${totalDocs > 0 ? `(${totalDocs})` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => setView(t.id)}
              className={`px-4 py-2 text-[12px] font-mono uppercase tracking-wide transition-colors relative ${
                view === t.id ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
              }`}>
              {t.label}
              {view === t.id && <span className="absolute bottom-0 left-0 right-0 h-px bg-amber-500" />}
            </button>
          ))}
        </div>

        {error && (
          <div className="flex items-center gap-2 text-[13px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 mb-6">
            <AlertTriangle size={14} /> {error}
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-28 bg-[#111113] rounded-xl animate-pulse border border-zinc-800/50" />
            ))}
          </div>
        )}

        {/* CATEGORIES VIEW */}
        {!loading && view === 'categories' && (
          <>
            {/* Category cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
              {categories.map(cat => {
                const meta  = CATEGORY_META[cat.slug] || { icon: FileText, color: 'text-zinc-400', bg: 'bg-zinc-800', border: 'border-zinc-700' };
                const Icon  = meta.icon;
                const docs  = docsByCategory[cat.slug] || [];
                return (
                  <Link key={cat.id} href={`/docs/category/${cat.slug}`}
                    className="group flex flex-col p-4 bg-[#111113] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all">
                    <div className={`w-8 h-8 rounded-lg border flex items-center justify-center mb-3 ${meta.bg} ${meta.border}`}>
                      <Icon size={15} className={meta.color} strokeWidth={1.75} />
                    </div>
                    <div className="flex-1">
                      <div className="text-[13px] font-medium text-zinc-200 group-hover:text-white transition-colors leading-tight">{cat.name}</div>
                      {cat.description && (
                        <div className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed line-clamp-2">{cat.description}</div>
                      )}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-zinc-800">
                      <span className="font-mono text-[12px]">
                        <span className={docs.length > 0 ? meta.color : 'text-zinc-700'}>{docs.length}</span>
                        <span className="text-zinc-700"> doc{docs.length !== 1 ? 's' : ''}</span>
                      </span>
                      <ChevronRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors" />
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Uncategorised — shown as a section, not hidden */}
            {uncategorised.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[11px] font-mono text-zinc-500 uppercase tracking-wider">Uncategorised</span>
                  <span className="text-[11px] font-mono text-zinc-700">— {uncategorised.length} doc{uncategorised.length !== 1 ? 's' : ''}</span>
                  <span className="text-[11px] text-zinc-700 font-mono">·</span>
                  <Link href="/migration" className="text-[11px] font-mono text-amber-500/70 hover:text-amber-400 transition-colors">
                    assign a category on import →
                  </Link>
                </div>
                <div className="space-y-1">
                  {uncategorised.map(doc => <DocRow key={doc.id} doc={doc} />)}
                </div>
              </div>
            )}

            {/* Truly empty */}
            {totalDocs === 0 && (
              <div className="text-center py-20">
                <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                  <FileText size={20} className="text-zinc-700" />
                </div>
                <p className="font-mono text-[13px] text-zinc-500 mb-1">No documents yet</p>
                <p className="text-[12px] text-zinc-700 mb-4">Import from MediaWiki to populate the knowledge base</p>
                <Link href="/migration"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-md text-[12px] font-mono font-600 transition-colors">
                  <Plus size={13} /> Import Documents
                </Link>
              </div>
            )}
          </>
        )}

        {/* ALL DOCS VIEW — flat list, every imported doc visible */}
        {!loading && view === 'all' && (
          <>
            {allDocs.length === 0 ? (
              <div className="text-center py-20 text-zinc-600 font-mono text-[13px]">No documents yet.</div>
            ) : (
              <div className="space-y-1">
                {allDocs.map(doc => <DocRow key={doc.id} doc={doc} />)}
              </div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}

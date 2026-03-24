'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import AppLayout from '../../../../components/layout/AppLayout';
import { FileText, ChevronRight, Plus, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

const STATUS_DOT = { approved:'bg-green-500', draft:'bg-amber-500', in_review:'bg-blue-500' };
const STATUS_LABEL = { approved:'Published', draft:'Draft', in_review:'In Review' };

export default function CategoryPage() {
  const { slug }  = useParams();
  const [docs, setDocs]         = useState([]);
  const [category, setCategory] = useState(null);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!slug) return;
    const token   = localStorage.getItem('operwiki_token');
    if (!token) { window.location.href = '/login'; return; }
    const base    = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    const headers = { Authorization: `Bearer ${token}` };

    Promise.all([
      fetch(`${base}/documents?category=${slug}&limit=100`, { headers }),
      fetch(`${base}/categories`, { headers }),
    ]).then(async ([docsRes, catsRes]) => {
      const docsJson = await docsRes.json();
      const catsJson = await catsRes.json();
      setDocs(Array.isArray(docsJson) ? docsJson : (docsJson.data || []));
      const cat = (Array.isArray(catsJson) ? catsJson : []).find(c => c.slug === slug);
      setCategory(cat);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Back + breadcrumb */}
        <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-600 mb-6">
          <Link href="/docs" className="flex items-center gap-1 hover:text-zinc-400 transition-colors">
            <ArrowLeft size={11} /> DOCS
          </Link>
          <span>/</span>
          <span className="text-zinc-500 uppercase">{category?.name || slug}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="font-mono text-lg font-600 text-zinc-100">{category?.name || slug}</h1>
            {category?.description && (
              <p className="text-[13px] text-zinc-500 mt-0.5">{category.description}</p>
            )}
            <p className="text-[12px] font-mono text-zinc-600 mt-1">
              {loading ? '…' : `${docs.length} document${docs.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <Link href="/migration"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-[12px] font-mono text-zinc-300 transition-colors">
            <Plus size={12} /> Import more
          </Link>
        </div>

        {/* Loading */}
        {loading && (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-[#111113] rounded-lg animate-pulse border border-zinc-800/50" />)}
          </div>
        )}

        {/* Empty */}
        {!loading && docs.length === 0 && (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
              <FileText size={20} className="text-zinc-700" />
            </div>
            <p className="font-mono text-[13px] text-zinc-500 mb-1">No documents in this category</p>
            <Link href="/migration"
              className="text-[12px] text-amber-500 hover:text-amber-400 font-mono animated-underline">
              Import documents and assign this category →
            </Link>
          </div>
        )}

        {/* Doc list */}
        {!loading && docs.length > 0 && (
          <div className="space-y-1">
            {docs.map(doc => (
              <Link key={doc.id} href={`/docs/${doc.slug}`}
                className="group flex items-center gap-3 px-4 py-3 bg-[#111113] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 rounded-lg transition-all">
                <span className={`status-dot ${STATUS_DOT[doc.status] || 'bg-zinc-600'} flex-shrink-0`} />
                <span className="flex-1 text-[13px] text-zinc-300 group-hover:text-white transition-colors truncate">{doc.title}</span>
                <span className={`text-[10px] font-mono ${
                  doc.status === 'approved' ? 'text-green-500/70' :
                  doc.status === 'in_review' ? 'text-blue-400/70' : 'text-amber-500/70'
                }`}>{STATUS_LABEL[doc.status] || doc.status}</span>
                <span className="text-[11px] font-mono text-zinc-700 hidden sm:block">
                  {new Date(doc.updated_at).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' })}
                </span>
                <ChevronRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors flex-shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

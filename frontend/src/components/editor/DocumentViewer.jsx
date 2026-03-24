'use client';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Clock, CheckCircle2, AlertTriangle, Edit3, History, Flag, ChevronRight, Shield } from 'lucide-react';
import Link from 'next/link';
import { api } from '../../lib/api';

const STATUS = {
  draft:      { label: 'Draft',      dot: 'bg-amber-500',  text: 'text-amber-400' },
  in_review:  { label: 'In Review',  dot: 'bg-blue-500',   text: 'text-blue-400' },
  approved:   { label: 'Published',  dot: 'bg-green-500',  text: 'text-green-400' },
  deprecated: { label: 'Deprecated', dot: 'bg-zinc-600',   text: 'text-zinc-500' },
};

export default function DocumentViewer({ doc, userRole }) {
  const [tab, setTab]         = useState('content');
  const [approving, setApproving] = useState(false);
  const [approved, setApproved]   = useState(doc?.status === 'approved');
  const s = STATUS[doc?.status] || STATUS.draft;

  const handleApprove = async () => {
    setApproving(true);
    try {
      await api.post(`/documents/${doc.id}/publish`);
      setApproved(true);
    } catch (e) { alert('Approval failed: ' + e.message); }
    finally { setApproving(false); }
  };

  if (!doc) return null;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-600 mb-6">
        <Link href="/docs" className="hover:text-zinc-400 transition-colors">DOCS</Link>
        <ChevronRight size={10} />
        {doc.category_name && (
          <>
            <Link href={`/docs/category/${doc.category_slug}`} className="hover:text-zinc-400 transition-colors uppercase">
              {doc.category_name}
            </Link>
            <ChevronRight size={10} />
          </>
        )}
        <span className="text-zinc-500 truncate uppercase">{doc.title}</span>
      </nav>

      {/* Document header */}
      <div className="bg-[#111113] border border-zinc-800 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            {/* Status + version */}
            <div className="flex items-center gap-3 mb-3 flex-wrap">
              <div className={`flex items-center gap-1.5 text-[11px] font-mono ${s.text}`}>
                <span className={`status-dot ${s.dot}`} />
                {s.label}
              </div>
              <span className="text-[11px] font-mono text-zinc-600 border border-zinc-800 px-1.5 py-0.5 rounded">
                v{doc.current_version}
              </span>
              {doc.tags?.map(tag => (
                <span key={tag} className="text-[10px] font-mono text-zinc-600 bg-zinc-800/50 border border-zinc-800 px-2 py-0.5 rounded-full">
                  {tag}
                </span>
              ))}
            </div>

            <h1 className="font-mono text-xl font-600 text-zinc-100 mb-3 leading-tight">{doc.title}</h1>

            <div className="flex items-center gap-4 text-[11px] font-mono text-zinc-600 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {new Date(doc.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              </span>
              {doc.owner_name && <span>Owner: {doc.owner_name}</span>}
              {doc.freshness_score && (
                <span className={
                  doc.freshness_score >= 80 ? 'text-green-500' :
                  doc.freshness_score >= 50 ? 'text-amber-500' : 'text-red-500'
                }>
                  ◈ Freshness {doc.freshness_score}%
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {(userRole === 'contributor' || userRole === 'reviewer' || userRole === 'admin') && (
              <Link href={`/docs/${doc.slug}/edit`}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md text-[12px] font-mono text-zinc-300 transition-colors">
                <Edit3 size={12} /> Edit
              </Link>
            )}
            {(userRole === 'reviewer' || userRole === 'admin') && !approved && (
              <button onClick={handleApprove} disabled={approving}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/15 hover:bg-green-500/25 border border-green-500/30 rounded-md text-[12px] font-mono text-green-400 transition-colors disabled:opacity-50">
                <CheckCircle2 size={12} />
                {approving ? 'Publishing…' : 'Publish'}
              </button>
            )}
            {approved && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/5 border border-green-500/20 rounded-md text-[12px] font-mono text-green-500/70">
                <Shield size={12} /> Published
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Freshness flags */}
      {doc.freshnessFlags?.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={13} className="text-amber-400" />
            <span className="text-[12px] font-mono text-amber-400 uppercase tracking-wide">
              AI detected {doc.freshnessFlags.length} issue{doc.freshnessFlags.length > 1 ? 's' : ''}
            </span>
          </div>
          {doc.freshnessFlags.slice(0, 3).map(flag => (
            <div key={flag.id} className="flex items-start gap-2 text-[12px] text-amber-200/60 mt-1.5">
              <Flag size={10} className="mt-0.5 flex-shrink-0" />
              {flag.description}
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-zinc-800">
        {['content', 'history'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-[12px] font-mono uppercase tracking-wide transition-colors relative ${
              tab === t ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-400'
            }`}>
            {t}
            {tab === t && (
              <span className="absolute bottom-0 left-0 right-0 h-px bg-amber-500" />
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'content' && (
        <div className="bg-[#111113] border border-zinc-800 rounded-xl p-8">
          <div className="prose-doc">
            {doc.content_md
              ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content_md}</ReactMarkdown>
              : <p className="text-zinc-600 text-[13px] font-mono">No content available.</p>
            }
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-[#111113] border border-zinc-800 rounded-xl">
          <div className="px-6 py-4 border-b border-zinc-800">
            <h3 className="font-mono text-[12px] text-zinc-500 uppercase tracking-wider">Version History</h3>
          </div>
          <div className="p-6 text-[13px] text-zinc-600 font-mono">
            History loaded via <code className="text-amber-500/70">/api/documents/{doc.id}/history</code>
          </div>
        </div>
      )}
    </div>
  );
}

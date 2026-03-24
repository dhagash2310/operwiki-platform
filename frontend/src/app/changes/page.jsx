'use client';
import { useEffect, useState } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { GitPullRequest, Plus, Loader2, AlertTriangle, X, ChevronDown } from 'lucide-react';
import Link from 'next/link';

const STATUS_STYLE = {
  pending:       'text-zinc-500  border-zinc-700   bg-zinc-800/30',
  ai_processing: 'text-blue-400  border-blue-500/25 bg-blue-500/5',
  in_review:     'text-amber-400 border-amber-500/25 bg-amber-500/5',
  approved:      'text-green-400 border-green-500/25 bg-green-500/5',
  rejected:      'text-red-400   border-red-500/25  bg-red-500/5',
  merged:        'text-purple-400 border-purple-500/25 bg-purple-500/5',
};
const STATUS_DOT = {
  pending:'bg-zinc-500', ai_processing:'bg-blue-500', in_review:'bg-amber-500',
  approved:'bg-green-500', rejected:'bg-red-500', merged:'bg-purple-500',
};
const CHANGE_TYPES = ['Infrastructure Update','Process Change','New Service','Decommission','Security Update'];
const SYSTEMS      = ['Citrix','Monitoring','Servers','Network','Application','Security','Database','Storage'];

export default function ChangesPage() {
  const [crs, setCrs]         = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm]       = useState({ title:'', description:'', changeType:CHANGE_TYPES[0], affectedSystems:[] });
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    setLoading(true);
    const token = localStorage.getItem('operwiki_token');
    const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    try {
      const res = await fetch(`${base}/change-requests`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setCrs(Array.isArray(data) ? data : []);
    } catch { setCrs([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const toggleSystem = (sys) => setForm(p => ({
    ...p, affectedSystems: p.affectedSystems.includes(sys)
      ? p.affectedSystems.filter(s => s !== sys)
      : [...p.affectedSystems, sys],
  }));

  const submit = async (e) => {
    e.preventDefault(); setSubmitting(true);
    const token = localStorage.getItem('operwiki_token');
    const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    try {
      const res  = await fetch(`${base}/change-requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      setCrs(p => [data, ...p]);
      setShowForm(false);
      setForm({ title:'', description:'', changeType:CHANGE_TYPES[0], affectedSystems:[] });
    } catch { alert('Failed to submit'); }
    finally { setSubmitting(false); }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="font-mono text-lg font-600 text-zinc-100">Change Requests</h1>
            <p className="text-[13px] text-zinc-500 mt-0.5">AI-driven documentation update pipeline</p>
          </div>
          <button onClick={() => setShowForm(!showForm)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-mono font-600 transition-colors ${
              showForm ? 'bg-zinc-800 border border-zinc-700 text-zinc-400' : 'bg-amber-500 hover:bg-amber-400 text-zinc-900'
            }`}>
            {showForm ? <X size={13} /> : <Plus size={13} />}
            {showForm ? 'Cancel' : 'New Request'}
          </button>
        </div>

        {/* Create form */}
        {showForm && (
          <form onSubmit={submit} className="bg-[#111113] border border-zinc-800 rounded-xl p-6 mb-6 space-y-5 animate-slide-in">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <h2 className="font-mono text-[12px] text-zinc-400 uppercase tracking-wider">New Change Request</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1.5">Title</label>
                <input required value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))}
                  placeholder="e.g. Added two new Citrix servers CTX-05 and CTX-06"
                  className="w-full bg-[#0D0D0F] border border-zinc-800 focus:border-amber-500/40 rounded-lg px-3 py-2.5 text-[13px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors" />
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1.5">Change Type</label>
                <select value={form.changeType} onChange={e => setForm(p => ({...p, changeType: e.target.value}))}
                  className="w-full bg-[#0D0D0F] border border-zinc-800 focus:border-amber-500/40 rounded-lg px-3 py-2.5 text-[13px] text-zinc-200 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors">
                  {CHANGE_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1.5">Affected Systems</label>
                <div className="flex flex-wrap gap-1.5">
                  {SYSTEMS.map(sys => (
                    <button key={sys} type="button" onClick={() => toggleSystem(sys)}
                      className={`text-[11px] font-mono px-2 py-1 rounded border transition-colors ${
                        form.affectedSystems.includes(sys)
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-400'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-600 hover:text-zinc-400'
                      }`}>
                      {sys}
                    </button>
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-1.5">Description</label>
                <textarea required rows={4} value={form.description}
                  onChange={e => setForm(p => ({...p, description: e.target.value}))}
                  placeholder="Describe the change in detail. AI will use this to identify and update affected documentation..."
                  className="w-full bg-[#0D0D0F] border border-zinc-800 focus:border-amber-500/40 rounded-lg px-3 py-2.5 text-[13px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors resize-none" />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-1">
              <button type="submit" disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-900 rounded-md text-[12px] font-mono font-600 transition-colors">
                {submitting && <Loader2 size={12} className="animate-spin" />}
                Submit & Trigger AI Analysis
              </button>
            </div>
          </form>
        )}

        {/* List */}
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 size={18} className="animate-spin text-zinc-700" /></div>
        ) : crs.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
              <GitPullRequest size={20} className="text-zinc-700" />
            </div>
            <p className="font-mono text-[13px] text-zinc-600">No change requests yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {crs.map(cr => (
              <div key={cr.id} className="bg-[#111113] border border-zinc-800 hover:border-zinc-700 rounded-xl p-5 transition-colors">
                <div className="flex items-start gap-3">
                  <span className={`status-dot ${STATUS_DOT[cr.status] || 'bg-zinc-500'} mt-1.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-[11px] text-zinc-600">{cr.reference_number}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${STATUS_STYLE[cr.status] || STATUS_STYLE.pending}`}>
                        {cr.status?.replace('_', ' ').toUpperCase()}
                      </span>
                      {cr.change_type && (
                        <span className="text-[11px] text-zinc-600">{cr.change_type}</span>
                      )}
                    </div>
                    <p className="text-[13px] text-zinc-200 font-medium">{cr.title}</p>
                    <p className="text-[12px] text-zinc-600 mt-1 line-clamp-2">{cr.description}</p>
                    {cr.affected_systems?.length > 0 && (
                      <div className="flex gap-1.5 mt-2 flex-wrap">
                        {cr.affected_systems.map(s => (
                          <span key={s} className="text-[10px] font-mono text-zinc-600 bg-zinc-800 border border-zinc-700 px-2 py-0.5 rounded-full">{s}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] font-mono text-zinc-700 flex-shrink-0">
                    {new Date(cr.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
                {cr.status === 'in_review' && (
                  <div className="mt-3 pt-3 border-t border-zinc-800 flex items-center gap-2">
                    <AlertTriangle size={11} className="text-amber-400" />
                    <span className="text-[11px] font-mono text-amber-400/80">AI has proposed documentation updates — review required</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

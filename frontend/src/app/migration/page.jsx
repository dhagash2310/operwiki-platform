'use client';
import { useState, useEffect } from 'react';
import AppLayout from '../../components/layout/AppLayout';
import { Upload, FileText, Globe, Loader2, CheckCircle2, XCircle, Terminal, ChevronDown } from 'lucide-react';

export default function MigrationPage() {
  const [mode, setMode]           = useState('xml');
  const [xmlContent, setXml]      = useState('');
  const [fileName, setFileName]   = useState('');
  const [apiUrl, setApiUrl]       = useState('');
  const [categoryId, setCategoryId] = useState('');   // selected category id
  const [categories, setCategories] = useState([]);
  const [dryRun, setDryRun]       = useState(false);
  const [useAI, setUseAI]         = useState(false);
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);

  // Load categories from API on mount
  useEffect(() => {
    const token = localStorage.getItem('operwiki_token');
    const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
    fetch(`${base}/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => setCategories(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = ev => setXml(ev.target.result);
    reader.readAsText(file);
  };

  const run = async () => {
    setLoading(true); setResult(null);
    const token = localStorage.getItem('operwiki_token');
    const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

    // Resolve the slug from selected category id
    const selectedCat = categories.find(c => c.id === categoryId);
    const categorySlug = selectedCat?.slug || undefined;

    try {
      const endpoint = mode === 'xml' ? `${base}/migration/xml` : `${base}/migration/from-api`;
      const body     = mode === 'xml'
        ? { xmlContent, categorySlug, dryRun, useAI }
        : { mwBaseUrl: apiUrl, categorySlug, dryRun, useAI, limit: 100 };
      const res  = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      setResult(await res.json());
    } catch (err) { setResult({ error: err.message }); }
    finally { setLoading(false); }
  };

  const canRun = mode === 'xml' ? xmlContent.length > 0 : apiUrl.length > 0;

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-6 py-8">

        <div className="mb-8">
          <h1 className="font-mono text-lg font-600 text-zinc-100">Import from MediaWiki</h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">Migrate existing wiki pages with optional AI restructuring</p>
        </div>

        {/* Mode tabs */}
        <div className="flex border border-zinc-800 rounded-lg overflow-hidden mb-6 w-fit">
          {[{ id:'xml', label:'XML Export', icon: FileText }, { id:'api', label:'Wiki API', icon: Globe }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`flex items-center gap-2 px-4 py-2 text-[12px] font-mono transition-colors ${
                mode === m.id ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-600 hover:text-zinc-400'
              }`}>
              <m.icon size={12} /> {m.label}
            </button>
          ))}
        </div>

        <div className="bg-[#111113] border border-zinc-800 rounded-xl p-6 space-y-5">

          {/* File / URL input */}
          {mode === 'xml' ? (
            <div>
              <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">
                MediaWiki XML Export
              </label>
              <label className={`flex items-center gap-3 px-4 py-3 border border-dashed rounded-lg cursor-pointer transition-colors ${
                xmlContent ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-700 hover:border-zinc-600'
              }`}>
                <Upload size={16} className={xmlContent ? 'text-amber-400' : 'text-zinc-600'} />
                <div>
                  <div className={`text-[13px] ${xmlContent ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {fileName || 'Click to select XML file'}
                  </div>
                  {xmlContent && (
                    <div className="text-[11px] font-mono text-zinc-600">{(xmlContent.length/1024).toFixed(1)} KB loaded</div>
                  )}
                </div>
                <input type="file" accept=".xml" onChange={handleFile} className="hidden" />
              </label>
            </div>
          ) : (
            <div>
              <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">
                MediaWiki Base URL
              </label>
              <input value={apiUrl} onChange={e => setApiUrl(e.target.value)}
                placeholder="http://your-wiki.internal/w"
                className="w-full bg-[#0D0D0F] border border-zinc-800 focus:border-amber-500/40 rounded-lg px-3 py-2.5 text-[13px] text-zinc-200 placeholder-zinc-700 focus:outline-none font-mono" />
            </div>
          )}

          {/* Category dropdown */}
          <div>
            <label className="block text-[10px] font-mono text-zinc-600 uppercase tracking-widest mb-2">
              Target Category <span className="text-zinc-700 normal-case tracking-normal">(optional)</span>
            </label>
            <div className="relative">
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="w-full appearance-none bg-[#0D0D0F] border border-zinc-800 focus:border-amber-500/40 rounded-lg px-3 py-2.5 text-[13px] text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors pr-8 cursor-pointer"
              >
                <option value="">— No category (import as uncategorised) —</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
            </div>
            {categoryId && (
              <p className="text-[11px] font-mono text-zinc-700 mt-1">
                Documents will appear under → {categories.find(c => c.id === categoryId)?.name}
              </p>
            )}
          </div>

          {/* Options */}
          <div className="space-y-3">
            {/* Dry run toggle — most important, shown prominently */}
            <div
              onClick={() => setDryRun(!dryRun)}
              className={`flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-all ${
                dryRun
                  ? 'bg-amber-500/5 border-amber-500/30 text-amber-400'
                  : 'bg-green-500/5 border-green-500/30 text-green-400'
              }`}>
              <div>
                <div className="text-[13px] font-medium">
                  {dryRun ? 'Preview mode (dry run)' : 'Live import — will save documents'}
                </div>
                <div className="text-[11px] font-mono mt-0.5 opacity-70">
                  {dryRun
                    ? 'No data will be saved. Toggle off to actually import.'
                    : 'Documents will be created in the knowledge base.'}
                </div>
              </div>
              <div className={`w-9 h-5 rounded-full border flex items-center px-0.5 flex-shrink-0 ml-4 ${
                dryRun ? 'bg-amber-500/20 border-amber-500/40' : 'bg-green-500/20 border-green-500/40'
              }`}>
                <div className={`w-4 h-4 rounded-full transition-transform ${
                  dryRun ? 'bg-amber-400' : 'translate-x-4 bg-green-400'
                }`} />
              </div>
            </div>

            {/* AI restructuring toggle */}
            <label className="flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-800 bg-[#0D0D0F] cursor-pointer hover:border-zinc-700 transition-colors">
              <div onClick={() => setUseAI(!useAI)}
                className={`w-9 h-5 rounded-full border transition-colors flex items-center px-0.5 flex-shrink-0 ${
                  useAI ? 'bg-amber-500/30 border-amber-500/40' : 'bg-zinc-900 border-zinc-700'
                }`}>
                <div className={`w-4 h-4 rounded-full transition-transform ${
                  useAI ? 'translate-x-4 bg-amber-400' : 'bg-zinc-600'
                }`} />
              </div>
              <div>
                <div className="text-[13px] text-zinc-300">AI restructuring</div>
                <div className="text-[11px] font-mono text-zinc-600 mt-0.5">
                  Uses Azure OpenAI to clean up and reformat wiki content
                </div>
              </div>
            </label>
          </div>

          {useAI && (
            <div className="flex items-start gap-2 text-[11px] font-mono text-amber-400/70 bg-amber-500/5 border border-amber-500/15 rounded-lg px-3 py-2">
              <Terminal size={11} className="mt-0.5 flex-shrink-0" />
              AI restructuring requires a valid Azure OpenAI key in the backend environment.
            </div>
          )}

          <button onClick={run} disabled={loading || !canRun}
            className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-900 rounded-lg text-[13px] font-mono font-600 transition-colors">
            {loading
              ? <><Loader2 size={14} className="animate-spin" />Processing...</>
              : <><Upload size={14} />Run Import</>
            }
          </button>
        </div>

        {/* Results */}
        {result && (
          <div className="mt-6 bg-[#111113] border border-zinc-800 rounded-xl overflow-hidden animate-slide-in">
            {result.error ? (
              <div className="flex items-center gap-2 text-red-400 p-5 text-[13px] font-mono">
                <XCircle size={14} /> {result.error}
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={15} className="text-green-400" />
                    <span className="font-mono text-[13px] text-zinc-200">Import Complete</span>
                    {dryRun && <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase">Dry Run — nothing saved</span>}
                  </div>
                </div>

                <div className="grid grid-cols-3 divide-x divide-zinc-800 border-b border-zinc-800">
                  {[['Total', result.total, 'text-zinc-300'], ['Success', result.success, 'text-green-400'], ['Failed', result.failed || 0, 'text-red-400']].map(([l, v, c]) => (
                    <div key={l} className="p-4 text-center">
                      <div className={`font-mono text-2xl font-600 tabular-nums ${c}`}>{v ?? 0}</div>
                      <div className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider mt-0.5">{l}</div>
                    </div>
                  ))}
                </div>

                {!dryRun && result.success > 0 && (
                  <div className="px-5 py-3 border-b border-zinc-800 bg-green-500/5">
                    <p className="text-[12px] font-mono text-green-400">
                      ✓ Documents saved. Go to{' '}
                      <a href="/docs" className="underline hover:text-green-300">Knowledge Base</a>
                      {' '}to view them.
                    </p>
                  </div>
                )}

                <div className="divide-y divide-zinc-800/50 max-h-64 overflow-y-auto">
                  {result.items?.slice(0, 20).map((item, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-5 py-2.5">
                      {item.status === 'success'
                        ? <CheckCircle2 size={12} className="text-green-400 flex-shrink-0" />
                        : item.status === 'skipped'
                          ? <span className="w-3 h-3 flex-shrink-0 text-zinc-600 font-mono text-[10px]">—</span>
                          : <XCircle size={12} className="text-red-400 flex-shrink-0" />
                      }
                      <span className="text-[12px] text-zinc-400 flex-1 truncate">{item.title}</span>
                      {item.status === 'skipped' && <span className="text-[10px] text-zinc-700 font-mono">{item.reason}</span>}
                      {item.error && <span className="text-[11px] text-red-400 font-mono truncate max-w-[200px]">{item.error}</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
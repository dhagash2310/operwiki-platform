'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Terminal } from 'lucide-react';
import { api } from '../../lib/api';

const DEV_USERS = [
  { email: 'admin@operwiki.local',       role: 'admin' },
  { email: 'reviewer@operwiki.local',    role: 'reviewer' },
  { email: 'contributor@operwiki.local', role: 'contributor' },
];

export default function LoginPage() {
  const router  = useRouter();
  const [email, setEmail]     = useState('admin@operwiki.local');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const res = await api.post('/auth/login', { email });
      localStorage.setItem('operwiki_token', res.data.token);
      router.push('/docs');
    } catch (err) {
      setError(err.response?.data?.error || 'Authentication failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#09090B] flex items-center justify-center p-4 relative overflow-hidden">

      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'linear-gradient(#F59E0B 1px, transparent 1px), linear-gradient(90deg, #F59E0B 1px, transparent 1px)', backgroundSize: '48px 48px' }} />

      {/* Ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-sm animate-slide-in">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 mb-4">
            <Terminal size={22} className="text-amber-400" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-xl font-600 text-zinc-100 tracking-tight">OperWiki AI</h1>
          <p className="text-[12px] text-zinc-600 mt-1 font-mono tracking-widest uppercase">Knowledge Platform</p>
        </div>

        {/* Form */}
        <form onSubmit={handleLogin}
          className="bg-[#111113] border border-zinc-800 rounded-xl p-6 space-y-4">
          <div>
            <label className="block text-[11px] font-mono text-zinc-500 uppercase tracking-wider mb-2">
              Email Address
            </label>
            <input
              value={email} onChange={e => setEmail(e.target.value)}
              type="email" required autoComplete="email"
              className="w-full bg-[#0D0D0F] border border-zinc-800 focus:border-amber-500/50 rounded-lg px-3 py-2.5 text-[13px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/25 transition-colors font-mono"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-[12px] text-red-400 bg-red-500/5 border border-red-500/20 rounded-lg px-3 py-2">
              <span className="w-1 h-1 rounded-full bg-red-400 flex-shrink-0" />
              {error}
            </div>
          )}

          <button type="submit" disabled={loading}
            className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-900 rounded-lg py-2.5 text-[13px] font-mono font-600 flex items-center justify-center gap-2 transition-colors">
            {loading ? <Loader2 size={13} className="animate-spin" /> : null}
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>

        {/* Dev shortcuts */}
        <div className="mt-4">
          <p className="text-[10px] font-mono text-zinc-700 text-center uppercase tracking-widest mb-2">Dev environment users</p>
          <div className="flex flex-col gap-1">
            {DEV_USERS.map(u => (
              <button key={u.email} onClick={() => setEmail(u.email)}
                className={`flex items-center justify-between px-3 py-1.5 rounded-md text-[11px] font-mono transition-colors border ${
                  email === u.email
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-transparent border-zinc-800 text-zinc-600 hover:text-zinc-400 hover:border-zinc-700'
                }`}>
                <span>{u.email}</span>
                <span className="text-[10px] uppercase tracking-wider opacity-60">{u.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

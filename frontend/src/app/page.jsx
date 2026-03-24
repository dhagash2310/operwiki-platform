'use client';
import Link from 'next/link';
import { BookOpen, MessageSquare, GitPullRequest, Upload, ArrowRight, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';

const TILES = [
  { href: '/docs',      icon: BookOpen,       label: 'Knowledge Base',   desc: 'Browse all documentation',              accent: 'text-amber-400 border-amber-500/20 bg-amber-500/5' },
  { href: '/chat',      icon: MessageSquare,  label: 'AI Assistant',     desc: 'Ask questions about your infrastructure', accent: 'text-blue-400 border-blue-500/20 bg-blue-500/5' },
  { href: '/changes',   icon: GitPullRequest, label: 'Change Requests',  desc: 'Review AI-proposed doc updates',          accent: 'text-green-400 border-green-500/20 bg-green-500/5' },
  { href: '/migration', icon: Upload,         label: 'Import',           desc: 'Migrate from MediaWiki',                  accent: 'text-purple-400 border-purple-500/20 bg-purple-500/5' },
];

export default function HomePage() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setTimeout(() => setVisible(true), 50); }, []);

  return (
    <div className="min-h-screen bg-[#09090B] flex flex-col items-center justify-center p-8 relative overflow-hidden">

      {/* Grid background */}
      <div className="absolute inset-0 opacity-[0.025]"
        style={{ backgroundImage: 'linear-gradient(#F59E0B 1px, transparent 1px), linear-gradient(90deg, #F59E0B 1px, transparent 1px)', backgroundSize: '64px 64px' }} />

      {/* Glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-amber-500/[0.04] rounded-full blur-3xl pointer-events-none" />

      <div className={`relative max-w-2xl w-full transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>

        {/* Badge */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/25 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse-slow" />
            <span className="text-[11px] font-mono text-amber-400/80 uppercase tracking-widest">AI-Powered Platform</span>
          </div>
        </div>

        {/* Logo + title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 mb-5">
            <Terminal size={26} className="text-amber-400" strokeWidth={1.5} />
          </div>
          <h1 className="font-mono text-4xl font-600 text-zinc-100 tracking-tight mb-3">
            OperWiki<span className="text-amber-400"> AI</span>
          </h1>
          <p className="text-zinc-500 text-[15px] leading-relaxed max-w-md mx-auto">
            AI-powered IT operations knowledge platform. Keep your SOPs current, searchable, and connected to your change management workflow.
          </p>
        </div>

        {/* Tiles */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          {TILES.map(({ href, icon: Icon, label, desc, accent }) => (
            <Link key={href} href={href}
              className="group flex items-start gap-3 p-4 bg-[#111113] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 rounded-xl transition-all">
              <div className={`w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0 ${accent}`}>
                <Icon size={15} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-zinc-200 group-hover:text-white transition-colors">{label}</div>
                <div className="text-[11px] text-zinc-600 mt-0.5 leading-relaxed">{desc}</div>
              </div>
              <ArrowRight size={13} className="text-zinc-700 group-hover:text-zinc-400 transition-colors mt-0.5 flex-shrink-0" />
            </Link>
          ))}
        </div>

        <div className="text-center">
          <Link href="/login" className="text-[12px] font-mono text-amber-500 hover:text-amber-400 animated-underline transition-colors">
            Sign in to get started →
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, ExternalLink, Loader2, Zap, CornerDownLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';

const SUGGESTED = [
  'What Citrix servers are currently active?',
  'How do we restart the Citrix broker service?',
  'What is the P1 incident response procedure?',
  'Where is monitoring configured?',
];

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUser ? 'bg-amber-500/20 border border-amber-500/30' : 'bg-zinc-800 border border-zinc-700'
      }`}>
        {isUser
          ? <User size={13} className="text-amber-400" />
          : <Bot size={13} className="text-zinc-400" />
        }
      </div>

      {/* Bubble */}
      <div className={`flex-1 max-w-2xl ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
        <div className={`px-4 py-3 rounded-lg text-[13px] leading-relaxed ${
          isUser
            ? 'bg-amber-500/15 border border-amber-500/25 text-zinc-200 rounded-tr-sm'
            : 'bg-[#111113] border border-zinc-800 text-zinc-300 rounded-tl-sm'
        }`}>
          {isUser ? msg.content : (
            <div className="prose-doc">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Sources */}
        {msg.sources?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pl-1">
            <span className="text-[10px] font-mono text-zinc-700 uppercase tracking-wider self-center">Sources</span>
            {msg.sources.slice(0, 3).map(s => (
              <Link key={s.documentId} href={`/docs/${s.slug || s.documentId}`}
                className="flex items-center gap-1 text-[11px] font-mono text-amber-500/70 hover:text-amber-400 bg-amber-500/5 border border-amber-500/15 hover:border-amber-500/30 px-2 py-0.5 rounded-full transition-colors">
                <ExternalLink size={9} />
                {s.title?.length > 25 ? s.title.slice(0, 25) + '…' : s.title}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AIChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    const newMsgs = [...messages, { role: 'user', content: msg }];
    setMessages(newMsgs);
    setLoading(true);
    try {
      const token = localStorage.getItem('operwiki_token');
      const base  = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
      const res   = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg, history: newMsgs.slice(-6) }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer, sources: data.sources || [] }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '⚠ Failed to get a response. Check that the backend is running.', sources: [] }]);
    } finally { setLoading(false); inputRef.current?.focus(); }
  };

  return (
    <div className="flex flex-col h-full bg-[#09090B]">

      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-[#0D0D0F] flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
          <Zap size={15} className="text-amber-400" strokeWidth={2} />
        </div>
        <div>
          <h1 className="font-mono text-[13px] font-600 text-zinc-100">AI Knowledge Assistant</h1>
          <p className="text-[11px] text-zinc-600">Ask anything about your infrastructure and SOPs</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse-slow" />
          <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">Connected</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && (
          <div className="max-w-xl mx-auto text-center pt-10">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center mx-auto mb-5">
              <Zap size={24} className="text-amber-400" strokeWidth={1.5} />
            </div>
            <h2 className="font-mono text-[15px] font-600 text-zinc-200 mb-2">What do you want to know?</h2>
            <p className="text-[12px] text-zinc-600 mb-8 leading-relaxed">
              I have access to all imported documentation. Ask about servers, procedures, configurations, or anything in the knowledge base.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
              {SUGGESTED.map(q => (
                <button key={q} onClick={() => sendMessage(q)}
                  className="px-4 py-3 bg-[#111113] hover:bg-[#16161A] border border-zinc-800 hover:border-zinc-700 rounded-lg text-[12px] text-zinc-400 hover:text-zinc-200 transition-all text-left leading-relaxed">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => <Message key={i} msg={msg} />)}

        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center flex-shrink-0">
              <Bot size={13} className="text-zinc-400" />
            </div>
            <div className="bg-[#111113] border border-zinc-800 rounded-lg rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 size={13} className="animate-spin text-amber-400" />
              <span className="text-[12px] font-mono text-zinc-600">Searching knowledge base...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-zinc-800 bg-[#0D0D0F]">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder="Ask about your infrastructure..."
            rows={1}
            style={{ resize: 'none' }}
            className="flex-1 bg-[#111113] border border-zinc-800 focus:border-amber-500/40 rounded-lg px-4 py-3 text-[13px] text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-amber-500/20 transition-colors leading-relaxed"
          />
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="w-10 h-10 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors">
            <Send size={15} className="text-zinc-900" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 px-1">
          <p className="text-[10px] font-mono text-zinc-700">Answers grounded in your documentation</p>
          <div className="flex items-center gap-1 text-[10px] font-mono text-zinc-700">
            <CornerDownLeft size={9} /> Enter to send
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BookOpen, MessageSquare, GitPullRequest, Upload,
  Shield, Search, ChevronDown, Server, Activity,
  Code, Layers, Menu, X, LogOut, Bell, User,
} from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  {
    name: 'Knowledge Base', href: '/docs', icon: BookOpen,
    children: [
      { name: 'IT Infrastructure', href: '/docs/category/it-infrastructure', icon: Server },
      { name: 'Citrix',            href: '/docs/category/citrix',            icon: Layers },
      { name: 'Monitoring',        href: '/docs/category/monitoring',        icon: Activity },
      { name: 'App Support',       href: '/docs/category/app-support',       icon: Code },
    ],
  },
  { name: 'AI Chat',         href: '/chat',      icon: MessageSquare },
  { name: 'Change Requests', href: '/changes',   icon: GitPullRequest },
  { name: 'Import',          href: '/migration', icon: Upload },
  { name: 'Admin',           href: '/admin',     icon: Shield },
];

function NavItem({ item, pathname, onNavigate, expandedNav, setExpandedNav }) {
  const isActive   = pathname.startsWith(item.href);
  const isExpanded = expandedNav === item.name;

  const activeBar = isActive && (
    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-4 bg-amber-500 rounded-r-full" />
  );

  // Items with children: label navigates, chevron toggles dropdown
  if (item.children) {
    return (
      <div>
        <div className={clsx('flex items-center rounded-sm', isActive ? 'text-amber-400' : 'text-zinc-400')}>
          {/* Label — navigates to the section */}
          <Link
            href={item.href}
            onClick={onNavigate}
            className={clsx(
              'flex items-center gap-2.5 flex-1 px-3 py-[7px] text-[13px] font-medium transition-colors duration-150 relative',
              isActive ? 'text-amber-400' : 'hover:text-zinc-100'
            )}
          >
            {activeBar}
            <item.icon size={14} className={isActive ? 'text-amber-400' : 'text-zinc-500'} strokeWidth={1.75} />
            <span>{item.name}</span>
          </Link>
          {/* Chevron — only expands/collapses children */}
          <button
            onClick={() => setExpandedNav(isExpanded ? null : item.name)}
            className="px-2 py-[7px] text-zinc-600 hover:text-zinc-300 transition-colors"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ChevronDown size={12} className={clsx('transition-transform duration-200', isExpanded && 'rotate-180')} />
          </button>
        </div>

        {isExpanded && (
          <div className="ml-[22px] pl-3 border-l border-zinc-800 mt-0.5 mb-1 space-y-0.5">
            {item.children.map(child => {
              const childActive = pathname.startsWith(child.href);
              return (
                <Link key={child.href} href={child.href} onClick={onNavigate}
                  className={clsx(
                    'flex items-center gap-2 px-2 py-[5px] text-[12px] rounded-sm transition-colors',
                    childActive ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-200'
                  )}>
                  <child.icon size={12} strokeWidth={1.75} />
                  {child.name}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Leaf items: full row is a link
  return (
    <Link href={item.href} onClick={onNavigate}
      className={clsx(
        'group flex items-center gap-2.5 w-full px-3 py-[7px] text-[13px] transition-all duration-150 rounded-sm relative',
        isActive ? 'text-amber-400 font-medium' : 'text-zinc-400 hover:text-zinc-100'
      )}>
      {activeBar}
      <item.icon size={14} className={isActive ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-300'} strokeWidth={1.75} />
      <span>{item.name}</span>
    </Link>
  );
}

export default function AppLayout({ children }) {
  const pathname = usePathname();
  const router   = useRouter();
  const [open, setOpen]         = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [user, setUser]         = useState(null);

  // Auto-expand the nav section that matches the current path
  useEffect(() => {
    const match = NAV.find(n => n.children && pathname.startsWith(n.href));
    if (match) setExpanded(match.name);
  }, [pathname]);

  useEffect(() => {
    try {
      const token = localStorage.getItem('operwiki_token');
      if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUser(payload);
      }
    } catch {}
  }, []);

  const logout = () => {
    localStorage.removeItem('operwiki_token');
    router.push('/login');
  };

  const currentPage = NAV.find(n => pathname.startsWith(n.href))?.name || 'OperWiki AI';

  return (
    <div className="min-h-screen flex bg-[#09090B] font-sans">

      {open && (
        <div className="fixed inset-0 bg-black/70 z-20 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={clsx(
        'fixed inset-y-0 left-0 z-30 w-56 flex flex-col bg-[#0D0D0F] border-r border-zinc-800/80 transition-transform duration-200',
        'lg:translate-x-0 lg:static',
        open ? 'translate-x-0' : '-translate-x-full'
      )}>

        {/* Logo */}
        <div className="px-4 py-4 border-b border-zinc-800/80">
          <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
            <div className="w-7 h-7 rounded-md bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
              <BookOpen size={13} className="text-amber-400" strokeWidth={2} />
            </div>
            <div>
              <div className="text-[13px] font-mono font-600 text-zinc-100 leading-none">OperWiki</div>
              <div className="text-[10px] text-zinc-600 leading-none mt-0.5 font-mono">AI PLATFORM</div>
            </div>
          </Link>
        </div>

        {/* Search */}
        <div className="px-3 pt-3 pb-2">
          <Link href="/search" onClick={() => setOpen(false)}
            className="flex items-center gap-2 w-full px-3 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-md text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors group">
            <Search size={12} strokeWidth={2} />
            <span className="flex-1">Search docs...</span>
            <kbd className="text-[10px] bg-zinc-800 group-hover:bg-zinc-700 text-zinc-500 px-1.5 py-0.5 rounded font-mono">⌘K</kbd>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV.map(item => (
            <NavItem key={item.name} item={item} pathname={pathname}
              onNavigate={() => setOpen(false)}
              expandedNav={expanded} setExpandedNav={setExpanded} />
          ))}
        </nav>

        {/* User footer */}
        <div className="px-3 py-3 border-t border-zinc-800/80 space-y-0.5">
          {user && (
            <div className="flex items-center gap-2.5 px-3 py-2 rounded-sm">
              <div className="w-6 h-6 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                <User size={11} className="text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-zinc-300 truncate font-medium">{user.email?.split('@')[0]}</div>
                <div className="text-[10px] text-zinc-600 font-mono uppercase tracking-wide">{user.role}</div>
              </div>
            </div>
          )}
          <button onClick={logout}
            className="flex items-center gap-2.5 w-full px-3 py-[7px] text-[12px] text-zinc-600 hover:text-zinc-300 transition-colors rounded-sm">
            <LogOut size={12} strokeWidth={1.75} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-12 flex items-center px-4 gap-3 border-b border-zinc-800/80 bg-[#0D0D0F]/80 backdrop-blur-sm sticky top-0 z-10">
          <button className="lg:hidden p-1 text-zinc-500 hover:text-zinc-200" onClick={() => setOpen(true)}>
            <Menu size={18} />
          </button>
          <span className="text-[12px] font-mono text-zinc-500 tracking-wide hidden sm:block">
            {currentPage.toUpperCase()}
          </span>
          <div className="flex-1" />
          <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-green-500/5 border border-green-500/20 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse-slow" />
            <span className="text-[10px] font-mono text-green-500/70">SYSTEMS NOMINAL</span>
          </div>
          <button className="p-1.5 text-zinc-600 hover:text-zinc-300 transition-colors relative">
            <Bell size={15} strokeWidth={1.75} />
          </button>
        </header>

        <main className="flex-1 overflow-auto animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}

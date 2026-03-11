'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Network, Users, UserCheck,
  Building2, Map, Cpu, LogOut, Bell
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

const navItems = [
  { href: '/admin', icon: <LayoutDashboard size={18} />, label: 'Dashboard' },
  { href: '/admin/chains', icon: <Network size={18} />, label: 'Opportunity Queue' },
  { href: '/admin/users', icon: <Users size={18} />, label: 'Users' },
  { href: '/admin/brokers', icon: <UserCheck size={18} />, label: 'Brokers' },
  { href: '/admin/agencies', icon: <Building2 size={18} />, label: 'Agencies' },
  { href: '/admin/heatmap', icon: <Map size={18} />, label: 'Heatmap' },
  { href: '/admin/engine', icon: <Cpu size={18} />, label: 'Engine' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  return (
    <div className="flex h-screen bg-slate-950">
      {/* Sidebar */}
      <aside className="w-64 flex-shrink-0 border-r border-white/8 bg-slate-950 flex flex-col">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-slate-950 font-display font-bold text-sm">H</span>
            </div>
            <div>
              <span className="font-display font-semibold text-white">Homelink</span>
              <div className="text-xs text-slate-600 font-mono">Admin</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-brand-500/15 text-brand-400 border border-brand-500/25'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}>
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/8">
          <div className="flex items-center gap-3 p-2">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400 text-xs font-bold">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-white font-medium truncate">{user?.firstName} {user?.lastName}</div>
              <div className="text-xs text-slate-500 truncate">{user?.email}</div>
            </div>
            <button onClick={() => logout()} className="text-slate-600 hover:text-slate-400 transition-colors">
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="sticky top-0 z-10 border-b border-white/8 bg-slate-950/90 backdrop-blur px-8 py-4 flex items-center justify-end gap-3">
          <button className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-all">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-brand-500" />
          </button>
        </div>

        <div className="p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

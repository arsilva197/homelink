import Link from 'next/link';
import { ArrowRight, Network, TrendingUp, Shield, Zap } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 overflow-hidden">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 backdrop-blur-md bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
              <span className="text-slate-950 font-display font-bold text-sm">H</span>
            </div>
            <span className="font-display font-semibold text-lg text-white">Homelink</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/marketplace" className="text-slate-400 hover:text-white text-sm transition-colors">
              Marketplace
            </Link>
            <Link href="/auth/login"
              className="text-sm text-slate-300 hover:text-white transition-colors px-4 py-2">
              Sign in
            </Link>
            <Link href="/auth/register"
              className="text-sm bg-brand-500 text-slate-950 font-semibold px-4 py-2 rounded-lg hover:bg-brand-400 transition-colors">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-32 pb-24 px-6">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-brand-500/8 rounded-full blur-3xl" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[300px] bg-blue-600/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 text-brand-400 text-sm font-medium mb-8">
            <Zap size={14} />
            Graph-powered real estate transactions
          </div>

          <h1 className="font-display text-6xl md:text-7xl font-bold text-white leading-tight mb-6">
            Your property swap,{' '}
            <span className="text-brand-400">intelligently</span>{' '}
            matched
          </h1>

          <p className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Homelink finds multi-party transaction chains between property owners,
            unlocking real estate liquidity that traditional markets miss.
          </p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link href="/auth/register"
              className="inline-flex items-center gap-2 bg-brand-500 text-slate-950 font-semibold px-8 py-4 rounded-xl hover:bg-brand-400 transition-all hover:scale-105">
              List your property
              <ArrowRight size={18} />
            </Link>
            <Link href="/marketplace"
              className="inline-flex items-center gap-2 border border-white/10 text-white px-8 py-4 rounded-xl hover:bg-white/5 transition-all">
              Explore marketplace
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 border-t border-white/5">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-bold text-white mb-4">How Homelink works</h2>
            <p className="text-slate-400 text-lg max-w-xl mx-auto">
              We don't just list properties. We find the optimal transaction path between multiple owners.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Shield size={24} />,
                step: '01',
                title: 'List & define your goals',
                desc: 'Register your property and set your buying preferences — what you want, where, and at what price.',
              },
              {
                icon: <Network size={24} />,
                step: '02',
                title: 'The graph finds chains',
                desc: 'Our engine scans all properties every 2 minutes, detecting multi-party transaction cycles that create real liquidity.',
              },
              {
                icon: <TrendingUp size={24} />,
                step: '03',
                title: 'A broker closes the deal',
                desc: 'Admin-reviewed opportunities are assigned to qualified brokers who manage the full negotiation.',
              },
            ].map((item) => (
              <div key={item.step}
                className="relative p-8 rounded-2xl border border-white/8 bg-white/2 hover:border-brand-500/30 transition-colors">
                <div className="text-brand-500 mb-4">{item.icon}</div>
                <div className="text-xs font-mono text-slate-500 mb-3">{item.step}</div>
                <h3 className="font-display text-xl font-semibold text-white mb-3">{item.title}</h3>
                <p className="text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-20 px-6 bg-white/2 border-y border-white/5">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {[
            { value: '100K+', label: 'Properties supported' },
            { value: '5-party', label: 'Max chain size' },
            { value: '2min', label: 'Matching cycle' },
            { value: '60%+', label: 'Min chain score' },
          ].map((stat) => (
            <div key={stat.label}>
              <div className="font-display text-4xl font-bold text-brand-400 mb-2">{stat.value}</div>
              <div className="text-slate-500 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 text-center text-slate-600 text-sm">
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-6 h-6 rounded bg-brand-500 flex items-center justify-center">
            <span className="text-slate-950 font-bold text-xs">H</span>
          </div>
          <span className="text-slate-400 font-display font-medium">Homelink</span>
        </div>
        <p>© {new Date().getFullYear()} Homelink. Real Estate Liquidity Network.</p>
      </footer>
    </main>
  );
}

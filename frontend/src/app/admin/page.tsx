'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminApi, chainApi, AdminMetrics, ChainOpportunity } from '@/lib/api';
import {
  Network, Users, Building2, TrendingUp, AlertCircle,
  CheckCircle2, Clock, Zap, ChevronRight, RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';
import Link from 'next/link';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

function MetricCard({ icon, label, value, sub, index }: {
  icon: React.ReactNode; label: string; value: string | number;
  sub?: string; index: number;
}) {
  return (
    <motion.div
      variants={fadeUp} custom={index} initial="hidden" animate="show"
      className="relative p-6 rounded-2xl border border-white/8 bg-white/2 hover:border-brand-500/20 transition-all group"
    >
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400">{icon}</div>
      </div>
      <div className="font-display text-3xl font-bold text-white mb-1">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-slate-400 text-sm">{label}</div>
      {sub && <div className="text-xs text-slate-600 mt-1">{sub}</div>}
    </motion.div>
  );
}

function CPSBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const cls = pct >= 80 ? 'cps-high' : pct >= 70 ? 'cps-mid' : 'cps-low';
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-bold ${cls}`}>
      {pct}%
    </span>
  );
}

function ChainStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    PENDING_REVIEW: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    APPROVED: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    REJECTED: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    ASSIGNED_TO_BROKER: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  };
  const labels: Record<string, string> = {
    PENDING_REVIEW: 'Pending Review',
    APPROVED: 'Approved',
    REJECTED: 'Rejected',
    ASSIGNED_TO_BROKER: 'Assigned',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${map[status] || 'bg-slate-500/20 text-slate-400 border-slate-500/30'}`}>
      {labels[status] || status}
    </span>
  );
}

export default function AdminDashboard() {
  const [triggeringRun, setTriggeringRun] = useState(false);

  const { data: metricsData, refetch: refetchMetrics } = useQuery({
    queryKey: ['admin-metrics'],
    queryFn: () => adminApi.metrics(),
    refetchInterval: 30000,
  });

  const { data: chainsData } = useQuery({
    queryKey: ['admin-chains', 'PENDING_REVIEW'],
    queryFn: () => chainApi.list('PENDING_REVIEW'),
    refetchInterval: 15000,
  });

  const metrics: AdminMetrics | undefined = metricsData?.data;
  const pendingChains: ChainOpportunity[] = chainsData?.data || [];

  const handleTriggerRun = async () => {
    setTriggeringRun(true);
    try {
      await chainApi.triggerRun();
      setTimeout(() => { refetchMetrics(); setTriggeringRun(false); }, 3000);
    } catch { setTriggeringRun(false); }
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Command Center</h1>
          <p className="text-slate-400 mt-1">Real-time platform overview</p>
        </div>
        <button onClick={handleTriggerRun} disabled={triggeringRun}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-500/10 border border-brand-500/30 text-brand-400 text-sm font-medium hover:bg-brand-500/20 transition-all disabled:opacity-50">
          <RefreshCw size={15} className={triggeringRun ? 'animate-spin' : ''} />
          {triggeringRun ? 'Running...' : 'Trigger Match Cycle'}
        </button>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={<Users size={20} />} label="Total Users" value={metrics?.users.total || 0} index={0} />
        <MetricCard icon={<Building2 size={20} />} label="Active Properties" value={metrics?.properties.active || 0}
          sub={`${metrics?.properties.total || 0} total`} index={1} />
        <MetricCard icon={<Network size={20} />} label="Graph Edges" value={metrics?.graph.edges || 0} index={2} />
        <MetricCard icon={<TrendingUp size={20} />} label="Avg CPS Score"
          value={metrics ? `${(metrics.chains.avgCps * 100).toFixed(1)}%` : '—'} index={3} />
      </div>

      {/* Chain Counters */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pending Review', value: metrics?.chains.pending || 0, color: 'text-amber-400', icon: <Clock size={16} /> },
          { label: 'Approved', value: metrics?.chains.approved || 0, color: 'text-emerald-400', icon: <CheckCircle2 size={16} /> },
          { label: 'Brokers Awaiting Approval', value: metrics?.brokers.pendingApproval || 0, color: 'text-blue-400', icon: <AlertCircle size={16} /> },
        ].map((item, i) => (
          <motion.div key={item.label} variants={fadeUp} custom={i + 4} initial="hidden" animate="show"
            className="p-5 rounded-xl border border-white/8 bg-white/2 flex items-center gap-4">
            <div className={`${item.color}`}>{item.icon}</div>
            <div>
              <div className={`font-display text-2xl font-bold ${item.color}`}>{item.value}</div>
              <div className="text-slate-500 text-xs mt-0.5">{item.label}</div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Opportunity Queue */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-white">Opportunity Queue</h2>
          <Link href="/admin/chains" className="text-brand-400 text-sm hover:text-brand-300 transition-colors inline-flex items-center gap-1">
            View all <ChevronRight size={14} />
          </Link>
        </div>

        <div className="rounded-2xl border border-white/8 bg-white/2 overflow-hidden">
          {pendingChains.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <Network size={32} className="mx-auto mb-3 opacity-30" />
              <p>No pending opportunities</p>
              <p className="text-xs mt-1">Chains will appear here after the next matching cycle</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {pendingChains.slice(0, 8).map((chain, i) => (
                <motion.div key={chain.id} variants={fadeUp} custom={i} initial="hidden" animate="show"
                  className="flex items-center gap-4 px-6 py-4 hover:bg-white/3 transition-colors">
                  {/* Chain size indicator */}
                  <div className="flex-shrink-0 w-10 h-10 rounded-full border border-brand-500/40 bg-brand-500/10 flex items-center justify-center">
                    <span className="font-mono font-bold text-brand-400 text-sm">{chain.chainSize}</span>
                  </div>

                  {/* Chain info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-medium text-sm truncate">
                        {chain.chainSize}-Party Chain · {chain.region}
                      </span>
                    </div>
                    <div className="text-slate-500 text-xs">
                      R$ {(chain.totalValue / 1000000).toFixed(1)}M total · {new Date(chain.createdAt).toRelativeString?.() || 'recently'}
                    </div>
                  </div>

                  {/* CPS */}
                  <CPSBadge score={chain.cpsScore} />

                  {/* Status */}
                  <ChainStatusBadge status={chain.status} />

                  {/* Action */}
                  <Link href={`/admin/chains/${chain.id}`}
                    className="flex-shrink-0 p-2 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition-colors">
                    <ChevronRight size={16} />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Engine Status */}
      {metrics?.engine.recentRuns.length ? (
        <div>
          <h2 className="font-display text-xl font-semibold text-white mb-4">Recent Engine Runs</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {metrics.engine.recentRuns.slice(0, 3).map((run, i) => (
              <div key={i} className="p-4 rounded-xl border border-white/8 bg-white/2">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${run.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                    {run.status}
                  </span>
                  <span className="font-mono text-xs text-slate-500">{run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}</span>
                </div>
                <div className="text-2xl font-display font-bold text-white mb-1">{run.chainsDetected}</div>
                <div className="text-slate-500 text-xs">chains detected</div>
                <div className="text-slate-600 text-xs mt-1">{new Date(run.startedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

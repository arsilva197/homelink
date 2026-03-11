'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chainApi, adminApi, ChainOpportunity } from '@/lib/api';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight, CheckCircle, XCircle, UserCheck,
  Building2, TrendingUp, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value);
}

function CPSMeter({ score }: { score: number }) {
  const pct = score * 100;
  const color = pct >= 80 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative">
      <svg viewBox="0 0 120 70" className="w-32 h-20">
        <path d="M 10 60 A 50 50 0 0 1 110 60" stroke="#1e293b" strokeWidth="12" fill="none" strokeLinecap="round" />
        <path d="M 10 60 A 50 50 0 0 1 110 60" stroke={color} strokeWidth="12" fill="none" strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * 157} 157`} style={{ transition: 'stroke-dasharray 1s ease' }} />
        <text x="60" y="58" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" fontFamily="monospace">
          {pct.toFixed(0)}%
        </text>
        <text x="60" y="70" textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="sans-serif">CPS SCORE</text>
      </svg>
    </div>
  );
}

export default function ChainDetailPage({ params }: { params: { id: string } }) {
  const queryClient = useQueryClient();
  const [assignBrokerId, setAssignBrokerId] = useState('');
  const [showAssign, setShowAssign] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['chain', params.id],
    queryFn: () => chainApi.get(params.id),
  });

  const { data: brokersData } = useQuery({
    queryKey: ['admin-brokers-approved'],
    queryFn: () => adminApi.brokers('APPROVED'),
  });

  const approveMutation = useMutation({
    mutationFn: () => chainApi.approve(params.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chain', params.id] }),
  });

  const rejectMutation = useMutation({
    mutationFn: () => chainApi.reject(params.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['chain', params.id] }),
  });

  const assignMutation = useMutation({
    mutationFn: () => chainApi.assignBroker(params.id, assignBrokerId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chain', params.id] });
      setShowAssign(false);
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-2 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
    </div>
  );

  const chain: ChainOpportunity = data!.data;

  return (
    <div className="max-w-5xl space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-full bg-brand-500/15 border border-brand-500/30 flex items-center justify-center">
              <span className="font-mono font-bold text-brand-400">{chain.chainSize}</span>
            </div>
            <h1 className="font-display text-3xl font-bold text-white">
              {chain.chainSize}-Party Chain
            </h1>
          </div>
          <p className="text-slate-400">{chain.region} · {formatCurrency(chain.totalValue)} total value</p>
        </div>
        <CPSMeter score={chain.cpsScore} />
      </div>

      {/* Chain Visualization */}
      <div className="p-6 rounded-2xl border border-white/8 bg-white/2">
        <h2 className="font-display text-lg font-semibold text-white mb-6">Transaction Chain</h2>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {chain.participants.sort((a, b) => a.position - b.position).map((p, i) => (
            <div key={p.id} className="flex items-center">
              {/* Property card */}
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className="flex-shrink-0 w-48 p-4 rounded-xl border border-white/10 bg-slate-900">
                {p.property.images?.[0] && (
                  <div className="w-full h-24 rounded-lg bg-slate-800 mb-3 overflow-hidden">
                    <img src={p.property.images[0].imageUrl} alt={p.property.title}
                      className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="text-xs text-slate-500 font-mono mb-1">#{i + 1}</div>
                <div className="text-sm font-medium text-white truncate mb-1">{p.property.title}</div>
                <div className="text-xs text-slate-400 mb-2">{p.property.city}</div>
                <div className="font-mono text-sm font-bold text-brand-400">{formatCurrency(p.property.price)}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {p.property.owner.firstName} {p.property.owner.lastName}
                </div>
              </motion.div>

              {/* Arrow */}
              {i < chain.participants.length - 1 && (
                <div className="flex-shrink-0 flex flex-col items-center mx-2">
                  <ArrowRight size={18} className="text-brand-500" />
                </div>
              )}
            </div>
          ))}
          {/* Last arrow back to first (cycle) */}
          {chain.participants.length > 1 && (
            <div className="flex-shrink-0 ml-2 text-brand-500/50">
              <ArrowRight size={18} />
            </div>
          )}
        </div>
      </div>

      {/* Price Bridge */}
      <div className="p-6 rounded-2xl border border-white/8 bg-white/2">
        <h2 className="font-display text-lg font-semibold text-white mb-4">Dynamic Price Bridge</h2>
        <div className="space-y-3">
          {chain.priceBridge.map((entry, i) => {
            const from = chain.participants.find(p => p.property.id === entry.fromPropertyId);
            const to = chain.participants.find(p => p.property.id === entry.toPropertyId);
            return (
              <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-900/50">
                <div className={entry.direction === 'receive' ? 'text-emerald-400' : 'text-rose-400'}>
                  {entry.direction === 'receive' ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
                </div>
                <div className="flex-1 text-sm text-slate-300">
                  <span className="text-white font-medium">{from?.property.owner.firstName}</span>
                  {' '}{entry.direction === 'receive' ? 'receives' : 'pays'}{' '}
                  <span className="font-mono font-bold text-brand-400">{formatCurrency(entry.adjustment)}</span>
                  {' '}→ <span className="text-white font-medium">{to?.property.owner.firstName}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      {chain.status === 'PENDING_REVIEW' && (
        <div className="flex gap-3">
          <button onClick={() => approveMutation.mutate()}
            disabled={approveMutation.isPending}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-medium hover:bg-emerald-500/25 transition-all">
            <CheckCircle size={18} />
            {approveMutation.isPending ? 'Approving...' : 'Approve'}
          </button>
          <button onClick={() => rejectMutation.mutate()}
            disabled={rejectMutation.isPending}
            className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 font-medium hover:bg-rose-500/25 transition-all">
            <XCircle size={18} />
            Reject
          </button>
        </div>
      )}

      {chain.status === 'APPROVED' && !chain.assignedBroker && (
        <div>
          {!showAssign ? (
            <button onClick={() => setShowAssign(true)}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-500/15 border border-brand-500/30 text-brand-400 font-medium hover:bg-brand-500/25 transition-all">
              <UserCheck size={18} />
              Assign to Broker
            </button>
          ) : (
            <div className="p-5 rounded-xl border border-brand-500/30 bg-brand-500/5">
              <h3 className="font-medium text-white mb-3">Select a Broker</h3>
              <select value={assignBrokerId} onChange={(e) => setAssignBrokerId(e.target.value)}
                className="w-full bg-slate-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm mb-3">
                <option value="">Choose broker...</option>
                {brokersData?.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.user.firstName} {b.user.lastName} · {b.creciNumber} ({b.creciState})
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <button onClick={() => assignMutation.mutate()} disabled={!assignBrokerId || assignMutation.isPending}
                  className="flex-1 py-2 rounded-lg bg-brand-500 text-slate-950 font-semibold text-sm hover:bg-brand-400 disabled:opacity-50 transition-colors">
                  {assignMutation.isPending ? 'Assigning...' : 'Confirm Assignment'}
                </button>
                <button onClick={() => setShowAssign(false)}
                  className="px-4 py-2 rounded-lg border border-white/10 text-slate-400 text-sm hover:bg-white/5 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {chain.assignedBroker && (
        <div className="p-5 rounded-xl border border-blue-500/30 bg-blue-500/5">
          <div className="flex items-center gap-3">
            <UserCheck size={18} className="text-blue-400" />
            <div>
              <div className="text-sm font-medium text-white">
                Assigned to {chain.assignedBroker.user.firstName} {chain.assignedBroker.user.lastName}
              </div>
              <div className="text-xs text-slate-500">Broker is managing this transaction</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

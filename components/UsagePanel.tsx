'use client';

import { useState, useEffect, useCallback } from 'react';

interface UsageData {
  total: { input: number; output: number; cost: number; sessions: number; messages: number };
  byProject: { name: string; input: number; output: number; cost: number; sessions: number }[];
  byModel: { model: string; input: number; output: number; cost: number; messages: number }[];
  byDay: { date: string; input: number; output: number; cost: number }[];
  bySource: { source: string; input: number; output: number; cost: number; messages: number }[];
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function formatCost(n: number): string {
  return `$${n.toFixed(2)}`;
}

// Simple bar component
function Bar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden flex-1">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function UsagePanel() {
  const [data, setData] = useState<UsageData | null>(null);
  const [days, setDays] = useState(7);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/usage${days ? `?days=${days}` : ''}`);
      const d = await res.json();
      setData(d);
    } catch {}
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const triggerScan = async () => {
    setScanning(true);
    try {
      await fetch('/api/usage', { method: 'POST' });
      await fetchData();
    } catch {}
    setScanning(false);
  };

  if (loading && !data) {
    return <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-xs">Loading usage data...</div>;
  }

  if (!data) {
    return <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)] text-xs">Failed to load usage data</div>;
  }

  const maxProjectCost = data.byProject.length > 0 ? data.byProject[0].cost : 1;
  const maxDayCost = data.byDay.length > 0 ? Math.max(...data.byDay.map(d => d.cost)) : 1;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] shrink-0 flex items-center gap-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Token Usage</h2>
        <div className="flex items-center gap-1 ml-auto">
          {[7, 30, 90, 0].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`text-[10px] px-2 py-0.5 rounded ${days === d ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
            >
              {d === 0 ? 'All' : `${d}d`}
            </button>
          ))}
        </div>
        <button
          onClick={triggerScan}
          disabled={scanning}
          className="text-[10px] px-2 py-0.5 border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan Now'}
        </button>
      </div>

      <div className="p-4 space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3">
            <div className="text-[9px] text-[var(--text-secondary)] uppercase">Total Cost</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{formatCost(data.total.cost)}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3">
            <div className="text-[9px] text-[var(--text-secondary)] uppercase">Input Tokens</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{formatTokens(data.total.input)}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3">
            <div className="text-[9px] text-[var(--text-secondary)] uppercase">Output Tokens</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{formatTokens(data.total.output)}</div>
          </div>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg p-3">
            <div className="text-[9px] text-[var(--text-secondary)] uppercase">Sessions</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{data.total.sessions}</div>
            <div className="text-[9px] text-[var(--text-secondary)]">{data.total.messages} messages</div>
          </div>
        </div>

        {/* By Day — bar chart */}
        {data.byDay.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase mb-2">Daily Cost</h3>
            <div className="space-y-1">
              {data.byDay.slice(0, 14).reverse().map(d => (
                <div key={d.date} className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--text-secondary)] w-16 shrink-0">{d.date.slice(5)}</span>
                  <Bar value={d.cost} max={maxDayCost} color="bg-[var(--accent)]" />
                  <span className="text-[var(--text-primary)] w-16 text-right shrink-0">{formatCost(d.cost)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Project */}
        {data.byProject.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase mb-2">By Project</h3>
            <div className="space-y-1.5">
              {data.byProject.map(p => (
                <div key={p.name} className="flex items-center gap-2 text-[10px]">
                  <span className="text-[var(--text-primary)] w-28 truncate shrink-0" title={p.name}>{p.name}</span>
                  <Bar value={p.cost} max={maxProjectCost} color="bg-blue-500" />
                  <span className="text-[var(--text-primary)] w-16 text-right shrink-0">{formatCost(p.cost)}</span>
                  <span className="text-[var(--text-secondary)] w-12 text-right shrink-0">{p.sessions}s</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By Model */}
        {data.byModel.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase mb-2">By Model</h3>
            <div className="border border-[var(--border)] rounded overflow-hidden">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                    <th className="text-left px-3 py-1.5">Model</th>
                    <th className="text-right px-3 py-1.5">Input</th>
                    <th className="text-right px-3 py-1.5">Output</th>
                    <th className="text-right px-3 py-1.5">Cost</th>
                    <th className="text-right px-3 py-1.5">Msgs</th>
                  </tr>
                </thead>
                <tbody>
                  {data.byModel.map(m => (
                    <tr key={m.model} className="border-t border-[var(--border)]/30">
                      <td className="px-3 py-1.5 text-[var(--text-primary)]">{m.model}</td>
                      <td className="px-3 py-1.5 text-right text-[var(--text-secondary)]">{formatTokens(m.input)}</td>
                      <td className="px-3 py-1.5 text-right text-[var(--text-secondary)]">{formatTokens(m.output)}</td>
                      <td className="px-3 py-1.5 text-right text-[var(--text-primary)] font-medium">{formatCost(m.cost)}</td>
                      <td className="px-3 py-1.5 text-right text-[var(--text-secondary)]">{m.messages}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* By Source */}
        {data.bySource.length > 0 && (
          <div>
            <h3 className="text-[11px] font-semibold text-[var(--text-secondary)] uppercase mb-2">By Source</h3>
            <div className="flex gap-3 flex-wrap">
              {data.bySource.map(s => (
                <div key={s.source} className="bg-[var(--bg-secondary)] border border-[var(--border)] rounded-lg px-3 py-2 min-w-[120px]">
                  <div className="text-[9px] text-[var(--text-secondary)] uppercase">{s.source}</div>
                  <div className="text-sm font-bold text-[var(--text-primary)]">{formatCost(s.cost)}</div>
                  <div className="text-[9px] text-[var(--text-secondary)]">{s.messages} msgs</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Note */}
        <div className="text-[9px] text-[var(--text-secondary)] border-t border-[var(--border)] pt-3">
          Cost estimates based on API pricing (Opus: $15/$75 per M tokens, Sonnet: $3/$15).
          Actual cost may differ with Claude Max/Pro subscription.
          Daily breakdown groups by session completion date.
        </div>
      </div>
    </div>
  );
}

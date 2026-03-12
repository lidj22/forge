'use client';

import type { Session } from '@/src/types';

const providerLabels: Record<string, string> = {
  anthropic: 'Claude',
  google: 'Gemini',
  openai: 'OpenAI',
  grok: 'Grok',
};

export default function StatusBar({
  providers,
  usage,
  sessions,
}: {
  providers: any[];
  usage: any[];
  sessions: Session[];
}) {
  const running = sessions.filter(s => s.status === 'running').length;
  const idle = sessions.filter(s => s.status === 'idle').length;
  const errored = sessions.filter(s => s.status === 'error').length;

  return (
    <div className="flex flex-col p-3 space-y-4 text-xs overflow-y-auto">
      {/* Overview */}
      <div>
        <h3 className="font-semibold text-[var(--text-secondary)] uppercase mb-2">Status</h3>
        <div className="space-y-1">
          <div className="flex justify-between">
            <span className="text-[var(--green)]">Running</span>
            <span>{running}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[var(--accent)]">Idle</span>
            <span>{idle}</span>
          </div>
          {errored > 0 && (
            <div className="flex justify-between">
              <span className="text-[var(--red)]">Error</span>
              <span>{errored}</span>
            </div>
          )}
        </div>
      </div>

      {/* Providers */}
      <div>
        <h3 className="font-semibold text-[var(--text-secondary)] uppercase mb-2">Providers</h3>
        <div className="space-y-2">
          {providers.filter(p => p.enabled).map(p => {
            const u = usage.find((u: any) => u.provider === p.name);
            const totalTokens = u ? u.totalInput + u.totalOutput : 0;

            return (
              <div key={p.name} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] ${p.hasKey ? 'text-[var(--green)]' : 'text-[var(--yellow)]'}`}>
                      {p.hasKey ? '●' : '○'}
                    </span>
                    <span>{p.displayName}</span>
                  </div>
                  <span className="text-[var(--text-secondary)]">
                    {totalTokens > 0 ? `${(totalTokens / 1000).toFixed(1)}k` : '—'}
                  </span>
                </div>
                {totalTokens > 0 && (
                  <div className="ml-4 h-1 bg-[var(--bg-primary)] rounded overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] rounded"
                      style={{ width: `${Math.min((totalTokens / 100000) * 100, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick info */}
      <div>
        <h3 className="font-semibold text-[var(--text-secondary)] uppercase mb-2">Info</h3>
        <div className="space-y-1 text-[var(--text-secondary)]">
          <div className="flex justify-between">
            <span>Sessions</span>
            <span>{sessions.length}</span>
          </div>
          <div className="flex justify-between">
            <span>Total msgs</span>
            <span>{sessions.reduce((a, s) => a + s.messageCount, 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

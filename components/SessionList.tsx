'use client';

import type { Session } from '@/src/types';

const statusConfig = {
  running: { icon: '●', color: 'text-[var(--green)]' },
  idle: { icon: '●', color: 'text-[var(--accent)]' },
  paused: { icon: '○', color: 'text-[var(--yellow)]' },
  archived: { icon: '○', color: 'text-[var(--text-secondary)]' },
  error: { icon: '●', color: 'text-[var(--red)]' },
};

const providerLabels: Record<string, string> = {
  anthropic: 'Claude',
  google: 'Gemini',
  openai: 'OpenAI',
  grok: 'Grok',
};

export default function SessionList({
  sessions,
  activeId,
  onSelect,
}: {
  sessions: Session[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto">
      {sessions.map(s => {
        const cfg = statusConfig[s.status] || statusConfig.idle;
        const isActive = s.id === activeId;

        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-[var(--border)] hover:bg-[var(--bg-tertiary)] transition-colors ${
              isActive ? 'bg-[var(--bg-tertiary)] border-l-2 border-l-[var(--accent)]' : ''
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`text-xs ${cfg.color}`}>{cfg.icon}</span>
              <span className="text-sm font-medium truncate">{s.name}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5 ml-4">
              <span className="text-[10px] text-[var(--text-secondary)]">
                {providerLabels[s.provider] || s.provider}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">
                {s.memory.strategy}
              </span>
              <span className="text-[10px] text-[var(--text-secondary)]">
                {s.messageCount}msg
              </span>
            </div>
            {s.lastMessage && (
              <p className="text-[10px] text-[var(--text-secondary)] mt-0.5 ml-4 truncate">
                {s.lastMessage.slice(0, 60)}
              </p>
            )}
          </button>
        );
      })}

      {sessions.length === 0 && (
        <div className="p-4 text-center text-xs text-[var(--text-secondary)]">
          No sessions yet
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import type { TaskLogEntry } from '@/src/types';

// ─── Colors per agent ─────────────────────────────────────

const TERM_COLORS = [
  { headerBg: '#1e2a4a', border: '#3b82f6', accent: '#60a5fa' },
  { headerBg: '#2a1e4a', border: '#8b5cf6', accent: '#a78bfa' },
  { headerBg: '#1e3a2a', border: '#22c55e', accent: '#4ade80' },
  { headerBg: '#3a2a1e', border: '#f97316', accent: '#fb923c' },
];

// ─── Task SSE stream hook ─────────────────────────────────

function useAgentStream(taskIds: string[]) {
  const [logs, setLogs] = useState<Map<string, TaskLogEntry[]>>(new Map());
  const activeRef = useRef(new Set<string>());

  useEffect(() => {
    const sources: EventSource[] = [];
    for (const taskId of taskIds) {
      if (!taskId || activeRef.current.has(taskId)) continue;
      activeRef.current.add(taskId);
      const es = new EventSource(`/api/tasks/${taskId}/stream`);
      sources.push(es);
      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log') {
            setLogs(prev => { const next = new Map(prev); next.set(taskId, [...(next.get(taskId) || []), data.entry]); return next; });
          } else if (data.type === 'complete' && data.task) {
            setLogs(prev => { const next = new Map(prev); next.set(taskId, data.task.log || []); return next; });
          }
        } catch {}
      };
      es.onerror = () => { es.close(); activeRef.current.delete(taskId); };
    }
    return () => { sources.forEach(es => es.close()); };
  }, [taskIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  return logs;
}

// ─── Log line renderer ────────────────────────────────────

function LogLine({ entry, accent }: { entry: TaskLogEntry; accent: string }) {
  if (entry.type === 'system' && entry.subtype === 'init') return <div className="text-gray-600 text-[9px]">{entry.content}</div>;
  if (entry.type === 'assistant' && entry.subtype === 'tool_use') {
    return <div className="text-[10px]"><span style={{ color: accent }}>⚙</span> <span className="text-blue-400">{entry.tool || 'tool'}</span><span className="text-gray-600"> {entry.content.slice(0, 100)}{entry.content.length > 100 ? '...' : ''}</span></div>;
  }
  if (entry.type === 'assistant' && entry.subtype === 'tool_result') {
    return <div className={`text-[10px] ${entry.content.toLowerCase().includes('error') ? 'text-red-400' : 'text-gray-500'}`}>{'  → '}{entry.content.slice(0, 150)}{entry.content.length > 150 ? '...' : ''}</div>;
  }
  if (entry.type === 'result') return <div className="text-green-400 text-[10px]">{entry.content}</div>;
  if (entry.subtype === 'error') return <div className="text-red-400 text-[10px]">{entry.content}</div>;
  return <div className="text-[10px]" style={{ color: '#c9d1d9' }}>{entry.content.slice(0, 200)}{entry.content.length > 200 ? '...' : ''}</div>;
}

// ─── Agent terminal panel with inline input ───────────────

function AgentTerminalPanel({ agentDef, messages, colorIdx, allLogs, pipelineId, pipelineRunning, onViewTask }: {
  agentDef: { id: string; agent: string; role: string };
  messages: any[];
  colorIdx: number;
  allLogs: Map<string, TaskLogEntry[]>;
  pipelineId: string;
  pipelineRunning: boolean;
  onViewTask?: (taskId: string) => void;
}) {
  const colors = TERM_COLORS[colorIdx % TERM_COLORS.length];
  const scrollRef = useRef<HTMLDivElement>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const lastMsg = messages[messages.length - 1];
  const isRunning = lastMsg?.status === 'running';

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, allLogs]);

  const handleSend = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch(`/api/pipelines/${pipelineId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'inject', agentId: agentDef.id, message: input }),
      });
      setInput('');
    } catch {}
    setSending(false);
  };

  return (
    <div className="flex flex-col min-w-0 min-h-0 border rounded-lg overflow-hidden" style={{ borderColor: colors.border, flex: 1 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 shrink-0" style={{ background: colors.headerBg, borderBottom: `1px solid ${colors.border}` }}>
        <div className="flex gap-1">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
        </div>
        <span className="text-[10px] font-bold text-white ml-1">{agentDef.id}</span>
        <span className="text-[8px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${colors.accent}30`, color: colors.accent }}>{agentDef.agent}</span>
        {isRunning && <span className="text-[8px] text-yellow-400 animate-pulse">● running</span>}
        {lastMsg && !isRunning && lastMsg.status === 'done' && <span className="text-[8px] text-green-400">✓</span>}
        <span className="text-[7px] text-gray-500 ml-auto truncate max-w-[120px]">{agentDef.role}</span>
      </div>

      {/* Terminal body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-[1.6]" style={{ background: '#0d1117', color: '#c9d1d9' }}>
        {messages.length === 0 && (
          <div className="text-gray-600"><span style={{ color: colors.accent }}>$</span> waiting for input...</div>
        )}
        {messages.map((msg: any, idx: number) => {
          const taskLogs = allLogs.get(msg.taskId) || [];
          return (
            <div key={idx} className="mb-2">
              <div className="text-gray-600 text-[8px]">{'─'.repeat(15)} R{msg.round} {'─'.repeat(15)}</div>
              {/* User inject messages */}
              {msg.agentId === 'user' ? (
                <div className="text-yellow-300 text-[10px]"><span className="text-yellow-500">▸</span> {msg.content}</div>
              ) : msg.status === 'running' ? (
                <>
                  <div className="text-gray-500 text-[9px]"><span style={{ color: colors.accent }}>$</span> task:{msg.taskId}</div>
                  {taskLogs.length === 0 ? (
                    <div className="text-gray-600 animate-pulse">Starting...</div>
                  ) : taskLogs.map((e, i) => <LogLine key={i} entry={e} accent={colors.accent} />)}
                  <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-0.5" />
                </>
              ) : msg.status === 'done' ? (
                <>
                  <div className="text-gray-500 text-[9px]">
                    <span style={{ color: colors.accent }}>$</span> task:{msg.taskId}
                    {onViewTask && <button onClick={() => onViewTask(msg.taskId)} className="ml-2 hover:underline" style={{ color: colors.accent }}>view</button>}
                  </div>
                  <div className="whitespace-pre-wrap text-[10px]" style={{ color: '#c9d1d9' }}>{msg.content.slice(0, 5000)}{msg.content.length > 5000 ? '\n[...]' : ''}</div>
                  <div className="text-green-500 text-[8px] mt-0.5">✓ {new Date(msg.timestamp).toLocaleTimeString()}</div>
                </>
              ) : msg.status === 'failed' ? (
                <div className="text-red-400 text-[10px]">{msg.content || 'Failed'}</div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Inline input */}
      {pipelineRunning && (
        <div className="flex items-center gap-1 px-2 py-1 shrink-0" style={{ background: '#161b22', borderTop: `1px solid ${colors.border}40` }}>
          <span className="text-[10px] font-mono" style={{ color: colors.accent }}>$</span>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder={`@${agentDef.id}...`}
            className="flex-1 bg-transparent text-[10px] font-mono text-gray-300 focus:outline-none placeholder:text-gray-600"
          />
          {input.trim() && (
            <button onClick={handleSend} disabled={sending} className="text-[8px] px-1.5 py-0.5 rounded" style={{ background: `${colors.accent}30`, color: colors.accent }}>
              {sending ? '...' : 'Send'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Horizontal data flow connector ───────────────────────

function HorizontalFlow({ fromColor, toColor, label, isActive }: {
  fromColor: string; toColor: string; label: string; isActive: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center w-10 shrink-0 gap-0.5">
      <svg width="32" height="24" viewBox="0 0 32 24">
        <defs>
          <linearGradient id={`hflow-${label}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={fromColor} />
            <stop offset="100%" stopColor={toColor} />
          </linearGradient>
        </defs>
        <line x1="0" y1="12" x2="24" y2="12" stroke={`url(#hflow-${label})`} strokeWidth="2"
          strokeDasharray={isActive ? '4 3' : '2 2'} opacity={isActive ? 1 : 0.3}>
          {isActive && <animate attributeName="stroke-dashoffset" from="14" to="0" dur="0.6s" repeatCount="indefinite" />}
        </line>
        <polygon points="22,6 32,12 22,18" fill={toColor} opacity={isActive ? 1 : 0.3} />
      </svg>
      <div className="text-[7px] text-gray-500">{label}</div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────

export default function ConversationTerminalView({ pipeline, onViewTask }: {
  pipeline: any;
  onViewTask?: (taskId: string) => void;
}) {
  const conv = pipeline.conversation;
  if (!conv) return null;

  const { config, messages } = conv;
  const agents = config.agents || [];
  const isRunning = pipeline.status === 'running';

  const runningTaskIds = messages.filter((m: any) => m.status === 'running' && m.taskId).map((m: any) => m.taskId);
  const allLogs = useAgentStream(runningTaskIds);

  const agentMessages: Record<string, any[]> = {};
  for (const a of agents) {
    agentMessages[a.id] = messages.filter((m: any) => m.agentId === a.id || (m.agentId === 'user' && m.content.includes(`@${a.id}`)));
  }

  // Data flow state per pair
  const getFlowState = (fromIdx: number, toIdx: number) => {
    const toAgent = agents[toIdx];
    const toMsgs = messages.filter((m: any) => m.agentId === toAgent.id);
    const latestTo = toMsgs[toMsgs.length - 1];
    const isActive = latestTo?.status === 'running';
    const latestRound = latestTo?.round || 0;
    return { isActive, round: latestRound };
  };

  return (
    <div className="flex flex-col h-full" style={{ background: '#0d1117' }}>
      {/* Top: Initial Prompt bar */}
      <div className="shrink-0 mx-3 mt-2 mb-1 border border-green-500/40 rounded-lg overflow-hidden" style={{ background: '#0d1e0d' }}>
        <div className="flex items-center gap-2 px-3 py-1" style={{ borderBottom: '1px solid rgba(34,197,94,0.2)' }}>
          <span className="text-green-400 text-[10px]">▶</span>
          <span className="text-[10px] font-bold text-green-300">Initial Prompt</span>
          <span className="text-[8px] text-gray-500 ml-auto">R{conv.currentRound}/{config.maxRounds}</span>
        </div>
        <div className="px-3 py-1.5 text-[10px] font-mono text-green-200/80 whitespace-pre-wrap line-clamp-2">{config.initialPrompt}</div>
      </div>

      {/* Down arrow from prompt */}
      <div className="flex justify-center shrink-0">
        <svg width="20" height="16" viewBox="0 0 20 16">
          <line x1="10" y1="0" x2="10" y2="10" stroke="#22c55e" strokeWidth="2" strokeDasharray="3 2">
            {isRunning && <animate attributeName="stroke-dashoffset" from="10" to="0" dur="0.6s" repeatCount="indefinite" />}
          </line>
          <polygon points="5,10 15,10 10,16" fill="#22c55e" opacity={isRunning ? 1 : 0.4} />
        </svg>
      </div>

      {/* Middle: Agent terminals with flow connectors */}
      <div className="flex-1 flex items-stretch gap-0 px-3 min-h-0">
        {agents.map((agent: any, i: number) => {
          const flow = i > 0 ? getFlowState(i - 1, i) : null;
          return (
            <div key={agent.id} className="flex items-stretch min-w-0" style={{ flex: 1 }}>
              {i > 0 && flow && (
                <HorizontalFlow
                  fromColor={TERM_COLORS[(i - 1) % TERM_COLORS.length].accent}
                  toColor={TERM_COLORS[i % TERM_COLORS.length].accent}
                  label={flow.round > 0 ? `R${flow.round}` : ''}
                  isActive={flow.isActive}
                />
              )}
              <AgentTerminalPanel
                agentDef={agent}
                messages={agentMessages[agent.id] || []}
                colorIdx={i}
                allLogs={allLogs}
                pipelineId={pipeline.id}
                pipelineRunning={isRunning}
                onViewTask={onViewTask}
              />
            </div>
          );
        })}
      </div>

      {/* Up arrow to status */}
      <div className="flex justify-center shrink-0">
        <svg width="20" height="16" viewBox="0 0 20 16">
          <line x1="10" y1="0" x2="10" y2="10" stroke={pipeline.status === 'done' ? '#22c55e' : pipeline.status === 'failed' ? '#ef4444' : '#6b7280'} strokeWidth="2" strokeDasharray="3 2" />
          <polygon points="5,10 15,10 10,16" fill={pipeline.status === 'done' ? '#22c55e' : pipeline.status === 'failed' ? '#ef4444' : '#6b7280'} opacity="0.5" />
        </svg>
      </div>

      {/* Bottom: Status bar */}
      <div className={`shrink-0 mx-3 mb-2 border rounded-lg px-3 py-1.5 text-center text-[10px] font-mono ${
        pipeline.status === 'done' ? 'border-green-500/40 text-green-400 bg-green-500/5' :
        pipeline.status === 'failed' ? 'border-red-500/40 text-red-400 bg-red-500/5' :
        pipeline.status === 'cancelled' ? 'border-gray-500/40 text-gray-400 bg-gray-500/5' :
        'border-yellow-500/40 text-yellow-400 bg-yellow-500/5'
      }`}>
        {pipeline.status === 'running' ? `Running — Round ${conv.currentRound}/${config.maxRounds}` :
         pipeline.status === 'done' ? `Complete — ${messages.filter((m: any) => m.agentId !== 'user').length} messages` :
         pipeline.status === 'failed' ? 'Failed' : 'Cancelled'}
        {config.stopCondition && pipeline.status === 'running' && (
          <span className="text-gray-500 ml-2">stop: {config.stopCondition}</span>
        )}
      </div>
    </div>
  );
}

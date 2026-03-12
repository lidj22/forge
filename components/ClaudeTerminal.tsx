'use client';

import { useState, useEffect, useRef } from 'react';

interface ClaudeMessage {
  type: 'system' | 'assistant' | 'result';
  subtype?: string;
  content: string;
  tool?: string;
  costUSD?: number;
  sessionId?: string;
  timestamp: string;
}

interface ClaudeProcess {
  id: string;
  projectName: string;
  projectPath: string;
  status: string;
  conversationId?: string;
}

export default function ClaudeTerminal({
  process: proc,
  onKill,
}: {
  process: ClaudeProcess;
  onKill: (id: string) => void;
}) {
  const [messages, setMessages] = useState<ClaudeMessage[]>([]);
  const [input, setInput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(proc.conversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Connect SSE stream with auto-reconnect
  useEffect(() => {
    let cancelled = false;
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      es = new EventSource(`/api/claude/${proc.id}/stream`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        try {
          const msg: ClaudeMessage = JSON.parse(event.data);
          setMessages(prev => {
            // Deduplicate by timestamp+content on reconnect
            if (prev.some(m => m.timestamp === msg.timestamp && m.content === msg.content)) {
              return prev;
            }
            return [...prev, msg];
          });

          if (msg.sessionId) {
            setConversationId(msg.sessionId);
          }

          if (msg.subtype === 'complete') {
            setIsRunning(false);
          }
        } catch {}
      };

      es.onerror = () => {
        es?.close();
        eventSourceRef.current = null;
        // Auto-reconnect after 2s
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 2000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      es?.close();
      eventSourceRef.current = null;
    };
  }, [proc.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isRunning) return;

    setInput('');
    setIsRunning(true);

    await fetch(`/api/claude/${proc.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', content: text, conversationId }),
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="h-8 border-b border-[var(--border)] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${proc.status === 'running' || isRunning ? 'text-[var(--green)]' : 'text-[var(--text-secondary)]'}`}>●</span>
          <span className="text-xs font-semibold">Claude Code</span>
          <span className="text-[10px] text-[var(--text-secondary)]">{proc.projectName}</span>
          {isRunning && <span className="text-[10px] text-[var(--accent)] animate-pulse">thinking...</span>}
        </div>
        <button
          onClick={() => onKill(proc.id)}
          className="text-[10px] px-2 py-0.5 text-[var(--red)] hover:bg-[var(--red)] hover:text-white rounded transition-colors"
        >
          Kill
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs">
        {messages.length === 0 && (
          <div className="text-center text-[var(--text-secondary)] py-8">
            <p>Send a message to start working with Claude Code</p>
            <p className="text-[10px] mt-1">Working in: {proc.projectPath}</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <MessageBubble key={i} msg={msg} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isRunning ? 'Waiting for response...' : 'Send a message to Claude Code...'}
            disabled={isRunning}
            rows={2}
            className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-xs text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={isRunning || !input.trim()}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded text-xs hover:opacity-90 disabled:opacity-50 self-end"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ClaudeMessage }) {
  // User input
  if (msg.type === 'system' && msg.subtype === 'user_input') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] px-3 py-2 bg-[var(--accent)] text-white rounded-lg rounded-br-sm">
          <pre className="whitespace-pre-wrap break-words">{msg.content}</pre>
        </div>
      </div>
    );
  }

  // System init — show model info subtly
  if (msg.type === 'system' && msg.subtype === 'init') {
    return (
      <div className="text-center text-[10px] text-[var(--text-secondary)] py-1">
        {msg.content}
      </div>
    );
  }

  // Error
  if (msg.subtype === 'error') {
    return (
      <div className="px-3 py-2 bg-red-900/20 border border-red-800/30 rounded text-[var(--red)]">
        <pre className="whitespace-pre-wrap break-words">{msg.content}</pre>
      </div>
    );
  }

  // Completion notice
  if (msg.subtype === 'complete') {
    return (
      <div className="text-center text-[10px] text-[var(--text-secondary)] py-1">
        {msg.content}
        {msg.costUSD != null && ` · $${msg.costUSD.toFixed(4)}`}
      </div>
    );
  }

  // Tool use
  if (msg.subtype === 'tool_use') {
    return (
      <div className="px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded">
            {msg.tool || 'tool'}
          </span>
        </div>
        <pre className="whitespace-pre-wrap break-words text-[var(--text-secondary)] max-h-40 overflow-y-auto">
          {formatToolContent(msg.content)}
        </pre>
      </div>
    );
  }

  // Tool result
  if (msg.subtype === 'tool_result') {
    return (
      <div className="px-3 py-2 bg-[var(--bg-tertiary)] border-l-2 border-[var(--accent)] rounded-r">
        <pre className="whitespace-pre-wrap break-words text-[var(--text-secondary)] max-h-60 overflow-y-auto">
          {formatToolContent(msg.content)}
        </pre>
      </div>
    );
  }

  // Final result
  if (msg.type === 'result') {
    return (
      <div className="px-3 py-2 bg-green-900/10 border border-green-800/20 rounded">
        <pre className="whitespace-pre-wrap break-words">{msg.content}</pre>
        {msg.costUSD != null && (
          <div className="text-[10px] text-[var(--text-secondary)] mt-1">Cost: ${msg.costUSD.toFixed(4)}</div>
        )}
      </div>
    );
  }

  // Regular assistant text
  return (
    <div className="px-3 py-2">
      <pre className="whitespace-pre-wrap break-words text-[var(--text-primary)]">{msg.content}</pre>
    </div>
  );
}

function formatToolContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return content;
  }
}

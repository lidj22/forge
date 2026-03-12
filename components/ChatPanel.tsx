'use client';

import { useState, useEffect, useRef } from 'react';
import type { Session, Message } from '@/src/types';

const providerLabels: Record<string, string> = {
  anthropic: 'Claude',
  google: 'Gemini',
  openai: 'OpenAI',
  grok: 'Grok',
};

export default function ChatPanel({
  session,
  onUpdate,
}: {
  session: Session;
  onUpdate: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load messages when session changes
  useEffect(() => {
    fetch(`/api/sessions/${session.id}/messages`)
      .then(r => r.json())
      .then(setMessages);
  }, [session.id]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamContent]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    setInput('');
    setStreaming(true);
    setStreamContent('');

    // Optimistic: add user message
    const userMsg: Message = {
      id: Date.now(),
      sessionId: session.id,
      role: 'user',
      content: text,
      provider: session.provider,
      model: session.model,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg]);

    try {
      const res = await fetch(`/api/sessions/${session.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullContent = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.token) {
                fullContent += data.token;
                setStreamContent(fullContent);
              }
              if (data.done) {
                // Add final assistant message
                const assistantMsg: Message = {
                  id: Date.now() + 1,
                  sessionId: session.id,
                  role: 'assistant',
                  content: fullContent,
                  provider: session.provider,
                  model: session.model,
                  createdAt: new Date().toISOString(),
                };
                setMessages(prev => [...prev, assistantMsg]);
                setStreamContent('');
              }
              if (data.error) {
                setStreamContent(`Error: ${data.error}`);
              }
            } catch {}
          }
        }
      }
    } catch (err: any) {
      setStreamContent(`Error: ${err.message}`);
    }

    setStreaming(false);
    onUpdate();
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Session header */}
      <div className="h-10 border-b border-[var(--border)] flex items-center px-4 gap-3 shrink-0">
        <span className="text-sm font-semibold">{session.name}</span>
        <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
          {providerLabels[session.provider] || session.provider}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 bg-[var(--bg-tertiary)] rounded text-[var(--text-secondary)]">
          {session.memory.strategy}
        </span>
        <span className="text-[10px] text-[var(--text-secondary)]">
          {session.messageCount} messages
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] px-3 py-2 rounded-lg text-sm whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {streamContent && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3 py-2 rounded-lg text-sm bg-[var(--bg-tertiary)] text-[var(--text-primary)] whitespace-pre-wrap">
              {streamContent}
              <span className="animate-pulse">▌</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-[var(--border)] p-3 shrink-0">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={streaming ? 'Waiting for response...' : 'Type a message... (Enter to send, Shift+Enter for newline)'}
            disabled={streaming}
            rows={1}
            className="flex-1 px-3 py-2 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded text-sm text-[var(--text-primary)] resize-none focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
          />
          <button
            onClick={sendMessage}
            disabled={streaming || !input.trim()}
            className="px-4 py-2 bg-[var(--accent)] text-white text-sm rounded hover:opacity-90 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

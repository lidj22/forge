'use client';

import { useState, useEffect } from 'react';

export default function PreviewPanel() {
  const [port, setPort] = useState(0);
  const [inputPort, setInputPort] = useState('');
  const [status, setStatus] = useState<'idle' | 'connected' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/preview')
      .then(r => r.json())
      .then(d => {
        if (d.port) {
          setPort(d.port);
          setInputPort(String(d.port));
          checkConnection(d.port);
        }
      })
      .catch(() => {});
  }, []);

  const checkConnection = async (p: number) => {
    try {
      const res = await fetch(`/api/preview/`);
      if (res.ok) setStatus('connected');
      else setStatus('error');
    } catch {
      setStatus('error');
    }
  };

  const handleStart = async () => {
    const p = parseInt(inputPort);
    if (!p || p < 1 || p > 65535) {
      setError('Invalid port');
      return;
    }
    setError('');
    await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: p }),
    });
    setPort(p);
    checkConnection(p);
  };

  const handleStop = async () => {
    await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ port: 0 }),
    });
    setPort(0);
    setStatus('idle');
  };

  const previewUrl = port ? `/api/preview/` : '';

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Control bar */}
      <div className="px-4 py-2 border-b border-[var(--border)] flex items-center gap-3 shrink-0">
        <span className="text-[11px] font-semibold text-[var(--text-primary)]">Preview</span>

        <input
          type="number"
          value={inputPort}
          onChange={e => setInputPort(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleStart()}
          placeholder="Port (e.g. 5173)"
          className="w-28 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
        />

        {port ? (
          <>
            <span className={`text-[10px] ${status === 'connected' ? 'text-green-400' : status === 'error' ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
              {status === 'connected' ? `● localhost:${port}` : status === 'error' ? `● Cannot reach :${port}` : '○ Checking...'}
            </span>
            <button
              onClick={() => checkConnection(port)}
              className="text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              Refresh
            </button>
            <button
              onClick={handleStop}
              className="text-[10px] text-red-400 hover:text-red-300"
            >
              Stop
            </button>
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener"
              className="text-[10px] text-[var(--accent)] hover:underline ml-auto"
            >
              Open in new tab ↗
            </a>
          </>
        ) : (
          <button
            onClick={handleStart}
            disabled={!inputPort}
            className="text-[10px] px-3 py-1 bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            Connect
          </button>
        )}

        {error && <span className="text-[10px] text-red-400">{error}</span>}
      </div>

      {/* Preview iframe */}
      {port && status === 'connected' ? (
        <iframe
          src={previewUrl}
          className="flex-1 w-full border-0 bg-white"
          title="Preview"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
          <div className="text-center space-y-2">
            <p className="text-sm">Preview a local dev server</p>
            <p className="text-xs">Enter the port of your running dev server (e.g. 5173 for Vite, 3001 for Next.js)</p>
            <p className="text-[10px]">Accessible via tunnel: <code className="text-[var(--accent)]">/api/preview/</code></p>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';

interface PreviewEntry {
  port: number;
  url: string | null;
  status: string;
  label?: string;
}

export default function PreviewPanel() {
  const [previews, setPreviews] = useState<PreviewEntry[]>([]);
  const [inputPort, setInputPort] = useState('');
  const [inputLabel, setInputLabel] = useState('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [activePreview, setActivePreview] = useState<number | null>(null);
  const [isRemote, setIsRemote] = useState(false);

  useEffect(() => {
    setIsRemote(!['localhost', '127.0.0.1'].includes(window.location.hostname));
  }, []);

  const fetchPreviews = useCallback(async () => {
    try {
      const res = await fetch('/api/preview');
      const data = await res.json();
      if (Array.isArray(data)) setPreviews(data);
    } catch {}
  }, []);

  useEffect(() => {
    fetchPreviews();
    const timer = setInterval(fetchPreviews, 5000);
    return () => clearInterval(timer);
  }, [fetchPreviews]);

  const handleStart = async () => {
    const p = parseInt(inputPort);
    if (!p || p < 1 || p > 65535) { setError('Invalid port'); return; }
    setError('');
    setStarting(true);
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', port: p, label: inputLabel || undefined }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else {
        setInputPort('');
        setInputLabel('');
        setActivePreview(p);
      }
      fetchPreviews();
    } catch { setError('Failed'); }
    setStarting(false);
  };

  const handleStop = async (port: number) => {
    await fetch('/api/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', port }),
    });
    if (activePreview === port) setActivePreview(null);
    fetchPreviews();
  };

  const active = previews.find(p => p.port === activePreview);
  const previewSrc = active
    ? (isRemote ? active.url : `http://localhost:${active.port}`)
    : null;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Top bar */}
      <div className="px-4 py-2 border-b border-[var(--border)] shrink-0 space-y-2">
        {/* Preview list */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-semibold text-[var(--text-primary)]">Demo Preview</span>
          {previews.map(p => (
            <div key={p.port} className="flex items-center gap-1">
              <button
                onClick={() => setActivePreview(p.port)}
                className={`text-[10px] px-2 py-0.5 rounded ${activePreview === p.port ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}
              >
                <span className={`mr-1 ${p.status === 'running' ? 'text-green-400' : 'text-gray-500'}`}>●</span>
                {p.label || `:${p.port}`}
              </button>
              {p.url && (
                <button
                  onClick={() => navigator.clipboard.writeText(p.url!)}
                  className="text-[8px] text-green-400 hover:text-green-300 truncate max-w-[150px]"
                  title={`Copy: ${p.url}`}
                >
                  {p.url.replace('https://', '').slice(0, 20)}...
                </button>
              )}
              <button
                onClick={() => handleStop(p.port)}
                className="text-[9px] text-red-400 hover:text-red-300"
              >
                x
              </button>
            </div>
          ))}
        </div>

        {/* Add new */}
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={inputPort}
            onChange={e => setInputPort(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            placeholder="Port"
            className="w-20 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] font-mono"
          />
          <input
            value={inputLabel}
            onChange={e => setInputLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleStart()}
            placeholder="Label (optional)"
            className="w-32 text-xs bg-[var(--bg-tertiary)] border border-[var(--border)] rounded px-2 py-1 text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
          />
          <button
            onClick={handleStart}
            disabled={!inputPort || starting}
            className="text-[10px] px-3 py-1 bg-[var(--accent)] text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            {starting ? 'Starting...' : '+ Add'}
          </button>
          {active && (
            <a
              href={previewSrc || '#'}
              target="_blank"
              rel="noopener"
              className="text-[10px] text-[var(--accent)] hover:underline ml-auto"
            >
              Open ↗
            </a>
          )}
          {error && <span className="text-[10px] text-red-400">{error}</span>}
        </div>
      </div>

      {/* Preview iframe */}
      {previewSrc && active?.status === 'running' ? (
        <iframe
          src={previewSrc}
          className="flex-1 w-full border-0 bg-white"
          title="Preview"
        />
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--text-secondary)]">
          <div className="text-center space-y-3 max-w-md">
            <p className="text-sm">{previews.length > 0 ? 'Select a preview to display' : 'Preview local dev servers'}</p>
            <p className="text-xs">Enter a port, add a label, and click Add. Each preview gets its own Cloudflare Tunnel URL.</p>
          </div>
        </div>
      )}
    </div>
  );
}

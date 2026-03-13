'use client';

import { useState, useEffect, useCallback } from 'react';

interface TunnelStatus {
  status: 'stopped' | 'starting' | 'running' | 'error';
  url: string | null;
  error: string | null;
}

export default function TunnelToggle() {
  const [tunnel, setTunnel] = useState<TunnelStatus>({ status: 'stopped', url: null, error: null });
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isRemote, setIsRemote] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  useEffect(() => {
    setIsRemote(!['localhost', '127.0.0.1'].includes(window.location.hostname));
  }, []);

  const refresh = useCallback(() => {
    fetch('/api/tunnel').then(r => r.json()).then(setTunnel).catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (tunnel.status !== 'starting') return;
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [tunnel.status, refresh]);

  const doStop = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      });
      const data = await res.json();
      setTunnel(data);
    } catch {}
    setLoading(false);
    setConfirmStop(false);
  };

  const doStart = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await res.json();
      setTunnel(data);
    } catch {}
    setLoading(false);
  };

  const copyUrl = () => {
    if (tunnel.url) {
      navigator.clipboard.writeText(tunnel.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Hide tunnel controls when accessing remotely
  if (isRemote) {
    return null;
  }

  // Stop confirmation dialog
  if (confirmStop) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--text-secondary)]">Stop tunnel?</span>
        <button
          onClick={doStop}
          disabled={loading}
          className="text-[10px] px-2 py-0.5 bg-[var(--red)] text-white rounded hover:opacity-90"
        >
          Confirm
        </button>
        <button
          onClick={() => setConfirmStop(false)}
          className="text-[10px] px-2 py-0.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>
    );
  }

  if (tunnel.status === 'stopped' && !tunnel.error) {
    return (
      <button
        onClick={doStart}
        disabled={loading}
        className="text-[10px] px-2 py-0.5 border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-secondary)] transition-colors disabled:opacity-50"
        title="Start Cloudflare Tunnel for remote access"
      >
        {loading ? 'Starting...' : 'Tunnel'}
      </button>
    );
  }

  if (tunnel.status === 'starting') {
    return (
      <span className="text-[10px] px-2 py-0.5 border border-[var(--yellow)] rounded text-[var(--yellow)]">
        Tunnel starting...
      </span>
    );
  }

  if (tunnel.status === 'running' && tunnel.url) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          onClick={copyUrl}
          className="text-[10px] px-2 py-0.5 border border-[var(--green)] rounded text-[var(--green)] hover:bg-[var(--green)] hover:text-black transition-colors truncate max-w-[200px]"
          title={`Click to copy: ${tunnel.url}`}
        >
          {copied ? 'Copied!' : tunnel.url.replace('https://', '')}
        </button>
        <button
          onClick={() => setConfirmStop(true)}
          disabled={loading}
          className="text-[10px] px-1.5 py-0.5 text-[var(--red)] hover:bg-[var(--red)] hover:text-white rounded transition-colors"
          title="Stop tunnel"
        >
          Stop
        </button>
      </div>
    );
  }

  if (tunnel.status === 'error') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] text-[var(--red)] truncate max-w-[200px]" title={tunnel.error || ''}>
          Tunnel error
        </span>
        <button
          onClick={doStart}
          disabled={loading}
          className="text-[10px] px-2 py-0.5 border border-[var(--border)] rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  return null;
}

'use client';

export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html>
      <body style={{ background: '#0a0a0a', color: '#e5e5e5', fontFamily: 'monospace', padding: '2rem' }}>
        <h2>Something went wrong</h2>
        <p style={{ color: '#999' }}>{error.message}</p>
        <button onClick={reset} style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          Try again
        </button>
      </body>
    </html>
  );
}

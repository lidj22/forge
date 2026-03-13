import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3'],
  async rewrites() {
    return [
      {
        // Proxy terminal WebSocket through Next.js so it works via Cloudflare Tunnel
        source: '/terminal-ws',
        destination: 'http://localhost:3001',
      },
    ];
  },
};

export default nextConfig;

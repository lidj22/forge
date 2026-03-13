import { NextResponse } from 'next/server';
import { startTunnel, stopTunnel, getTunnelStatus } from '@/lib/cloudflared';

/** GET /api/tunnel — current tunnel status */
export async function GET() {
  return NextResponse.json(getTunnelStatus());
}

/** POST /api/tunnel — start or stop tunnel */
export async function POST(req: Request) {
  const { action } = await req.json() as { action: 'start' | 'stop' };

  if (action === 'stop') {
    stopTunnel();
    return NextResponse.json({ ok: true, ...getTunnelStatus() });
  }

  const result = await startTunnel();
  return NextResponse.json({ ok: !result.error, ...getTunnelStatus() });
}

import { NextResponse } from 'next/server';
import { startTunnel, stopTunnel, getTunnelStatus } from '@/lib/cloudflared';
import { verifyAdmin } from '@/lib/password';

export async function GET() {
  return NextResponse.json(getTunnelStatus());
}

export async function POST(req: Request) {
  const body = await req.json() as { action: 'start' | 'stop'; password?: string };

  if (body.action === 'start') {
    if (!body.password || !verifyAdmin(body.password)) {
      return NextResponse.json({ ok: false, error: 'Wrong password' }, { status: 403 });
    }
    const result = await startTunnel();
    return NextResponse.json({ ok: !result.error, ...getTunnelStatus() });
  }

  if (body.action === 'stop') {
    stopTunnel();
    return NextResponse.json({ ok: true, ...getTunnelStatus() });
  }

  return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
}

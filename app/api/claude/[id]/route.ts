import { NextResponse } from 'next/server';
import { getProcess, sendToClaudeSession, killProcess } from '@/lib/claude-process';

// Get session info
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const proc = getProcess(id);
  if (!proc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(proc);
}

// Send a message to the Claude session
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  if (body.type === 'message') {
    const ok = sendToClaudeSession(id, body.content, body.conversationId);
    if (!ok) {
      return NextResponse.json({ error: 'Session not found or already running' }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.type === 'kill') {
    killProcess(id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
}

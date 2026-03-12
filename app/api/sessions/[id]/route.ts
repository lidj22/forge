import { NextResponse } from 'next/server';
import { getSessionManager } from '@/lib/session-manager';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = getSessionManager();
  const session = manager.get(id) || manager.getByName(id);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(session);
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = getSessionManager();
  manager.delete(id);
  return NextResponse.json({ ok: true });
}

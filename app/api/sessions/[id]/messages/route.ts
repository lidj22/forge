import { NextResponse } from 'next/server';
import { getSessionManager } from '@/lib/session-manager';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const manager = getSessionManager();
  const messages = manager.getMessages(id);
  return NextResponse.json(messages);
}

import { NextResponse } from 'next/server';
import { getSessionManager } from '@/lib/session-manager';
import { loadAllTemplates } from '@/src/config';

export async function GET() {
  const manager = getSessionManager();
  const sessions = manager.list();
  return NextResponse.json(sessions);
}

export async function POST(req: Request) {
  const body = await req.json();
  const manager = getSessionManager();
  try {
    const session = manager.create(body);
    return NextResponse.json(session);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

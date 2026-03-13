import { NextResponse } from 'next/server';
import { listClaudeSessions, deleteSession } from '@/lib/claude-sessions';
import { getDb } from '@/src/core/db/database';
import { getDbPath } from '@/src/config';

export async function GET(_req: Request, { params }: { params: Promise<{ projectName: string }> }) {
  const { projectName } = await params;
  const sessions = listClaudeSessions(decodeURIComponent(projectName));
  return NextResponse.json(sessions);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ projectName: string }> }) {
  const { projectName } = await params;
  const project = decodeURIComponent(projectName);
  const { sessionId } = await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }

  const deleted = deleteSession(project, sessionId);
  if (!deleted) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  // Also remove from cache
  try {
    const db = getDb(getDbPath());
    db.prepare('DELETE FROM cached_sessions WHERE project_name = ? AND session_id = ?').run(project, sessionId);
  } catch {}

  return NextResponse.json({ ok: true });
}

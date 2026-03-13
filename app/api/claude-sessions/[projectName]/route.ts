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
  const body = await req.json();

  // Support both single sessionId and batch sessionIds
  const ids: string[] = body.sessionIds || (body.sessionId ? [body.sessionId] : []);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'sessionId or sessionIds required' }, { status: 400 });
  }

  const db = getDb(getDbPath());
  let deletedCount = 0;

  for (const id of ids) {
    if (deleteSession(project, id)) {
      deletedCount++;
    }
    try {
      db.prepare('DELETE FROM cached_sessions WHERE project_name = ? AND session_id = ?').run(project, id);
    } catch {}
  }

  return NextResponse.json({ ok: true, deleted: deletedCount });
}

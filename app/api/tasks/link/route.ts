import { NextResponse } from 'next/server';
import { createTask } from '@/lib/task-manager';
import { getProjectInfo } from '@/lib/projects';
import { getDb } from '@/src/core/db/database';
import { getDbPath } from '@/src/config';

/**
 * Link an existing local Claude Code session to a project.
 * Creates a placeholder task with the conversation_id so future tasks
 * for this project automatically continue that session.
 */
export async function POST(req: Request) {
  const { projectName, conversationId } = await req.json();

  if (!projectName || !conversationId) {
    return NextResponse.json({ error: 'projectName and conversationId required' }, { status: 400 });
  }

  const project = getProjectInfo(projectName);
  if (!project) {
    return NextResponse.json({ error: `Project not found: ${projectName}` }, { status: 404 });
  }

  // Create a placeholder "done" task that carries the conversation_id
  const db = getDb(getDbPath());
  const id = `link-${Date.now().toString(36)}`;
  db.prepare(`
    INSERT INTO tasks (id, project_name, project_path, prompt, status, priority, conversation_id, log, result_summary, completed_at)
    VALUES (?, ?, ?, ?, 'done', 0, ?, '[]', ?, datetime('now'))
  `).run(id, project.name, project.path, '(linked from local CLI)', conversationId, `Session ${conversationId} linked from local CLI`);

  return NextResponse.json({
    id,
    projectName: project.name,
    conversationId,
  });
}

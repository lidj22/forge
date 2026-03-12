import { NextResponse } from 'next/server';
import { createClaudeSession, listProcesses, deleteSession } from '@/lib/claude-process';
import { getProjectInfo } from '@/lib/projects';

// List all Claude Code sessions
export async function GET() {
  return NextResponse.json(listProcesses());
}

// Create a new Claude Code session for a project
export async function POST(req: Request) {
  const { projectName } = await req.json();

  const project = getProjectInfo(projectName);
  if (!project) {
    return NextResponse.json({ error: `Project not found: ${projectName}` }, { status: 404 });
  }

  const session = createClaudeSession(project.name, project.path);
  return NextResponse.json(session);
}

// Delete a session
export async function DELETE(req: Request) {
  const { id } = await req.json();
  deleteSession(id);
  return NextResponse.json({ ok: true });
}

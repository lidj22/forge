import { NextResponse } from 'next/server';
import { listWorkspaces, findWorkspaceByProject, loadWorkspace, saveWorkspace, deleteWorkspace } from '@/lib/workspace';
import type { WorkspaceState } from '@/lib/workspace';
import { randomUUID } from 'node:crypto';

// List all workspaces, or find by projectPath query param
export async function GET(req: Request) {
  const url = new URL(req.url);
  const projectPath = url.searchParams.get('projectPath');

  if (projectPath) {
    const ws = findWorkspaceByProject(projectPath);
    return NextResponse.json(ws || null);
  }

  return NextResponse.json(listWorkspaces());
}

// Create a new workspace
export async function POST(req: Request) {
  const { projectPath, projectName } = await req.json();
  if (!projectPath || !projectName) {
    return NextResponse.json({ error: 'projectPath and projectName are required' }, { status: 400 });
  }

  // Check if workspace already exists for this project
  const existing = findWorkspaceByProject(projectPath);
  if (existing) {
    return NextResponse.json(existing);
  }

  const state: WorkspaceState = {
    id: randomUUID(),
    projectPath,
    projectName,
    agents: [],
    agentStates: {},
    nodePositions: {},
    busLog: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  saveWorkspace(state);
  return NextResponse.json(state, { status: 201 });
}

// Delete a workspace
export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  deleteWorkspace(id);
  return NextResponse.json({ ok: true });
}

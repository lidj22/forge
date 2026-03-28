import { NextResponse } from 'next/server';

const WORKSPACE_PORT = Number(process.env.WORKSPACE_PORT) || 8405;
const DAEMON_URL = `http://localhost:${WORKSPACE_PORT}`;

// Proxy to workspace daemon — Memory query
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: workspaceId } = await params;
  const url = new URL(req.url);
  const agentId = url.searchParams.get('agentId');

  if (!agentId) {
    return NextResponse.json({ error: 'agentId required' }, { status: 400 });
  }

  try {
    const res = await fetch(`${DAEMON_URL}/workspace/${workspaceId}/memory?agentId=${encodeURIComponent(agentId)}`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Workspace daemon not available' }, { status: 503 });
  }
}

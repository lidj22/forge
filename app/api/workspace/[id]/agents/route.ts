import { NextResponse } from 'next/server';

const WORKSPACE_PORT = Number(process.env.WORKSPACE_PORT) || 8405;
const DAEMON_URL = `http://localhost:${WORKSPACE_PORT}`;

// Proxy to workspace daemon — Agent operations
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  try {
    const res = await fetch(`${DAEMON_URL}/workspace/${id}/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Workspace daemon not available' }, { status: 503 });
  }
}

// Proxy to workspace daemon — Get agent states
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const res = await fetch(`${DAEMON_URL}/workspace/${id}/agents`);
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err: any) {
    return NextResponse.json({ error: 'Workspace daemon not available' }, { status: 503 });
  }
}

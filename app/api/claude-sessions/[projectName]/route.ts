import { NextResponse } from 'next/server';
import { listClaudeSessions } from '@/lib/claude-sessions';

export async function GET(_req: Request, { params }: { params: Promise<{ projectName: string }> }) {
  const { projectName } = await params;
  const sessions = listClaudeSessions(decodeURIComponent(projectName));
  return NextResponse.json(sessions);
}

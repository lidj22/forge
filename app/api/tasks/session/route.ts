import { NextResponse } from 'next/server';
import { getProjectConversationId } from '@/lib/task-manager';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const project = url.searchParams.get('project');

  if (!project) {
    return NextResponse.json({ error: 'project parameter required' }, { status: 400 });
  }

  const conversationId = getProjectConversationId(project);
  return NextResponse.json({ conversationId });
}

import { NextResponse } from 'next/server';
import { listAgents, getDefaultAgentId, resolveTerminalLaunch } from '@/lib/agents';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolve = url.searchParams.get('resolve');

  // GET /api/agents?resolve=claude → resolve terminal launch info for an agent
  if (resolve) {
    const info = resolveTerminalLaunch(resolve);
    return NextResponse.json(info);
  }

  const agents = listAgents();
  const defaultAgent = getDefaultAgentId();
  return NextResponse.json({ agents, defaultAgent });
}

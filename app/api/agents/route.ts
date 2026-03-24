import { NextResponse } from 'next/server';
import { listAgents, getDefaultAgentId } from '@/lib/agents';

export async function GET() {
  const agents = listAgents();
  const defaultAgent = getDefaultAgentId();
  return NextResponse.json({ agents, defaultAgent });
}

import { NextResponse } from 'next/server';
import { getSessionManager } from '@/lib/session-manager';
import { listAvailableProviders } from '@/src/core/providers/registry';

export async function GET() {
  const manager = getSessionManager();
  return NextResponse.json({
    sessions: manager.list(),
    providers: listAvailableProviders(),
    usage: manager.getUsageSummary(),
  });
}

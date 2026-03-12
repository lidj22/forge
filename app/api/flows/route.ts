import { NextResponse } from 'next/server';
import { listFlows } from '@/lib/flows';

export async function GET() {
  return NextResponse.json(listFlows());
}

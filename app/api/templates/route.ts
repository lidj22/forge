import { NextResponse } from 'next/server';
import { loadAllTemplates } from '@/src/config';

export async function GET() {
  return NextResponse.json(loadAllTemplates());
}

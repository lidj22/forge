import { NextResponse } from 'next/server';
import { scanProjects } from '@/lib/projects';

export async function GET() {
  const projects = scanProjects();
  return NextResponse.json(projects);
}

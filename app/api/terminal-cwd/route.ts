import { NextResponse } from 'next/server';
import { execSync } from 'node:child_process';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const session = searchParams.get('session');
  if (!session || !session.startsWith('mw-')) {
    return NextResponse.json({ path: null });
  }
  try {
    const cwd = execSync(`tmux display-message -p -t ${session} '#{pane_current_path}'`, {
      encoding: 'utf-8',
      timeout: 3000,
    }).trim();
    return NextResponse.json({ path: cwd || null });
  } catch {
    return NextResponse.json({ path: null });
  }
}

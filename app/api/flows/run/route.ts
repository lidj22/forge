import { NextResponse } from 'next/server';
import { runFlow } from '@/lib/flows';

export async function POST(req: Request) {
  const { name } = await req.json();
  if (!name) {
    return NextResponse.json({ error: 'Flow name required' }, { status: 400 });
  }

  try {
    const result = runFlow(name);
    return NextResponse.json({
      flow: result.flow.name,
      tasks: result.tasks.map(t => ({ id: t.id, projectName: t.projectName, prompt: t.prompt })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

import { NextResponse } from 'next/server';
import { getTask, cancelTask, deleteTask, retryTask } from '@/lib/task-manager';

// Get task details (including full log)
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = getTask(id);
  if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(task);
}

// Actions: cancel, retry
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { action } = await req.json();

  if (action === 'cancel') {
    const ok = cancelTask(id);
    return NextResponse.json({ ok });
  }

  if (action === 'retry') {
    const newTask = retryTask(id);
    if (!newTask) return NextResponse.json({ error: 'Cannot retry this task' }, { status: 400 });
    return NextResponse.json(newTask);
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// Delete a task
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  deleteTask(id);
  return NextResponse.json({ ok: true });
}

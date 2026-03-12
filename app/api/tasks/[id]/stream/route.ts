import { getTask } from '@/lib/task-manager';
import { onTaskEvent } from '@/lib/task-manager';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SSE stream for real-time task log updates
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const task = getTask(id);
  if (!task) {
    return new Response('Task not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send existing log entries
      for (const entry of task.log) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', entry })}\n\n`));
      }

      // Send current status
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', status: task.status })}\n\n`));

      // Heartbeat
      heartbeat = setInterval(() => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { cleanup(); }
        }
      }, 15000);

      // Listen for new events
      unsubscribe = onTaskEvent((taskId, event, data) => {
        if (taskId !== id || closed) return;
        try {
          if (event === 'log') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'log', entry: data })}\n\n`));
          } else if (event === 'status') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'status', status: data })}\n\n`));
            // Close stream when task is done
            if (data === 'done' || data === 'failed' || data === 'cancelled') {
              // Send final task data
              const finalTask = getTask(id);
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete', task: finalTask })}\n\n`));
              cleanup();
              controller.close();
            }
          }
        } catch { cleanup(); }
      });
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    closed = true;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

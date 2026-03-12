import { attachToProcess } from '@/lib/claude-process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SSE stream of Claude Code structured messages
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Heartbeat every 15s to keep connection alive
      heartbeat = setInterval(() => {
        if (!closed) {
          try {
            controller.enqueue(encoder.encode(': heartbeat\n\n'));
          } catch {
            // Controller closed
            cleanup();
          }
        }
      }, 15000);

      unsubscribe = attachToProcess(id, (msg) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(msg)}\n\n`));
        } catch {
          cleanup();
        }
      });

      if (!unsubscribe) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'system', subtype: 'error', content: 'Session not found' })}\n\n`));
        cleanup();
        controller.close();
      }
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

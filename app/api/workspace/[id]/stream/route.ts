import { subscribeSSE, getOrchestrator } from '@/lib/workspace/manager';

// SSE stream for real-time workspace events
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const orch = getOrchestrator(id);
  if (!orch) {
    return new Response('Workspace not found', { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send initial state
      const snapshot = orch.getSnapshot();
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'init', ...snapshot })}\n\n`));

      // Subscribe to live events
      const unsubscribe = subscribeSSE(id, (event) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          // Stream closed
          unsubscribe();
        }
      });

      // Keep-alive ping every 15s
      const ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(ping);
          unsubscribe();
        }
      }, 15000);

      // Cleanup on abort
      _req.signal.addEventListener('abort', () => {
        clearInterval(ping);
        unsubscribe();
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

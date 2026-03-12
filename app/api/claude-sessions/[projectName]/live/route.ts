import { getSessionFilePath, readSessionEntries, tailSessionFile } from '@/lib/claude-sessions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ projectName: string }> }) {
  const { projectName } = await params;
  const url = new URL(req.url);
  const sessionId = url.searchParams.get('sessionId');

  if (!sessionId) {
    return new Response('sessionId parameter required', { status: 400 });
  }

  const filePath = getSessionFilePath(decodeURIComponent(projectName), sessionId);
  if (!filePath) {
    return new Response('Session file not found', { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send all existing entries
      const existing = readSessionEntries(filePath);
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'init', entries: existing })}\n\n`));

      // Heartbeat
      heartbeat = setInterval(() => {
        if (!closed) {
          try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { doCleanup(); }
        }
      }, 15000);

      // Tail for new entries
      cleanup = tailSessionFile(
        filePath,
        (entries) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'update', entries })}\n\n`));
          } catch { doCleanup(); }
        },
        () => {
          doCleanup();
          try { controller.close(); } catch {}
        },
      );
    },
    cancel() {
      doCleanup();
    },
  });

  function doCleanup() {
    closed = true;
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (cleanup) { cleanup(); cleanup = null; }
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

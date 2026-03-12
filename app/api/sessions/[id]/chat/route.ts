import { getSessionManager } from '@/lib/session-manager';
import { chatStream } from '@/src/core/providers/chat';
import type { ModelMessage } from 'ai';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { message } = await req.json();
  const manager = getSessionManager();

  const session = manager.get(id);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Session not found' }), { status: 404 });
  }

  // Save user message
  manager.addMessage(id, 'user', message, session.provider, session.model);

  // Get memory-filtered messages
  const memoryMessages = manager.getMemoryMessages(id);
  const coreMessages: ModelMessage[] = memoryMessages.map(m => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  manager.updateStatus(id, 'running');

  // Stream response
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const result = await chatStream({
          provider: session.provider,
          model: session.model || undefined,
          systemPrompt: session.systemPrompt,
          messages: coreMessages,
          onToken(token) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`));
          },
        });

        // Save assistant message
        manager.addMessage(id, 'assistant', result.content, result.provider, result.model);
        manager.recordUsage(id, result);
        manager.updateStatus(id, 'idle');

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, usage: { input: result.inputTokens, output: result.outputTokens } })}\n\n`));
        controller.close();
      } catch (err: any) {
        manager.updateStatus(id, 'error');
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

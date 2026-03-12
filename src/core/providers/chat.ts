import { streamText, generateText, type ModelMessage } from 'ai';
import { getModel } from '@/src/core/providers/registry';
import type { ProviderName } from '@/src/types';

export interface ChatOptions {
  provider: ProviderName;
  model?: string;
  systemPrompt?: string;
  messages: ModelMessage[];
  onToken?: (token: string) => void;
}

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider: ProviderName;
}

export async function chat(options: ChatOptions): Promise<ChatResult> {
  const model = getModel(options.provider, options.model);
  const modelId = options.model || (model as any).modelId || options.model || 'unknown';

  const result = await generateText({
    model,
    system: options.systemPrompt,
    messages: options.messages,
  });

  return {
    content: result.text,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    model: modelId,
    provider: options.provider,
  };
}

export async function chatStream(options: ChatOptions): Promise<ChatResult> {
  const model = getModel(options.provider, options.model);
  const modelId = options.model || (model as any).modelId || options.model || 'unknown';

  const result = streamText({
    model,
    system: options.systemPrompt,
    messages: options.messages,
  });

  let content = '';
  for await (const chunk of result.textStream) {
    content += chunk;
    options.onToken?.(chunk);
  }

  const usage = await result.usage;

  return {
    content,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    model: modelId,
    provider: options.provider,
  };
}

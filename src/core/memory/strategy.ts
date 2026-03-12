import type { Message, MemoryConfig } from '@/src/types';

/**
 * Apply memory strategy to filter/transform messages before sending to AI.
 */
export function getMemoryMessages(messages: Message[], config: MemoryConfig): Message[] {
  switch (config.strategy) {
    case 'none':
      // Only return the last user message
      return messages.length > 0 ? [messages[messages.length - 1]] : [];

    case 'sliding_window': {
      const windowSize = config.windowSize || 20;
      return messages.slice(-windowSize);
    }

    case 'full':
      return messages;

    case 'full_with_summary':
      // TODO: Implement compression — for now, same as full
      // Future: compress older messages into a summary using summaryModel
      return messages;

    case 'external':
      // Only return the last user message; full history is in Obsidian
      return messages.length > 0 ? [messages[messages.length - 1]] : [];

    default:
      return messages;
  }
}

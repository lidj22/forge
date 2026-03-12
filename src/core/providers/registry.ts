import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import { loadConfig, getProviderApiKey } from '@/src/config';
import type { ProviderName } from '@/src/types';

const providerInstances = new Map<string, LanguageModel>();

export function getModel(provider: ProviderName, model?: string): LanguageModel {
  const config = loadConfig();
  const providerConfig = config.providers[provider];
  const modelId = model || providerConfig.defaultModel;
  const cacheKey = `${provider}:${modelId}`;

  const cached = providerInstances.get(cacheKey);
  if (cached) return cached;

  const apiKey = providerConfig.apiKey || getProviderApiKey(provider);
  const instance = createModel(provider, modelId, apiKey);
  providerInstances.set(cacheKey, instance);
  return instance;
}

function createModel(provider: ProviderName, modelId: string, apiKey?: string): LanguageModel {
  switch (provider) {
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(modelId);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(modelId);
    }
    case 'openai': {
      const openai = createOpenAI({ apiKey });
      return openai(modelId);
    }
    case 'grok': {
      // Grok uses OpenAI-compatible API
      const grok = createOpenAI({
        apiKey,
        baseURL: 'https://api.x.ai/v1',
      });
      return grok(modelId);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export function listAvailableProviders(): { name: ProviderName; displayName: string; hasKey: boolean; enabled: boolean }[] {
  const config = loadConfig();
  return Object.values(config.providers).map(p => ({
    name: p.name,
    displayName: p.displayName,
    hasKey: !!(p.apiKey || getProviderApiKey(p.name)),
    enabled: p.enabled,
  }));
}

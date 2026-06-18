/**
 * LLM Provider abstraction — routes chat completions to Azure OpenAI or local Ollama.
 *
 * Provider selection (AI_PROVIDER env):
 *   auto   (default) — Azure if configured, otherwise Ollama
 *   azure  — force Azure (fails if not configured)
 *   ollama — force Ollama
 *
 * Ollama is accessed via its OpenAI-compatible /v1 endpoint.
 * Embeddings are Azure-only; Ollama supports chat completions only.
 */
import { AzureOpenAI, OpenAI } from 'openai';
import { logger } from '../../utils/logger.js';

const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT || '';
const AZURE_KEY      = process.env.AZURE_OPENAI_KEY      || '';
const AZURE_MODEL    = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4o';
const API_VERSION    = '2024-02-01';

const OLLAMA_URL   = process.env.OLLAMA_URL   || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

function isAzureReady() {
  return !!(
    AZURE_KEY && AZURE_KEY !== 'placeholder' &&
    AZURE_ENDPOINT && !AZURE_ENDPOINT.includes('placeholder')
  );
}

function isOllamaReady() {
  // OLLAMA_URL always has a default so we just check it's not explicitly disabled
  return OLLAMA_URL !== 'disabled';
}

/**
 * Returns 'azure' | 'ollama' | null based on config and AI_PROVIDER env.
 */
export function getProviderName() {
  const forced = (process.env.AI_PROVIDER || 'auto').toLowerCase();
  if (forced === 'azure')  return isAzureReady()  ? 'azure'  : null;
  if (forced === 'ollama') return isOllamaReady() ? 'ollama' : null;
  if (isAzureReady())  return 'azure';
  if (isOllamaReady()) return 'ollama';
  return null;
}

export function isChatConfigured() {
  return getProviderName() !== null;
}

/**
 * Returns metadata about the active provider for health checks / logging.
 */
export function getProviderInfo() {
  const name = getProviderName();
  return {
    provider: name,
    model:    name === 'azure' ? AZURE_MODEL : name === 'ollama' ? OLLAMA_MODEL : null,
    supportsEmbeddings: name === 'azure',
  };
}

function buildClient() {
  const name = getProviderName();
  if (name === 'azure') {
    return {
      client:  new AzureOpenAI({ endpoint: AZURE_ENDPOINT, apiKey: AZURE_KEY, apiVersion: API_VERSION }),
      model:   AZURE_MODEL,
      isAzure: true,
    };
  }
  if (name === 'ollama') {
    return {
      // Ollama exposes an OpenAI-compatible API at /v1
      client:  new OpenAI({ baseURL: `${OLLAMA_URL}/v1`, apiKey: 'ollama' }),
      model:   OLLAMA_MODEL,
      isAzure: false,
    };
  }
  return null;
}

/**
 * Unified chat completion.
 *
 * @param {Array<{role:string,content:string}>} messages
 * @param {{ temperature?: number, maxTokens?: number, jsonMode?: boolean }} options
 * @returns {Promise<string>} raw text content from the model
 */
export async function chatComplete(messages, options = {}) {
  const ctx = buildClient();
  if (!ctx) {
    throw new Error(
      'No AI provider configured. Set AZURE_OPENAI_KEY for Azure or ensure OLLAMA_URL is reachable for Ollama.'
    );
  }

  const providerName = getProviderName();

  // For non-Azure JSON mode: append a JSON-only instruction to the last user message
  let finalMessages = messages;
  if (options.jsonMode && !ctx.isAzure) {
    const last = messages[messages.length - 1];
    finalMessages = [
      ...messages.slice(0, -1),
      { ...last, content: last.content + '\n\nRespond with ONLY valid JSON. No explanation, no markdown fences.' },
    ];
  }

  const params = {
    model:       ctx.model,
    messages:    finalMessages,
    temperature: options.temperature ?? 0.2,
    max_tokens:  options.maxTokens  ?? 1500,
  };

  // Native JSON mode only available on Azure
  if (options.jsonMode && ctx.isAzure) {
    params.response_format = { type: 'json_object' };
  }

  logger.info(`[llmProvider] chatComplete via ${providerName} (${ctx.model})`);
  const completion = await ctx.client.chat.completions.create(params);
  return completion.choices[0].message.content;
}

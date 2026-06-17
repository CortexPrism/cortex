import type { ProviderKind } from '../config/config.ts';

interface ModelEntry {
  id: string;
  name?: string;
}

type ModelLister = (apiKey: string, baseUrl?: string) => Promise<ModelEntry[]>;

async function openaiModels(apiKey: string, _baseUrl?: string): Promise<ModelEntry[]> {
  const base = _baseUrl || 'https://api.openai.com/v1';
  const res = await fetch(`${base}/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
  if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function anthropicModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.anthropic.com/v1/models', {
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
  });
  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string; display_name?: string }> };
  return data.data.map((m) => ({ id: m.id, name: m.display_name }));
}

async function googleModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
  if (!res.ok) throw new Error(`Google API error: ${res.status}`);
  const data = await res.json() as { models: Array<{ name: string; displayName?: string }> };
  return data.models.map((m) => ({ id: m.name.replace('models/', ''), name: m.displayName }));
}

async function groqModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.groq.com/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Groq API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function deepseekModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.deepseek.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`DeepSeek API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function openrouterModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`OpenRouter API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string; name?: string }> };
  return data.data.map((m) => ({ id: m.id, name: m.name }));
}

async function xaiModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.x.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`xAI API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function togetherModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.together.xyz/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Together AI API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function mistralModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.mistral.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Mistral API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function cohereModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.cohere.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Cohere API error: ${res.status}`);
  const data = await res.json() as { models?: Array<{ name: string }> };
  return (data.models ?? []).map((m) => ({ id: m.name }));
}

async function kiloModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.kilo.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Kilo API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string; name?: string }> };
  return data.data.map((m) => ({ id: m.id, name: m.name }));
}

async function ollamaModels(_apiKey: string, baseUrl?: string): Promise<ModelEntry[]> {
  const url = (baseUrl || 'http://localhost:11434').replace(/\/$/, '');
  const res = await fetch(`${url}/api/tags`);
  if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
  const data = await res.json() as { models: Array<{ name: string }> };
  return data.models.map((m) => ({ id: m.name }));
}

async function bedrockModels(): Promise<ModelEntry[]> {
  // Bedrock model listing doesn't require API key for the list endpoint
  const res = await fetch('https://bedrock.us-east-1.amazonaws.com/foundation-model-list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    // Fallback to common models if API fails
    return [
      { id: 'anthropic.claude-3-5-sonnet-20240620-v1:0', name: 'Claude 3.5 Sonnet' },
      { id: 'anthropic.claude-3-opus-20240229-v1:0', name: 'Claude 3 Opus' },
      { id: 'anthropic.claude-3-haiku-20240307-v1:0', name: 'Claude 3 Haiku' },
      { id: 'meta.llama3-70b-instruct-v1:0', name: 'Llama 3 70B' },
      { id: 'meta.llama3-8b-instruct-v1:0', name: 'Llama 3 8B' },
      { id: 'amazon.titan-text-premier-v1:0', name: 'Titan Text Premier' },
    ];
  }
  const data = await res.json() as {
    modelSummaries: Array<{ modelId: string; modelName?: string }>;
  };
  return data.modelSummaries.map((m) => ({ id: m.modelId, name: m.modelName }));
}

async function cerebrasModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.cerebras.ai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Cerebras API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function fireworksModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.fireworks.ai/inference/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Fireworks API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function perplexityModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.perplexity.ai/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    return [
      { id: 'sonar', name: 'Sonar' },
      { id: 'sonar-pro', name: 'Sonar Pro' },
      { id: 'sonar-reasoning', name: 'Sonar Reasoning' },
      { id: 'sonar-reasoning-pro', name: 'Sonar Reasoning Pro' },
      { id: 'r1-1776', name: 'R1 1776' },
    ];
  }
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function nvidiaModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`NVIDIA NIM API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function moonshotModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.moonshot.cn/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Moonshot API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function novitaModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.novita.ai/openai/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Novita API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function lmstudioModels(_apiKey: string, baseUrl?: string): Promise<ModelEntry[]> {
  const url = (baseUrl || 'http://localhost:1234').replace(/\/$/, '');
  const res = await fetch(`${url}/v1/models`);
  if (!res.ok) throw new Error(`LM Studio API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function litellmModels(apiKey: string, baseUrl?: string): Promise<ModelEntry[]> {
  const url = (baseUrl || 'http://localhost:4000').replace(/\/$/, '');
  const res = await fetch(`${url}/v1/models`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`LiteLLM API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function huggingfaceModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://router.huggingface.co/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`HuggingFace API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function alibabaModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    return [
      { id: 'qwen-turbo', name: 'Qwen Turbo' },
      { id: 'qwen-plus', name: 'Qwen Plus' },
      { id: 'qwen-max', name: 'Qwen Max' },
      { id: 'qwen3-235b-a22b', name: 'Qwen3 235B' },
      { id: 'qwen3-32b', name: 'Qwen3 32B' },
    ];
  }
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

async function veniceModels(apiKey: string): Promise<ModelEntry[]> {
  const res = await fetch('https://api.venice.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Venice AI API error: ${res.status}`);
  const data = await res.json() as { data: Array<{ id: string }> };
  return data.data.map((m) => ({ id: m.id }));
}

const LISTERS: Record<string, ModelLister | null> = {
  openai: openaiModels,
  anthropic: anthropicModels,
  google: googleModels,
  groq: groqModels,
  deepseek: deepseekModels,
  openrouter: openrouterModels,
  xai: xaiModels,
  together: togetherModels,
  mistral: mistralModels,
  cohere: cohereModels,
  ollama: ollamaModels,
  bedrock: bedrockModels,
  kilo: kiloModels,
  cerebras: cerebrasModels,
  fireworks: fireworksModels,
  perplexity: perplexityModels,
  nvidia: nvidiaModels,
  moonshot: moonshotModels,
  novita: novitaModels,
  lmstudio: lmstudioModels,
  litellm: litellmModels,
  huggingface: huggingfaceModels,
  alibaba: alibabaModels,
  venice: veniceModels,
};

export function fetchModels(
  kind: ProviderKind,
  apiKey?: string,
  baseUrl?: string,
): Promise<ModelEntry[]> {
  const lister = LISTERS[kind];
  if (!lister) throw new Error(`Model listing not supported for provider: ${kind}`);
  return lister(apiKey ?? '', baseUrl);
}

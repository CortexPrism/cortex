export const PROVIDER_OPTIONS = [
  { kind: 'openai', label: 'OpenAI' },
  { kind: 'anthropic', label: 'Anthropic' },
  { kind: 'google', label: 'Google Gemini' },
  { kind: 'mistral', label: 'Mistral' },
  { kind: 'groq', label: 'Groq' },
  { kind: 'deepseek', label: 'DeepSeek' },
  { kind: 'openrouter', label: 'OpenRouter' },
  { kind: 'xai', label: 'xAI (Grok)' },
  { kind: 'together', label: 'Together AI' },
  { kind: 'bedrock', label: 'AWS Bedrock' },
  { kind: 'cohere', label: 'Cohere' },
  { kind: 'kilo', label: 'Kilo (AI Gateway)' },
  { kind: 'ollama', label: 'Ollama' },
  { kind: 'cerebras', label: 'Cerebras' },
  { kind: 'fireworks', label: 'Fireworks AI' },
  { kind: 'perplexity', label: 'Perplexity' },
  { kind: 'nvidia', label: 'NVIDIA NIM' },
  { kind: 'moonshot', label: 'Moonshot (Kimi)' },
  { kind: 'novita', label: 'Novita AI' },
  { kind: 'lmstudio', label: 'LM Studio' },
  { kind: 'litellm', label: 'LiteLLM' },
  { kind: 'huggingface', label: 'Hugging Face' },
  { kind: 'alibaba', label: 'Alibaba (Qwen)' },
  { kind: 'venice', label: 'Venice AI' },
];

export const PROVIDER_OPTIONS_HTML = PROVIDER_OPTIONS.map((p) =>
  `<option value="${p.kind}">${p.label}</option>`
).join('');

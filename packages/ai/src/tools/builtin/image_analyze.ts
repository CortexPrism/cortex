/**
 * Image Analyze Tool
 *
 * Analyze images using multimodal LLM providers (Claude, GPT-4V, Gemini).
 * Supports local file paths, data URLs, and detail level control.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { loadConfig } from '../../../../../src/config/config.ts';
import { buildProviderFromConfig } from '../../llm/router.ts';
import type { ProviderConfig, ProviderKind } from '../../../../../src/config/config.ts';
import { exists } from '@std/fs/exists';

const MULTIMODAL_PROVIDERS: ProviderKind[] = [
  'anthropic',
  'google',
  'openai',
  'deepseek',
  'openrouter',
  'groq',
  'mistral',
  'xai',
  'together',
  'cerebras',
  'fireworks',
  'moonshot',
  'novita',
  'kilo',
  'alibaba',
  'venice',
  'bedrock',
  'ollama',
];

const IMAGE_MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function detectMimeType(path: string): string {
  const ext = path.toLowerCase().slice(path.lastIndexOf('.'));
  return IMAGE_MIME_MAP[ext] ?? 'image/png';
}

function resolveDetailLevel(level: string, model: string): string {
  if (level === 'auto') {
    const lc = model.toLowerCase();
    if (lc.includes('flash') || lc.includes('mini') || lc.includes('haiku')) return 'low';
    if (lc.includes('pro') || lc.includes('ultra') || lc.includes('opus')) return 'high';
    return 'high';
  }
  return level;
}

export const imageAnalyzeTool: Tool = {
  definition: {
    name: 'image_analyze',
    description:
      'Analyze images using multimodal AI. Accepts local file paths or base64 data URLs. Returns detailed descriptions, text extraction (OCR), visual analysis, and answers to specific questions about the image.',
    params: [
      {
        name: 'image',
        type: 'string',
        description:
          'Path to a local image file, or a base64 data URL (e.g., data:image/png;base64,...)',
        required: true,
      },
      {
        name: 'prompt',
        type: 'string',
        description:
          'Question or instruction for analyzing the image (e.g., "Describe this image", "Extract all text", "What colors are dominant?")',
        required: true,
      },
      {
        name: 'detail',
        type: 'string',
        description:
          'Detail level: "low" (brief), "high" (detailed), "auto" (choose based on model, default: auto)',
        required: false,
        enum: ['low', 'high', 'auto'],
      },
      {
        name: 'provider',
        type: 'string',
        description:
          'Optional provider override (e.g., "anthropic", "google", "openai"). Defaults to configured default provider.',
        required: false,
        enum: [
          'anthropic',
          'google',
          'openai',
          'deepseek',
          'openrouter',
          'groq',
          'mistral',
          'xai',
          'together',
          'cerebras',
          'fireworks',
          'moonshot',
          'novita',
          'kilo',
          'alibaba',
          'venice',
          'bedrock',
          'ollama',
        ],
      },
    ],
    capabilities: ['network:fetch'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      const imageInput = String(args.image ?? '').trim();
      if (!imageInput) {
        return {
          toolName: 'image_analyze',
          success: false,
          output: '',
          error: 'image parameter is required',
          durationMs: Date.now() - start,
        };
      }

      const prompt = String(args.prompt ?? '').trim();
      if (!prompt) {
        return {
          toolName: 'image_analyze',
          success: false,
          output: '',
          error: 'prompt parameter is required',
          durationMs: Date.now() - start,
        };
      }

      const detail = (args.detail as string) ?? 'auto';
      const requestedProvider = (args.provider as string | undefined) ?? null;

      // Determine image source and media type
      let mediaType = 'image/png';
      let base64Data = '';

      if (imageInput.startsWith('data:')) {
        const match = imageInput.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          return {
            toolName: 'image_analyze',
            success: false,
            output: '',
            error: 'Invalid data URL format. Expected: data:image/png;base64,...',
            durationMs: Date.now() - start,
          };
        }
        mediaType = match[1];
        base64Data = match[2];
      } else {
        if (!await exists(imageInput)) {
          return {
            toolName: 'image_analyze',
            success: false,
            output: '',
            error: `Image file not found: ${imageInput}`,
            durationMs: Date.now() - start,
          };
        }

        mediaType = detectMimeType(imageInput);
        const bytes = await Deno.readFile(imageInput);
        base64Data = btoa(String.fromCharCode(...bytes));
      }

      // Load config and build provider
      const config = await loadConfig();

      let providerKind: ProviderKind = config.defaultProvider;
      let providerConfig: ProviderConfig | undefined;

      if (requestedProvider && config.providers[requestedProvider as ProviderKind]) {
        providerKind = requestedProvider as ProviderKind;
      }

      providerConfig = config.providers[providerKind];
      if (!providerConfig || !providerConfig.apiKey) {
        for (const pk of MULTIMODAL_PROVIDERS) {
          const pc = config.providers[pk];
          if (pc && pc.apiKey) {
            providerKind = pk;
            providerConfig = pc;
            break;
          }
        }
      }

      if (!providerConfig || !providerConfig.apiKey) {
        return {
          toolName: 'image_analyze',
          success: false,
          output: '',
          error:
            'No multimodal LLM provider configured. Configure an API key for Anthropic, Google, or OpenAI.',
          durationMs: Date.now() - start,
        };
      }

      const provider = buildProviderFromConfig(providerKind, providerConfig);
      const model = providerConfig.model || provider.defaultModel;
      const effectiveDetail = resolveDetailLevel(detail, model);

      // Construct the image content block
      const imageBlock = {
        type: 'image' as const,
        source: {
          type: 'base64' as const,
          mediaType,
          data: base64Data,
        },
      };

      // Build the prompt based on detail level
      let systemPrompt = 'You are an image analysis assistant. ';
      if (effectiveDetail === 'high') {
        systemPrompt +=
          'Provide a thorough, detailed analysis of the image. Include descriptions of objects, people, text, colors, composition, lighting, and any notable details. Be comprehensive.';
      } else {
        systemPrompt +=
          "Provide a concise analysis of the image. Focus on the most important elements and answer the user's question directly.";
      }

      const result = await provider.complete({
        messages: [
          {
            role: 'user',
            content: [
              imageBlock,
              { type: 'text', text: prompt },
            ],
          },
        ],
        model,
        systemPrompt,
        maxTokens: effectiveDetail === 'high' ? 2000 : 500,
        temperature: 0.3,
      });

      const analysisText = result.content;
      if (!analysisText) {
        return {
          toolName: 'image_analyze',
          success: false,
          output: '',
          error: 'LLM returned no content for image analysis',
          durationMs: Date.now() - start,
        };
      }

      const output =
        `**Image Analysis** (${providerKind}/${model}, detail: ${effectiveDetail})\n\n${analysisText}`;

      return {
        toolName: 'image_analyze',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'image_analyze',
        success: false,
        output: '',
        error: `Image analysis failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default imageAnalyzeTool;

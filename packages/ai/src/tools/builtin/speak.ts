import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { synthesizeSpeech } from '../../../../../src/voice/tts.ts';
import { encodeBase64 } from '../../../../../src/voice/audio.ts';
import { loadConfig } from '../../../../../src/config/config.ts';

export const speakTool: Tool = {
  definition: {
    name: 'speak',
    description: 'Synthesize text to speech audio. Returns an audio data URL that can be played.',
    capabilities: ['network:fetch'],
    params: [
      {
        name: 'text',
        type: 'string',
        description: 'The text to convert to speech',
        required: true,
      },
      {
        name: 'voice',
        type: 'string',
        description:
          'Voice to use (e.g. alloy, echo, fable, onyx, nova, shimmer for OpenAI). Default from config.',
        required: false,
      },
      {
        name: 'speed',
        type: 'number',
        description: 'Speech speed multiplier (0.25 to 4.0). Default 1.0.',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const text = String(args.text ?? '').trim();

    if (!text) {
      return {
        toolName: 'speak',
        success: false,
        output: '',
        error: 'No text provided',
        durationMs: Date.now() - start,
      };
    }

    try {
      const config = await loadConfig();
      const voiceConfig = config.voice;
      const providerName = voiceConfig?.ttsProvider ?? 'openai';
      const voice = String(args.voice ?? voiceConfig?.defaultVoice ?? 'alloy');
      const speed = typeof args.speed === 'number' ? args.speed : 1.0;

      const audio = await synthesizeSpeech(text, providerName, { voice, speed });

      const dataUrl = `data:audio/${audio.format};base64,${encodeBase64(audio.data)}`;

      return {
        toolName: 'speak',
        success: true,
        output:
          `Audio generated (${audio.data.length} bytes, ${audio.format} format).\nAudio URL: ${dataUrl}`,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        toolName: 'speak',
        success: false,
        output: '',
        error: (e as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default speakTool;

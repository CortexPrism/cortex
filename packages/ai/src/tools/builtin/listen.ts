import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { getSTTProvider, type transcribeAudio } from '../../../../../src/voice/stt.ts';
import { detectAudioFormat } from '../../../../../src/voice/audio.ts';
import { loadConfig } from '../../../../../src/config/config.ts';

export const listenTool: Tool = {
  definition: {
    name: 'listen',
    description:
      'Transcribe audio data to text. Provide audio as a data URL or base64-encoded string. If no audio is provided, returns instructions for capturing audio.',
    capabilities: ['network:fetch'],
    params: [
      {
        name: 'audio_data',
        type: 'string',
        description:
          'Base64-encoded audio data or data URL. Supported formats: wav, mp3, ogg, webm.',
        required: false,
      },
      {
        name: 'format',
        type: 'string',
        description: 'Audio format if not detectable from data: wav, mp3, ogg, webm.',
        required: false,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Language hint for transcription (e.g. "en", "fr"). Default from config.',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const rawData = String(args.audio_data ?? '').trim();

    if (!rawData) {
      return {
        toolName: 'listen',
        success: true,
        output:
          'No audio data provided. To transcribe audio, provide it as a base64 data URL (e.g. data:audio/wav;base64,...) or raw base64 string with a format parameter.',
        durationMs: Date.now() - start,
      };
    }

    try {
      let base64Data = rawData;
      let format = String(args.format ?? '').trim() as 'wav' | 'mp3' | 'ogg' | 'webm' | '';

      const dataUrlMatch = rawData.match(/^data:audio\/(\w+);base64,(.+)$/);
      if (dataUrlMatch) {
        format = (format || dataUrlMatch[1]) as 'wav' | 'mp3' | 'ogg' | 'webm';
        base64Data = dataUrlMatch[2];
      }

      const binaryString = atob(base64Data);
      const data = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        data[i] = binaryString.charCodeAt(i);
      }

      const detectedFormat = format || detectAudioFormat(data);
      const config = await loadConfig();
      const voiceConfig = config.voice;
      const providerName = voiceConfig?.sttProvider ?? 'openai';
      const language = String(args.language ?? voiceConfig?.language ?? '');

      const provider = getSTTProvider(providerName);
      if (!provider) {
        return {
          toolName: 'listen',
          success: false,
          output: '',
          error: `STT provider "${providerName}" not registered. Configure voice in config.`,
          durationMs: Date.now() - start,
        };
      }

      const utterance = await provider.transcribe(
        { format: detectedFormat, data },
        { language: language && language !== 'auto' ? language : undefined },
      );

      return {
        toolName: 'listen',
        success: true,
        output: `Transcribed text: ${utterance.text}${
          utterance.confidence ? `\nConfidence: ${(utterance.confidence * 100).toFixed(1)}%` : ''
        }`,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        toolName: 'listen',
        success: false,
        output: '',
        error: (e as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default listenTool;

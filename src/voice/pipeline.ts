import { registerHook } from '../pipeline/manager.ts';
import type { PipelineHook } from '../pipeline/types.ts';
import { loadConfig } from '../config/config.ts';
import { synthesizeSpeech } from './tts.ts';
import { encodeBase64 } from './audio.ts';

export const voiceAutoTTSHook: PipelineHook = {
  name: 'voice-auto-tts',
  stages: ['post-output'],
  priority: 100,
  async: false,
  disableable: true,
  async run(ctx) {
    const config = await loadConfig();
    const voiceConfig = config.voice;
    if (!voiceConfig?.enabled || !voiceConfig.autoTTS) return {};

    const output = ctx.output;
    if (!output) return {};

    const providerName = voiceConfig.ttsProvider;

    try {
      const audio = await synthesizeSpeech(output, providerName, {
        voice: voiceConfig.defaultVoice,
      });

      const audioDataUrl = `data:audio/${audio.format};base64,${encodeBase64(audio.data)}`;

      return {
        sideEffects: [
          {
            type: 'store',
            payload: {
              key: `voice_audio_${ctx.sessionId}_${ctx.turnId}`,
              value: { url: audioDataUrl, format: audio.format },
            },
          },
          {
            type: 'notify',
            payload: {
              sessionId: ctx.sessionId,
              type: 'audio',
              data: encodeBase64(audio.data),
              format: audio.format,
            },
          },
        ],
      };
    } catch (e) {
      console.error(`[voice-auto-tts] Synthesis failed: ${(e as Error).message}`);
      return {};
    }
  },
};

export function registerVoicePipelineHook(): void {
  registerHook(voiceAutoTTSHook, 'core');
}

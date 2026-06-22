import { err, json, type RouteHandler } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/voice\/transcribe$/,
    handler: async (req) => {
      try {
        const formData = await req.formData();
        const audioFile = formData.get('audio') as File | null;
        const language = (formData.get('language') as string) || undefined;
        if (!audioFile) return err('No audio file provided', 400);
        const audioBytes = new Uint8Array(await audioFile.arrayBuffer());
        const mimeType = audioFile.type || 'audio/wav';
        const { initVoiceSystem, getSTT } = await import('../../voice/manager.ts');
        const { loadConfig } = await import('../../../../../src/config/config.ts');
        const config = await loadConfig();
        if (config.voice) await initVoiceSystem(config.voice);
        const stt = getSTT();
        if (!stt) return err('STT provider not available', 503);
        const { mimeToFormat } = await import('../../voice/audio.ts');
        const format = mimeToFormat(mimeType);
        const utterance = await stt.transcribe({ format, data: audioBytes }, { language });
        return json(utterance);
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'POST',
    pattern: /^\/api\/voice\/synthesize$/,
    handler: async (req) => {
      try {
        const body = await req.json() as {
          text: string;
          voice?: string;
          speed?: number;
          format?: string;
        };
        if (!body.text?.trim()) return err('No text provided', 400);
        const { initVoiceSystem, getTTS } = await import('../../voice/manager.ts');
        const { loadConfig } = await import('../../../../../src/config/config.ts');
        const config = await loadConfig();
        if (config.voice) await initVoiceSystem(config.voice);
        const tts = getTTS();
        if (!tts) return err('TTS provider not available', 503);
        const audio = await tts.synthesize(body.text, {
          voice: body.voice,
          speed: body.speed,
          format: (body.format as 'wav' | 'mp3') || 'mp3',
        });
        return new Response(audio.data.buffer as ArrayBuffer, {
          status: 200,
          headers: {
            'Content-Type': `audio/${audio.format}`,
            'Content-Disposition': `inline; filename="speech.${audio.format}"`,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/voice\/synthesize\//,
    handler: async (req, path) => {
      try {
        const text = decodeURIComponent(path.slice('/api/voice/synthesize/'.length));
        if (!text.trim()) return err('No text provided', 400);
        const voice = new URL(req.url).searchParams.get('voice') || undefined;
        const speed = Number(new URL(req.url).searchParams.get('speed')) || 1.0;
        const { initVoiceSystem, getTTS } = await import('../../voice/manager.ts');
        const { loadConfig } = await import('../../../../../src/config/config.ts');
        const config = await loadConfig();
        if (config.voice) await initVoiceSystem(config.voice);
        const tts = getTTS();
        if (!tts) return err('TTS provider not available', 503);
        const audio = await tts.synthesize(text, { voice, speed, format: 'mp3' });
        return new Response(audio.data.buffer as ArrayBuffer, {
          status: 200,
          headers: {
            'Content-Type': `audio/${audio.format}`,
            'Content-Disposition': `inline; filename="speech.${audio.format}"`,
            'Access-Control-Allow-Origin': '*',
          },
        });
      } catch (e) {
        return err((e as Error).message, 500);
      }
    },
  },
  {
    method: 'GET',
    pattern: /^\/api\/voice\/providers$/,
    handler: async () => {
      const { listSTTProviders } = await import('../../voice/stt.ts');
      const { listTTSProviders } = await import('../../voice/tts.ts');
      return json({
        sttProviders: listSTTProviders(),
        ttsProviders: listTTSProviders(),
        openaiVoices: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
        elevenLabsVoices: [
          'rachel',
          'domi',
          'bella',
          'antoni',
          'elli',
          'josh',
          'arnold',
          'adam',
          'sam',
        ],
      });
    },
  },
];

import type { AudioSource, SynthesisOptions, TTSProvider } from '../types.ts';

const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

const ELEVENLABS_VOICES: Record<string, string> = {
  'rachel': '21m00Tcm4TlvDq8ikWAM',
  'domi': 'AZnzlk1XvdvUeBnXmlld',
  'bella': 'EXAVITQu4vrVxn15Jq9W',
  'antoni': 'ErXwobaYiN019PkySvjV',
  'elli': 'MF3mGyEYCl7XYWbV9V6O',
  'josh': 'TxGEqnHWrfWFTfGW9XjX',
  'arnold': 'VR6AewLTigWG4xSOukaG',
  'adam': 'pNInz6obpgDQGcFmaJgB',
  'sam': 'yoZ06aMxZJJ28mfd3POQ',
};

export class ElevenLabsTTSProvider implements TTSProvider {
  readonly name = 'elevenlabs';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async synthesize(
    text: string,
    opts?: SynthesisOptions,
  ): Promise<AudioSource> {
    const voiceId = opts?.voice
      ? ELEVENLABS_VOICES[opts.voice] || opts.voice
      : ELEVENLABS_VOICES['rachel'];
    const speed = opts?.speed ?? 1.0;
    const format = opts?.format === 'mp3' ? 'mp3' : 'mp3';

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed,
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(
        `ElevenLabs TTS failed (${response.status}): ${errBody || response.statusText}`,
      );
    }

    const buffer = await response.arrayBuffer();
    return {
      format,
      data: new Uint8Array(buffer),
      sampleRate: 24000,
    };
  }

  async *stream(
    text: string,
    opts?: SynthesisOptions,
  ): AsyncIterable<Uint8Array> {
    const voiceId = opts?.voice
      ? ELEVENLABS_VOICES[opts.voice] || opts.voice
      : ELEVENLABS_VOICES['rachel'];

    const response = await fetch(
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}/stream`,
      {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: opts?.speed ?? 1.0,
          },
        }),
      },
    );

    if (!response.ok) {
      const errBody = await response.text().catch(() => '');
      throw new Error(
        `ElevenLabs TTS stream failed (${response.status}): ${errBody || response.statusText}`,
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const buffer = await response.arrayBuffer();
      yield new Uint8Array(buffer);
      return;
    }

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        yield value;
      }
    } finally {
      reader.releaseLock();
    }
  }
}

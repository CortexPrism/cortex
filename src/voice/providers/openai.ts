import OpenAI from 'npm:openai';
import type {
  AudioSource,
  STTProvider,
  SynthesisOptions,
  TTSProvider,
  Utterance,
} from '../types.ts';

const OPENAI_TTS_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

export class OpenAISTTProvider implements STTProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(
    audio: AudioSource,
    opts?: { language?: string },
  ): Promise<Utterance> {
    const blob = new Blob([audio.data.buffer as ArrayBuffer], {
      type: `audio/${audio.format}`,
    });
    const file = new File([blob], `audio.${audio.format}`, {
      type: `audio/${audio.format}`,
    });

    const result = await this.client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: opts?.language,
      response_format: 'verbose_json',
    });

    const segments = (result as unknown as Record<string, unknown>).segments as
      | Array<{ start: number; end: number; text: string; confidence?: number }>
      | undefined;

    let confidence: number | undefined;
    if (segments && segments.length > 0) {
      const sum = segments.reduce((acc: number, s) => acc + (s.confidence ?? 0), 0);
      confidence = sum / segments.length;
    }

    return {
      text: result.text,
      confidence,
      language: opts?.language ??
        (result as unknown as Record<string, unknown>).language as string | undefined,
      timestamps: segments
        ? segments.map((s) => ({
          start: s.start,
          end: s.end,
          word: s.text,
        }))
        : undefined,
    };
  }
}

export class OpenAITTSProvider implements TTSProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async synthesize(
    text: string,
    opts?: SynthesisOptions,
  ): Promise<AudioSource> {
    const voice = opts?.voice &&
        OPENAI_TTS_VOICES.includes(opts.voice as typeof OPENAI_TTS_VOICES[number])
      ? (opts.voice as typeof OPENAI_TTS_VOICES[number])
      : 'alloy';
    const speed = opts?.speed ?? 1.0;
    const format = opts?.format === 'mp3' ? 'mp3' : 'wav';

    const response = await this.client.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      speed,
      response_format: format === 'mp3' ? 'mp3' : 'wav',
    });

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
    const voice = opts?.voice &&
        OPENAI_TTS_VOICES.includes(opts.voice as typeof OPENAI_TTS_VOICES[number])
      ? (opts.voice as typeof OPENAI_TTS_VOICES[number])
      : 'alloy';
    const speed = opts?.speed ?? 1.0;
    const format = opts?.format === 'mp3' ? 'mp3' : 'wav';

    const stream = await this.client.audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
      speed,
      response_format: format === 'mp3' ? 'mp3' : 'wav',
    });

    const body = stream.body as unknown as ReadableStream<Uint8Array> | null;
    const reader = body?.getReader();
    if (!reader) {
      const buffer = await stream.arrayBuffer();
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

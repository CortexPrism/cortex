import type { AudioSource, SynthesisOptions, TTSProvider } from './types.ts';

const providers = new Map<string, TTSProvider>();

export function registerTTSProvider(name: string, provider: TTSProvider): void {
  providers.set(name, provider);
}

export function getTTSProvider(name: string): TTSProvider | undefined {
  return providers.get(name);
}

export function listTTSProviders(): string[] {
  return [...providers.keys()];
}

export async function synthesizeSpeech(
  text: string,
  providerName: string = 'openai',
  opts?: SynthesisOptions,
): Promise<AudioSource> {
  const provider = providers.get(providerName);
  if (!provider) {
    throw new Error(`TTS provider "${providerName}" not registered`);
  }
  return provider.synthesize(text, opts);
}

export async function* streamSpeech(
  text: string,
  providerName: string = 'openai',
  opts?: SynthesisOptions,
): AsyncIterable<Uint8Array> {
  const provider = providers.get(providerName);
  if (!provider) {
    throw new Error(`TTS provider "${providerName}" not registered`);
  }
  if (!provider.stream) {
    const result = await provider.synthesize(text, opts);
    yield result.data;
    return;
  }
  yield* provider.stream(text, opts);
}

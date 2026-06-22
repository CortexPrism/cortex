import type { AudioSource, STTProvider, Utterance } from './types.ts';

const providers = new Map<string, STTProvider>();

export function registerSTTProvider(name: string, provider: STTProvider): void {
  providers.set(name, provider);
}

export function getSTTProvider(name: string): STTProvider | undefined {
  return providers.get(name);
}

export function listSTTProviders(): string[] {
  return [...providers.keys()];
}

export async function transcribeAudio(
  audio: AudioSource,
  providerName: string = 'openai',
  opts?: { language?: string },
): Promise<Utterance> {
  const provider = providers.get(providerName);
  if (!provider) {
    throw new Error(`STT provider "${providerName}" not registered`);
  }
  return provider.transcribe(audio, opts);
}

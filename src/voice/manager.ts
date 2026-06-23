import type { VoiceConfig } from './types.ts';
import type { STTProvider, TTSProvider } from './types.ts';
import { getSTTProvider, registerSTTProvider } from './stt.ts';
import { getTTSProvider, registerTTSProvider } from './tts.ts';
import { OpenAISTTProvider, OpenAITTSProvider } from './providers/openai.ts';

const activeSessions = new Map<string, VoiceSessionState>();

export interface VoiceSessionState {
  sessionId: string;
  audioBuffer: Uint8Array[];
  speaking: boolean;
  voice: string;
  speechRate: number;
  language: string;
  wsConnection?: WebSocket;
}

let initialized = false;

export async function initVoiceSystem(config: VoiceConfig): Promise<void> {
  if (initialized) return;

  _sttProviderName = config.sttProvider ?? 'openai';

  if (config.sttProvider === 'openai') {
    const providerConfig = await resolveProviderConfig();
    const stt = new OpenAISTTProvider(providerConfig.apiKey);
    registerSTTProvider('openai', stt);
  }

  if (config.ttsProvider === 'openai') {
    const providerConfig = await resolveProviderConfig();
    const tts = new OpenAITTSProvider(providerConfig.apiKey);
    registerTTSProvider('openai', tts);
  }

  if (config.ttsProvider === 'elevenlabs' && config.elevenLabsApiKey) {
    const { ElevenLabsTTSProvider } = await import('./providers/elevenlabs.ts');
    const tts = new ElevenLabsTTSProvider(config.elevenLabsApiKey);
    registerTTSProvider('elevenlabs', tts);
  }

  initialized = true;
}

let _sttProviderName = 'openai';

export function getSTT(): STTProvider | undefined {
  return getSTTProvider(_sttProviderName);
}

export function getTTS(): TTSProvider | undefined {
  return getTTSProvider('openai') ?? getTTSProvider('elevenlabs');
}

export function createVoiceSession(
  sessionId: string,
  config: VoiceConfig,
  wsConnection?: WebSocket,
): VoiceSessionState {
  const state: VoiceSessionState = {
    sessionId,
    audioBuffer: [],
    speaking: false,
    voice: config.defaultVoice,
    speechRate: 1.0,
    language: config.language === 'auto' ? 'en' : config.language,
    wsConnection,
  };
  activeSessions.set(sessionId, state);
  return state;
}

export function getVoiceSession(sessionId: string): VoiceSessionState | undefined {
  return activeSessions.get(sessionId);
}

export function destroyVoiceSession(sessionId: string): void {
  activeSessions.delete(sessionId);
}

export function listVoiceSessions(): VoiceSessionState[] {
  return [...activeSessions.values()];
}

export function addAudioChunk(sessionId: string, chunk: Uint8Array): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.audioBuffer.push(chunk);
  }
}

export function flushAudioBuffer(sessionId: string): Uint8Array | null {
  const session = activeSessions.get(sessionId);
  if (!session || session.audioBuffer.length === 0) return null;

  const totalSize = session.audioBuffer.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(totalSize);
  let offset = 0;
  for (const chunk of session.audioBuffer) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  session.audioBuffer = [];
  return merged;
}

export function setSpeaking(sessionId: string, speaking: boolean): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.speaking = speaking;
  }
}

export function setVoice(sessionId: string, voice: string): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.voice = voice;
  }
}

export function setSpeechRate(sessionId: string, rate: number): void {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.speechRate = rate;
  }
}

let _cachedApiKey: string | null = null;

async function resolveProviderConfig(): Promise<{ apiKey: string }> {
  if (_cachedApiKey) return { apiKey: _cachedApiKey };

  const { loadConfig } = await import('../config/config.ts');
  const config = await loadConfig();
  const openaiCfg = config.providers.openai;
  const key = openaiCfg?.apiKey || Deno.env.get('OPENAI_API_KEY') || '';

  if (!key) {
    throw new Error(
      'OpenAI API key not configured. Set it in config or via OPENAI_API_KEY env var.',
    );
  }

  _cachedApiKey = key;
  return { apiKey: key };
}

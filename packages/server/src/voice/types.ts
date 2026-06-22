export interface VoiceConfig {
  enabled: boolean;
  sttProvider: 'openai';
  ttsProvider: 'openai' | 'elevenlabs';
  sttModel: string;
  ttsModel: string;
  defaultVoice: string;
  autoTTS: boolean;
  language: string;
  elevenLabsApiKey?: string;
}

export interface AudioSource {
  format: 'wav' | 'ogg' | 'mp3' | 'webm';
  data: Uint8Array;
  sampleRate?: number;
}

export interface Utterance {
  text: string;
  confidence?: number;
  speakerId?: string;
  timestamps?: Array<{ start: number; end: number; word: string }>;
  language?: string;
}

export interface SynthesisOptions {
  voice?: string;
  speed?: number;
  format?: AudioSource['format'];
  streaming?: boolean;
}

export interface STTProvider {
  readonly name: string;
  transcribe(audio: AudioSource, opts?: { language?: string }): Promise<Utterance>;
}

export interface TTSProvider {
  readonly name: string;
  synthesize(text: string, opts?: SynthesisOptions): Promise<AudioSource>;
  stream?(text: string, opts?: SynthesisOptions): AsyncIterable<Uint8Array>;
}

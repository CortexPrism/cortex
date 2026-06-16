export interface SpeechSegment {
  start: number;
  end: number;
  energy: number;
  isSpeech: boolean;
}

export interface VADConfig {
  sampleRate: number;
  frameSize: number;
  speechThreshold: number;
  silenceTimeoutMs: number;
  minSpeechDurationMs: number;
}

const DEFAULT_VAD_CONFIG: VADConfig = {
  sampleRate: 16000,
  frameSize: 512,
  speechThreshold: 0.02,
  silenceTimeoutMs: 800,
  minSpeechDurationMs: 200,
};

function rmsEnergy(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    sum += samples[i] * samples[i];
  }
  return Math.sqrt(sum / samples.length);
}

export function detectSpeech(
  audio: Uint8Array,
  config: Partial<VADConfig> = {},
): SpeechSegment[] {
  const cfg = { ...DEFAULT_VAD_CONFIG, ...config };

  const bytesPerSample = 2;
  const sampleCount = Math.floor(audio.length / bytesPerSample);
  const frameSampleCount = cfg.frameSize;

  const segments: SpeechSegment[] = [];
  let inSpeech = false;
  let speechStart = 0;
  let speechEnd = 0;
  let silenceFrames = 0;
  const silenceFramesMax = Math.ceil(
    (cfg.silenceTimeoutMs / 1000) * cfg.sampleRate / frameSampleCount,
  );
  const minSpeechSamples = Math.ceil(
    (cfg.minSpeechDurationMs / 1000) * cfg.sampleRate,
  );

  let offset = 0;
  while (offset + frameSampleCount * bytesPerSample <= audio.length) {
    const frame = new Float32Array(frameSampleCount);
    for (let i = 0; i < frameSampleCount; i++) {
      const byteOffset = offset + i * bytesPerSample;
      frame[i] = new DataView(audio.buffer).getInt16(byteOffset, true) / 32768;
    }

    const energy = rmsEnergy(frame);
    const isSpeech = energy > cfg.speechThreshold;

    if (isSpeech && !inSpeech) {
      inSpeech = true;
      speechStart = offset / bytesPerSample / cfg.sampleRate;
      silenceFrames = 0;
    } else if (!isSpeech && inSpeech) {
      silenceFrames++;
      if (silenceFrames >= silenceFramesMax) {
        speechEnd = offset / bytesPerSample / cfg.sampleRate;
        const duration = (speechEnd - speechStart) * cfg.sampleRate;
        if (duration >= minSpeechSamples) {
          segments.push({
            start: speechStart,
            end: speechEnd,
            energy,
            isSpeech: true,
          });
        }
        inSpeech = false;
        silenceFrames = 0;
      }
    }

    offset += frameSampleCount * bytesPerSample;
  }

  if (inSpeech) {
    speechEnd = sampleCount / cfg.sampleRate;
    segments.push({
      start: speechStart,
      end: speechEnd,
      energy: 0,
      isSpeech: true,
    });
  }

  return segments;
}

export function isSpeech(audio: Uint8Array, threshold: number = 0.02): boolean {
  const bytesPerSample = 2;
  const sampleCount = Math.floor(audio.length / bytesPerSample);
  const samples = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = new DataView(audio.buffer).getInt16(i * bytesPerSample, true) / 32768;
  }
  return rmsEnergy(samples) > threshold;
}

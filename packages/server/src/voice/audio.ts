import type { AudioSource } from './types.ts';

export function detectAudioFormat(buffer: Uint8Array): AudioSource['format'] {
  if (buffer.length < 4) return 'wav';
  const header = new Uint8Array(buffer.slice(0, 4));
  if (header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46) {
    return 'wav';
  }
  if (header[0] === 0x4f && header[1] === 0x67 && header[2] === 0x67 && header[3] === 0x53) {
    return 'ogg';
  }
  if (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) {
    return 'mp3';
  }
  if (header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3) {
    return 'webm';
  }
  return 'wav';
}

export function mimeToFormat(mime: string): AudioSource['format'] {
  switch (mime) {
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
      return 'wav';
    case 'audio/ogg':
    case 'audio/opus':
      return 'ogg';
    case 'audio/mpeg':
    case 'audio/mp3':
      return 'mp3';
    case 'audio/webm':
      return 'webm';
    default:
      return 'wav';
  }
}

export async function convertFormat(
  audio: AudioSource,
  targetFormat: AudioSource['format'],
): Promise<AudioSource> {
  if (audio.format === targetFormat) return audio;

  try {
    const proc = new Deno.Command('ffmpeg', {
      args: [
        '-f',
        audio.format,
        '-i',
        'pipe:0',
        '-f',
        targetFormat,
        '-acodec',
        targetFormat === 'mp3' ? 'libmp3lame' : 'pcm_s16le',
        'pipe:1',
      ],
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'null',
    });

    const child = proc.spawn();
    const rawIn = child.stdin.getWriter();
    await rawIn.write(audio.data);
    await rawIn.close();

    const { stdout } = await child.output();
    return { format: targetFormat, data: stdout, sampleRate: audio.sampleRate };
  } catch {
    console.warn('[voice] ffmpeg not available, returning original format');
    return audio;
  }
}

export function encodeBase64(data: Uint8Array): string {
  const bin = String.fromCharCode(...data);
  return btoa(bin);
}

export function decodeBase64(data: string): Uint8Array {
  const bin = atob(data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    buf[i] = bin.charCodeAt(i);
  }
  return buf;
}

export function createWavHeader(
  dataLength: number,
  sampleRate: number = 24000,
  numChannels: number = 1,
  bitsPerSample: number = 16,
): Uint8Array {
  const header = new Uint8Array(44);
  const dv = new DataView(header.buffer);

  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = dataLength;
  const fileSize = 36 + dataSize;

  dv.setUint32(0, 0x52494646, false); // RIFF
  dv.setUint32(4, fileSize, true);
  dv.setUint32(8, 0x57415645, false); // WAVE
  dv.setUint32(12, 0x666d7420, false); // fmt
  dv.setUint32(16, 16, true); // chunk size
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, numChannels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  dv.setUint32(36, 0x64617461, false); // data
  dv.setUint32(40, dataSize, true);

  return header;
}

import type {
  ChannelConfig,
  ChannelEvent,
  ChannelPlugin,
  ChannelTarget,
  EventHandler,
  FileUpload,
  MessageEdit,
  MessageId,
  OutboundMessage,
} from '../channels/types.ts';
import { transcribeAudio } from './stt.ts';
import { synthesizeSpeech } from './tts.ts';
import { detectSpeech } from './vad.ts';
import { encodeBase64 } from './audio.ts';
import type { AudioSource, VoiceConfig } from './types.ts';

export class VoiceChannelPlugin implements ChannelPlugin {
  readonly name = 'voice';
  readonly protocol = 'voice';

  private config!: VoiceConfig;
  private handler: EventHandler | null = null;
  private audioStream: AudioSource[] = [];
  private isListening = false;
  private sessionId: string | null = null;

  constructor(sessionId?: string) {
    this.sessionId = sessionId ?? null;
  }

  async connect(config: ChannelConfig): Promise<void> {
    this.config = config.settings as unknown as VoiceConfig;
  }

  async disconnect(): Promise<void> {
    this.isListening = false;
    this.audioStream = [];
  }

  onEvent(handler: EventHandler): void {
    this.handler = handler;
  }

  async send(target: ChannelTarget, message: OutboundMessage): Promise<MessageId> {
    if (message.text && this.config.ttsProvider) {
      const audio = await synthesizeSpeech(message.text, this.config.ttsProvider, {
        voice: this.config.defaultVoice,
      });
      const event: ChannelEvent = {
        id: `voice_out_${Date.now()}`,
        channel: target,
        author: { id: 'agent', name: 'Cortex', bot: true },
        text: message.text,
        attachments: [
          {
            type: 'audio',
            url: `data:audio/${audio.format};base64,${encodeBase64(audio.data)}`,
            name: `tts.${audio.format}`,
            mimeType: `audio/${audio.format}`,
          },
        ],
        timestamp: new Date(),
        raw: {},
      };
      if (this.handler) {
        await this.handler(event);
      }
    }
    return { platform: 'voice', id: `voice_${Date.now()}` };
  }

  async edit(_target: ChannelTarget, _messageId: string, _updates: MessageEdit): Promise<void> {
    // Voice messages are not editable
  }

  async react(_target: ChannelTarget, _messageId: string, _reaction: string): Promise<void> {
    // Voice reactions not supported
  }

  async delete(_target: ChannelTarget, _messageId: string): Promise<void> {
    // Voice messages are ephemeral
  }

  async typing(_target: ChannelTarget): Promise<void> {
    // No typing indicator for voice
  }

  async upload(_target: ChannelTarget, _file: FileUpload): Promise<MessageId> {
    throw new Error('Upload not supported on voice channel');
  }

  async feedAudio(audio: AudioSource): Promise<void> {
    if (!this.handler) return;

    const segments = detectSpeech(audio.data);

    if (segments.length > 0) {
      const utterance = await transcribeAudio(audio, this.config.sttProvider, {
        language: this.config.language === 'auto' ? undefined : this.config.language,
      });

      const event: ChannelEvent = {
        id: `voice_in_${Date.now()}`,
        channel: { type: 'channel', id: this.sessionId ?? 'voice' },
        author: { id: 'user', name: 'User', bot: false },
        text: utterance.text,
        attachments: [
          {
            type: 'audio',
            url: `data:audio/${audio.format};base64,${encodeBase64(audio.data)}`,
            name: `recording.${audio.format}`,
            mimeType: `audio/${audio.format}`,
          },
        ],
        timestamp: new Date(),
        raw: { confidence: utterance.confidence },
      };

      await this.handler(event);
    }
  }

  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }
}

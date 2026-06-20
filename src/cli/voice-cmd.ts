import { Command } from '@cliffy/command';
import { loadConfig, saveConfig } from '../config/config.ts';
import { initVoiceSystem, listVoiceSessions } from '../voice/manager.ts';
import { i18n } from '../i18n/service.ts';

const VOICE_DEFAULTS = {
  enabled: false,
  sttProvider: 'openai',
  ttsProvider: 'openai',
  sttModel: 'whisper-1',
  ttsModel: 'tts-1',
  defaultVoice: 'alloy',
  autoTTS: false,
  language: 'en',
} as const;

function ensureVoiceConfig(config: Awaited<ReturnType<typeof loadConfig>>) {
  if (!config.voice) config.voice = { ...VOICE_DEFAULTS };
}

export const voiceCommand = new Command()
  .name('voice')
  .description('Manage voice/TTS settings and sessions')
  .action(async () => {
    const config = await loadConfig();
    const vc = config.voice;
    if (!vc?.enabled) {
      console.log(i18n.t('cli.voice.disabled'));
      return;
    }
    console.log(`Voice: enabled (${vc.sttProvider} STT, ${vc.ttsProvider} TTS)`);
    console.log(`Voice: ${vc.defaultVoice}, Auto-TTS: ${vc.autoTTS}`);
  });

voiceCommand
  .command('enable')
  .description('Enable voice mode')
  .action(async () => {
    const config = await loadConfig();
    ensureVoiceConfig(config);
    config.voice!.enabled = true;
    await saveConfig(config);
    await initVoiceSystem(config.voice!);
    console.log(i18n.t('cli.voice.enabled'));
  });

voiceCommand
  .command('disable')
  .description('Disable voice mode')
  .action(async () => {
    const config = await loadConfig();
    if (config.voice) config.voice.enabled = false;
    await saveConfig(config);
    console.log(i18n.t('cli.voice.disabledMsg'));
  });

voiceCommand
  .command('status')
  .description('Show voice system status')
  .action(async () => {
    const config = await loadConfig();
    const vc = config.voice;
    if (!vc || !vc.enabled) {
      console.log('Voice system: disabled');
      return;
    }
    console.log('Voice system: enabled');
    console.log(`  STT provider:  ${vc.sttProvider} (model: ${vc.sttModel})`);
    console.log(`  TTS provider:  ${vc.ttsProvider} (model: ${vc.ttsModel})`);
    console.log(`  Default voice: ${vc.defaultVoice}`);
    console.log(`  Auto TTS:      ${vc.autoTTS}`);
    console.log(`  Language:      ${vc.language}`);
    const sessions = listVoiceSessions();
    if (sessions.length > 0) {
      console.log(`  Active sessions: ${sessions.length}`);
      for (const s of sessions) {
        console.log(`    - ${s.sessionId} (speaking: ${s.speaking}, voice: ${s.voice})`);
      }
    }
  });

voiceCommand
  .command('set-voice')
  .description('Set default TTS voice')
  .arguments('<voice:string>')
  .action(async (_options: unknown, voice: string) => {
    const config = await loadConfig();
    ensureVoiceConfig(config);
    config.voice!.defaultVoice = voice;
    config.voice!.enabled = true;
    await saveConfig(config);
    console.log(i18n.t('cli.voice.voiceSet', { voice }));
  });

voiceCommand
  .command('set-speed')
  .description('Set default speech rate (0.25–4.0)')
  .arguments('<rate:number>')
  .action(async (_options: unknown, rate: number) => {
    if (rate < 0.25 || rate > 4.0) {
      console.error(i18n.t('cli.voice.invalidSpeed'));
      Deno.exit(1);
    }
    const config = await loadConfig();
    ensureVoiceConfig(config);
    (config.voice as unknown as Record<string, unknown>).speed = rate;
    await saveConfig(config);
    console.log(i18n.t('cli.voice.speedSet', { rate: String(rate) }));
  });

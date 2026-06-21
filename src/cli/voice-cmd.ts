import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { saveConfig } from '../config/config.ts';
import type { CortexConfig } from '../config/config.ts';
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

function ensureVoiceConfig(config: CortexConfig) {
  if (!config.voice) config.voice = { ...VOICE_DEFAULTS };
}

const enableCmd = cortexCommand('enable')
  .description('Enable voice mode')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
    ensureVoiceConfig(config);
    config.voice!.enabled = true;
    await saveConfig(config);
    await initVoiceSystem(config.voice!);
    console.log(i18n.t('cli.voice.enabled'));
  });

const disableCmd = cortexCommand('disable')
  .description('Disable voice mode')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
    if (config.voice) config.voice.enabled = false;
    await saveConfig(config);
    console.log(i18n.t('cli.voice.disabledMsg'));
  });

const statusCmd = cortexCommand('status')
  .description('Show voice system status')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
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

const setVoiceCmd = cortexCommand('set-voice')
  .description('Set default TTS voice')
  .arguments('<voice:string>')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx, voice: string) => {
    const config = ctx.config!;
    ensureVoiceConfig(config);
    config.voice!.defaultVoice = voice;
    config.voice!.enabled = true;
    await saveConfig(config);
    console.log(i18n.t('cli.voice.voiceSet', { voice }));
  });

const setSpeedCmd = cortexCommand('set-speed')
  .description('Set default speech rate (0.25–4.0)')
  .arguments('<rate:number>')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx, rate: string) => {
    const speed = Number(rate);
    if (speed < 0.25 || speed > 4.0) {
      console.error(i18n.t('cli.voice.invalidSpeed'));
      Deno.exit(1);
    }
    const config = ctx.config!;
    ensureVoiceConfig(config);
    (config.voice as unknown as Record<string, unknown>).speed = speed;
    await saveConfig(config);
    console.log(i18n.t('cli.voice.speedSet', { rate: String(speed) }));
  });

export const voiceCommand = cortexCommand('voice')
  .description('Manage voice/TTS settings and sessions')
  .needs('config')
  .command('enable', enableCmd)
  .command('disable', disableCmd)
  .command('status', statusCmd)
  .command('set-voice', setVoiceCmd)
  .command('set-speed', setSpeedCmd)
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
    const vc = config.voice;
    if (!vc?.enabled) {
      console.log(i18n.t('cli.voice.disabled'));
      return;
    }
    console.log(`Voice: enabled (${vc.sttProvider} STT, ${vc.ttsProvider} TTS)`);
    console.log(`Voice: ${vc.defaultVoice}, Auto-TTS: ${vc.autoTTS}`);
  });

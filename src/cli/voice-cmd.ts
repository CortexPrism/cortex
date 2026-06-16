import { Command } from '@cliffy/command';
import { loadConfig, saveConfig } from '../config/config.ts';
import { initVoiceSystem, listVoiceSessions } from '../voice/manager.ts';

export const voiceCommand = new Command()
  .name('voice')
  .description('Manage voice/TTS settings and sessions')
  .command('enable', 'Enable voice mode')
  .action(async () => {
    const config = await loadConfig();
    config.voice = config.voice || {
      enabled: false,
      sttProvider: 'openai',
      ttsProvider: 'openai',
      sttModel: 'whisper-1',
      ttsModel: 'tts-1',
      defaultVoice: 'alloy',
      autoTTS: false,
      language: 'en',
    };
    config.voice.enabled = true;
    await saveConfig(config);
    await initVoiceSystem(config.voice);
    console.log('Voice mode enabled.');
  })
  .command('disable', 'Disable voice mode')
  .action(async () => {
    const config = await loadConfig();
    if (config.voice) config.voice.enabled = false;
    await saveConfig(config);
    console.log('Voice mode disabled.');
  })
  .command('status', 'Show voice system status')
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
  })
  .command('set-voice', 'Set default TTS voice')
  .arguments('<voice:string>')
  .action(async (_options: unknown, voice: string) => {
    const config = await loadConfig();
    config.voice = config.voice || {
      enabled: true,
      sttProvider: 'openai',
      ttsProvider: 'openai',
      sttModel: 'whisper-1',
      ttsModel: 'tts-1',
      defaultVoice: 'alloy',
      autoTTS: false,
      language: 'en',
    };
    config.voice.defaultVoice = voice;
    config.voice.enabled = true;
    await saveConfig(config);
    console.log(`Default voice set to "${voice}".`);
  })
  .command('set-speed', 'Set speech rate')
  .arguments('<rate:number>')
  .action(async (_options: unknown, rate: number) => {
    console.log(`Speech rate set to ${rate}. (Apply per-session via tools.)`);
  })
  .reset()
  .action(async () => {
    const config = await loadConfig();
    const vc = config.voice;
    if (!vc?.enabled) {
      console.log('Voice system is disabled. Run `cortex voice enable` to enable.');
      return;
    }
    console.log(`Voice: enabled (${vc.sttProvider} STT, ${vc.ttsProvider} TTS)`);
    console.log(`Voice: ${vc.defaultVoice}, Auto-TTS: ${vc.autoTTS}`);
  });

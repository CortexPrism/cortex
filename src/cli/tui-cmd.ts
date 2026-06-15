import { Command } from '@cliffy/command';
import { TerminalUI } from '../tui/terminal.ts';
import { loadConfig } from '../config/config.ts';
import { buildProvider } from '../llm/router.ts';
import { agentTurn } from '../agent/loop.ts';
import { createSession, closeSession } from '../db/sessions.ts';
import { getSessionDb } from '../db/client.ts';

const tuiCommand = new Command()
  .name('tui')
  .description('Start the Cortex interactive terminal UI')
  .action(async () => {
    const config = await loadConfig();
    const provider = buildProvider(config);
    const model = config.providers[config.defaultProvider]?.model ?? 'unknown';

    const sessionId = `tui_${Date.now().toString(36)}`;
    await createSession(sessionId, 'tui');
    const sessionDb = await getSessionDb(sessionId);

    const tui = new TerminalUI();

    tui.setStatus(`Connected — ${config.defaultProvider}/${model}`);

    tui.setOnSend(async (message: string) => {
      tui.setStatus('thinking...');
      let currentResponse = '';

      try {
        const result = await agentTurn({
          userMessage: message,
          provider,
          model,
          sessionDb,
          sessionId,
          stream: true,
          onChunk: (chunk: string) => {
            currentResponse += chunk;
            tui.updateLastMessage(currentResponse);
          },
        });

        tui.setStatus(`idle — ${result.tokensIn}+${result.tokensOut} tokens | $${result.costUsd.toFixed(6)}`);
      } catch (e) {
        tui.addMessage({
          role: 'system',
          content: `Error: ${(e as Error).message}`,
        });
        tui.setStatus('error');
      }
    });

    tui.setOnCancel(() => {
      tui.addMessage({ role: 'system', content: 'Cancelled.' });
      tui.setStatus('idle');
    });

    tui.addMessage({
      role: 'system',
      content: `Cortex TUI v0.20.0 — ${config.defaultProvider}/${model}. Type /help for commands.`,
    });

    tui.addMessage({
      role: 'system',
      content: 'Key bindings: Ctrl+C cancel, Ctrl+L clear, /: focus tools, Up/Down: history, Enter: send',
    });

    await tui.start();

    tui.stop();
    await closeSession(sessionId);
  });

export { tuiCommand };

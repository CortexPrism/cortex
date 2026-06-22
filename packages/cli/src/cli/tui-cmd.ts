import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { createAgentSession, endAgentSession } from './agent-session.ts';
import type { AgentSession } from './agent-session.ts';
import { agentTurn } from '../../../../src/agent/loop.ts';
import { getVersion } from '../../../../src/config/version.ts';
import { i18n } from '../../../../src/i18n/service.ts';
import { VirtualScreen } from '../tui/screen.ts';
import { execShell, getTermCols, getTermRows } from '../tui/screen.ts';
import { Renderer } from '../tui/renderer.ts';
import { HSplit, VSplit } from '../tui/layout.ts';
import { Header } from '../tui/components/header.ts';
import { StatusBar } from '../tui/components/status-bar.ts';
import { TextInput } from '../tui/components/text-input.ts';
import { CompletionMenu } from '../tui/components/completion-menu.ts';
import { ChatView } from '../tui/components/chat-view.ts';
import { ToolCard } from '../tui/components/tool-card.ts';
import type { ToolCallInfo } from '../tui/components/tool-card.ts';
import { Component } from '../tui/component.ts';
import type { RenderContext } from '../tui/component.ts';
import { inputEngine } from '../tui/input-engine.ts';
import { contrast, dark, light } from '../tui/mod.ts';

class ToolPanel extends Component {
  tools: ToolCallInfo[] = [];

  render(ctx: RenderContext): void {
    const title = ctx.t('cli.tui.tools') || 'Tools';
    ctx.buffer.drawText(
      ctx.x,
      ctx.y,
      ` ${title} `,
      ctx.theme.styles['title.bar'] ?? { inverse: true },
    );
    let y = ctx.y + 1;
    for (const tool of this.tools) {
      if (y >= ctx.y + ctx.height) break;
      const card = new ToolCard(tool);
      card.x = ctx.x;
      card.y = y;
      card.width = ctx.width;
      card.height = tool.expanded ? 10 : 1;
      card.render({
        buffer: ctx.buffer,
        theme: ctx.theme,
        t: ctx.t,
        x: ctx.x,
        y,
        width: ctx.width,
        height: tool.expanded ? 10 : 1,
      });
      y += tool.expanded && tool.result ? tool.result.split('\n').length + 1 : 1;
    }
  }
}

export const tuiCommand = cortexCommand('tui')
  .description('Start the Cortex interactive terminal UI')
  .option('-m, --model <model:string>', 'Override the model for this session')
  .option('-a, --agent <agent:string>', 'Use a specific agent identity')
  .needs('config')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const session: AgentSession = await createAgentSession({
      model: opts.model as string | undefined,
      agent: opts.agent as string | undefined,
      enableStream: true,
      quietLogging: true,
    });

    const version = await getVersion();
    const cols = getTermCols();
    const rows = getTermRows();
    const screen = new VirtualScreen(cols, rows);
    const renderer = new Renderer(screen, dark, i18n.t);

    const header = new Header(
      'Cortex — TUI',
      `${session.effectiveProvider.name}/${session.model}`,
    );
    const statusBar = new StatusBar();
    statusBar.model = `${session.effectiveProvider.name}/${session.model}`;
    statusBar.sessionName = session.sid.slice(0, 8);

    const chatView = new ChatView();
    const toolPanel = new ToolPanel();
    const textInput = new TextInput();
    textInput.setPrompt('> ');
    textInput.height = 3;
    textInput.focused = true;
    const completionMenu = new CompletionMenu();
    completionMenu.visible = false;

    const contentSplit = new HSplit();
    contentSplit.add(chatView, '70%');
    contentSplit.add(toolPanel, '30%');

    const mainSplit = new VSplit();
    mainSplit.add(header, 1);
    mainSplit.add(contentSplit, '*');
    mainSplit.add(textInput, 3);
    mainSplit.add(statusBar, 1);
    mainSplit.x = 0;
    mainSplit.y = 0;
    mainSplit.width = screen.width;
    mainSplit.height = screen.height;

    renderer.mount(mainSplit);
    renderer.mount(completionMenu);

    chatView.addMessage({
      role: 'system',
      content:
        `Cortex TUI v${version} — ${session.config.defaultProvider}/${session.model}. Type /help for commands.`,
    });
    chatView.addMessage({
      role: 'system',
      content: 'Ctrl+C cancel · Ctrl+L clear · Up/Down: history · Enter: send · /: commands',
    });

    inputEngine.onKey(async (event) => {
      renderer.handleKey(event);
      renderer.scheduleRender();
    });

    completionMenu.setOnSelect((candidate) => {
      textInput.setText(candidate.label + ' ');
      renderer.scheduleRender();
    });

    textInput.setOnSubmit(async (text) => {
      if (text.trim() === '/exit' || text.trim() === '/quit') {
        inputEngine.stop();
        return;
      }

      if (text.startsWith('/')) {
        await handleTuiSlash(text, session, chatView, toolPanel, renderer);
        textInput.clear();
        renderer.scheduleRender();
        return;
      }

      chatView.addMessage({ role: 'user', content: text });
      chatView.addMessage({ role: 'assistant', content: '' });
      textInput.clear();
      renderer.scheduleRender();

      try {
        const result = await agentTurn({
          userMessage: text,
          provider: session.effectiveProvider,
          model: session.model,
          sessionDb: session.sessionDb,
          sessionId: session.sid,
          systemPrompt: session.systemPrompt,
          stream: true,
          reasoningEffort: session.reasoningEffort,
          onChunk: (chunk) => {
            chatView.appendToLastMessage(chunk);
            renderer.scheduleRender();
          },
          registry: session.registry,
          toolContext: {
            workingDir: Deno.cwd(),
            agentId: 'assistant',
            workspaceDir: Deno.cwd(),
            model: session.model,
            provider: session.config.defaultProvider,
          },
          embedder: session.embedder,
        }).catch((err: Error) => {
          chatView.addMessage({
            role: 'system',
            content: `Error: ${err.message}`,
          });
          return null;
        });

        if (result) {
          statusBar.inputTokens = result.tokensIn;
          statusBar.outputTokens = result.tokensOut;
          statusBar.cost = result.costUsd;
        }
      } catch (err) {
        chatView.addMessage({
          role: 'system',
          content: `Error: ${(err as Error).message}`,
        });
      }

      renderer.scheduleRender();
    });

    renderer.start();
    await inputEngine.start();

    inputEngine.stop();
    renderer.stop();
    await endAgentSession(session);
    Deno.exit(0);
  });

async function handleTuiSlash(
  input: string,
  session: AgentSession,
  chatView: ChatView,
  toolPanel: ToolPanel,
  renderer: Renderer,
): Promise<void> {
  const parts = input.trim().split(/\s+/);
  const cmd = (parts[0] ?? '').slice(1);
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case 'help':
      chatView.addMessage({
        role: 'system',
        content: 'Commands: /model, /status, /clear, /save, /theme, /help, /! <cmd>, /exit',
      });
      break;
    case 'model':
      if (arg) {
        session.model = arg;
        chatView.addMessage({ role: 'system', content: `Model: ${arg}` });
      } else {
        chatView.addMessage({ role: 'system', content: `Current: ${session.model}` });
      }
      break;
    case 'status':
      chatView.addMessage({
        role: 'system',
        content: `Session: ${session.sid.slice(0, 12)}... · ${session.model}`,
      });
      break;
    case 'clear':
      chatView.clear();
      toolPanel.tools = [];
      chatView.addMessage({ role: 'system', content: 'Cleared.' });
      break;
    case 'save': {
      const file = arg || `tui-transcript-${session.sid.slice(0, 8)}.md`;
      const msgs = chatView.getCurrentMessages();
      const text = msgs.map((m) => `## ${m.role}\n${m.content}`).join('\n\n');
      Deno.writeTextFile(file, text).then(() => {
        chatView.addMessage({ role: 'system', content: `Saved to ${file}` });
        renderer.scheduleRender();
      }).catch((e) => {
        chatView.addMessage({ role: 'system', content: `Save failed: ${e.message}` });
        renderer.scheduleRender();
      });
      break;
    }
    case 'theme': {
      const themes: Record<string, import('../../../../src/tui/style.ts').Theme> = { dark, light, contrast };
      const theme = themes[arg || 'dark'];
      if (theme) {
        renderer.setTheme(theme);
        chatView.addMessage({ role: 'system', content: `Theme: ${arg || 'dark'}` });
      }
      break;
    }
    case '!': {
      if (!arg) {
        chatView.addMessage({ role: 'system', content: 'Usage: /! <bash command>' });
        break;
      }
      try {
        const result = await execShell(arg);
        chatView.addMessage({ role: 'system', content: result });
      } catch (e) {
        chatView.addMessage({ role: 'system', content: `Error: ${(e as Error).message}` });
      }
      break;
    }
    default:
      chatView.addMessage({ role: 'system', content: `Unknown: /${cmd}. /help for commands.` });
  }
}

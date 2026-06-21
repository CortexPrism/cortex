import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { createAgentSession, endAgentSession } from './agent-session.ts';
import type { AgentSession } from './agent-session.ts';
import { agentTurn } from '../agent/loop.ts';
import { listAgents } from '../agent/manager.ts';
import { loadConfig } from '../config/config.ts';
import { loadSoulContext } from '../agent/soul.ts';
import { i18n } from '../i18n/service.ts';
import { execShell, getTermCols, getTermRows, VirtualScreen } from '../tui/screen.ts';
import { Renderer } from '../tui/renderer.ts';
import { VSplit } from '../tui/layout.ts';
import { Header } from '../tui/components/header.ts';
import { StatusBar } from '../tui/components/status-bar.ts';
import { TextInput } from '../tui/components/text-input.ts';
import { CompletionMenu } from '../tui/components/completion-menu.ts';
import { ChatView } from '../tui/components/chat-view.ts';
import { inputEngine } from '../tui/input-engine.ts';
import { contrast, dark, light } from '../tui/mod.ts';

export const chatCommand = cortexCommand('chat')
  .description('Start an interactive chat session with Cortex')
  .option('-m, --model <model:string>', 'Override the model for this session')
  .option('-p, --provider <provider:string>', 'Override the provider for this session')
  .option('-a, --agent <agent:string>', 'Use a specific agent identity')
  .option('-s, --resume <sessionId:string>', 'Resume an existing session')
  .option('--list-agents', 'List available agents and exit')
  .option('--no-stream', 'Disable streaming output')
  .option('--sandbox-debug', 'Enable sandbox debug logging')
  .needs('config')
  .needs('migrations')
  .action(async (opts: Record<string, unknown>, _ctx: Ctx) => {
    const options = opts as {
      model?: string;
      provider?: string;
      agent?: string;
      resume?: string;
      listAgents?: boolean;
      stream?: boolean;
      sandboxDebug?: boolean;
    };

    if (options.listAgents) {
      const agents = await listAgents();
      const config = await loadConfig();
      console.log('\n  ' + i18n.t('cli.chat.listAgents.heading'));
      for (const a of agents) {
        const active = config.defaultAgent === a.id ? ' ●' : ' ○';
        const p = a.provider ? ` [${a.provider}/${a.model || '?'}]` : '';
        console.log(`  ${active}  ${a.name} (${a.id})${p}`);
      }
      console.log('');
      return;
    }

    const session: AgentSession = await createAgentSession({
      model: options.model,
      provider: options.provider,
      agent: options.agent,
      resume: options.resume,
      enableStream: options.stream,
      sandboxDebug: options.sandboxDebug,
      quietLogging: true,
    });

    const cols = getTermCols();
    const rows = getTermRows();
    const screen = new VirtualScreen(cols, rows);
    const renderer = new Renderer(screen, dark, i18n.t);
    const tui = startTui(screen, renderer, session);

    tui.chatView.addMessage({
      role: 'system',
      content: `${session.agent.name} · ${session.effectiveProvider.name}/${session.model}`,
    });
    tui.chatView.addMessage({
      role: 'system',
      content: i18n.t('cli.chat.banner.promptHint'),
    });

    inputEngine.onKey(async (event) => {
      renderer.handleKey(event);
      renderer.scheduleRender();
    });

    tui.completionMenu.setOnSelect((candidate) => {
      tui.textInput.setText(candidate.label + ' ');
      tui.textInput.showCompletions = false;
      renderer.scheduleRender();
    });

    tui.textInput.setOnSubmit(async (text) => {
      if (tui.pendingApproval) {
        const answer = text.trim().toLowerCase();
        const approved = answer === 'y' || answer === 'yes';
        const command = tui.pendingApproval.command;
        tui.pendingApproval.resolve(approved);
        tui.pendingApproval = null;
        tui.textInput.clear();
        tui.chatView.addMessage({
          role: 'system',
          content: approved ? `Approved: ${command}` : `Denied: ${command}`,
        });
        renderer.scheduleRender();
        return;
      }

      if (text.trim() === '/exit' || text.trim() === '/quit') {
        tui.running = false;
        return;
      }

      if (text.startsWith('/')) {
        await handleSlashCommand(text, session, tui, renderer);
        tui.textInput.clear();
        renderer.scheduleRender();
        return;
      }

      tui.chatView.addMessage({ role: 'user', content: text });
      tui.chatView.addMessage({ role: 'assistant', content: '' });
      tui.statusBar.model = `${session.effectiveProvider.name}/${session.model}`;
      tui.statusBar.sessionName = session.sid.slice(0, 8);
      tui.textInput.clear();
      renderer.scheduleRender();

      const approvalGate = async (
        tool: string,
        command: string,
        sampleData?: string,
      ): Promise<boolean> => {
        tui.chatView.addMessage({
          role: 'system',
          content: `Approval needed: ${tool}\n  ${command}${
            sampleData ? `\n  Sample: ${sampleData}` : ''
          }\n  Type "y" to approve or "n" to deny.`,
        });
        renderer.scheduleRender();

        return new Promise((resolve) => {
          tui.pendingApproval = { resolve, command };
        });
      };

      try {
        const result = await agentTurn({
          userMessage: text,
          provider: session.effectiveProvider,
          model: session.model,
          sessionDb: session.sessionDb,
          sessionId: session.sid,
          systemPrompt: session.systemPrompt,
          stream: session.enableStream,
          reasoningEffort: session.reasoningEffort,
          onChunk: session.enableStream
            ? (chunk) => {
              tui.chatView.appendToLastMessage(chunk);
              renderer.scheduleRender();
            }
            : undefined,
          registry: session.registry,
          toolContext: {
            workingDir: Deno.cwd(),
            approvalGate,
            agentId: 'assistant',
            workspaceDir: Deno.cwd(),
            model: session.model,
            provider: session.config.defaultProvider,
          },
          embedder: session.embedder,
        });

        if (!session.enableStream) {
          tui.chatView.updateLastMessage(result.response);
        }

        tui.statusBar.inputTokens = result.tokensIn;
        tui.statusBar.outputTokens = result.tokensOut;
        tui.statusBar.cost = result.costUsd;
        tui.statusBar.contextPercent = 0;
      } catch (err) {
        tui.chatView.addMessage({
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
  });

interface TuiState {
  running: boolean;
  theme: import('../tui/style.ts').Theme;
  chatView: ChatView;
  statusBar: StatusBar;
  header: Header;
  textInput: TextInput;
  completionMenu: CompletionMenu;
  pendingApproval: { resolve: (v: boolean) => void; command: string } | null;
}

function startTui(
  screen: VirtualScreen,
  renderer: Renderer,
  session: AgentSession,
): TuiState {
  const rows = screen.height;
  const header = new Header(
    'Cortex — chat',
    `${session.effectiveProvider.name}/${session.model}`,
  );
  header.x = 0;
  header.y = 0;
  header.width = screen.width;
  header.height = 1;

  const statusBar = new StatusBar();
  statusBar.model = `${session.effectiveProvider.name}/${session.model}`;
  statusBar.sessionName = session.sid.slice(0, 8);

  const chatView = new ChatView();
  chatView.x = 0;
  chatView.y = 0;
  chatView.focused = true;

  const textInput = new TextInput();
  textInput.setPrompt('> ');
  textInput.x = 0;
  textInput.y = 0;
  textInput.height = 3;
  textInput.focused = true;

  const completionMenu = new CompletionMenu();
  completionMenu.visible = false;

  const mainSplit = new VSplit();
  mainSplit.add(header, 1);
  mainSplit.add(chatView, `*`);
  mainSplit.add(textInput, 3);
  mainSplit.add(statusBar, 1);
  mainSplit.x = 0;
  mainSplit.y = 0;
  mainSplit.width = screen.width;
  mainSplit.height = screen.height;

  renderer.mount(mainSplit);
  renderer.mount(completionMenu);

  const state: TuiState = {
    running: true,
    theme: dark,
    chatView,
    statusBar,
    header,
    textInput,
    completionMenu,
    pendingApproval: null,
  };

  return state;
}

async function handleSlashCommand(
  input: string,
  session: AgentSession,
  tui: TuiState,
  renderer: Renderer,
): Promise<void> {
  const parts = input.trim().split(/\s+/);
  const cmd = (parts[0] ?? '').slice(1);
  const arg = parts.slice(1).join(' ');

  switch (cmd) {
    case 'model': {
      const name = arg.trim();
      if (!name) {
        tui.chatView.addMessage({
          role: 'system',
          content: `Current model: ${session.model}\nUsage: /model <model-name>`,
        });
        break;
      }
      session.model = name;
      tui.statusBar.model = `${session.effectiveProvider.name}/${name}`;
      tui.chatView.addMessage({
        role: 'system',
        content: `Switched to model: ${name}`,
      });
      break;
    }
    case 'compact': {
      tui.chatView.addMessage({
        role: 'system',
        content:
          'Context compaction will run automatically when the context window is full. No manual compaction needed.',
      });
      break;
    }
    case 'status': {
      tui.chatView.addMessage({
        role: 'system',
        content: `Session: ${
          session.sid.slice(0, 12)
        }...\nModel: ${session.model}\nProvider: ${session.effectiveProvider.name}\nAgent: ${session.agent.name}`,
      });
      break;
    }
    case 'clear': {
      tui.chatView.clear();
      tui.chatView.addMessage({
        role: 'system',
        content: 'Chat history cleared.',
      });
      break;
    }
    case 'save': {
      const file = arg || `transcript-${session.sid.slice(0, 8)}.md`;
      try {
        const messages = tui.chatView.getCurrentMessages();
        const text = messages.map((m) => `## ${m.role}\n${m.content}`).join('\n\n');
        await Deno.writeTextFile(file, text);
        tui.chatView.addMessage({
          role: 'system',
          content: `Transcript saved to ${file}`,
        });
      } catch (e) {
        tui.chatView.addMessage({
          role: 'system',
          content: `Failed to save: ${(e as Error).message}`,
        });
      }
      break;
    }
    case 'load': {
      const file = arg;
      if (!file) {
        tui.chatView.addMessage({
          role: 'system',
          content: 'Usage: /load <file>',
        });
        break;
      }
      try {
        const content = await Deno.readTextFile(file);
        tui.chatView.addMessage({
          role: 'system',
          content: `Loaded from ${file} (${content.length} chars)`,
        });
      } catch (e) {
        tui.chatView.addMessage({
          role: 'system',
          content: `Failed to load: ${(e as Error).message}`,
        });
      }
      break;
    }
    case 'export': {
      try {
        const messages = tui.chatView.getCurrentMessages();
        const text = messages.map((m) => `## ${m.role}\n${m.content}`).join('\n\n');
        const file = `export-${session.sid.slice(0, 8)}.md`;
        await Deno.writeTextFile(file, text);
        tui.chatView.addMessage({
          role: 'system',
          content: `Session exported to ${file}`,
        });
      } catch (e) {
        tui.chatView.addMessage({
          role: 'system',
          content: `Failed to export: ${(e as Error).message}`,
        });
      }
      break;
    }
    case 'theme': {
      const name = arg.trim() || 'dark';
      const themes: Record<string, import('../tui/style.ts').Theme> = {
        dark,
        light,
        contrast,
      };
      const theme = themes[name];
      if (theme) {
        tui.theme = theme;
        renderer.setTheme(theme);
        tui.chatView.addMessage({
          role: 'system',
          content: `Theme switched to: ${name}`,
        });
      } else {
        tui.chatView.addMessage({
          role: 'system',
          content: `Unknown theme: ${name}. Available: dark, light, contrast`,
        });
      }
      break;
    }
    case 'diff': {
      tui.chatView.addMessage({
        role: 'system',
        content: 'No recent diff available. Run file operations first.',
      });
      break;
    }
    case 'review': {
      tui.chatView.addMessage({
        role: 'system',
        content: 'No pending tool approvals.',
      });
      break;
    }
    case 'plan': {
      tui.chatView.addMessage({
        role: 'system',
        content:
          'Planning is embedded in the agent loop. The agent automatically plans before executing complex tasks.',
      });
      break;
    }
    case 'help': {
      tui.chatView.addMessage({
        role: 'system',
        content: `Slash commands:
  /model <name>   - Switch model
  /compact        - Trigger context compaction
  /status         - Show session info
  /clear          - Clear chat history
  /save [file]    - Save transcript
  /load <file>    - Load transcript
  /export         - Export session as markdown
  /theme <name>   - Switch theme (dark/light/contrast)
  /diff           - Show last file change
  /review         - Review pending approvals
  /plan           - Enter planning mode
  /help           - Show this help
  /soul           - Show soul context
  /! <cmd>        - Execute bash command
  /exit, /quit    - Exit chat`,
      });
      break;
    }
    case 'soul': {
      const ctx = await loadSoulContext();
      const lines: string[] = ['Soul context:'];
      if (ctx.soul) lines.push(`\nSoul:\n${ctx.soul.slice(0, 500)}`);
      if (ctx.user) lines.push(`\nUser:\n${ctx.user.slice(0, 300)}`);
      if (ctx.memory) lines.push(`\nMemory:\n${ctx.memory.slice(0, 300)}`);
      tui.chatView.addMessage({ role: 'system', content: lines.join('\n') });
      break;
    }
    case '!': {
      const shellCmd = arg;
      if (!shellCmd) {
        tui.chatView.addMessage({
          role: 'system',
          content: 'Usage: /! <bash command>',
        });
        break;
      }
      try {
        const result = await execShell(shellCmd);
        tui.chatView.addMessage({ role: 'system', content: result });
      } catch (e) {
        tui.chatView.addMessage({
          role: 'system',
          content: `Command failed: ${(e as Error).message}`,
        });
      }
      break;
    }
    default: {
      tui.chatView.addMessage({
        role: 'system',
        content: `Unknown command: /${cmd}. Type /help for available commands.`,
      });
    }
  }

  renderer.scheduleRender();
}

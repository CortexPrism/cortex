export interface CompletionCandidate {
  label: string;
  description?: string;
  type: 'slash-command' | 'file' | 'agent' | 'model' | 'shell';
}

export type CompletionProvider = (
  input: string,
  cursorPos: number,
) => CompletionCandidate[];

const SLASH_COMMANDS: CompletionCandidate[] = [
  { label: '/model', description: 'Switch model', type: 'slash-command' },
  { label: '/compact', description: 'Trigger context compaction', type: 'slash-command' },
  { label: '/status', description: 'Show session info', type: 'slash-command' },
  { label: '/clear', description: 'Clear chat history', type: 'slash-command' },
  { label: '/save', description: 'Save transcript to file', type: 'slash-command' },
  { label: '/load', description: 'Load transcript from file', type: 'slash-command' },
  { label: '/export', description: 'Export session as markdown', type: 'slash-command' },
  { label: '/theme', description: 'Switch color theme', type: 'slash-command' },
  { label: '/diff', description: 'Show last file change as diff', type: 'slash-command' },
  { label: '/review', description: 'Review pending tool approvals', type: 'slash-command' },
  { label: '/plan', description: 'Enter planning mode', type: 'slash-command' },
  { label: '/soul', description: 'Show agent soul context', type: 'slash-command' },
  { label: '/help', description: 'List all commands and keybindings', type: 'slash-command' },
];

const SHELL_COMMANDS: CompletionCandidate[] = [
  { label: '/!', description: 'Execute bash command', type: 'shell' },
];

export function slashCommandProvider(
  input: string,
  _cursorPos: number,
): CompletionCandidate[] {
  if (input.startsWith('/!')) return [];
  if (!input.startsWith('/')) return [];
  const prefix = input.toLowerCase();
  return [...SLASH_COMMANDS, ...SHELL_COMMANDS].filter(
    (c) => c.label.toLowerCase().startsWith(prefix),
  );
}

export function filePathProvider(
  input: string,
  _cursorPos: number,
): CompletionCandidate[] {
  if (input.startsWith('/')) return [];
  const lastSpace = input.lastIndexOf(' ');
  const prefix = lastSpace >= 0 ? input.slice(lastSpace + 1) : input;
  if (!prefix || prefix === '.') return [];

  try {
    const entries: CompletionCandidate[] = [];
    for (const entry of Deno.readDirSync(Deno.cwd())) {
      if (entry.name.startsWith(prefix)) {
        entries.push({
          label: entry.name,
          description: entry.isDirectory ? 'Directory' : 'File',
          type: 'file',
        });
      }
    }
    return entries.slice(0, 20);
  } catch {
    return [];
  }
}

export function agentNameProvider(
  input: string,
  _cursorPos: number,
): CompletionCandidate[] {
  if (!input.startsWith('@')) return [];
  const prefix = input.slice(1).toLowerCase();
  try {
    const configText = Deno.readTextFileSync(
      Deno.env.get('CORTEX_CONFIG_DIR') || `${Deno.env.get('HOME')}/.cortex`,
    );
    const config = JSON.parse(configText);
    const agents: Record<string, unknown> = config.agents ?? {};
    return Object.keys(agents)
      .filter((name) => name.toLowerCase().startsWith(prefix))
      .map((name) => ({
        label: `@${name}`,
        description: 'Agent',
        type: 'agent' as const,
      }));
  } catch {
    return [];
  }
}

export function compositeProvider(
  input: string,
  cursorPos: number,
): CompletionCandidate[] {
  const providers = [slashCommandProvider, filePathProvider, agentNameProvider];
  for (const provider of providers) {
    const results = provider(input, cursorPos);
    if (results.length > 0) return results;
  }
  return [];
}

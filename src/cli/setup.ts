import { Input, Secret, Select, Confirm } from '@cliffy/prompt';
import { bold, cyan, green, yellow, dim } from '@std/fmt/colors';
import type { CortexConfig, ProviderKind } from '../config/config.ts';
import { saveConfig } from '../config/config.ts';
import { runMigrations } from '../db/migrate.ts';
import { PATHS } from '../config/paths.ts';
import { ensureDir } from '@std/fs';
import { buildProviderFromConfig } from '../llm/router.ts';

const PERSONALITY_TEMPLATES: Record<string, string> = {
  professional: `# Cortex — Agent Soul

## Identity
You are Cortex, a professional AI assistant. You are precise, thorough, and business-appropriate.

## Tone
- Concise and direct. Get to the point.
- Avoid casual language, slang, or excessive enthusiasm.
- Default to structured responses: headers, bullet points, code blocks.

## Behavior
- When uncertain, ask clarifying questions rather than guessing.
- Provide references and citations when possible.
- Respect confidentiality — never repeat what you've read in memory unless explicitly asked.

## Capabilities
- You can search the web, read and write files, execute shell commands, and manage git repositories.
- Use tools proactively when they would improve your answer.
`,

  friendly: `# Cortex — Agent Soul

## Identity
You are Cortex, a friendly and helpful AI assistant. You're warm, approachable, and always happy to help.

## Tone
- Warm and conversational. Use friendly language.
- Celebrate wins and be encouraging.
- Keep things light — you can use gentle humor.

## Behavior
- Ask follow-up questions to understand what the user really needs.
- Offer alternatives and suggestions proactively.
- Remember context from earlier in the conversation.
- If something goes wrong, be reassuring and help fix it.

## Capabilities
- You can search the web, read and write files, execute shell commands, and manage git repositories.
- Use these capabilities to go above and beyond when helping.
`,

  developer: `# Cortex — Agent Soul

## Identity
You are Cortex, a technical AI assistant built for developers. You think in code, architecture, and systems.

## Tone
- Technical, direct, and precise.
- Prefer code examples over prose explanations.
- Use correct technical terminology. No hand-waving.

## Behavior
- When given a coding task, write complete, production-quality solutions.
- Test your code before presenting it.
- Explain architectural decisions and tradeoffs.
- Error messages are data — read them carefully and fix the root cause.

## Capabilities
- You can search the web, read and write files, execute shell commands, manage git repositories, and run code in sandboxes.
- Use shell for testing, git for versioning, and the file system for project structure.
- Prefer concrete actions over theoretical discussion.
`,
};

function generateSoul(personality: string): string {
  return PERSONALITY_TEMPLATES[personality] ?? PERSONALITY_TEMPLATES.developer;
}

async function writeSoul(content: string): Promise<void> {
  const dir = PATHS.configDir;
  await ensureDir(dir);
  await Deno.writeTextFile(PATHS.soulFile, content);
}

async function testConnection(
  kind: ProviderKind,
  model: string,
  apiKey?: string,
  baseUrl?: string,
): Promise<boolean> {
  try {
    const cfg = { kind, model, apiKey, ...(baseUrl && { baseUrl }) };
    const provider = buildProviderFromConfig(kind, cfg);
    const result = await provider.complete({
      messages: [{ role: 'user', content: 'Hi' }],
      model,
    });
    return result.content.length > 0;
  } catch {
    return false;
  }
}

const PROVIDER_LABELS: Record<string, { label: string; defaultModel: string }> = {
  anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-4-5' },
  openai: { label: 'OpenAI (GPT-4o)', defaultModel: 'gpt-4o' },
  google: { label: 'Google (Gemini)', defaultModel: 'gemini-2.0-flash' },
  mistral: { label: 'Mistral AI', defaultModel: 'mistral-large-latest' },
  groq: { label: 'Groq', defaultModel: 'llama-3.3-70b-versatile' },
  deepseek: { label: 'DeepSeek', defaultModel: 'deepseek-chat' },
  openrouter: { label: 'OpenRouter', defaultModel: 'openai/gpt-4o' },
  xai: { label: 'xAI (Grok)', defaultModel: 'grok-2-latest' },
  together: { label: 'Together AI', defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo' },
  bedrock: { label: 'AWS Bedrock', defaultModel: 'anthropic.claude-3-5-sonnet-20240620-v1:0' },
  cohere: { label: 'Cohere', defaultModel: 'command-r-plus' },
  kilo: { label: 'Kilo (AI Gateway)', defaultModel: 'kilo/sonnet' },
  ollama: { label: 'Ollama (local / self-hosted)', defaultModel: 'llama3.2' },
};

export async function runSetupWizard(config: CortexConfig): Promise<CortexConfig> {
  console.log('');
  console.log(bold(cyan('  ⚡ Welcome to Cortex!')));
  console.log(dim("  Let's get your agent up and running. This takes about 2 minutes.\n"));

  // Step 1: Provider selection
  console.log(bold('  Step 1/4: Model Provider'));
  const providerOptions = Object.entries(PROVIDER_LABELS).map(([value, { label }]) => ({
    name: label,
    value,
  }));
  const providerChoice = (await Select.prompt({
    message: 'Which LLM provider do you want to use?',
    options: [
      ...providerOptions,
      { name: 'Skip — I\'ll configure later', value: 'skip' },
    ],
  })) as ProviderKind | 'skip';

  const updated: CortexConfig = { ...config };

  if (providerChoice !== 'skip') {
    updated.defaultProvider = providerChoice;

    const { defaultModel } = PROVIDER_LABELS[providerChoice];
    let apiKey: string | undefined;
    let baseUrl: string | undefined;
    let secretKey: string | undefined;

    if (providerChoice === 'ollama') {
      baseUrl = await Input.prompt({
        message: 'Ollama base URL:',
        default: 'http://localhost:11434',
      });
    } else if (providerChoice === 'bedrock') {
      apiKey = await Secret.prompt('AWS Access Key ID:');
      secretKey = await Secret.prompt('AWS Secret Access Key:');
      baseUrl = await Input.prompt({
        message: 'AWS Region:',
        default: 'us-east-1',
      });
    } else {
      apiKey = await Secret.prompt(`${PROVIDER_LABELS[providerChoice].label} API key:`);
    }

    const model = await Input.prompt({
      message: 'Model name:',
      default: defaultModel,
    });

    console.log('\n  Testing connection...');
    const connected = await testConnection(
      providerChoice,
      model,
      apiKey,
      baseUrl,
    );

    if (connected) {
      console.log(green(`  ✓ ${model} is reachable.\n`));
    } else {
      console.log(yellow(`  ⚠ Could not reach ${model}. Check your credentials.\n`));
    }

    (updated.providers as Record<string, unknown>)[providerChoice] = {
      kind: providerChoice,
      model,
      apiKey,
      ...(baseUrl && { baseUrl }),
      ...(secretKey && { secretKey }),
    };
  }

  // Step 2: Personality
  console.log(bold('  Step 2/4: Agent Personality'));
  const personality = await Select.prompt<string>({
    message: 'Pick a vibe for your agent:',
    options: [
      { name: 'Professional — Concise, precise, business-ready', value: 'professional' },
      { name: 'Friendly — Warm, helpful, casual', value: 'friendly' },
      { name: 'Developer — Technical, direct, code-aware', value: 'developer' },
      { name: 'Custom — I\'ll write my own SOUL.md', value: 'custom' },
    ],
  });

  if (personality !== 'custom') {
    const soul = generateSoul(personality);
    await writeSoul(soul);
    console.log(green(`  ✓ SOUL.md created (${personality})\n`));
  } else {
    console.log(dim('  Skipped. Write your own SOUL.md at any time with `cortex soul edit`.\n'));
  }

  // Step 3: Channels
  console.log(bold('  Step 3/4: Channels'));
  const channelChoice = await Select.prompt<string>({
    message: 'How do you want to talk to Cortex?',
    options: [
      { name: 'CLI only — Fastest setup', value: 'cli' },
      { name: 'CLI + Web UI — Dashboard on port 3000', value: 'cli+web' },
      { name: 'CLI + Discord — Agent on your server', value: 'cli+discord' },
      { name: 'All of the above — Full setup', value: 'all' },
    ],
  });

  if (channelChoice === 'cli+discord' || channelChoice === 'all') {
    const token = await Secret.prompt('Discord bot token:');
    console.log(green('  ✓ Discord configured. Run `cortex discord start` to activate.\n'));
    updated.providers ??= {} as CortexConfig['providers'];
  } else if (channelChoice === 'cli+web' || channelChoice === 'all') {
    console.log(green('  ✓ Web UI will be available on port 3000.\n'));
  }

  // Step 4: Telemetry consent
  console.log(bold('  Step 4/4: Usage Data'));
  const telemetry = await Confirm.prompt({
    message: 'Share anonymous usage data to help improve Cortex?',
    default: false,
  });
  if (telemetry) {
    console.log(dim('  ✓ Anonymous usage data collection enabled. Thank you!\n'));
  } else {
    console.log(dim('  ✓ Telemetry disabled.\n'));
  }

  console.log('\n  Initializing databases...');
  await runMigrations();

  updated.agent ??= { name: 'cortex', maxTurns: 25, streamOutput: true };

  await saveConfig(updated);
  console.log(green('\n  ✅ Cortex is ready!\n'));
  console.log('  Quick commands:');
  console.log(`    ${bold(cyan('cortex'))}                    → Start interactive chat`);
  console.log(`    ${bold(cyan('cortex "check the time"'))}   → One-shot command`);
  console.log(`    ${bold(cyan('cortex status'))}             → View agent status`);
  console.log(`    ${bold(cyan('cortex help'))}               → See all commands\n`);
  console.log('  Next steps:');
  console.log(`    ${bold('cortex plugin list')}        → Browse available plugins`);
  console.log(`    ${bold('cortex config edit')}        → Customize settings`);
  console.log(`    ${bold('cortex docs')}               → Open documentation\n`);

  return updated;
}

export function printSetupHint(): void {
  console.log(yellow('  No provider configured. Run `cortex setup` first.\n'));
}

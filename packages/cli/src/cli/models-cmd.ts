import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, red, yellow } from '@std/fmt/colors';
import { saveConfig } from '../../../../src/config/config.ts';
import type { ProviderConfig, ProviderKind } from '../../../../src/config/config.ts';
import { fetchModels } from '../../../../src/server/models.ts';
import { i18n } from '../../../../src/i18n/service.ts';

const PROVIDER_KINDS: ProviderKind[] = [
  'anthropic',
  'openai',
  'ollama',
  'google',
  'mistral',
  'groq',
  'deepseek',
  'openrouter',
  'xai',
  'together',
  'bedrock',
  'cohere',
  'kilo',
  'cerebras',
  'fireworks',
  'perplexity',
  'nvidia',
  'moonshot',
  'novita',
  'lmstudio',
  'litellm',
  'huggingface',
  'alibaba',
  'venice',
];

function isProviderKind(v: string): v is ProviderKind {
  return PROVIDER_KINDS.includes(v as ProviderKind);
}

function formatProvider(
  kind: ProviderKind,
  cfg: ProviderConfig,
  defaultProvider: ProviderKind,
): string {
  const isDefault = kind === defaultProvider;
  const providerName = bold(isDefault ? green(kind) : cyan(kind));
  const model = cfg.model ? yellow(cfg.model) : dim('(not configured)');
  const reasoning = cfg.reasoningEffort ? `  reason: ${cyan(cfg.reasoningEffort)}` : '';
  const context = cfg.contextWindow
    ? `  context: ${dim(`${(cfg.contextWindow / 1000).toFixed(0)}k tokens`)}`
    : '';
  const temp = cfg.temperature !== undefined ? `  temp: ${dim(String(cfg.temperature))}` : '';
  const maxTok = cfg.maxTokens ? `  maxToken: ${dim(String(cfg.maxTokens))}` : '';
  return `  ${providerName} → ${model}${reasoning}${context}${temp}${maxTok}`;
}

export const modelsCommand = cortexCommand('models')
  .description('List and configure LLM models, reasoning effort, and context windows')
  .needs('config')
  .command(
    'list',
    cortexCommand('list')
      .description('List all configured providers and their model settings')
      .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
        const config = ctx.config!;
        const entries = Object.entries(config.providers).filter(
          ([, v]) => v !== undefined,
        ) as [ProviderKind, ProviderConfig][];

        if (entries.length === 0) {
          console.log(dim(i18n.t('cli.models.noProvidersConfigured')));
          return;
        }

        console.log('');
        console.log(bold('  Configured Models'));
        console.log(dim('  ────────────────────────────────────────────────────────'));
        for (const [kind, cfg] of entries) {
          console.log(formatProvider(kind, cfg, config.defaultProvider));
        }
        console.log('');
        console.log(
          dim(
            `  Default provider: ${
              green(config.defaultProvider)
            }  •  ${entries.length} provider(s) configured`,
          ),
        );
        console.log('');
      }),
  )
  .command(
    'show',
    cortexCommand('show')
      .description('Show detailed settings for a specific provider')
      .arguments('<provider:string>')
      .action(async (_opts: Record<string, unknown>, ctx: Ctx, provider: string) => {
        if (!isProviderKind(provider)) {
          console.error(red(i18n.t('cli.models.errorUnknownProvider', { provider })));
          console.error(
            dim(i18n.t('cli.models.validProviders', { providers: PROVIDER_KINDS.join(', ') })),
          );
          Deno.exit(1);
        }

        const config = ctx.config!;
        const cfg = config.providers[provider];

        if (!cfg) {
          console.log(dim(i18n.t('cli.models.providerNotConfigured', { provider })));
          return;
        }

        const isDefault = provider === config.defaultProvider;

        console.log('');
        console.log(bold(`  ${isDefault ? green(provider + ' (default)') : cyan(provider)}`));
        console.log(dim('  ────────────────────────────────────────────────────────'));
        console.log(`  Model:       ${yellow(cfg.model)}`);
        console.log(
          `  Temperature: ${
            cfg.temperature !== undefined ? dim(String(cfg.temperature)) : dim('default')
          }`,
        );
        console.log(
          `  Max Tokens:  ${cfg.maxTokens ? dim(String(cfg.maxTokens)) : dim('default')}`,
        );
        console.log(`  Top P:       ${cfg.topP ? dim(String(cfg.topP)) : dim('default')}`);
        console.log(
          `  Reasoning:   ${cfg.reasoningEffort ? cyan(cfg.reasoningEffort) : dim('off')}` +
            `  (${dim('low=1k · medium=4k · high=16k tokens')})`,
        );
        console.log(
          `  Context:     ${
            cfg.contextWindow
              ? cyan(`${(cfg.contextWindow / 1000).toFixed(0)}k tokens`)
              : dim('not set')
          }`,
        );
        console.log(`  API Key:     ${cfg.apiKey ? green('configured') : red('missing')}`);
        if (cfg.baseUrl) console.log(`  Base URL:    ${dim(cfg.baseUrl)}`);
        if (cfg.pricing && Object.keys(cfg.pricing).length > 0) {
          console.log(`  Pricing:${dim(' (per 1M tokens)')}`);
          for (const [m, r] of Object.entries(cfg.pricing)) {
            console.log(`    ${cyan(m)}: $${r.in} in / $${r.out} out`);
          }
        }
        console.log('');
      }),
  )
  .command(
    'set',
    cortexCommand('set')
      .description('Set model configuration for a provider')
      .arguments('<provider:string> <key:string> [value:string]')
      .action(
        async (
          _opts: Record<string, unknown>,
          ctx: Ctx,
          provider: string,
          key: string,
          value?: string,
        ) => {
          if (!isProviderKind(provider)) {
            console.error(red(`  Error: unknown provider "${provider}"`));
            Deno.exit(1);
          }

          const validKeys = [
            'model',
            'reasoningEffort',
            'contextWindow',
            'temperature',
            'maxTokens',
            'topP',
          ];
          if (!validKeys.includes(key)) {
            console.error(red(i18n.t('cli.models.unknownKey', { key })));
            console.error(dim(i18n.t('cli.models.validKeys', { keys: validKeys.join(', ') })));
            Deno.exit(1);
          }

          const config = ctx.config!;
          const cfg = config.providers[provider];

          if (!cfg) {
            console.error(
              red(i18n.t('cli.models.providerNotConfiguredError', { provider })),
            );
            Deno.exit(1);
          }

          if (value === undefined || value === '') {
            // Unset the field
            if (key === 'model') {
              console.error(red(i18n.t('cli.models.modelCannotUnset')));
              Deno.exit(1);
            }
            (cfg as unknown as Record<string, unknown>)[key] = undefined;
            config.providers[provider] = cfg;
            await saveConfig(config);
            console.log(
              green(i18n.t('cli.models.unsetKey', { key: bold(key), provider: bold(provider) })),
            );
          } else {
            switch (key) {
              case 'model':
                cfg.model = value;
                break;
              case 'reasoningEffort': {
                const validEfforts = ['low', 'medium', 'high'];
                if (!validEfforts.includes(value)) {
                  console.error(
                    red(
                      i18n.t('cli.models.invalidReasoningEffort', {
                        values: validEfforts.join(', '),
                      }),
                    ),
                  );
                  Deno.exit(1);
                }
                cfg.reasoningEffort = value;
                break;
              }
              case 'contextWindow': {
                const num = Number(value);
                if (isNaN(num) || num < 1000 || num > 2_000_000) {
                  console.error(
                    red(i18n.t('cli.models.invalidContextWindow')),
                  );
                  Deno.exit(1);
                }
                cfg.contextWindow = num;
                break;
              }
              case 'temperature': {
                const num = Number(value);
                if (isNaN(num) || num < 0 || num > 2) {
                  console.error(red(i18n.t('cli.models.invalidTemperature')));
                  Deno.exit(1);
                }
                cfg.temperature = num;
                break;
              }
              case 'maxTokens': {
                const num = Number(value);
                if (isNaN(num) || num < 1) {
                  console.error(red(i18n.t('cli.models.invalidMaxTokens')));
                  Deno.exit(1);
                }
                cfg.maxTokens = num;
                break;
              }
              case 'topP': {
                const num = Number(value);
                if (isNaN(num) || num < 0 || num > 1) {
                  console.error(red(i18n.t('cli.models.invalidTopP')));
                  Deno.exit(1);
                }
                cfg.topP = num;
                break;
              }
            }
            config.providers[provider] = cfg;

            await saveConfig(config);
            console.log(
              green(
                i18n.t('cli.models.setKey', {
                  key: bold(key),
                  value: cyan(value),
                  provider: bold(provider),
                }),
              ),
            );
          }
        },
      ),
  )
  .command(
    'available',
    cortexCommand('available')
      .description('Fetch available models from a provider API')
      .arguments('[provider:string]')
      .action(async (_opts: Record<string, unknown>, ctx: Ctx, provider?: string) => {
        if (provider && !isProviderKind(provider)) {
          console.error(red(`  Error: unknown provider "${provider}"`));
          Deno.exit(1);
        }

        const config = ctx.config!;
        const kinds: ProviderKind[] = provider ? [provider as ProviderKind] : PROVIDER_KINDS;

        for (const kind of kinds) {
          const cfg = config.providers[kind];
          if (!cfg?.apiKey && kind !== 'ollama' && kind !== 'bedrock') {
            if (provider) {
              console.error(red(i18n.t('cli.models.noApiKey', { provider: kind })));
              Deno.exit(1);
            }
            continue;
          }

          const label = kind === config.defaultProvider ? green(kind) : kind;
          console.log('');
          console.log(bold(`  ${label}`));
          console.log(dim('  ────────────────────────────────────────────────────────'));

          try {
            const models = await fetchModels(kind, cfg?.apiKey, cfg?.baseUrl);
            if (models.length === 0) {
              console.log(dim('    (no models returned)'));
            } else {
              for (const m of models) {
                const marker = m.id === cfg?.model ? yellow(' ● ') : '   ';
                const name = m.name ? dim(` — ${m.name}`) : '';
                console.log(`${marker}${m.id}${name}`);
              }
            }
            console.log(dim(`    ${models.length} model(s)`));
          } catch (err) {
            console.log(red(`    Error: ${(err as Error).message}`));
          }
        }
        console.log('');
      }),
  );

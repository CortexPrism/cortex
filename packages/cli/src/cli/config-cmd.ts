import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { saveConfig } from '../../../../src/config/config.ts';

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

function deleteNestedValue(obj: Record<string, unknown>, path: string): boolean {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) return false;
    const next = current[part];
    if (typeof next !== 'object' || next === null) return false;
    current = next as Record<string, unknown>;
  }
  return delete current[parts[parts.length - 1]];
}

function tryParseJson5(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const lower = value.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    if (lower === 'null') return null;
    if (lower === 'undefined') return undefined;
    if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
    const unquoted = value.replace(/^['"](.*)['"]$/, '$1');
    if (unquoted !== value) return unquoted;
    return value;
  }
}

const SENSITIVE_KEYS = new Set([
  'apiKey',
  'secretKey',
  'githubToken',
  'authToken',
  'api_key',
  'secret_key',
  'token',
  'password',
]);

function redactSecrets(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(redactSecrets);
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(key) && typeof value === 'string' && value.length > 0) {
      result[key] = '***REDACTED***';
    } else {
      result[key] = redactSecrets(value);
    }
  }
  return result;
}

export const configCommand = cortexCommand('config')
  .description('Manage Cortex configuration')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {});

export const configGetCommand = cortexCommand('get')
  .description('Get a configuration value by dot-notation key')
  .arguments('<key:string>')
  .needs('config')
  .action(async (opts: Record<string, unknown>, ctx: Ctx, key: string) => {
    const config = ctx.config!;
    const value = getNestedValue(config as unknown as Record<string, unknown>, key);
    if (value === undefined) {
      console.error(`Key not found: ${key}`);
      Deno.exit(1);
    }
    if (opts.json) {
      console.log(JSON.stringify(value));
    } else {
      console.log(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
    }
  });

export const configSetCommand = cortexCommand('set')
  .description('Set a configuration value by dot-notation key')
  .arguments('<key:string> <value:string>')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx, key: string, valueStr: string) => {
    const config = ctx.config!;
    const parsed = tryParseJson5(valueStr);
    setNestedValue(config as unknown as Record<string, unknown>, key, parsed);
    await saveConfig(config);
    console.log(`Set ${key} = ${JSON.stringify(parsed)}`);
  });

export const configUnsetCommand = cortexCommand('unset')
  .description('Remove a configuration key')
  .arguments('<key:string>')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx, key: string) => {
    const config = ctx.config!;
    const deleted = deleteNestedValue(config as unknown as Record<string, unknown>, key);
    if (!deleted) {
      console.error(`Key not found: ${key}`);
      Deno.exit(1);
    }
    await saveConfig(config);
    console.log(`Unset ${key}`);
  });

export const configListCommand = cortexCommand('list')
  .description('List full configuration (secrets redacted)')
  .needs('config')
  .action(async (opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
    const safe = redactSecrets(config);
    if (opts.json) {
      console.log(JSON.stringify(safe, null, 2));
    } else {
      console.log(JSON.stringify(safe, null, 2));
    }
  });

export const configValidateCommand = cortexCommand('validate')
  .description('Validate configuration against schema')
  .needs('config')
  .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
    const config = ctx.config!;
    const issues: string[] = [];

    if (!config.version) issues.push('Missing version');
    if (!config.defaultProvider) issues.push('Missing defaultProvider');
    if (!config.providers[config.defaultProvider]?.apiKey) {
      issues.push(`No apiKey configured for default provider "${config.defaultProvider}"`);
    }
    if (!config.defaultAgent) issues.push('Missing defaultAgent');
    if (!config.agents?.[config.defaultAgent]) {
      issues.push(`Default agent "${config.defaultAgent}" not found in agents`);
    }

    if (issues.length === 0) {
      console.log('Configuration is valid.');
    } else {
      console.error('Configuration issues:');
      for (const issue of issues) {
        console.error(`  - ${issue}`);
      }
      Deno.exit(1);
    }
  });

configCommand._cmd
  .command('get', configGetCommand._cmd)
  .command('set', configSetCommand._cmd)
  .command('unset', configUnsetCommand._cmd)
  .command('list', configListCommand._cmd)
  .command('validate', configValidateCommand._cmd);

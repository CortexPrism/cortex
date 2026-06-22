import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan, dim, green, yellow } from '@std/fmt/colors';
import type { i18n } from '../../../../src/i18n/service.ts';

export const a2aCommand = cortexCommand('a2a')
  .description('A2A Protocol Bridge — agent-to-agent interoperability')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
    console.log('');
    console.log(bold('Cortex A2A Protocol Bridge'));
    console.log('  Google Agent2Agent (A2A) v1.0 protocol for cross-framework agent interop.');
    console.log('');
    console.log(bold('Usage'));
    console.log(`  ${cyan('cortex mcp a2a card')}         — Display the local Cortex agent card`);
    console.log(`  ${cyan('cortex mcp a2a skills')}       — List registered agent skills`);
    console.log(`  ${cyan('cortex mcp a2a remote')}      — List configured remote A2A agents`);
    console.log('');
    console.log(bold('Configuration'));
    console.log(`  Add remote A2A agents in ${yellow('~/.cortex/config.json')}:`);
    console.log('');
    console.log(`  {`);
    console.log(`    "a2a": {`);
    console.log(`      "remoteAgents": {`);
    console.log(`        "my-agent": {`);
    console.log(`          "endpoint": "https://agent.example.com",`);
    console.log(`          "authToken": "sk-xxx",`);
    console.log(`          "timeout": 120000`);
    console.log(`        }`);
    console.log(`      }`);
    console.log(`    }`);
    console.log(`  }`);
    console.log('');
    console.log(`  Each remote agent becomes a tool (${cyan('a2a_<name>')}) that the local`);
    console.log(`  agent can call to delegate tasks to external A2A-compatible agents.`);
    console.log('');
  });

a2aCommand
  .command(
    'card',
    cortexCommand('card')
      .description('Display the Cortex agent card')
      .option('--url <url:string>', 'A2A server base URL (overrides CORTEX_A2A_URL and config)')
      .needs('config')
      .action(async (opts: Record<string, unknown>, ctx: Ctx) => {
        const baseUrl = (opts.url as string | undefined) ??
          Deno.env.get('CORTEX_A2A_URL') ??
          (ctx.config! as unknown as Record<string, unknown>).a2aUrl as string ??
          `http://localhost:4220`;
        const { getA2AAgentCard } = await import('../../../../src/a2a/mod.ts');
        const card = await getA2AAgentCard(
          baseUrl,
          'CortexPrism',
          'CortexPrism AI Coding Agent',
        );
        console.log(JSON.stringify(card, null, 2));
      }),
  );

a2aCommand
  .command(
    'skills',
    cortexCommand('skills')
      .description('List registered agent skills')
      .option('--url <url:string>', 'A2A server base URL (overrides CORTEX_A2A_URL and config)')
      .needs('config')
      .action(async (opts: Record<string, unknown>, ctx: Ctx) => {
        const baseUrl = (opts.url as string | undefined) ??
          Deno.env.get('CORTEX_A2A_URL') ??
          (ctx.config! as unknown as Record<string, unknown>).a2aUrl as string ??
          `http://localhost:4220`;
        const { getA2AAgentCard } = await import('../../../../src/a2a/mod.ts');
        const card = await getA2AAgentCard(
          baseUrl,
          'CortexPrism',
          'CortexPrism AI Coding Agent',
        );
        console.log(bold('\nA2A Agent Skills'));
        console.log('');
        for (const skill of card.skills) {
          console.log(`  ${cyan(skill.name)} (${skill.id})`);
          console.log(`    ${skill.description}`);
          if (skill.tags) console.log(`    Tags: ${skill.tags.join(', ')}`);
          console.log('');
        }
      }),
  );

a2aCommand
  .command(
    'remote',
    cortexCommand('remote')
      .description('List configured remote A2A agents')
      .needs('config')
      .action(async (_opts: Record<string, unknown>, ctx: Ctx) => {
        const config = ctx.config! as unknown as Record<string, unknown>;
        const a2a = config.a2a as Record<string, unknown> | undefined;
        const agents = (a2a?.remoteAgents as Record<string, Record<string, unknown>> | undefined) ??
          {};

        console.log(bold('\nConfigured Remote A2A Agents'));
        console.log('');

        const entries = Object.entries(agents);
        if (entries.length === 0) {
          console.log(`  ${dim('No remote A2A agents configured.')}`);
          console.log('');
          console.log(
            `  Add agents in ${yellow('~/.cortex/config.json')} under ${cyan('a2a.remoteAgents')}:`,
          );
          console.log('');
          console.log(`  "a2a": {`);
          console.log(`    "remoteAgents": {`);
          console.log(`      "my-agent": {`);
          console.log(`        "endpoint": "https://agent.example.com",`);
          console.log(`        "authToken": "sk-xxx",`);
          console.log(`        "timeout": 120000`);
          console.log(`      }`);
          console.log(`    }`);
          console.log(`  }`);
          console.log('');
          return;
        }

        for (const [name, cfg] of entries) {
          console.log(`  ${bold(name)}`);
          console.log(`    Endpoint:   ${cfg.endpoint ?? dim('(required)')}`);
          console.log(`    Auth:       ${cfg.authToken ? green('Token set') : yellow('No auth')}`);
          console.log(`    Timeout:    ${cfg.timeout ? `${cfg.timeout}ms` : 'default (120s)'}`);
          console.log(`    Tool name:  ${cyan(`a2a_${name.replace(/[^a-zA-Z0-9_-]/g, '_')}`)}`);
          console.log('');
        }

        console.log(`  Total: ${bold(String(entries.length))} remote agent(s) configured`);
        console.log('');
      }),
  );

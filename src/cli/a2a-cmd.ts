import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { bold, cyan } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

export const a2aCommand = cortexCommand('a2a')
  .description('A2A Protocol Bridge — agent-to-agent interoperability')
  .action(async (_opts: Record<string, unknown>, _ctx: Ctx) => {
    console.log('');
    console.log(bold('Cortex A2A Protocol Bridge'));
    console.log('  Google Agent2Agent (A2A) v1.0 protocol for cross-framework agent interop.');
    console.log('');
    console.log(bold('Actions'));
    console.log(`  ${cyan('cortex a2a card')}     — Display the Cortex agent card`);
    console.log(`  ${cyan('cortex a2a skills')}   — List registered agent skills`);
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
        const { getA2AAgentCard } = await import('../a2a/mod.ts');
        const card = getA2AAgentCard(
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
        const { getA2AAgentCard } = await import('../a2a/mod.ts');
        const card = getA2AAgentCard(
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

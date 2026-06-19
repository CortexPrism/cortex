import { Command } from '@cliffy/command';
import { bold, cyan } from '@std/fmt/colors';

export const a2aCommand = new Command()
  .name('a2a')
  .description('A2A Protocol Bridge — agent-to-agent interoperability')
  .action(async () => {
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
  .command('card')
  .description('Display the Cortex agent card')
  .action(async () => {
    const { getA2AAgentCard } = await import('../a2a/mod.ts');
    const card = getA2AAgentCard('http://localhost:4220', 'CortexPrism', 'CortexPrism AI Coding Agent');
    console.log(JSON.stringify(card, null, 2));
  });

a2aCommand
  .command('skills')
  .description('List registered agent skills')
  .action(async () => {
    const { getA2AAgentCard } = await import('../a2a/mod.ts');
    const card = getA2AAgentCard('http://localhost:4220', 'CortexPrism', 'CortexPrism AI Coding Agent');
    console.log(bold('\nA2A Agent Skills'));
    console.log('');
    for (const skill of card.skills) {
      console.log(`  ${cyan(skill.name)} (${skill.id})`);
      console.log(`    ${skill.description}`);
      if (skill.tags) console.log(`    Tags: ${skill.tags.join(', ')}`);
      console.log('');
    }
  });

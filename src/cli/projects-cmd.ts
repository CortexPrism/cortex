import { cortexCommand } from './command-builder.ts';
import type { Ctx } from './command-builder.ts';
import { Input } from '@cliffy/prompt';
import { createProject, deleteProject, listProjects, loadProject } from '../projects/manager.ts';
import { green, yellow } from '@std/fmt/colors';
import { i18n } from '../i18n/service.ts';

const projectsCommand = cortexCommand('projects')
  .description('Manage project workspaces')
  .action(async () => {
    const projects = await listProjects();
    if (projects.length === 0) {
      console.log(i18n.t('cli.projects.noProjects'));
      return;
    }
    console.log(`\n${projects.length} project(s):\n`);
    for (const p of projects) {
      const desc = p.description ? ` — ${p.description}` : '';
      console.log(`  ${p.name}${desc}`);
      console.log(`    Path: ${p.path}`);
      console.log(`    Agent: ${p.agentId ?? 'assistant'}`);
      console.log();
    }
  });

projectsCommand
  .command(
    'create',
    cortexCommand('create')
      .arguments('<name:string>')
      .description('Create a new project workspace')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const desc = await Input.prompt({ message: 'Description (optional):', default: '' });
        const agent = await Input.prompt({
          message: 'Agent (default = assistant):',
          default: 'assistant',
        });
        const project = await createProject(name, {
          agentId: agent === 'assistant' ? undefined : agent,
          description: desc || undefined,
        });
        console.log(
          green(i18n.t('cli.projects.projectCreated', { name: project.name, path: project.path })),
        );
        console.log(i18n.t('cli.projects.useProjectHint', { name }));
      }),
  );

projectsCommand
  .command(
    'delete',
    cortexCommand('delete')
      .arguments('<name:string>')
      .description('Delete a project workspace')
      .action(async (_opts: Record<string, unknown>, _ctx: Ctx, name: string) => {
        const ok = await deleteProject(name);
        console.log(
          ok
            ? i18n.t('cli.projects.projectDeleted', { name })
            : i18n.t('cli.projects.projectNotFound', { name }),
        );
      }),
  );

export { projectsCommand };

import { Command } from '@cliffy/command';
import { Input } from '@cliffy/prompt';
import { createProject, listProjects, loadProject, deleteProject } from '../projects/manager.ts';
import { green, yellow } from '@std/fmt/colors';

const projectsCommand = new Command()
  .name('projects')
  .description('Manage project workspaces')
  .action(async () => {
    const projects = await listProjects();
    if (projects.length === 0) {
      console.log('No projects. Create one with `cortex projects create <name>`');
      return;
    }
    console.log(`\n${projects.length} project(s):\n`);
    for (const p of projects) {
      const desc = p.description ? ` — ${p.description}` : '';
      console.log(`  ${p.name}${desc}`);
      console.log(`    Path: ${p.path}`);
      console.log(`    Agent: ${p.agentId ?? 'default'}`);
      console.log();
    }
  });

projectsCommand
  .command('create <name:string>')
  .description('Create a new project workspace')
  .action(async (_opts: void, name: string) => {
    const desc = await Input.prompt({ message: 'Description (optional):', default: '' });
    const agent = await Input.prompt({ message: 'Agent (default = default):', default: 'default' });
    const project = await createProject(name, {
      agentId: agent === 'default' ? undefined : agent,
      description: desc || undefined,
    });
    console.log(green(`\nProject "${project.name}" created at ${project.path}`));
    console.log(`Run ${yellow('cortex chat --project ' + name)} to use it.`);
  });

projectsCommand
  .command('delete <name:string>')
  .description('Delete a project workspace')
  .action(async (_opts: void, name: string) => {
    const ok = await deleteProject(name);
    console.log(ok ? `Project "${name}" deleted.` : `Project "${name}" not found.`);
  });

export { projectsCommand };

import { Command } from '@cliffy/command';
import { Select, Input, Confirm } from '@cliffy/prompt';
import {
  registerTrigger,
  listTriggers,
  unregisterTrigger,
} from '../triggers/manager.ts';
import { installGitHooks, uninstallGitHooks } from '../triggers/git-hooks.ts';
import type { TriggerConfig } from '../triggers/types.ts';

const triggersCommand = new Command()
  .name('triggers')
  .description('Manage event triggers (webhooks, file watchers, git hooks)')
  .action(async () => {
    const triggers = listTriggers();
    if (triggers.length === 0) {
      console.log('No triggers configured.');
      console.log('Use `cortex triggers add` to create a trigger.');
      return;
    }
    console.log(`\n${triggers.length} trigger(s) configured:\n`);
    for (const t of triggers) {
      const status = t.enabled ? 'enabled' : 'disabled';
      console.log(`  ${t.name} (${t.source}) — ${status}`);
      if (t.webhook) console.log(`    Webhook: POST /api/webhooks/${t.name}`);
      if (t.watcher) console.log(`    Watching: ${t.watcher.paths.join(', ')}`);
      if (t.gitHook) console.log(`    Git repo: ${t.gitHook.repoPath} | hooks: ${t.gitHook.hooks.join(', ')}`);
      console.log();
    }
  });

triggersCommand
  .command('add')
  .description('Add a new event trigger')
  .action(async () => {
    const name = await Input.prompt('Trigger name (e.g. github-push):');
    const source = await Select.prompt<string>({
      message: 'Trigger source:',
      options: [
        { name: 'Webhook — HTTP POST from external service', value: 'webhook' },
        { name: 'File watcher — Watch for filesystem changes', value: 'watcher' },
        { name: 'Git hook — Post-commit, post-receive hooks', value: 'git_hook' },
      ],
    });

    const active = await Confirm.prompt('Enable now?');

    const agent = await Input.prompt({
      message: 'Target agent (default = default):',
      default: 'default',
    });

    const prompt = await Input.prompt({
      message: 'Prompt template (use {{ variable }} for event data):',
      default: 'Event received. Process accordingly.',
    });

    const config: TriggerConfig = {
      name,
      enabled: active,
      source: source as TriggerConfig['source'],
      action: {
        type: 'agent_turn',
        agent,
        promptTemplate: prompt,
        timeoutSeconds: 300,
      },
    };

    if (source === 'webhook') {
      const provider = await Select.prompt<string>({
        message: 'Webhook provider:',
        options: [
          { name: 'GitHub', value: 'github' },
          { name: 'GitLab', value: 'gitlab' },
          { name: 'Generic', value: 'generic' },
        ],
      });

      config.webhook = {
        path: `/api/webhooks/${name}`,
        providers: [provider],
        events: ['*'],
        secretEnv: await Input.prompt({
          message: 'Webhook secret env var (leave blank for none):',
          default: '',
        }) || undefined,
      };
    } else if (source === 'watcher') {
      const paths = await Input.prompt({
        message: 'Paths to watch (comma-separated):',
        default: '/etc/nginx/conf.d/',
      });

      const debounce = await Input.prompt({
        message: 'Debounce (ms):',
        default: '5000',
      });

      config.watcher = {
        paths: paths.split(',').map((p) => p.trim()),
        events: ['modify', 'create', 'delete'],
        debounceMs: parseInt(debounce, 10) || 5000,
        recursive: false,
      };
    } else if (source === 'git_hook') {
      const repo = await Input.prompt({
        message: 'Repository path:',
        default: Deno.cwd(),
      });

      config.gitHook = {
        repoPath: repo,
        hooks: ['post-commit', 'post-receive'],
      };
    }

    registerTrigger(config);
    console.log(`\nTrigger "${name}" added and ${active ? 'enabled' : 'disabled'}.`);
  });

triggersCommand
  .command('remove <name:string>')
  .description('Remove a trigger')
  .action((_opts: void, name: string) => {
    const ok = unregisterTrigger(name);
    console.log(ok ? `Trigger "${name}" removed.` : `Trigger "${name}" not found.`);
  });

triggersCommand
  .command('install-hooks <repo:string>')
  .description('Install Cortex git hooks into a repository')
  .action(async (_opts: void, repo: string) => {
    const installed = await installGitHooks(repo);
    console.log(`Installed ${installed.length} hooks in ${repo}/hooks/`);
  });

triggersCommand
  .command('uninstall-hooks <repo:string>')
  .description('Remove Cortex git hooks from a repository')
  .action(async (_opts: void, repo: string) => {
    const removed = await uninstallGitHooks(repo);
    console.log(`Removed ${removed.length} hooks from ${repo}/hooks/`);
  });

export { triggersCommand };

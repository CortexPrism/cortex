import { assertEquals, assert } from '@std/assert';
import { join } from '@std/path';

Deno.test('gitInit initializes a git repo', async () => {
  const { gitInit } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();

  await gitInit(dir);

  const gitDir = join(dir, '.git');
  await Deno.stat(gitDir);
  assert(true, '.git directory was created');

  await Deno.remove(dir, { recursive: true });
});

async function gitConfig(dir: string): Promise<void> {
  const configCmds = [
    ['-C', dir, 'config', 'user.email', 'test@cortex.test'],
    ['-C', dir, 'config', 'user.name', 'Cortex Test'],
  ];
  for (const args of configCmds) {
    await new Deno.Command('git', { args, stdout: 'null', stderr: 'null' }).output();
  }
}

async function makeInitialCommit(dir: string): Promise<void> {
  await gitConfig(dir);
  await Deno.writeTextFile(join(dir, 'initial.txt'), 'test');
  const addCmd = new Deno.Command('git', {
    args: ['-C', dir, 'add', '-A'],
    stdout: 'null',
    stderr: 'null',
  });
  await addCmd.output();
  const commitCmd = new Deno.Command('git', {
    args: ['-C', dir, 'commit', '--no-gpg-sign', '-m', 'initial'],
    stdout: 'null',
    stderr: 'null',
  });
  await commitCmd.output();
}

Deno.test('gitEnsureBranch creates and switches to branch', async () => {
  const { gitInit, gitEnsureBranch } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();

  await gitInit(dir);
  await makeInitialCommit(dir);
  await gitEnsureBranch(dir, 'workspace/test-agent');

  const cmd = new Deno.Command('git', {
    args: ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'],
    stdout: 'piped',
  });
  const result = await cmd.output();
  const branch = new TextDecoder().decode(result.stdout).trim();
  assertEquals(branch, 'workspace/test-agent');

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitAutoCommit creates a commit', async () => {
  const { gitInit, gitEnsureBranch, gitAutoCommit } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();

  await gitInit(dir);
  await makeInitialCommit(dir);
  await gitEnsureBranch(dir, 'workspace/test-agent');
  await Deno.writeTextFile(join(dir, 'test.txt'), 'hello');
  await gitAutoCommit(dir, 'test-agent', 'test.txt', 'file_write');

  const logCmd = new Deno.Command('git', {
    args: ['-C', dir, 'log', '--oneline', '-1'],
    stdout: 'piped',
  });
  const result = await logCmd.output();
  const log = new TextDecoder().decode(result.stdout).trim();
  assert(log.includes('agent/test-agent'), `Expected commit message to include agent id. Got: ${log}`);

  await Deno.remove(dir, { recursive: true });
});

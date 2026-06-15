import { assertEquals, assert, assertExists } from '@std/assert';
import { join } from '@std/path';

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
  await new Deno.Command('git', { args: ['-C', dir, 'add', '-A'], stdout: 'null', stderr: 'null' }).output();
  await new Deno.Command('git', { args: ['-C', dir, 'commit', '--no-gpg-sign', '-m', 'initial'], stdout: 'null', stderr: 'null' }).output();
}

Deno.test('gitStatus shows clean working tree', async () => {
  const { gitInit, gitStatus } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  const status = await gitStatus(dir);
  assertEquals(status.clean, true);

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitStatus shows untracked files', async () => {
  const { gitInit, gitStatus } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  await Deno.writeTextFile(join(dir, 'newfile.txt'), 'hello');
  const status = await gitStatus(dir);
  assertEquals(status.clean, false);
  assert(status.untracked.includes('newfile.txt'));

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitLog returns commit entries', async () => {
  const { gitInit, gitLog } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  const log = await gitLog(dir);
  assert(log.length >= 1);
  assertEquals(log[0].message, 'initial');

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitAdd and gitCommit create a commit', async () => {
  const { gitInit, gitAdd, gitCommit, gitLog } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  await Deno.writeTextFile(join(dir, 'test.txt'), 'content');
  const added = await gitAdd(dir, ['test.txt']);
  assert(added);

  const committed = await gitCommit(dir, 'test commit');
  assert(committed);

  const log = await gitLog(dir, 1);
  assertEquals(log[0].message, 'test commit');

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitListBranches returns current branch', async () => {
  const { gitInit, gitListBranches } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  const branches = await gitListBranches(dir);
  assert(branches.length >= 1);
  assert(branches.some((b) => b.current));

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitCreateBranch and gitCheckout work', async () => {
  const { gitInit, gitCreateBranch, gitCheckout, gitListBranches } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  await gitCreateBranch(dir, 'feature/test');
  const branches = await gitListBranches(dir);
  assert(branches.some((b) => b.name === 'feature/test'));

  const current = branches.find((b) => b.current);
  assertEquals(current?.name, 'feature/test');

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitDiffStat returns diff output for unstaged changes', async () => {
  const { gitInit, gitDiffStat } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  await Deno.writeTextFile(join(dir, 'initial.txt'), 'modified content');
  const diff = await gitDiffStat(dir);
  assert(diff !== '(clean)', 'Expected diff to show changes');

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitAddRemote and gitListRemotes', async () => {
  const { gitInit, gitAddRemote, gitListRemotes } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);
  await makeInitialCommit(dir);

  const added = await gitAddRemote(dir, 'origin', 'https://github.com/user/repo.git');
  assert(added);

  const remotes = await gitListRemotes(dir);
  assert(remotes.some((r) => r.name === 'origin'));

  await Deno.remove(dir, { recursive: true });
});

Deno.test('gitSetConfig works', async () => {
  const { gitInit, gitSetConfig } = await import('../src/workspace/git.ts');
  const dir = await Deno.makeTempDir();
  await gitInit(dir);

  const ok = await gitSetConfig(dir, 'user.email', 'test@test.com');
  assert(ok);

  await Deno.remove(dir, { recursive: true });
});

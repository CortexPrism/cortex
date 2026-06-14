export async function gitInit(dir: string): Promise<void> {
  const cmd = new Deno.Command('git', {
    args: ['-C', dir, 'init'],
    stdout: 'null',
    stderr: 'null',
  });
  const result = await cmd.output();
  if (!result.success) {
    const stderr = new TextDecoder().decode(result.stderr);
    console.warn(`git init warning: ${stderr}`);
  }
}

export async function gitAutoCommit(
  dir: string,
  agentId: string,
  filePath: string,
  toolName: string,
): Promise<void> {
  try {
    const addCmd = new Deno.Command('git', {
      args: ['-C', dir, 'add', filePath],
      stdout: 'null',
      stderr: 'null',
    });
    const addResult = await addCmd.output();
    if (!addResult.success) return;

    const commitCmd = new Deno.Command('git', {
      args: [
        '-C',
        dir,
        'commit',
        '--no-gpg-sign',
        '-m',
        `agent/${agentId}: ${toolName} ${filePath}`,
        '--allow-empty',
      ],
      stdout: 'null',
      stderr: 'null',
    });
    await commitCmd.output();
  } catch {
    // Git unavailable — silently skip auto-commit
  }
}

export async function gitEnsureBranch(
  dir: string,
  branch: string,
): Promise<void> {
  try {
    const checkCmd = new Deno.Command('git', {
      args: ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'],
      stdout: 'piped',
      stderr: 'null',
    });
    const checkResult = await checkCmd.output();
    const current = new TextDecoder().decode(checkResult.stdout).trim();
    if (current === branch) return;

    const branchCmd = new Deno.Command('git', {
      args: ['-C', dir, 'checkout', '-b', branch],
      stdout: 'null',
      stderr: 'null',
    });
    await branchCmd.output();
  } catch {
    // Git unavailable
  }
}

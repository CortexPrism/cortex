import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { getShellCommand, isWindows } from '../../utils/platform.ts';

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT_BYTES = 32 * 1024;

const BLOCKED = [
  /rm\s+-rf\s+\//,
  /mkfs/,
  /dd\s+if=/,
  /:\s*\(\s*\)\s*\{.*\}/,
  />\s*\/dev\/(s?d[a-z]|nvme)/,
  /del\s+\/f\s+\/s\s+\/q\s+\w:\\/i,
  /format\s+\w:/i,
  /rmdir\s+\/s\s+\/q\s+\w:\\/i,
  /Remove-Item\s+-Recurse\s+-Force\s+\w:\\/i,
];

function isSafe(cmd: string): boolean {
  return !BLOCKED.some((re) => re.test(cmd));
}

export const shellTool: Tool = {
  definition: {
    name: 'shell',
    description:
      'Run a shell command and return stdout + stderr. Requires user approval before executing.',
    capabilities: ['shell:run'],
    params: [
      {
        name: 'command',
        type: 'string',
        description: 'The shell command to run',
        required: true,
      },
      {
        name: 'cwd',
        type: 'string',
        description: 'Working directory for the command (defaults to session working dir)',
        required: false,
      },
      {
        name: 'timeout',
        type: 'number',
        description: 'Timeout in milliseconds (default 30000)',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const command = String(args.command ?? '').trim();
    const cwd = String(args.cwd ?? context.workingDir);
    const timeout = typeof args.timeout === 'number' ? args.timeout : TIMEOUT_MS;

    if (!command) {
      return result(false, '', 'No command provided', start);
    }

    if (!isSafe(command)) {
      return result(false, '', `Command blocked by safety filter: ${command}`, start);
    }

    if (context.approvalGate) {
      const approved = await context.approvalGate('shell', command);
      if (!approved) {
        return result(false, '', `User denied execution of: ${command}`, start);
      }
    }

    try {
      const shell = getShellCommand();
      const proc = new Deno.Command(shell.cmd, {
        args: shell.args(command),
        cwd,
        stdout: 'piped',
        stderr: 'piped',
      });

      const child = proc.spawn();
      const timer = setTimeout(() => {
        try {
          if (isWindows()) {
            child.kill();
          } else {
            child.kill('SIGTERM');
            // Give SIGTERM 2 seconds to work, then SIGKILL
            setTimeout(() => {
              try {
                child.kill('SIGKILL');
              } catch {
                // already exited
              }
            }, 2000);
          }
        } catch {
          // already exited
        }
      }, timeout);

      const { code, stdout, stderr } = await child.output();
      clearTimeout(timer);

      const outText = new TextDecoder().decode(stdout.slice(0, MAX_OUTPUT_BYTES));
      const errText = new TextDecoder().decode(stderr.slice(0, MAX_OUTPUT_BYTES));

      const combined = [
        outText && `stdout:\n${outText}`,
        errText && `stderr:\n${errText}`,
        `exit code: ${code}`,
      ]
        .filter(Boolean)
        .join('\n');

      return result(code === 0, combined, code !== 0 ? `exit ${code}` : undefined, start);
    } catch (err) {
      return result(false, '', (err as Error).message, start);
    }
  },
};

function result(
  success: boolean,
  output: string,
  error: string | undefined,
  startMs: number,
): ToolCallResult {
  return {
    toolName: 'shell',
    success,
    output,
    error,
    durationMs: Date.now() - startMs,
  };
}

export default shellTool;

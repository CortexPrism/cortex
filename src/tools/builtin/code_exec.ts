import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { runInSandbox, formatSandboxResult } from '../../sandbox/executor.ts';

export const codeExecTool: Tool = {
  definition: {
    name: 'code_exec',
    description:
      'Execute a code snippet and return the output. Runs in an ephemeral sandbox (Docker if available, subprocess otherwise). Use for calculations, data processing, or verifying logic.',
    capabilities: ['shell:run'],
    params: [
      {
        name: 'code',
        type: 'string',
        description: 'The code to execute',
        required: true,
      },
      {
        name: 'language',
        type: 'string',
        description: 'Language: python, javascript, bash, typescript, ruby, go',
        required: true,
        enum: ['python', 'javascript', 'bash', 'typescript', 'ruby', 'go', 'sh'],
      },
      {
        name: 'stdin',
        type: 'string',
        description: 'Optional stdin input to pass to the program',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const code = String(args.code ?? '').trim();
    const language = String(args.language ?? 'bash').toLowerCase();
    const stdin = args.stdin ? String(args.stdin) : undefined;

    if (!code) {
      return { toolName: 'code_exec', success: false, output: '', error: 'No code provided', durationMs: 0 };
    }

    if (context.approvalGate) {
      const preview = code.length > 120 ? code.slice(0, 120) + '…' : code;
      const approved = await context.approvalGate('code_exec', `[${language}] ${preview}`);
      if (!approved) {
        return {
          toolName: 'code_exec',
          success: false,
          output: '',
          error: 'User denied code execution',
          durationMs: Date.now() - start,
        };
      }
    }

    const result = await runInSandbox({ code, language, stdin, workingDir: context.workingDir });
    const output = formatSandboxResult(result);

    return {
      toolName: 'code_exec',
      success: result.exitCode === 0 && !result.timedOut,
      output,
      error: result.exitCode !== 0 ? `exit ${result.exitCode}` : undefined,
      durationMs: result.durationMs,
    };
  },
};

export default codeExecTool;

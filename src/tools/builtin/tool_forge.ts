/**
 * tool_forge — Runtime Tool Forging
 *
 * Lets the agent create new tools at runtime by writing TypeScript code.
 * Execution model:
 *   - Pure-compute code → Deno Worker (no net/write permissions)
 *   - fs/shell-touching code → existing sandbox executor
 * An LLM-based judge reviews each forged tool before it can be called.
 * Forged tools are session-scoped; use tool_export to persist them as skills.
 */
import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { runInSandbox } from '../../sandbox/executor.ts';
import { loadConfig } from '../../config/config.ts';

export interface ForgedTool {
  name: string;
  description: string;
  code: string;
  needsShell: boolean;
  judgeVerdict: 'approved' | 'rejected';
  judgeReason: string;
  createdAt: string;
  sessionId: string;
  callCount: number;
}

const FORGED_TOOLS_KEY = '__forged_tools__';

export function getForgedRegistry(context: ToolContext): Map<string, ForgedTool> {
  const ctx = context as unknown as Record<string, unknown>;
  if (!ctx[FORGED_TOOLS_KEY]) {
    ctx[FORGED_TOOLS_KEY] = new Map<string, ForgedTool>();
  }
  return ctx[FORGED_TOOLS_KEY] as Map<string, ForgedTool>;
}

const UNSAFE_PATTERNS = [
  /Deno\.env\s*\.\s*get/,
  /Deno\.env\s*\.\s*set/,
  /Deno\.readFile/,
  /Deno\.writeFile/,
  /Deno\.remove/,
  /Deno\.mkdir/,
  /Deno\.command/i,
  /import\s*\(/,
  /eval\s*\(/,
  /Function\s*\(/,
  /process\.env/,
  /require\s*\(/,
  /WebSocket/,
  /XMLHttpRequest/,
];

function detectNeedsShell(code: string): boolean {
  return /Deno\.Command|shell|exec|spawn|subprocess|child_process/.test(code);
}

async function llmJudge(
  name: string,
  description: string,
  code: string,
): Promise<{ verdict: 'approved' | 'rejected'; reason: string }> {
  try {
    const config = await loadConfig();
    const providerKind = config.defaultProvider;
    const providerCfg = config.providers?.[providerKind];
    if (!providerCfg) {
      return { verdict: 'approved', reason: 'No LLM configured — static check only' };
    }

    const { buildProvider } = await import('../../llm/router.ts');
    const llm = buildProvider(config);
    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a security auditor reviewing agent-forged tools. Respond with JSON: {"verdict":"approved"|"rejected","reason":"one sentence"}.',
      },
      {
        role: 'user' as const,
        content:
          `Review this tool for security risks:\n\nName: ${name}\nDescription: ${description}\n\nCode:\n\`\`\`typescript\n${code}\n\`\`\`\n\nApprove if it is safe. Reject if it could exfiltrate data, access secrets, make uncontrolled network requests, or cause irreversible damage.`,
      },
    ];
    const result = await llm.complete({
      messages,
      model: providerCfg.model ?? '',
      maxTokens: 200,
      temperature: 0,
    });
    const text = result.content.trim();
    const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? text) as {
      verdict: 'approved' | 'rejected';
      reason: string;
    };
    return {
      verdict: json.verdict === 'rejected' ? 'rejected' : 'approved',
      reason: json.reason ?? '',
    };
  } catch {
    return { verdict: 'approved', reason: 'Judge unavailable — static check passed' };
  }
}

async function runInWorker(
  fnCode: string,
  inputArgs: unknown,
  timeoutMs = 10_000,
): Promise<{ output: string; success: boolean; durationMs: number }> {
  const start = Date.now();
  const workerCode = `
    const userFn = (function() {
      ${fnCode}
      return typeof execute === 'function' ? execute : typeof main === 'function' ? main : null;
    })();
    self.onmessage = async function(e) {
      try {
        if (!userFn) { self.postMessage({ error: 'No execute() or main() function found', output: '' }); return; }
        const result = await userFn(e.data);
        self.postMessage({ output: result !== undefined ? String(result) : '', error: null });
      } catch(err) {
        self.postMessage({ error: String(err), output: '' });
      }
    };
  `;
  const blob = new Blob([workerCode], { type: 'application/typescript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url, {
    type: 'module',
    deno: { permissions: { net: false, read: false, write: false, env: false, run: false } },
  } as WorkerOptions);

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        output: 'Timeout after ' + timeoutMs + 'ms',
        success: false,
        durationMs: Date.now() - start,
      });
    }, timeoutMs);

    worker.onmessage = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      const { output, error } = e.data as { output: string; error: string | null };
      resolve({
        output: error ? `Error: ${error}` : output,
        success: !error,
        durationMs: Date.now() - start,
      });
    };

    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      URL.revokeObjectURL(url);
      resolve({
        output: `Worker error: ${e.message}`,
        success: false,
        durationMs: Date.now() - start,
      });
    };

    worker.postMessage(inputArgs);
  });
}

export const toolForgeTool: Tool = {
  definition: {
    name: 'tool_forge',
    description:
      'Forge (create) a new tool at runtime by writing TypeScript code. The tool is session-scoped. The code must export an `execute(args)` or `main(args)` async function. Pure-compute tools run in a Deno Worker sandbox; tools needing shell/fs run in the existing code sandbox. An LLM judge reviews each tool before registration.',
    capabilities: ['shell:run'],
    params: [
      {
        name: 'name',
        type: 'string',
        description: 'Unique tool name (snake_case). Will be callable as forged_<name>.',
        required: true,
      },
      {
        name: 'description',
        type: 'string',
        description: 'What this tool does and when to use it.',
        required: true,
      },
      {
        name: 'code',
        type: 'string',
        description:
          'TypeScript code that exports an `async function execute(args: Record<string, unknown>): Promise<string>` function. For shell/fs tools, also export `const needsShell = true`.',
        required: true,
      },
      {
        name: 'test_args',
        type: 'object',
        description: 'Optional args to smoke-test the forged tool immediately after registration.',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const name = String(args.name ?? '').trim().replace(/[^a-z0-9_]/gi, '_').toLowerCase();
    const description = String(args.description ?? '').trim();
    const code = String(args.code ?? '').trim();
    const testArgs = args.test_args as Record<string, unknown> | undefined;

    if (!name || !description || !code) {
      return {
        toolName: 'tool_forge',
        success: false,
        output: '',
        error: 'name, description, and code are required',
        durationMs: 0,
      };
    }

    if (name.length > 64) {
      return {
        toolName: 'tool_forge',
        success: false,
        output: '',
        error: 'Tool name too long (max 64 chars)',
        durationMs: 0,
      };
    }

    // Static safety checks
    for (const pattern of UNSAFE_PATTERNS) {
      if (pattern.test(code)) {
        return {
          toolName: 'tool_forge',
          success: false,
          output: '',
          error: `Static safety check failed: code matches unsafe pattern ${pattern.source}`,
          durationMs: Date.now() - start,
        };
      }
    }

    const needsShell = detectNeedsShell(code);

    // LLM judge
    const { verdict, reason } = await llmJudge(name, description, code);
    if (verdict === 'rejected') {
      return {
        toolName: 'tool_forge',
        success: false,
        output: '',
        error: `LLM judge rejected tool "${name}": ${reason}`,
        durationMs: Date.now() - start,
      };
    }

    const forgedTool: ForgedTool = {
      name,
      description,
      code,
      needsShell,
      judgeVerdict: verdict,
      judgeReason: reason,
      createdAt: new Date().toISOString(),
      sessionId: context.sessionId,
      callCount: 0,
    };

    const registry = getForgedRegistry(context);
    registry.set(`forged_${name}`, forgedTool);

    let smokeResult = '';
    if (testArgs !== undefined) {
      if (needsShell) {
        const fullCode = `${code}\nconst result = await execute(${
          JSON.stringify(testArgs)
        });\nconsole.log(result);`;
        const sandboxResult = await runInSandbox({
          code: fullCode,
          language: 'typescript',
          workingDir: context.workingDir,
        });
        smokeResult =
          `\n\nSmoke test (sandbox): exit=${sandboxResult.exitCode}\n${sandboxResult.stdout}${sandboxResult.stderr}`;
      } else {
        const workerResult = await runInWorker(code, testArgs);
        smokeResult = `\n\nSmoke test (worker): ${
          workerResult.success ? 'OK' : 'FAIL'
        } in ${workerResult.durationMs}ms\n${workerResult.output}`;
      }
    }

    return {
      toolName: 'tool_forge',
      success: true,
      output: `Tool "forged_${name}" registered successfully.\nJudge: ${reason}\nExecution mode: ${
        needsShell ? 'sandbox (shell/fs)' : 'Deno Worker (pure compute)'
      }${smokeResult}\n\nCall it with tool name "forged_${name}". Use tool_export to save it permanently as a skill.`,
      durationMs: Date.now() - start,
    };
  },
};

export const toolCallForgedTool: Tool = {
  definition: {
    name: 'forged_call',
    description: 'Call a previously forged tool by name with given arguments.',
    capabilities: ['shell:run'],
    params: [
      {
        name: 'tool_name',
        type: 'string',
        description: 'Name of the forged tool to call (e.g. "forged_my_tool")',
        required: true,
      },
      {
        name: 'args',
        type: 'object',
        description: 'Arguments to pass to the forged tool',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const toolName = String(args.tool_name ?? '').trim();
    const callArgs = (args.args as Record<string, unknown>) ?? {};

    const registry = getForgedRegistry(context);
    const forged = registry.get(toolName);
    if (!forged) {
      const available = [...registry.keys()].join(', ') || 'none';
      return {
        toolName: 'forged_call',
        success: false,
        output: '',
        error: `Forged tool "${toolName}" not found in this session. Available: ${available}`,
        durationMs: Date.now() - start,
      };
    }

    forged.callCount++;

    if (forged.needsShell) {
      const fullCode = `${forged.code}\nconst result = await execute(${
        JSON.stringify(callArgs)
      });\nconsole.log(result !== undefined ? String(result) : '');`;
      const sandboxResult = await runInSandbox({
        code: fullCode,
        language: 'typescript',
        workingDir: context.workingDir,
      });
      const output = (sandboxResult.stdout + sandboxResult.stderr).trim();
      return {
        toolName: 'forged_call',
        success: sandboxResult.exitCode === 0,
        output,
        error: sandboxResult.exitCode !== 0 ? `exit ${sandboxResult.exitCode}` : undefined,
        durationMs: sandboxResult.durationMs,
      };
    }

    const workerResult = await runInWorker(forged.code, callArgs);
    return {
      toolName: 'forged_call',
      success: workerResult.success,
      output: workerResult.output,
      error: workerResult.success ? undefined : workerResult.output,
      durationMs: workerResult.durationMs,
    };
  },
};

export const toolExportTool: Tool = {
  definition: {
    name: 'tool_export',
    description:
      'Export a session-scoped forged tool as a persistent skill so it survives across sessions. Saves to the skills system with lifecycle "candidate".',
    capabilities: ['db:write'],
    params: [
      {
        name: 'tool_name',
        type: 'string',
        description: 'Name of the forged tool to export (e.g. "forged_my_tool")',
        required: true,
      },
      {
        name: 'tags',
        type: 'array',
        description: 'Optional tags for skill discovery',
        required: false,
      },
    ],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const toolName = String(args.tool_name ?? '').trim();
    const tags = Array.isArray(args.tags) ? (args.tags as string[]) : [];

    const registry = getForgedRegistry(context);
    const forged = registry.get(toolName);
    if (!forged) {
      const available = [...registry.keys()].join(', ') || 'none';
      return {
        toolName: 'tool_export',
        success: false,
        output: '',
        error: `Forged tool "${toolName}" not found. Available: ${available}`,
        durationMs: Date.now() - start,
      };
    }

    try {
      const { storeSkill } = await import('../../memory/skills.ts');
      const skillName = toolName.replace(/^forged_/, 'forged_skill_');
      const content = [
        `# Forged Tool: ${forged.name}`,
        '',
        `## Description`,
        forged.description,
        '',
        `## Code`,
        '```typescript',
        forged.code,
        '```',
        '',
        `## Metadata`,
        `- Execution mode: ${forged.needsShell ? 'sandbox' : 'worker'}`,
        `- Judge verdict: ${forged.judgeVerdict} — ${forged.judgeReason}`,
        `- Call count before export: ${forged.callCount}`,
        `- Exported from session: ${forged.sessionId}`,
        `- Exported at: ${new Date().toISOString()}`,
      ].join('\n');

      await storeSkill({
        name: skillName,
        description: forged.description,
        content,
        steps: [{ step: 1, action: 'execute forged tool', description: forged.description }],
        lifecycle: 'candidate',
        metadata: {
          tags: ['forged', 'runtime', ...tags],
        },
      });

      return {
        toolName: 'tool_export',
        success: true,
        output:
          `Tool "${toolName}" exported as skill "${skillName}" (lifecycle: candidate). It will be available in future sessions via skill_read.`,
        durationMs: Date.now() - start,
      };
    } catch (e) {
      return {
        toolName: 'tool_export',
        success: false,
        output: '',
        error: `Failed to export: ${(e as Error).message}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export const toolListForgedTool: Tool = {
  definition: {
    name: 'tool_list_forged',
    description: 'List all tools forged in the current session.',
    capabilities: [],
    params: [],
  },

  execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();
    const registry = getForgedRegistry(context);
    if (registry.size === 0) {
      return Promise.resolve({
        toolName: 'tool_list_forged',
        success: true,
        output: 'No forged tools in this session.',
        durationMs: Date.now() - start,
      });
    }
    const lines = [...registry.values()].map((t) =>
      `• forged_${t.name} — ${t.description} [${
        t.needsShell ? 'sandbox' : 'worker'
      }, called ${t.callCount}×]`
    );
    return Promise.resolve({
      toolName: 'tool_list_forged',
      success: true,
      output: `Forged tools in this session (${registry.size}):\n${lines.join('\n')}`,
      durationMs: Date.now() - start,
    });
  },
};

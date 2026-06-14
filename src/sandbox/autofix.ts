import type { LLMProvider } from '../llm/types.ts';
import {
  formatSandboxResult,
  runInSandbox,
  type SandboxOptions,
  type SandboxResult,
} from './executor.ts';

const MAX_FIX_ROUNDS = 4;

export interface AutofixOptions {
  code: string;
  language: string;
  provider: LLMProvider;
  model: string;
  systemPrompt?: string;
  maxRounds?: number;
  onProgress?: (round: number, result: SandboxResult, fixed?: string) => void;
}

export interface AutofixResult {
  finalCode: string;
  finalResult: SandboxResult;
  rounds: number;
  success: boolean;
}

const FIX_SYSTEM =
  `You are an expert code debugger. Given code and its error output, return ONLY the corrected code with no explanation, no markdown fences, no commentary. Just the raw fixed code.`;

export async function autofix(opts: AutofixOptions): Promise<AutofixResult> {
  const maxRounds = opts.maxRounds ?? MAX_FIX_ROUNDS;
  let code = opts.code;
  let lastResult: SandboxResult | null = null;

  for (let round = 0; round < maxRounds; round++) {
    const sandboxOpts: SandboxOptions = { code, language: opts.language };
    const result = await runInSandbox(sandboxOpts);
    lastResult = result;

    opts.onProgress?.(round + 1, result, round > 0 ? code : undefined);

    if (result.exitCode === 0 && !result.timedOut) {
      return { finalCode: code, finalResult: result, rounds: round + 1, success: true };
    }

    if (round === maxRounds - 1) break;

    const errorContext = [
      result.stderr.trim() && `STDERR:\n${result.stderr.trim()}`,
      result.timedOut && `TIMEOUT: execution exceeded time limit`,
      `EXIT CODE: ${result.exitCode}`,
    ].filter(Boolean).join('\n');

    const fixRequest =
      `Language: ${opts.language}\n\nCode:\n${code}\n\nError:\n${errorContext}\n\nReturn only the fixed code:`;

    try {
      const llmResult = await opts.provider.complete({
        messages: [{ role: 'user', content: fixRequest }],
        model: opts.model,
        systemPrompt: opts.systemPrompt ?? FIX_SYSTEM,
      });
      code = llmResult.content.trim();
      const fence = code.match(/^```[a-z]*\n?([\s\S]*?)```$/);
      if (fence) code = fence[1].trim();
    } catch {
      break;
    }
  }

  return {
    finalCode: code,
    finalResult: lastResult!,
    rounds: maxRounds,
    success: false,
  };
}

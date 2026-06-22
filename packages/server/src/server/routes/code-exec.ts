import { type RouteHandler, json, err } from './_helpers.ts';

export const routes: RouteHandler[] = [
  {
    method: 'POST',
    pattern: /^\/api\/code\/exec$/,
    handler: async (req) => {
      const body = await req.json() as { code: string; language: string };
      if (!body.code) return err('Missing code', 400);
      const { runInSandbox, formatSandboxResult } = await import('../../../../../src/sandbox/executor.ts');
      const result = await runInSandbox({ code: body.code, language: body.language || 'python' });
      const output = formatSandboxResult(result);
      return json({
        success: result.exitCode === 0 && !result.timedOut,
        output,
        error: result.exitCode !== 0 ? `exit ${result.exitCode}` : undefined,
        durationMs: result.durationMs,
        runtime: result.runtime,
      });
    },
  },
];

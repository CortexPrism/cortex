import { deriveDenoWorkerPermissions } from './permissions.ts';
import type { PluginCapability, PluginContext, PluginRow, Tool } from './types.ts';
import type { ToolCallResult } from '../tools/types.ts';

interface SandboxRpcRequest {
  id: number;
  method: string;
  params: unknown;
}

interface SandboxRpcResponse {
  id: number;
  result?: unknown;
  error?: { message: string };
}

interface SandboxPlugin {
  worker: Worker;
  tools: Tool[];
  ctx: PluginContext;
}

const _sandboxes = new Map<string, SandboxPlugin>();

export function isSandboxed(pluginName: string): boolean {
  return _sandboxes.has(pluginName);
}

export function getSandboxedTools(pluginName: string): Tool[] {
  return _sandboxes.get(pluginName)?.tools ?? [];
}

export function terminateSandbox(pluginName: string): void {
  const sandbox = _sandboxes.get(pluginName);
  if (sandbox) {
    sandbox.worker.terminate();
    _sandboxes.delete(pluginName);
  }
}

export async function loadSandboxedEsmPlugin(
  row: PluginRow,
  ctx: PluginContext,
  effectivePermissions: PluginCapability[],
): Promise<{ tools: Tool[] }> {
  const workerOptions: WorkerOptions & { deno?: { permissions?: Deno.PermissionOptions } } = {
    type: 'module',
    name: `plugin:${row.name}`,
    deno: {
      permissions: deriveDenoWorkerPermissions(effectivePermissions),
    },
  };

  const worker = new Worker(
    new URL(row.entry, import.meta.url),
    workerOptions,
  );

  return new Promise((resolve, reject) => {
    const rpcRequests = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
    let rpcId = 0;

    worker.onmessage = (ev: MessageEvent<SandboxRpcResponse>) => {
      const { id, result, error } = ev.data;
      const pending = rpcRequests.get(id);
      if (!pending) return;

      rpcRequests.delete(id);
      if (error) {
        pending.reject(new Error(error.message));
      } else {
        pending.resolve(result);
      }
    };

    worker.onerror = (ev: ErrorEvent) => {
      reject(new Error(`Worker error: ${ev.message}`));
    };

    function sendRpc(method: string, params: unknown): Promise<unknown> {
      const id = ++rpcId;
      return new Promise((res, rej) => {
        rpcRequests.set(id, { resolve: res, reject: rej });
        worker.postMessage({ id, method, params } satisfies SandboxRpcRequest);
      });
    }

    // Wait for the worker to signal readiness and register tools
    worker.onmessage = async (ev: MessageEvent<{ type: string; tools?: Tool[] }>) => {
      if (ev.data.type === 'ready') {
        try {
          const rawTools = await sendRpc('getTools', {}) as Tool[];
          const tools: Tool[] = rawTools.map((tpl) => ({
            definition: tpl.definition,
            execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
              return await sendRpc('executeTool', {
                toolName: tpl.definition.name,
                args,
              }) as ToolCallResult;
            },
          }));

          const sandbox: SandboxPlugin = { worker, tools, ctx };
          _sandboxes.set(row.name, sandbox);
          resolve({ tools });
        } catch (e) {
          worker.terminate();
          reject(e);
        }
      }
    };

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!_sandboxes.has(row.name)) {
        worker.terminate();
        reject(new Error(`Plugin "${row.name}" sandbox did not initialize within 30s`));
      }
    }, 30_000);
  });
}

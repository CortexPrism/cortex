import type { LoadedPlugin, PluginContext, PluginRow } from './types.ts';
import type { Tool, ToolCallResult } from '../tools/types.ts';
import type { PluginCapability } from './types.ts';

const CURRENT_ABI_VERSION = 1;
const SUPPORTED_ABI_VERSIONS = [1];

const MEMORY_PAGE_SIZE = 65536;
const DEFAULT_INITIAL_PAGES = 256;
const DEFAULT_MAX_PAGES = 512;
const SCRATCH_SIZE = 65536;
const SCRATCH_OFFSET = 0;
const ALLOCATOR_META_SIZE = 8;
const HEAP_OFFSET = SCRATCH_OFFSET + SCRATCH_SIZE;

const _wasmStateCache = new Map<string, Map<string, string>>();
const _wasmStateDirty = new Map<string, Set<string>>();

function getPluginStateCache(pluginName: string): Map<string, string> {
  let cache = _wasmStateCache.get(pluginName);
  if (!cache) {
    cache = new Map();
    _wasmStateCache.set(pluginName, cache);
  }
  return cache;
}

function markStateDirty(pluginName: string, key: string): void {
  let dirty = _wasmStateDirty.get(pluginName);
  if (!dirty) {
    dirty = new Set();
    _wasmStateDirty.set(pluginName, dirty);
  }
  dirty.add(key);
}

async function flushStateToDb(pluginName: string, ctx: PluginContext | null): Promise<void> {
  if (!ctx) return;
  const dirty = _wasmStateDirty.get(pluginName);
  if (!dirty || dirty.size === 0) return;
  const cache = _wasmStateCache.get(pluginName);
  if (!cache) return;
  for (const key of dirty) {
    const value = cache.get(key);
    if (value !== undefined) {
      await ctx.state.set(key, value).catch(() => {});
    }
  }
  dirty.clear();
}

export function flushAllWasmState(): Promise<void[]> {
  const promises: Promise<void>[] = [];
  for (const [name] of _wasmStateDirty) {
    const ctx = null;
    promises.push(flushStateToDb(name, ctx));
  }
  return Promise.all(promises);
}

interface WasmExports {
  plugin_init?: () => void;
  plugin_destroy?: () => void;
  plugin_get_abi_version?: () => number;
  plugin_get_capabilities?: (outJsonPtr: number, outLenPtr: number) => number;
  plugin_execute_tool?: (
    toolNamePtr: number,
    toolNameLen: number,
    argsJsonPtr: number,
    argsJsonLen: number,
    outResultPtr: number,
    outLenPtr: number,
  ) => number;
  memory?: WebAssembly.Memory;
  __heap_base?: number;
}

interface WasmHostFunctions {
  host_alloc: (size: number) => number;
  host_free: (ptr: number) => void;
  host_log: (ptr: number, len: number) => void;
  host_get_config: (
    keyPtr: number,
    keyLen: number,
    outValuePtr: number,
    outValueLenPtr: number,
  ) => number;
  host_set_state: (keyPtr: number, keyLen: number, valuePtr: number, valueLen: number) => void;
  host_get_state: (
    keyPtr: number,
    keyLen: number,
    outValuePtr: number,
    outValueLenPtr: number,
  ) => number;
  host_http_request: (
    methodPtr: number,
    methodLen: number,
    urlPtr: number,
    urlLen: number,
    bodyPtr: number,
    bodyLen: number,
    headersPtr: number,
    headersLen: number,
    outStatusPtr: number,
    outBodyPtr: number,
    outBodyLenPtr: number,
  ) => number;
  host_get_abi_version: () => number;
  host_get_time_ms: () => number;
  host_random: (outPtr: number, len: number) => void;
}

interface WasmToolDeclaration {
  name: string;
  description: string;
  params?: Array<{
    name: string;
    type: string;
    description: string;
    required?: boolean;
  }>;
}

interface WasmCapabilities {
  abi_version: number;
  tools?: WasmToolDeclaration[];
}

interface WasmInstance {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  exports: WasmExports;
  heapPtr: number;
  name: string;
  capabilities: PluginCapability[];
}

const _instances = new Map<string, WasmInstance>();

function decodeWasmString(memory: WebAssembly.Memory, ptr: number, len: number): string {
  try {
    const clamped = Math.min(len, SCRATCH_SIZE);
    const arr = new Uint8Array(memory.buffer, ptr, clamped);
    const nullIdx = arr.indexOf(0);
    return new TextDecoder().decode(nullIdx >= 0 ? arr.subarray(0, nullIdx) : arr);
  } catch {
    return '';
  }
}

function encodeWasmString(
  memory: WebAssembly.Memory,
  str: string,
  outPtr: number,
  outLenPtr: number,
): void {
  const encoded = new TextEncoder().encode(str);
  const maxLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0] || SCRATCH_SIZE;
  const copyLen = Math.min(encoded.length, maxLen);
  const dest = new Uint8Array(memory.buffer, outPtr, copyLen);
  dest.set(encoded.subarray(0, copyLen));
  new Uint32Array(memory.buffer, outLenPtr, 1)[0] = copyLen;
}

function buildHostFunctions(
  w: WasmInstance,
  ctx: PluginContext | null,
  permissions: PluginCapability[],
): WasmHostFunctions {
  const mem = w.memory;
  const pluginName = w.name;

  let heapPtr = HEAP_OFFSET;
  const heapEnd = mem.buffer.byteLength > 0
    ? mem.buffer.byteLength
    : DEFAULT_INITIAL_PAGES * MEMORY_PAGE_SIZE;

  function growIfNeeded(bytes: number): void {
    const needed = heapPtr + bytes;
    if (needed > heapEnd) {
      const additional = Math.ceil((needed - heapEnd) / MEMORY_PAGE_SIZE) + 16;
      try {
        mem.grow(additional);
      } catch {
        throw new Error(`WASM memory grow failed for ${pluginName}`);
      }
    }
  }

  return {
    host_alloc(size: number): number {
      if (size <= 0) return 0;
      const aligned = (size + 7) & ~7;
      growIfNeeded(aligned);
      const ptr = heapPtr;
      heapPtr += aligned;
      return ptr;
    },

    host_free(_ptr: number): void {
    },

    host_log(ptr: number, len: number): void {
      const msg = decodeWasmString(mem, ptr, len);
      if (ctx) {
        ctx.logger.info(msg);
      } else {
        console.log(`[wasm:${pluginName}] ${msg}`);
      }
    },

    host_get_config(
      keyPtr: number,
      keyLen: number,
      outValuePtr: number,
      outValueLenPtr: number,
    ): number {
      try {
        const key = decodeWasmString(mem, keyPtr, keyLen);
        let value = '';
        if (ctx) {
          const envVal = Deno.env.get(
            `CORTEX_PLUGIN_${pluginName.toUpperCase()}_${key.toUpperCase()}`,
          );
          if (envVal) {
            value = envVal;
          }
        } else {
          value = Deno.env.get(`CORTEX_WASM_${key.toUpperCase()}`) ?? '';
        }
        encodeWasmString(mem, value, outValuePtr, outValueLenPtr);
        return value.length > 0 ? 0 : -1;
      } catch {
        return -1;
      }
    },

    host_set_state(keyPtr: number, keyLen: number, valuePtr: number, valueLen: number): void {
      const key = decodeWasmString(mem, keyPtr, keyLen);
      const value = decodeWasmString(mem, valuePtr, valueLen);
      const cache = getPluginStateCache(pluginName);
      cache.set(key, value);
      markStateDirty(pluginName, key);
    },

    host_get_state(
      keyPtr: number,
      keyLen: number,
      outValuePtr: number,
      outValueLenPtr: number,
    ): number {
      try {
        const key = decodeWasmString(mem, keyPtr, keyLen);
        const cache = getPluginStateCache(pluginName);
        const value = cache.get(key);
        if (value !== undefined) {
          encodeWasmString(mem, value, outValuePtr, outValueLenPtr);
          return 0;
        }
        encodeWasmString(mem, '', outValuePtr, outValueLenPtr);
        return -1;
      } catch {
        return -1;
      }
    },

    host_http_request(
      methodPtr: number,
      methodLen: number,
      urlPtr: number,
      urlLen: number,
      bodyPtr: number,
      bodyLen: number,
      headersPtr: number,
      headersLen: number,
      outStatusPtr: number,
      outBodyPtr: number,
      outBodyLenPtr: number,
    ): number {
      try {
        if (!permissions.includes('network:fetch') && !permissions.includes('net:outbound')) {
          new Uint32Array(mem.buffer, outStatusPtr, 1)[0] = 403;
          encodeWasmString(mem, 'host: network:fetch permission denied', outBodyPtr, outBodyLenPtr);
          return -1;
        }

        const method = decodeWasmString(mem, methodPtr, methodLen) || 'GET';
        const urlStr = decodeWasmString(mem, urlPtr, urlLen);
        const body = bodyLen > 0 ? decodeWasmString(mem, bodyPtr, bodyLen) : undefined;
        const headersStr = headersLen > 0
          ? decodeWasmString(mem, headersPtr, headersLen)
          : undefined;

        if (!urlStr) {
          new Uint32Array(mem.buffer, outStatusPtr, 1)[0] = 400;
          encodeWasmString(mem, 'host: empty URL', outBodyPtr, outBodyLenPtr);
          return -1;
        }

        const responseSAB = new SharedArrayBuffer(65536 + 16);
        const statusInt32 = new Int32Array(responseSAB, 0, 1);
        const statusUint32 = new Uint32Array(responseSAB, 0, 1);
        const bodyLenUint32 = new Uint32Array(responseSAB, 4, 1);
        const bodyUint8 = new Uint8Array(responseSAB, 8, 65528);
        statusInt32[0] = 0;

        const worker = new Worker(
          new URL('./wasm-worker-http.ts', import.meta.url).href,
          { type: 'module' },
        );

        worker.postMessage({
          method,
          urlStr,
          body,
          headersStr,
          responseSAB,
        });

        const timeout = setTimeout(() => {
          if (statusInt32[0] === 0) {
            statusInt32[0] = -1;
            Atomics.notify(statusInt32, 0);
          }
        }, 30000);

        const start = Date.now();
        while (statusInt32[0] === 0 && (Date.now() - start) < 31000) {
          Atomics.wait(statusInt32, 0, 0);
        }

        clearTimeout(timeout);
        worker.terminate();

        if (statusInt32[0] <= 0) {
          new Uint32Array(mem.buffer, outStatusPtr, 1)[0] = statusInt32[0] === 0 ? 408 : 500;
          encodeWasmString(mem, 'host: request timeout or failed', outBodyPtr, outBodyLenPtr);
          return -1;
        }

        const respStatus = statusUint32[0];
        const respBodyLen = bodyLenUint32[0];
        const respBody = new TextDecoder().decode(bodyUint8.subarray(0, respBodyLen));

        new Uint32Array(mem.buffer, outStatusPtr, 1)[0] = respStatus;
        encodeWasmString(mem, respBody, outBodyPtr, outBodyLenPtr);
        return 0;
      } catch {
        new Uint32Array(mem.buffer, outStatusPtr, 1)[0] = 500;
        encodeWasmString(mem, 'host: unexpected error in http_request', outBodyPtr, outBodyLenPtr);
        return -1;
      }
    },

    host_get_abi_version(): number {
      return CURRENT_ABI_VERSION;
    },

    host_get_time_ms(): number {
      return Date.now();
    },

    host_random(outPtr: number, len: number): void {
      const clamped = Math.min(len, SCRATCH_SIZE);
      const dest = new Uint8Array(mem.buffer, outPtr, clamped);
      crypto.getRandomValues(dest);
    },
  };
}

export async function loadWasmPlugin(
  row: PluginRow,
  ctx?: PluginContext,
): Promise<LoadedPlugin> {
  let wasmBytes: ArrayBuffer;

  if (row.entry.startsWith('http')) {
    const res = await fetch(row.entry);
    if (!res.ok) throw new Error(`Failed to fetch WASM binary: ${res.status}`);
    wasmBytes = await res.arrayBuffer();
  } else {
    wasmBytes = (await Deno.readFile(row.entry)).buffer as ArrayBuffer;
  }

  let declaredPermissions: PluginCapability[] = [];
  try {
    declaredPermissions = JSON.parse(row.declared_permissions || '[]') as PluginCapability[];
  } catch {
    declaredPermissions = [];
  }

  const memory = new WebAssembly.Memory({
    initial: DEFAULT_INITIAL_PAGES,
    maximum: DEFAULT_MAX_PAGES,
  });

  const w: WasmInstance = {
    instance: null as unknown as WebAssembly.Instance,
    memory,
    exports: null as unknown as WasmExports,
    heapPtr: HEAP_OFFSET,
    name: row.name,
    capabilities: declaredPermissions,
  };

  const hostFunctions = buildHostFunctions(w, ctx ?? null, declaredPermissions);

  try {
    const result = await WebAssembly.instantiate(wasmBytes, {
      env: {
        memory,
        host_alloc: hostFunctions.host_alloc,
        host_free: hostFunctions.host_free,
        host_log: hostFunctions.host_log,
        host_get_config: hostFunctions.host_get_config,
        host_set_state: hostFunctions.host_set_state,
        host_get_state: hostFunctions.host_get_state,
        host_http_request: hostFunctions.host_http_request,
        host_get_abi_version: hostFunctions.host_get_abi_version,
        host_get_time_ms: hostFunctions.host_get_time_ms,
        host_random: hostFunctions.host_random,
      },
    });

    w.instance = result.instance;
    w.exports = result.instance.exports as unknown as WasmExports;
  } catch (e) {
    throw new Error(`Failed to instantiate WASM plugin "${row.name}": ${(e as Error).message}`);
  }

  if (w.exports.plugin_get_abi_version) {
    const abiVersion = w.exports.plugin_get_abi_version();
    if (!SUPPORTED_ABI_VERSIONS.includes(abiVersion)) {
      throw new Error(
        `WASM plugin "${row.name}" ABI version ${abiVersion} is not supported ` +
          `(supported: ${SUPPORTED_ABI_VERSIONS.join(', ')})`,
      );
    }
    ctx?.logger.info(`ABI version ${abiVersion}`);
  }

  if (w.exports.memory) w.memory = w.exports.memory;

  if (w.exports.plugin_init) {
    try {
      w.exports.plugin_init();
    } catch (e) {
      throw new Error(`WASM plugin "${row.name}" init failed: ${(e as Error).message}`);
    }
  }

  const tools: Tool[] = [];

  if (w.exports.plugin_get_capabilities && w.memory) {
    const mem = w.memory;
    const outPtr = SCRATCH_OFFSET;
    const outLenPtr = SCRATCH_OFFSET + 4;
    new Uint32Array(mem.buffer, outLenPtr, 1)[0] = SCRATCH_SIZE - 8;
    const result = w.exports.plugin_get_capabilities(outPtr, outLenPtr);
    if (result === 0) {
      const len = new Uint32Array(mem.buffer, outLenPtr, 1)[0];
      const json = new TextDecoder().decode(
        new Uint8Array(mem.buffer, outPtr, Math.min(len, SCRATCH_SIZE - 8)),
      );
      try {
        const caps = JSON.parse(json) as WasmCapabilities;
        if (caps.tools) {
          for (const t of caps.tools) {
            const toolParams = (t.params ?? []).map((p) => ({
              name: p.name,
              type: p.type as 'string' | 'number' | 'boolean' | 'object' | 'array',
              description: p.description,
              required: p.required,
            }));

            tools.push({
              definition: {
                name: t.name,
                description: t.description,
                params: toolParams,
                capabilities: ['network:fetch', 'fs:read', 'fs:write'],
              },
              execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
                const t0 = Date.now();
                try {
                  if (!w.exports.plugin_execute_tool || !w.exports.memory) {
                    return {
                      toolName: t.name,
                      success: false,
                      output: '',
                      error: 'WASM plugin has no execute_tool export',
                      durationMs: Date.now() - t0,
                    };
                  }
                  const mem = w.exports.memory;
                  const toolNameEncoded = new TextEncoder().encode(t.name);
                  const argsJson = JSON.stringify(args);
                  const argsEncoded = new TextEncoder().encode(argsJson);

                  const basePtr = HEAP_OFFSET + ALLOCATOR_META_SIZE;
                  const toolNamePtr = basePtr;
                  const toolNameLenPtr = toolNamePtr + toolNameEncoded.length + 1;
                  const argsPtr = toolNameLenPtr + 4;
                  const argsLenPtr = argsPtr + argsEncoded.length + 1;
                  const outPtr = argsLenPtr + 4;
                  const outLenPtr = outPtr + SCRATCH_SIZE;
                  const totalNeeded = (outLenPtr + 4) - basePtr;

                  if (basePtr + totalNeeded > mem.buffer.byteLength) {
                    const additional = Math.ceil(
                      (basePtr + totalNeeded - mem.buffer.byteLength) / MEMORY_PAGE_SIZE,
                    ) + 16;
                    try {
                      mem.grow(additional);
                    } catch {
                      return {
                        toolName: t.name,
                        success: false,
                        output: '',
                        error: 'WASM memory exhausted',
                        durationMs: Date.now() - t0,
                      };
                    }
                  }

                  const destToolName = new Uint8Array(
                    mem.buffer,
                    toolNamePtr,
                    toolNameEncoded.length + 1,
                  );
                  destToolName.set(toolNameEncoded);
                  destToolName[toolNameEncoded.length] = 0;
                  new Uint32Array(mem.buffer, toolNameLenPtr, 1)[0] = toolNameEncoded.length;

                  const destArgs = new Uint8Array(
                    mem.buffer,
                    argsPtr,
                    argsEncoded.length + 1,
                  );
                  destArgs.set(argsEncoded);
                  destArgs[argsEncoded.length] = 0;
                  new Uint32Array(mem.buffer, argsLenPtr, 1)[0] = argsEncoded.length;

                  new Uint32Array(mem.buffer, outLenPtr, 1)[0] = SCRATCH_SIZE;

                  let execResult: number;
                  try {
                    execResult = w.exports.plugin_execute_tool(
                      toolNamePtr,
                      toolNameEncoded.length,
                      argsPtr,
                      argsEncoded.length,
                      outPtr,
                      outLenPtr,
                    );
                  } catch (execErr) {
                    return {
                      toolName: t.name,
                      success: false,
                      output: '',
                      error: `WASM trap: ${(execErr as Error).message}`,
                      durationMs: Date.now() - t0,
                    };
                  }

                  const outLen = new Uint32Array(mem.buffer, outLenPtr, 1)[0];
                  const clampedOutLen = Math.min(outLen, SCRATCH_SIZE);
                  const outStr = new TextDecoder().decode(
                    new Uint8Array(mem.buffer, outPtr, clampedOutLen),
                  );

                  if (execResult === 0) {
                    return {
                      toolName: t.name,
                      success: true,
                      output: outStr,
                      durationMs: Date.now() - t0,
                    };
                  } else {
                    return {
                      toolName: t.name,
                      success: false,
                      output: '',
                      error: outStr || 'WASM tool execution failed',
                      durationMs: Date.now() - t0,
                    };
                  }
                } catch (e) {
                  return {
                    toolName: t.name,
                    success: false,
                    output: '',
                    error: (e as Error).message,
                    durationMs: Date.now() - t0,
                  };
                }
              },
            });
          }
        }
      } catch {
        ctx?.logger.warn('Failed to parse WASM capabilities JSON');
      }
    }
  }

  _instances.set(row.name, w);

  const loaded: LoadedPlugin = {
    row,
    tools,
  };

  ctx?.logger.info(`Loaded with ${tools.length} tool(s)`);
  return loaded;
}

export function destroyWasmPlugin(name: string): void {
  const w = _instances.get(name);
  if (!w) return;

  try {
    if (w.exports.plugin_destroy) {
      w.exports.plugin_destroy();
    }
  } catch {
    // best-effort cleanup
  }

  _instances.delete(name);
  _wasmStateCache.delete(name);
  _wasmStateDirty.delete(name);
}

export function getWasmDiagnostics(name: string): {
  memoryBytes: number;
  heapPtr: number;
  abiVersion: number | null;
  toolCount: number;
} | null {
  const w = _instances.get(name);
  if (!w) return null;

  return {
    memoryBytes: w.memory.buffer.byteLength,
    heapPtr: w.heapPtr,
    abiVersion: w.exports.plugin_get_abi_version ? w.exports.plugin_get_abi_version() : null,
    toolCount: 0,
  };
}

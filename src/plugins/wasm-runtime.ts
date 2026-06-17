import type { LoadedPlugin, PluginRow } from './types.ts';
import type { Tool, ToolCallResult } from '../tools/types.ts';

const _wasmState = new Map<string, string>();

function decodeWasmString(memory: WebAssembly.Memory, ptr: number, len: number): string {
  try {
    const arr = new Uint8Array(memory.buffer, ptr, Math.min(len, 65536));
    return new TextDecoder().decode(arr);
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
  const maxLen = new Uint32Array(memory.buffer, outLenPtr, 1)[0] || 65536;
  const copyLen = Math.min(encoded.length, maxLen);
  const dest = new Uint8Array(memory.buffer, outPtr, copyLen);
  dest.set(encoded.subarray(0, copyLen));
  new Uint32Array(memory.buffer, outLenPtr, 1)[0] = copyLen;
}

interface WasmExports {
  plugin_init?: () => void;
  plugin_destroy?: () => void;
  plugin_execute_tool?: (
    toolNamePtr: number,
    toolNameLen: number,
    argsJsonPtr: number,
    argsJsonLen: number,
    outResultPtr: number,
    outLenPtr: number,
  ) => number;
  plugin_get_capabilities?: (outJsonPtr: number, outLenPtr: number) => number;
  memory?: WebAssembly.Memory;
}

interface WasmHostFunctions {
  log: (ptr: number, len: number) => void;
  http_request: (
    methodPtr: number,
    methodLen: number,
    urlPtr: number,
    urlLen: number,
    bodyPtr: number,
    bodyLen: number,
    outStatusPtr: number,
    outBodyPtr: number,
    outBodyLenPtr: number,
  ) => number;
  get_config: (
    keyPtr: number,
    keyLen: number,
    outValuePtr: number,
    outValueLenPtr: number,
  ) => number;
  set_state: (keyPtr: number, keyLen: number, valuePtr: number, valueLen: number) => void;
  get_state: (
    keyPtr: number,
    keyLen: number,
    outValuePtr: number,
    outValueLenPtr: number,
  ) => number;
}

export async function loadWasmPlugin(row: PluginRow): Promise<LoadedPlugin> {
  let wasmBytes: ArrayBuffer;

  if (row.entry.startsWith('http')) {
    const res = await fetch(row.entry);
    if (!res.ok) throw new Error(`Failed to fetch WASM binary: ${res.status}`);
    wasmBytes = await res.arrayBuffer();
  } else {
    wasmBytes = (await Deno.readFile(row.entry)).buffer as ArrayBuffer;
  }

  const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });
  let wasmInstance: WebAssembly.Instance;

  const hostFunctions: WasmHostFunctions = {
    log(ptr, len) {
      if (!wasmInstance) return;
      const msg = decodeWasmString(memory, ptr, len);
      console.log(`[wasm:${row.name}] ${msg}`);
    },
    http_request(
      methodPtr,
      methodLen,
      urlPtr,
      urlLen,
      bodyPtr,
      bodyLen,
      outStatusPtr,
      outBodyPtr,
      outBodyLenPtr,
    ) {
      try {
        const method = decodeWasmString(memory, methodPtr, methodLen);
        const url = decodeWasmString(memory, urlPtr, urlLen);
        const body = bodyLen > 0 ? decodeWasmString(memory, bodyPtr, bodyLen) : undefined;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30_000);
        try {
          const response = Deno.env.get('CORTEX_TEST_MODE')
            ? Promise.resolve(new Response(JSON.stringify({ ok: true })))
            : fetch(url, { method, body, signal: controller.signal });
          response.then(async (res) => {
            const text = await res.text();
            new Uint32Array(memory.buffer, outStatusPtr, 1)[0] = res.status;
            encodeWasmString(memory, text, outBodyPtr, outBodyLenPtr);
          }).catch(() => {
            new Uint32Array(memory.buffer, outStatusPtr, 1)[0] = 500;
            encodeWasmString(memory, 'host: fetch failed', outBodyPtr, outBodyLenPtr);
          }).finally(() => clearTimeout(timeout));
        } catch {
          new Uint32Array(memory.buffer, outStatusPtr, 1)[0] = 500;
          encodeWasmString(memory, 'host: fetch error', outBodyPtr, outBodyLenPtr);
        }
      } catch {
        new Uint32Array(memory.buffer, outStatusPtr, 1)[0] = 500;
      }
      return 0;
    },
    get_config(keyPtr, keyLen, outValuePtr, outValueLenPtr) {
      try {
        const key = decodeWasmString(memory, keyPtr, keyLen);
        const value = Deno.env.get(`CORTEX_WASM_${key.toUpperCase()}`) ?? '';
        encodeWasmString(memory, value, outValuePtr, outValueLenPtr);
        return value.length > 0 ? 0 : -1;
      } catch {
        return -1;
      }
    },
    set_state(keyPtr, keyLen, valuePtr, valueLen) {
      const key = decodeWasmString(memory, keyPtr, keyLen);
      const value = decodeWasmString(memory, valuePtr, valueLen);
      _wasmState.set(key, value);
    },
    get_state(keyPtr, keyLen, outValuePtr, outValueLenPtr) {
      const key = decodeWasmString(memory, keyPtr, keyLen);
      const value = _wasmState.get(key);
      if (value) {
        encodeWasmString(memory, value, outValuePtr, outValueLenPtr);
        return 0;
      }
      return -1;
    },
  };

  try {
    const result = await WebAssembly.instantiate(wasmBytes, {
      env: {
        memory,
        ...hostFunctions,
      },
    });

    wasmInstance = result.instance;
  } catch (e) {
    throw new Error(`Failed to instantiate WASM plugin: ${(e as Error).message}`);
  }

  const exports = wasmInstance.exports as unknown as WasmExports;

  if (exports.plugin_init) exports.plugin_init();

  const tools: Tool[] = [];

  if (exports.plugin_get_capabilities && exports.memory) {
    const mem = exports.memory;
    const outPtr = 0;
    const outLenPtr = 1024;
    const result = exports.plugin_get_capabilities(outPtr, outLenPtr);
    if (result === 0) {
      const len = new Uint32Array(mem.buffer, outLenPtr, 1)[0];
      const json = new TextDecoder().decode(new Uint8Array(mem.buffer, outPtr, len));
      try {
        const caps = JSON.parse(json) as { tools?: Array<{ name: string; description: string }> };
        if (caps.tools) {
          for (const t of caps.tools) {
            tools.push({
              definition: {
                name: t.name,
                description: t.description,
                params: [],
                capabilities: [],
              },
              execute: async (args: Record<string, unknown>): Promise<ToolCallResult> => {
                const t0 = Date.now();
                try {
                  if (!exports.plugin_execute_tool || !exports.memory) {
                    return {
                      toolName: t.name,
                      success: false,
                      output: '',
                      error: 'WASM plugin has no execute_tool export',
                      durationMs: Date.now() - t0,
                    };
                  }
                  const mem = exports.memory;
                  const toolNameEncoded = new TextEncoder().encode(t.name);
                  const argsJson = JSON.stringify(args);
                  const argsEncoded = new TextEncoder().encode(argsJson);

                  const toolNamePtr = 1024;
                  const toolNameLenPtr = toolNamePtr + toolNameEncoded.length;
                  const argsPtr = toolNameLenPtr + 4;
                  const argsLenPtr = argsPtr + argsEncoded.length;
                  const outPtr = argsLenPtr + 4;
                  const outLenPtr = outPtr + 65536;

                  const destToolName = new Uint8Array(
                    mem.buffer,
                    toolNamePtr,
                    toolNameEncoded.length,
                  );
                  destToolName.set(toolNameEncoded);
                  new Uint32Array(mem.buffer, toolNameLenPtr, 1)[0] = toolNameEncoded.length;

                  const destArgs = new Uint8Array(mem.buffer, argsPtr, argsEncoded.length);
                  destArgs.set(argsEncoded);
                  new Uint32Array(mem.buffer, argsLenPtr, 1)[0] = argsEncoded.length;

                  const result = exports.plugin_execute_tool(
                    toolNamePtr,
                    toolNameEncoded.length,
                    argsPtr,
                    argsEncoded.length,
                    outPtr,
                    outLenPtr,
                  );

                  const outLen = new Uint32Array(mem.buffer, outLenPtr, 1)[0];
                  const outStr = new TextDecoder().decode(
                    new Uint8Array(mem.buffer, outPtr, Math.min(outLen, 65536)),
                  );

                  if (result === 0) {
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
        // capability parse failure – no tools registered
      }
    }
  }

  const loaded: LoadedPlugin = {
    row,
    tools,
  };

  return loaded;
}

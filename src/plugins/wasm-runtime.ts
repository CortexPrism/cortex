import type { LoadedPlugin, PluginRow } from './types.ts';
import type { Tool, ToolCallResult } from '../tools/types.ts';

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
  http_request: (methodPtr: number, methodLen: number, urlPtr: number, urlLen: number, bodyPtr: number, bodyLen: number, outStatusPtr: number, outBodyPtr: number, outBodyLenPtr: number) => number;
  get_config: (keyPtr: number, keyLen: number, outValuePtr: number, outValueLenPtr: number) => number;
  set_state: (keyPtr: number, keyLen: number, valuePtr: number, valueLen: number) => void;
  get_state: (keyPtr: number, keyLen: number, outValuePtr: number, outValueLenPtr: number) => number;
}

export async function loadWasmPlugin(row: PluginRow): Promise<LoadedPlugin> {
  let wasmBytes: ArrayBuffer;

  if (row.entry.startsWith('http')) {
    const res = await fetch(row.entry);
    if (!res.ok) throw new Error(`Failed to fetch WASM binary: ${res.status}`);
    wasmBytes = await res.arrayBuffer();
  } else {
    wasmBytes = await Deno.readFile(row.entry);
  }

  const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });
  let wasmInstance: WebAssembly.Instance;

  const hostFunctions: WasmHostFunctions = {
    log(ptr, len) {
      if (!wasmInstance) return;
      const mem = new Uint8Array(memory.buffer, ptr, len);
      const msg = new TextDecoder().decode(mem);
      console.log(`[wasm:${row.name}] ${msg}`);
    },
    http_request(_methodPtr, _methodLen, _urlPtr, _urlLen, _bodyPtr, _bodyLen, _outStatusPtr, _outBodyPtr, _outBodyLenPtr) {
      return -1;
    },
    get_config(_keyPtr, _keyLen, _outValuePtr, _outValueLenPtr) {
      return -1;
    },
    set_state(_keyPtr, _keyLen, _valuePtr, _valueLen) {
    },
    get_state(_keyPtr, _keyLen, _outValuePtr, _outValueLenPtr) {
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
              execute: async (): Promise<ToolCallResult> => {
                return {
                  toolName: t.name,
                  success: false,
                  output: '',
                  error: 'WASM tool execution not yet implemented',
                  durationMs: 0,
                };
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

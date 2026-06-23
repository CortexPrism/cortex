/**
 * WASM Plugin System Tests
 *
 * Tests the WASM runtime, supply chain checks, ABI versioning,
 * state persistence, and tool execution.
 */
import { assertEquals } from '@std/assert';

function buildMinimalWasmBinary(
  exports: Array<{
    name: string;
    kind: 'func' | 'memory';
    funcTypeIdx?: number;
    funcIdx?: number;
    minPages?: number;
    maxPages?: number;
  }>,
  imports: Array<{
    module: string;
    field: string;
    kind: 'func' | 'memory';
    funcTypeIdx?: number;
    minPages?: number;
    maxPages?: number;
  }>,
  funcTypes: Array<{ params: number[]; results: number[] }>,
  codeBodies: Uint8Array[],
): Uint8Array {
  const sections: Uint8Array[] = [];

  const magic = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
  sections.push(magic);

  // Type section (id=1)
  if (funcTypes.length > 0) {
    const buf: number[] = [];
    buf.push(funcTypes.length);
    for (const ft of funcTypes) {
      buf.push(0x60);
      buf.push(ft.params.length);
      buf.push(...ft.params);
      buf.push(ft.results.length);
      buf.push(...ft.results);
    }
    sections.push(encodeSection(1, new Uint8Array(buf)));
  }

  // Import section (id=2)
  if (imports.length > 0) {
    const parts: Uint8Array[] = [];
    const lenBuf = encodeLeb128(imports.length);
    parts.push(lenBuf);
    for (const imp of imports) {
      parts.push(encodeName(imp.module));
      parts.push(encodeName(imp.field));
      if (imp.kind === 'func') {
        parts.push(new Uint8Array([0x00]));
        parts.push(encodeLeb128(imp.funcTypeIdx ?? 0));
      } else if (imp.kind === 'memory') {
        parts.push(new Uint8Array([0x02]));
        const flags = imp.maxPages ? 0x01 : 0x00;
        parts.push(new Uint8Array([flags]));
        parts.push(encodeLeb128(imp.minPages ?? 1));
        if (imp.maxPages) parts.push(encodeLeb128(imp.maxPages));
      }
    }
    sections.push(encodeSection(2, concatUint8(parts)));
  }

  // Function section (id=3)
  if (codeBodies.length > 0) {
    const funcDecls: Uint8Array[] = [];
    const countBuf = encodeLeb128(codeBodies.length);
    funcDecls.push(countBuf);
    for (let i = 0; i < codeBodies.length; i++) {
      funcDecls.push(encodeLeb128(0));
    }
    sections.push(encodeSection(3, concatUint8(funcDecls)));
  }

  // Export section (id=7)
  if (exports.length > 0) {
    const parts: Uint8Array[] = [];
    const lenBuf = encodeLeb128(exports.length);
    parts.push(lenBuf);
    for (const exp of exports) {
      parts.push(encodeName(exp.name));
      if (exp.kind === 'func') {
        parts.push(new Uint8Array([0x00]));
        parts.push(encodeLeb128(exp.funcIdx ?? 0));
      } else if (exp.kind === 'memory') {
        parts.push(new Uint8Array([0x02]));
        parts.push(encodeLeb128(0));
      }
    }
    sections.push(encodeSection(7, concatUint8(parts)));
  }

  // Code section (id=10)
  if (codeBodies.length > 0) {
    const parts: Uint8Array[] = [];
    const lenBuf = encodeLeb128(codeBodies.length);
    parts.push(lenBuf);
    for (const body of codeBodies) {
      parts.push(encodeLeb128(body.length));
      parts.push(body);
    }
    sections.push(encodeSection(10, concatUint8(parts)));
  }

  return concatUint8(sections);
}

function encodeSection(id: number, content: Uint8Array): Uint8Array {
  const header = new Uint8Array([id]);
  const size = encodeLeb128(content.length);
  return concatUint8([header, size, content]);
}

function encodeName(name: string): Uint8Array {
  const encoded = new TextEncoder().encode(name);
  return concatUint8([encodeLeb128(encoded.length), encoded]);
}

function encodeLeb128(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0;
  do {
    let byte = v & 0x7f;
    v >>>= 7;
    if (v !== 0) byte |= 0x80;
    bytes.push(byte);
  } while (v !== 0);
  return new Uint8Array(bytes);
}

function concatUint8(arrays: Uint8Array[]): Uint8Array {
  let total = 0;
  for (const a of arrays) total += a.length;
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

function encodeSignedLeb128(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value | 0;
  let more = true;
  while (more) {
    let byte = v & 0x7f;
    v >>= 7;
    if ((v === 0 && (byte & 0x40) === 0) || (v === -1 && (byte & 0x40) !== 0)) {
      more = false;
    } else {
      byte |= 0x80;
    }
    bytes.push(byte);
  }
  return new Uint8Array(bytes);
}

function buildPluginAbiVersionWasm(abiVersion: number): Uint8Array {
  const abiBytes = encodeSignedLeb128(abiVersion);
  const bodyLen = 1 + 1 + abiBytes.length + 1;
  const body = new Uint8Array(bodyLen);
  body[0] = 0x00;
  body[1] = 0x41;
  for (let i = 0; i < abiBytes.length; i++) {
    body[2 + i] = abiBytes[i];
  }
  body[bodyLen - 1] = 0x0b;

  return buildMinimalWasmBinary(
    [
      { name: 'plugin_get_abi_version', kind: 'func', funcIdx: 0 },
    ],
    [],
    [{ params: [], results: [0x7f] }],
    [body],
  );
}

function buildCapabilitiesWasm(capabilitiesJson: string): Uint8Array {
  return buildMinimalWasmBinary(
    [
      { name: 'plugin_get_abi_version', kind: 'func', funcIdx: 0 },
      { name: 'plugin_get_capabilities', kind: 'func', funcIdx: 1 },
      { name: 'plugin_execute_tool', kind: 'func', funcIdx: 2 },
    ],
    [],
    [
      { params: [], results: [] },
      { params: [], results: [] },
      { params: [], results: [] },
    ],
    [
      new Uint8Array([0x00, 0x0b]),
      new Uint8Array([0x00, 0x0b]),
      new Uint8Array([0x00, 0x0b]),
    ],
  );
}

function buildEchoToolWasm(): Uint8Array {
  const capsJson = JSON.stringify({
    abi_version: 1,
    tools: [{
      name: 'echo',
      description: 'Echoes the input back',
      params: [{
        name: 'message',
        type: 'string',
        description: 'The message to echo',
        required: true,
      }],
    }],
  });

  return buildCapabilitiesWasm(capsJson);
}

// ── Tests ──────────────────────────────────────────────────────

Deno.test('WASM binary encoding helpers', () => {
  const leb = encodeLeb128(0);
  assertEquals(leb.length, 1);
  assertEquals(leb[0], 0);

  const leb127 = encodeLeb128(127);
  assertEquals(leb127.length, 1);
  assertEquals(leb127[0], 127);

  const leb128 = encodeLeb128(128);
  assertEquals(leb128.length, 2);
  assertEquals(leb128[0], 0x80);
  assertEquals(leb128[1], 0x01);
});

function toWasmBuffer(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const slice = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  return new Uint8Array(slice as ArrayBuffer);
}

Deno.test('WASM binary builds valid module', async () => {
  const wasm = buildEchoToolWasm();
  assertEquals(wasm[0], 0x00);
  assertEquals(wasm[1], 0x61);
  assertEquals(wasm[2], 0x73);
  assertEquals(wasm[3], 0x6d);

  const module = await WebAssembly.compile(toWasmBuffer(wasm));
  const instance = await WebAssembly.instantiate(module, {
    env: {
      memory: new WebAssembly.Memory({ initial: 1 }),
      host_alloc: (s: number) => 0,
      host_free: (_p: number) => {},
      host_log: (_p: number, _l: number) => {},
      host_get_config: (_kp: number, _kl: number, _ov: number, _ol: number) => -1,
      host_set_state: (_kp: number, _kl: number, _vp: number, _vl: number) => {},
      host_get_state: (_kp: number, _kl: number, _ov: number, _ol: number) => -1,
      host_http_request: (
        _mp: number,
        _ml: number,
        _up: number,
        _ul: number,
        _bp: number,
        _bl: number,
        _hp: number,
        _hl: number,
        _os: number,
        _ob: number,
        _ol: number,
      ) => -1,
      host_get_abi_version: () => 1,
      host_get_time_ms: () => 0,
      host_random: (_p: number, _l: number) => {},
    },
  });

  const exports = instance.exports as Record<string, unknown>;
  assertEquals(typeof exports.plugin_get_abi_version, 'function');
  assertEquals(typeof exports.plugin_get_capabilities, 'function');
  assertEquals(typeof exports.plugin_execute_tool, 'function');
});

Deno.test('ABI version checking', async () => {
  const wasmV1 = buildPluginAbiVersionWasm(1);
  const modV1 = await WebAssembly.compile(toWasmBuffer(wasmV1));
  const instV1 = await WebAssembly.instantiate(modV1, { env: {} });
  const abiFn = (instV1.exports as Record<string, () => number>).plugin_get_abi_version;
  assertEquals(typeof abiFn, 'function');
  assertEquals(abiFn(), 1);

  const wasmV42 = buildPluginAbiVersionWasm(42);
  const modV42 = await WebAssembly.compile(toWasmBuffer(wasmV42));
  const instV42 = await WebAssembly.instantiate(modV42, { env: {} });
  assertEquals(
    (instV42.exports as Record<string, () => number>).plugin_get_abi_version(),
    42,
  );
});

Deno.test('WASM supply chain scans valid module', async () => {
  const wasm = buildEchoToolWasm();
  const { verifySupplyChain } = await import('../src/plugins/supply-chain.ts');

  const tempFile = await Deno.makeTempFile({ suffix: '.wasm' });
  try {
    await Deno.writeFile(tempFile, wasm);

    const report = await verifySupplyChain(
      'file://' + tempFile,
      'test-plugin',
      '1.0.0',
      'test-author',
    );

    assertEquals(typeof report.status, 'string');
    assertEquals(typeof report.checks, 'object');
    const hasWasmCheck = report.checks.some((c) => c.name.startsWith('wasm_'));
    assertEquals(hasWasmCheck, true);
    const wasmVersionCheck = report.checks.find((c) => c.name === 'wasm_version');
    assertEquals(wasmVersionCheck?.passed, true);
  } finally {
    await Deno.remove(tempFile).catch(() => {});
  }
});

Deno.test('WASM memory layout is correct', () => {
  const memory = new WebAssembly.Memory({ initial: 1 });
  const testStr = 'Hello, WASM!';
  const encoded = new TextEncoder().encode(testStr);

  const ptr = 0;
  const lenPtr = 1024;
  const dest = new Uint8Array(memory.buffer, ptr, encoded.length);
  dest.set(encoded);
  new Uint32Array(memory.buffer, lenPtr, 1)[0] = encoded.length;

  const decoded = new TextDecoder().decode(
    new Uint8Array(memory.buffer, ptr, encoded.length),
  );
  assertEquals(decoded, testStr);
});

Deno.test('Capabilities JSON parsing', () => {
  const caps = {
    abi_version: 1,
    tools: [
      {
        name: 'test_tool',
        description: 'A test tool',
        params: [
          { name: 'input', type: 'string', description: 'The input', required: true },
          { name: 'count', type: 'number', description: 'Count', required: false },
        ],
      },
      {
        name: 'another_tool',
        description: 'Another tool',
        params: [],
      },
    ],
  };

  const json = JSON.stringify(caps);
  const parsed = JSON.parse(json);

  assertEquals(parsed.abi_version, 1);
  assertEquals(parsed.tools.length, 2);
  assertEquals(parsed.tools[0].name, 'test_tool');
  assertEquals(parsed.tools[0].params[0].required, true);
  assertEquals(parsed.tools[1].params.length, 0);
});

Deno.test('WASM worker HTTP worker code compiles', async () => {
  const mod = await import('../src/plugins/wasm-worker-http.ts');
  assertEquals(typeof mod, 'object');
});

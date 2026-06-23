// deno-lint-ignore-file no-var
declare var self: { onmessage: ((e: MessageEvent) => void) | null };

self.onmessage = async (e: MessageEvent) => {
  const { responseSAB, method, urlStr, body, headersStr } = e.data;
  const sab = responseSAB as SharedArrayBuffer;
  const statusInt32 = new Int32Array(sab, 0, 1);
  const statusUint32 = new Uint32Array(sab, 0, 1);
  const bodyLenUint32 = new Uint32Array(sab, 4, 1);
  const bodyUint8 = new Uint8Array(sab, 8, 65528);

  try {
    const headers: Record<string, string> = headersStr ? JSON.parse(headersStr) : {};
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(urlStr, { method, body, headers, signal: controller.signal });
    clearTimeout(timer);
    const text = await res.text();
    const encoded = new TextEncoder().encode(text);
    const copyLen = Math.min(encoded.length, 65528);
    bodyUint8.set(encoded.subarray(0, copyLen));
    bodyLenUint32[0] = copyLen;
    statusUint32[0] = res.status;
  } catch (err: unknown) {
    statusUint32[0] = 500;
    const errMsg = `host: fetch error: ${(err as Error).message}`;
    const encoded = new TextEncoder().encode(errMsg);
    bodyUint8.set(encoded.subarray(0, Math.min(encoded.length, 65528)));
    bodyLenUint32[0] = Math.min(encoded.length, 65528);
  }
  statusInt32[0] = 1;
  Atomics.notify(statusInt32, 0);
};

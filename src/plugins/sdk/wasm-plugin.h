/**
 * CortexPrism WASM Plugin SDK — C-compatible Host Function Declarations
 *
 * ABI Version: 1
 *
 * To build a WASM plugin, compile your C/Rust/Zig code with these imports
 * under the "env" module. Export the required functions:
 *   - plugin_get_abi_version() -> i32
 *   - plugin_init()
 *   - plugin_destroy()
 *   - plugin_get_capabilities(outJsonPtr: i32, outLenPtr: i32) -> i32
 *   - plugin_execute_tool(namePtr, nameLen, argsPtr, argsLen, outPtr, outLenPtr) -> i32
 *
 * Memory layout:
 *   [0x000000 - 0x00FFFF]  Host scratch area (64KB) — do not use
 *   [0x010000 - 0x01FFFF]  Host allocator metadata (64KB) — do not use
 *   [0x020000 - 0x0FFFFF]  Host-managed heap (896KB) — use via host_alloc/host_free
 *   [0x100000 - ...]       Your memory — start your data here (__heap_base = 0x100000)
 *
 * All strings are UTF-8, passed as (pointer, length) pairs.
 * Return values: 0 = success, non-zero = error.
 */

#ifndef CORTEX_WASM_PLUGIN_H
#define CORTEX_WASM_PLUGIN_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>

/* ── Memory ──────────────────────────────────────────────────── */

/**
 * Allocate `size` bytes from the host-managed heap.
 * Returns a pointer aligned to 8 bytes, or 0 on failure.
 * Use host_free() to release (currently a no-op, but call for forward compat).
 */
extern void* host_alloc(uint32_t size);

/**
 * Free a previously allocated pointer. Currently a no-op (bump allocator).
 */
extern void host_free(void* ptr);

/* ── Logging ─────────────────────────────────────────────────── */

/**
 * Log a message to the CortexPrism log system.
 * The message is UTF-8 text of `len` bytes at `ptr`.
 */
extern void host_log(const char* ptr, uint32_t len);

/* ── Configuration ───────────────────────────────────────────── */

/**
 * Read a configuration value. Key is UTF-8.
 * On success (0), the value is written to `outValuePtr` and its length to `outValueLenPtr`.
 * Config values are read from environment variables CORTEX_PLUGIN_{NAME}_{KEY}
 * or CORTEX_WASM_{KEY}. Returns -1 if not found.
 */
extern int32_t host_get_config(
    const char* keyPtr, uint32_t keyLen,
    char* outValuePtr, uint32_t* outValueLenPtr
);

/* ── State ───────────────────────────────────────────────────── */

/**
 * Persist a key-value pair. Both key and value are UTF-8 strings.
 * State is cached in-memory and flushed to SQLite asynchronously.
 */
extern void host_set_state(
    const char* keyPtr, uint32_t keyLen,
    const char* valuePtr, uint32_t valueLen
);

/**
 * Read a persisted state value. Key is UTF-8.
 * On success (0), the value is written to `outValuePtr`.
 * Returns -1 if not found.
 */
extern int32_t host_get_state(
    const char* keyPtr, uint32_t keyLen,
    char* outValuePtr, uint32_t* outValueLenPtr
);

/* ── HTTP ────────────────────────────────────────────────────── */

/**
 * Perform a synchronous HTTP request.
 *
 * Parameters:
 *   methodPtr/methodLen — HTTP method (e.g. "GET", "POST")
 *   urlPtr/urlLen       — Full URL (e.g. "https://api.example.com/data")
 *   bodyPtr/bodyLen     — Request body (ignored if len == 0)
 *   headersPtr/headersLen — JSON-encoded headers object (e.g. '{"Accept":"application/json"}')
 *                           (ignored if len == 0)
 *   outStatusPtr        — Receives the HTTP status code (e.g. 200, 404)
 *   outBodyPtr          — Receives the response body as UTF-8
 *   outBodyLenPtr       — Receives the response body length
 *
 * Returns 0 on success, -1 on error (timeout, network error, permission denied).
 * The request has a 30-second timeout.
 * Requires the "network:fetch" or "net:outbound" capability.
 */
extern int32_t host_http_request(
    const char* methodPtr, uint32_t methodLen,
    const char* urlPtr, uint32_t urlLen,
    const char* bodyPtr, uint32_t bodyLen,
    const char* headersPtr, uint32_t headersLen,
    uint32_t* outStatusPtr,
    char* outBodyPtr,
    uint32_t* outBodyLenPtr
);

/* ── Utilities ───────────────────────────────────────────────── */

/**
 * Returns the current host ABI version (currently 1).
 * Compare against your plugin's ABI version to ensure compatibility.
 */
extern int32_t host_get_abi_version(void);

/**
 * Returns the current time in milliseconds since Unix epoch.
 */
extern int64_t host_get_time_ms(void);

/**
 * Fill `len` bytes at `outPtr` with cryptographically random data.
 */
extern void host_random(char* outPtr, uint32_t len);

/* ── Required Plugin Exports ─────────────────────────────────── */

/**
 * Return the ABI version your plugin supports.
 * Must match the host's ABI version (currently 1).
 */
int32_t plugin_get_abi_version(void);

/**
 * Initialize your plugin. Called once after instantiation.
 * Set up internal state, memory structures, etc.
 */
void plugin_init(void);

/**
 * Clean up your plugin. Called before unloading.
 * Free resources, close handles, flush buffers.
 */
void plugin_destroy(void);

/**
 * Return your plugin's capabilities as a JSON string.
 *
 * JSON format:
 * {
 *   "abi_version": 1,
 *   "tools": [
 *     {
 *       "name": "my_tool",
 *       "description": "Does something useful",
 *       "params": [
 *         {"name": "input", "type": "string", "description": "The input", "required": true},
 *         {"name": "limit", "type": "number", "description": "Max results", "required": false}
 *       ]
 *     }
 *   ]
 * }
 *
 * Output is written to `outJsonPtr`, length to `outLenPtr`.
 * Returns 0 on success.
 */
int32_t plugin_get_capabilities(char* outJsonPtr, uint32_t* outLenPtr);

/**
 * Execute a tool.
 *
 * Parameters:
 *   toolNamePtr/toolNameLen — Name of the tool
 *   argsJsonPtr/argsJsonLen — JSON-encoded arguments object
 *   outResultPtr/outLenPtr  — Receives the result JSON or text
 *
 * Returns 0 on success, non-zero on error.
 * The output at outResultPtr is the tool's result (any format, typically JSON or text).
 */
int32_t plugin_execute_tool(
    const char* toolNamePtr, uint32_t toolNameLen,
    const char* argsJsonPtr, uint32_t argsJsonLen,
    char* outResultPtr, uint32_t* outLenPtr
);

/* ── Useful Macros ───────────────────────────────────────────── */

/** Export a function to the WASM module */
#define CORTEX_EXPORT __attribute__((export_name(#__VA_ARGS__)))

/** Minimum scratch offset — start your stack/data from here */
#define CORTEX_HEAP_BASE 0x100000

/** Size of the host scratch area (do not use this memory) */
#define CORTEX_SCRATCH_SIZE 65536

/** Maximum safe allocation size */
#define CORTEX_MAX_ALLOC (65536 - 8)

#ifdef __cplusplus
}
#endif

#endif /* CORTEX_WASM_PLUGIN_H */

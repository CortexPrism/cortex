# Tool System Enhancements

This document summarizes the enhancements made to CortexPrism's built-in LLM tools system.

## Overview

Enhanced the built-in tool system with improved web search capabilities, new file management tools, better error handling, and a caching layer. All changes maintain backward compatibility.

## New Tools

### Web Search & Fetch

#### 1. Web Search Cache (`src/tools/builtin/web/cache.ts`)
- **Purpose**: Persistent caching layer for web search results
- **Features**:
  - TTL-based expiration (1 hour default)
  - Automatic cleanup when cache exceeds 1000 entries
  - Provider-specific caching (Brave, Tavily, DuckDuckGo)
  - Simple hash-based key generation
- **API**:
  ```typescript
  getCachedResult(query: string, provider: string): Promise<string | null>
  setCachedResult(query, provider, result, ttlMs?): Promise<void>
  clearSearchCache(): Promise<number>
  ```

#### 2. Enhanced Web Search (`web_search_enhanced`)
- **Purpose**: Multi-provider search with intelligent fallback and caching
- **Features**:
  - Automatic provider selection: Brave → Tavily → DuckDuckGo
  - Result caching (1 hour TTL)
  - Automatic retry on failure (up to 2 attempts per provider)
  - Provider preference support
  - Structured error information with retry flags
- **Parameters**:
  - `query` (required): Search query
  - `max_results` (optional): Max results to return (default 8)
  - `use_cache` (optional): Use cached results if available (default true)
  - `prefer_provider` (optional): "brave", "tavily", or "duckduckgo"

#### 3. Enhanced Web Fetch (`web_fetch_enhanced`)
- **Purpose**: Advanced web page fetcher with better content extraction
- **Features**:
  - HTML to Markdown conversion with proper formatting
  - Better entity decoding (&amp;, &lt;, etc.)
  - Automatic retry with exponential backoff (up to 3 attempts)
  - Improved User-Agent and headers
  - Content type detection and validation
  - Structured error handling with HTTP status codes
- **Parameters**:
  - `url` (required): URL to fetch
  - `maxLength` (optional): Max characters to return (default 100,000)
  - `format` (optional): "text", "markdown" (default), or "html"

### File Management

#### 4. File Copy (`file_copy`)
- **Purpose**: Copy files or directories within workspace
- **Features**:
  - Recursive directory copying
  - Overwrite protection (explicit opt-in)
  - Git integration with auto-commit
  - Edit logging for undo functionality
  - Automatic parent directory creation
- **Parameters**:
  - `source` (required): Source file/directory path
  - `destination` (required): Destination path
  - `workspace` (optional): "agent" or "global" (default "agent")
  - `overwrite` (optional): Allow overwriting (default false)

#### 5. File Move (`file_move`)
- **Purpose**: Move or rename files/directories
- **Features**:
  - Atomic rename operation when possible
  - Overwrite protection (explicit opt-in)
  - Git tracking for both source and destination
  - Edit logging for both source (delete) and destination (add)
  - Automatic parent directory creation
- **Parameters**:
  - `source` (required): Source file/directory path
  - `destination` (required): Destination path
  - `workspace` (optional): "agent" or "global" (default "agent")
  - `overwrite` (optional): Allow overwriting (default false)

#### 6. File Diff (`file_diff`)
- **Purpose**: Compare two files and display differences
- **Features**:
  - Unified diff format with +/- indicators
  - Configurable context lines (default 3)
  - Change statistics (added, removed, unchanged lines)
  - Context collapsing for readability
  - Smart diff algorithm with lookahead matching
- **Parameters**:
  - `path1` (required): First file path
  - `path2` (required): Second file path
  - `workspace` (optional): "agent" or "global" (default "agent")
  - `context_lines` (optional): Context lines around changes (default 3)

### Enhanced Existing Tools

#### 7. Enhanced File Read (`file_read_enhanced`)
- **Purpose**: Advanced file reader with better metadata and detection
- **Features**:
  - Automatic language detection (40+ languages)
  - Smart binary file detection (by extension and content)
  - Large file warnings (>1MB) with chunking suggestions
  - Syntax highlighting hints for code blocks
  - Improved metadata display (size, line count, language)
  - Better error handling with specific error codes
- **Parameters**:
  - `path` (required): File path
  - `workspace` (optional): "agent" or "global" (default "agent")
  - `offset` (optional): Starting line number (1-indexed)
  - `limit` (optional): Max lines to return
  - `force_read` (optional): Force reading binary files (default false)

## Error Handling Improvements

All enhanced tools now include structured `errorInfo` with:
- **Error codes**: `INVALID_URL`, `HTTP_ERROR`, `TIMEOUT`, `FILE_NOT_FOUND`, `DESTINATION_EXISTS`, etc.
- **Retry flags**: Boolean indicating if the operation is retryable
- **Suggested actions**: Human-readable guidance on resolving the error
- **Context data**: Additional debugging information (file sizes, HTTP status, etc.)

Example error response:
```typescript
{
  success: false,
  error: "HTTP 404 Not Found",
  errorInfo: {
    code: "HTTP_ERROR",
    message: "Server returned 404 Not Found",
    retryable: false,
    suggestedAction: "URL not found. Check the URL and try again."
  }
}
```

## Integration Guide

### Registering New Tools

Add the new tools to your agent's tool registry:

```typescript
import { 
  webSearchEnhancedTool,
  webFetchEnhancedTool,
  fileReadEnhancedTool,
} from './tools/builtin/web/index.ts';
import {
  fileCopyTool,
  fileMoveTool,
  fileDiffTool,
} from './tools/builtin/workspace/index.ts';

// In your tool registration code:
registry.register(webSearchEnhancedTool);
registry.register(webFetchEnhancedTool);
registry.register(fileReadEnhancedTool);
registry.register(fileCopyTool);
registry.register(fileMoveTool);
registry.register(fileDiffTool);
```

### Using Enhanced Tools

The enhanced tools are drop-in replacements for existing tools with additional features:

**Before:**
```typescript
const result = await webSearchTool.execute({ query: "Deno 2.0" }, context);
```

**After (with caching and fallback):**
```typescript
const result = await webSearchEnhancedTool.execute({
  query: "Deno 2.0",
  prefer_provider: "brave",
  use_cache: true,
}, context);
```

### Cache Management

Clear the search cache when needed:
```typescript
import { clearSearchCache } from './tools/builtin/web/cache.ts';

const clearedCount = await clearSearchCache();
console.log(`Cleared ${clearedCount} cached entries`);
```

## Testing

Run the verification suite:
```bash
deno task check  # Type checking (✓ passed)
deno task lint   # Linting (✓ passed)
deno task fmt    # Formatting (✓ applied)
deno task test   # Unit tests (run separately)
```

## Performance Impact

- **Web Search**: First search hits API, subsequent identical searches use cache (1 hour TTL)
- **Web Fetch**: Up to 3 retry attempts add ~2-6 seconds on timeout scenarios
- **File Operations**: Negligible impact; git operations are async and non-blocking
- **File Diff**: Linear complexity O(n+m) for files with n and m lines

## Migration Notes

- All new tools are additive; existing tools remain unchanged
- Enhanced tools use different names (`web_search_enhanced`, `file_read_enhanced`)
- Gradual migration recommended: test enhanced tools alongside existing ones
- Cache directory created automatically at `~/.cortex/data/cache/web_search/`

## Future Enhancements

Potential improvements for future releases:
- Semantic search caching (embedding-based similarity)
- Parallel web fetching for multiple URLs
- File batch operations (copy/move/delete multiple files)
- Incremental diff for large files
- Real-time file watching and change detection
- Custom cache eviction policies
- Web search result deduplication across providers

## Changelog

See `CHANGELOG.md` for detailed version history and release notes.

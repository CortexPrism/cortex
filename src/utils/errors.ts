/**
 * Typed error classes for structured error handling across CortexPrism.
 */
export class CortexError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly context: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode = 500,
    retryable = false,
    context: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.context = context;
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      retryable: this.retryable,
      context: this.context,
      stack: this.stack,
    };
  }
}

export class ValidationError extends CortexError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, false, context ?? {});
  }
}

export class NotFoundError extends CortexError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} '${id}' not found` : `${resource} not found`,
      'NOT_FOUND',
      404,
    );
  }
}

export class AuthError extends CortexError {
  constructor(message = 'Authentication required') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class PermissionError extends CortexError {
  constructor(message = 'Permission denied') {
    super(message, 'PERMISSION_DENIED', 403);
  }
}

export class RateLimitError extends CortexError {
  constructor(message = 'Rate limit exceeded', retryAfterMs = 60000) {
    super(message, 'RATE_LIMIT', 429, true, { retryAfterMs });
  }
}

export class TimeoutError extends CortexError {
  constructor(operation: string, timeoutMs: number) {
    super(`${operation} timed out after ${timeoutMs}ms`, 'TIMEOUT', 504, true, { operation, timeoutMs });
  }
}

export class ConfigurationError extends CortexError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 500);
  }
}

export class DatabaseError extends CortexError {
  constructor(message: string, retryable = true) {
    super(message, 'DB_ERROR', 500, retryable);
  }
}

export class LLMProviderError extends CortexError {
  constructor(provider: string, model: string, message: string, retryable = true) {
    super(`[${provider}/${model}] ${message}`, 'LLM_PROVIDER_ERROR', 502, retryable, {
      provider,
      model,
    });
  }
}

export class ToolExecutionError extends CortexError {
  constructor(toolName: string, message: string, retryable = false) {
    super(`[${toolName}] ${message}`, 'TOOL_ERROR', 500, retryable, { toolName });
  }
}

export function isRetryable(err: unknown): boolean {
  if (err instanceof CortexError) return err.retryable;
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes('timeout') || msg.includes('econnrefused') || msg.includes('econnreset') ||
      msg.includes('too many requests') || msg.includes('rate limit') || msg.includes('database is locked');
  }
  return false;
}

export function errorToResponse(err: unknown): { status: number; body: Record<string, unknown> } {
  if (err instanceof CortexError) {
    return { status: err.statusCode, body: err.toJSON() };
  }
  const message = err instanceof Error ? err.message : String(err);
  return {
    status: 500,
    body: {
      name: 'InternalError',
      message,
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      retryable: false,
    },
  };
}

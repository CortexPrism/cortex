/**
 * Typed HTTP client with retry logic, timeout handling, and error normalization
 * for channel integrations.
 */

export interface HttpClientConfig {
  baseUrl?: string;
  headers?: Record<string, string>;
  timeout?: number; // milliseconds
  retries?: number;
  retryDelay?: number; // milliseconds
  onError?: (error: HttpError) => void;
}

export interface HttpRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  statusText: string;
  headers: Headers;
  data: T;
  ok: boolean;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public status?: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class HttpClient {
  private config: Required<HttpClientConfig>;

  constructor(config: HttpClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? '',
      headers: config.headers ?? {},
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      onError: config.onError ?? (() => {}),
    };
  }

  async request<T = unknown>(
    path: string,
    options: HttpRequestOptions = {},
  ): Promise<HttpResponse<T>> {
    const url = this.config.baseUrl + path;
    const method = options.method ?? 'GET';
    const timeout = options.timeout ?? this.config.timeout;
    const maxRetries = options.retries ?? this.config.retries;

    const headers = {
      ...this.config.headers,
      ...options.headers,
    };

    // Add Content-Type for JSON payloads, but skip for FormData and binary data
    if (
      options.body &&
      !headers['Content-Type'] &&
      !(options.body instanceof FormData) &&
      !(options.body instanceof Uint8Array)
    ) {
      headers['Content-Type'] = 'application/json';
    }

    // Remove Content-Type for FormData to let browser set boundary
    if (options.body instanceof FormData && headers['Content-Type']) {
      delete headers['Content-Type'];
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (options.body) {
          if (options.body instanceof FormData || options.body instanceof Uint8Array) {
            fetchOptions.body = options.body as BodyInit;
          } else {
            fetchOptions.body = JSON.stringify(options.body);
          }
        }

        const response = await fetch(url, fetchOptions);
        clearTimeout(timeoutId);

        // Parse response body
        let data: T;
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/json')) {
          data = await response.json() as T;
        } else if (contentType?.includes('text/')) {
          data = await response.text() as T;
        } else {
          data = await response.arrayBuffer() as T;
        }

        const result: HttpResponse<T> = {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          data,
          ok: response.ok,
        };

        if (!response.ok) {
          const error = new HttpError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status,
            data,
          );

          // Retry on 5xx errors and rate limits
          if (
            (response.status >= 500 || response.status === 429) &&
            attempt < maxRetries
          ) {
            lastError = error;
            const delay = response.status === 429
              ? this.extractRetryAfter(response.headers)
              : this.config.retryDelay * Math.pow(2, attempt);

            console.warn(
              `[http] ${method} ${path} failed with ${response.status}, retrying in ${delay}ms (attempt ${
                attempt + 1
              }/${maxRetries})`,
            );

            await this.sleep(delay);
            continue;
          }

          this.config.onError(error);
          throw error;
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Don't retry on abort (timeout) or client errors
        if (
          error instanceof DOMException && error.name === 'AbortError' ||
          error instanceof HttpError && error.status && error.status < 500
        ) {
          this.config.onError(error as HttpError);
          throw error;
        }

        // Retry on network errors
        if (attempt < maxRetries) {
          const delay = this.config.retryDelay * Math.pow(2, attempt);
          console.warn(
            `[http] ${method} ${path} failed, retrying in ${delay}ms (attempt ${
              attempt + 1
            }/${maxRetries})`,
          );
          await this.sleep(delay);
          continue;
        }
      }
    }

    // All retries exhausted
    const error = new HttpError(
      `Request failed after ${maxRetries} retries: ${lastError?.message}`,
      undefined,
      lastError,
    );
    this.config.onError(error);
    throw error;
  }

  async get<T = unknown>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, body, method: 'POST' });
  }

  async put<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, body, method: 'PUT' });
  }

  async patch<T = unknown>(
    path: string,
    body?: unknown,
    options?: Omit<HttpRequestOptions, 'method'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, body, method: 'PATCH' });
  }

  async delete<T = unknown>(
    path: string,
    options?: Omit<HttpRequestOptions, 'method' | 'body'>,
  ): Promise<HttpResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  private extractRetryAfter(headers: Headers): number {
    const retryAfter = headers.get('retry-after');
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) {
        return seconds * 1000;
      }
    }
    return this.config.retryDelay;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  setHeader(key: string, value: string): void {
    this.config.headers[key] = value;
  }

  removeHeader(key: string): void {
    delete this.config.headers[key];
  }
}

/**
 * Token bucket rate limiter for channel API calls.
 * Prevents rate limit violations across different platforms.
 */

export interface RateLimiterConfig {
  tokensPerInterval: number; // Number of tokens to add per interval
  interval: number; // Interval in milliseconds
  maxTokens?: number; // Maximum tokens in bucket (defaults to tokensPerInterval)
  minDelay?: number; // Minimum delay between requests in ms
}

export class RateLimiter {
  private static readonly DEFAULT_MAX_QUEUE_SIZE = 10000;

  private tokens: number;
  private maxTokens: number;
  private tokensPerInterval: number;
  private interval: number;
  private minDelay: number;
  private maxQueueSize: number;
  private lastRefill: number;
  private lastRequest: number = 0;
  private queue: Array<{
    tokens: number;
    resolve: () => void;
    reject: (error: Error) => void;
    timestamp: number;
  }> = [];
  private refillTimer: number | null = null;

  constructor(config: RateLimiterConfig) {
    this.tokensPerInterval = config.tokensPerInterval;
    this.interval = config.interval;
    this.maxTokens = config.maxTokens ?? config.tokensPerInterval;
    this.minDelay = config.minDelay ?? 0;
    this.maxQueueSize = RateLimiter.DEFAULT_MAX_QUEUE_SIZE;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();

    // Start refill interval
    this.startRefillTimer();
  }

  /**
   * Wait for tokens to become available and consume them.
   * @param tokens Number of tokens to consume (default: 1)
   * @returns Promise that resolves when tokens are available
   */
  async acquire(tokens = 1): Promise<void> {
    if (tokens > this.maxTokens) {
      throw new Error(
        `Cannot acquire ${tokens} tokens, max capacity is ${this.maxTokens}`,
      );
    }

    // Enforce minimum delay between requests
    if (this.minDelay > 0) {
      const timeSinceLastRequest = Date.now() - this.lastRequest;
      if (timeSinceLastRequest < this.minDelay) {
        await this.sleep(this.minDelay - timeSinceLastRequest);
      }
    }

    // Check if tokens are immediately available
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      this.lastRequest = Date.now();
      return;
    }

    // Check if queue is full
    if (this.queue.length >= this.maxQueueSize) {
      throw new Error(
        `Rate limiter queue full (${this.queue.length} requests). Cannot acquire ${tokens} tokens.`,
      );
    }

    // Queue the request
    return new Promise<void>((resolve, reject) => {
      this.queue.push({
        tokens,
        resolve,
        reject,
        timestamp: Date.now(),
      });
    });
  }

  /**
   * Try to acquire tokens without waiting.
   * @param tokens Number of tokens to consume (default: 1)
   * @returns true if tokens were acquired, false otherwise
   */
  tryAcquire(tokens = 1): boolean {
    if (this.tokens >= tokens) {
      this.tokens -= tokens;
      this.lastRequest = Date.now();
      return true;
    }
    return false;
  }

  /**
   * Get current token count.
   */
  getTokens(): number {
    return this.tokens;
  }

  /**
   * Get number of queued requests.
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Clear the queue and reject all pending requests.
   */
  clearQueue(): void {
    const error = new Error('Rate limiter queue cleared');
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (item) {
        item.reject(error);
      }
    }
  }

  /**
   * Stop the rate limiter and clean up.
   */
  stop(): void {
    if (this.refillTimer !== null) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
    this.clearQueue();
  }

  /**
   * Reset the rate limiter to full capacity.
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }

  private startRefillTimer(): void {
    // Refill tokens at regular intervals
    this.refillTimer = setInterval(() => {
      this.refill();
    }, this.interval) as unknown as number;
  }

  private refill(): void {
    const now = Date.now();
    const timeSinceLastRefill = now - this.lastRefill;

    // Calculate how many tokens to add based on time elapsed
    const tokensToAdd = Math.floor(
      (timeSinceLastRefill / this.interval) * this.tokensPerInterval,
    );

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.tokens + tokensToAdd, this.maxTokens);
      this.lastRefill = now;

      // Process queued requests
      this.processQueue();
    }
  }

  private processQueue(): void {
    while (this.queue.length > 0) {
      const item = this.queue[0];

      if (this.tokens >= item.tokens) {
        this.queue.shift();
        this.tokens -= item.tokens;
        this.lastRequest = Date.now();
        item.resolve();
      } else {
        // Not enough tokens for next request, wait for refill
        break;
      }
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Multi-tier rate limiter for handling different rate limit scopes
 * (e.g., per-endpoint, per-account, global).
 */
export class MultiTierRateLimiter {
  private limiters = new Map<string, RateLimiter>();

  /**
   * Register a rate limiter for a specific scope.
   */
  register(scope: string, config: RateLimiterConfig): void {
    this.limiters.set(scope, new RateLimiter(config));
  }

  /**
   * Acquire tokens from multiple scopes.
   * All scopes must have available tokens before resolving.
   */
  async acquire(scopes: string[], tokens = 1): Promise<void> {
    const promises = scopes.map((scope) => {
      const limiter = this.limiters.get(scope);
      if (!limiter) {
        throw new Error(`Rate limiter not found for scope: ${scope}`);
      }
      return limiter.acquire(tokens);
    });

    await Promise.all(promises);
  }

  /**
   * Try to acquire tokens from multiple scopes without waiting.
   */
  tryAcquire(scopes: string[], tokens = 1): boolean {
    // Check if all scopes have tokens available
    for (const scope of scopes) {
      const limiter = this.limiters.get(scope);
      if (!limiter || !limiter.tryAcquire(0)) {
        return false;
      }
    }

    // Acquire from all scopes
    for (const scope of scopes) {
      const limiter = this.limiters.get(scope);
      limiter!.tryAcquire(tokens);
    }

    return true;
  }

  /**
   * Get a specific rate limiter.
   */
  getLimiter(scope: string): RateLimiter | undefined {
    return this.limiters.get(scope);
  }

  /**
   * Stop all rate limiters.
   */
  stopAll(): void {
    for (const limiter of this.limiters.values()) {
      limiter.stop();
    }
    this.limiters.clear();
  }
}

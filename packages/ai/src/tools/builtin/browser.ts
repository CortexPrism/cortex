/**
 * Browser Automation Tool (Playwright)
 *
 * Enables agents to control a headless browser for web testing, JavaScript-rendered
 * content scraping, form interaction, and accessibility snapshot generation.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { type classifyContent, requiresSupervisor } from '../../../../../src/security/classification.ts';
import { requestSupervisorDecision } from '../../../../../src/security/supervisor.ts';
import type { SensitivityLevel } from '../../../../../src/security/classification.ts';

// Lazy-loaded Playwright instance (singleton pattern)
let browser: unknown = null;

async function getBrowser() {
  if (browser !== null) {
    return browser;
  }

  try {
    const { chromium } = await import('npm:playwright');
    browser = await chromium.launch({ headless: true });
    return browser;
  } catch {
    return null;
  }
}

/**
 * Close browser instance
 */
async function closeBrowser() {
  if (browser && typeof browser === 'object' && 'close' in browser) {
    try {
      await (browser as { close(): Promise<void> }).close();
    } catch {
      // Ignore errors on close
    }
  }
  browser = null;
}

export const browserTool: Tool = {
  definition: {
    name: 'browser',
    description:
      'Headless browser automation for web testing, JS-rendered scraping, form interaction, and accessibility snapshots. Supports navigate, click, type, screenshot, and snapshot actions. Automatically supervised for sensitive data in screenshots.',
    params: [
      {
        name: 'action',
        type: 'string',
        description:
          'Action to perform: navigate, click, type, screenshot, snapshot, evaluate, wait, close',
        required: true,
        enum: [
          'navigate',
          'click',
          'type',
          'screenshot',
          'snapshot',
          'evaluate',
          'wait',
          'close',
        ],
      },
      {
        name: 'url',
        type: 'string',
        description: 'URL to navigate to (required for navigate action)',
        required: false,
      },
      {
        name: 'selector',
        type: 'string',
        description: 'CSS selector for click/type actions',
        required: false,
      },
      {
        name: 'text',
        type: 'string',
        description: 'Text to type into input (for type action)',
        required: false,
      },
      {
        name: 'script',
        type: 'string',
        description: 'JavaScript to evaluate (for evaluate action)',
        required: false,
      },
      {
        name: 'timeout',
        type: 'number',
        description: 'Timeout in milliseconds (default: 30000)',
        required: false,
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Justification for action (for audit trail)',
        required: false,
      },
    ],
    capabilities: ['network:fetch', 'computer:screenshot'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      const action = String(args.action ?? '').toLowerCase();

      // Validate action parameter early
      const validActions = [
        'navigate',
        'click',
        'type',
        'screenshot',
        'snapshot',
        'evaluate',
        'wait',
        'close',
      ];
      if (!validActions.includes(action)) {
        return {
          toolName: 'browser',
          success: false,
          output: '',
          error: `Unknown action: ${action}. Valid actions: ${validActions.join(', ')}`,
          durationMs: Date.now() - start,
        };
      }

      // Handle close action separately (doesn't need browser instance)
      if (action === 'close') {
        await closeBrowser();
        return {
          toolName: 'browser',
          success: true,
          output: 'Browser closed',
          durationMs: Date.now() - start,
        };
      }

      // Validate required parameters for each action
      if (action === 'navigate' && !String(args.url ?? '').trim()) {
        return {
          toolName: 'browser',
          success: false,
          output: '',
          error: 'url required for navigate action',
          durationMs: Date.now() - start,
        };
      }

      if (action === 'click' && !String(args.selector ?? '').trim()) {
        return {
          toolName: 'browser',
          success: false,
          output: '',
          error: 'selector required for click action',
          durationMs: Date.now() - start,
        };
      }

      if (action === 'type' && !String(args.selector ?? '').trim()) {
        return {
          toolName: 'browser',
          success: false,
          output: '',
          error: 'selector required for type action',
          durationMs: Date.now() - start,
        };
      }

      if (action === 'evaluate' && !String(args.script ?? '').trim()) {
        return {
          toolName: 'browser',
          success: false,
          output: '',
          error: 'script required for evaluate action',
          durationMs: Date.now() - start,
        };
      }

      // Get browser instance
      const browserInstance = await getBrowser();
      if (!browserInstance) {
        return {
          toolName: 'browser',
          success: false,
          output: '',
          error: 'Failed to launch browser (Playwright not available)',
          durationMs: Date.now() - start,
        };
      }

      const timeout = (args.timeout as number) ?? 30000;
      const reason = (args.reason ?? '') as string;

      // Navigate action
      if (action === 'navigate') {
        const url = String(args.url ?? '').trim();

        try {
          const context = await (
            browserInstance as {
              newContext(): Promise<{
                newPage(): Promise<
                  { goto: (url: string, opts: { timeout: number }) => Promise<void> }
                >;
              }>;
            }
          ).newContext();
          const page = await context.newPage();
          await page.goto(url, { timeout });

          return {
            toolName: 'browser',
            success: true,
            output: `Navigated to ${url}`,
            durationMs: Date.now() - start,
          };
        } catch (error) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Navigation failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Screenshot action
      if (action === 'screenshot') {
        try {
          const pages =
            await (browserInstance as { contexts(): Array<{ pages(): Array<unknown> }> })
              .contexts()
              .flatMap((c) => c.pages());

          if (pages.length === 0) {
            return {
              toolName: 'browser',
              success: false,
              output: '',
              error: 'No active page. Navigate to a URL first.',
              durationMs: Date.now() - start,
            };
          }

          const page = pages[0] as unknown;
          const screenshotBase64 =
            await (page as { screenshot: (opts: { encoding: string }) => Promise<string> })
              .screenshot({ encoding: 'base64' });

          // Classify screenshot as potentially sensitive
          const sensitivity: SensitivityLevel = 'sensitive';

          if (requiresSupervisor(sensitivity)) {
            const decision = await requestSupervisorDecision({
              tool: 'browser',
              query: `screenshot action on active page`,
              requestReason: reason || 'Web testing/scraping',
              sessionId: context.sessionId || 'unknown',
              agentId: context.agentId || 'unknown',
              dataClassification: sensitivity,
              sampleData: `PNG screenshot (${screenshotBase64.length} bytes)`,
            });

            if (!decision.allowed) {
              return {
                toolName: 'browser',
                success: false,
                output: '',
                error: `Screenshot access denied: ${decision.reason}`,
                durationMs: Date.now() - start,
              };
            }
          }

          return {
            toolName: 'browser',
            success: true,
            output: `data:image/png;base64,${screenshotBase64}`,
            durationMs: Date.now() - start,
          };
        } catch (error) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Screenshot failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Snapshot action (accessibility tree)
      if (action === 'snapshot') {
        try {
          const pages =
            await (browserInstance as { contexts(): Array<{ pages(): Array<unknown> }> })
              .contexts()
              .flatMap((c) => c.pages());

          if (pages.length === 0) {
            return {
              toolName: 'browser',
              success: false,
              output: '',
              error: 'No active page. Navigate to a URL first.',
              durationMs: Date.now() - start,
            };
          }

          const page = pages[0] as unknown;
          const snapshot =
            await (page as { accessibility: { snapshot: () => Promise<string | unknown> } })
              .accessibility.snapshot();

          return {
            toolName: 'browser',
            success: true,
            output: JSON.stringify(snapshot, null, 2),
            durationMs: Date.now() - start,
          };
        } catch (error) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Snapshot failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Click action
      if (action === 'click') {
        const selector = String(args.selector ?? '').trim();

        try {
          const pages =
            await (browserInstance as { contexts(): Array<{ pages(): Array<unknown> }> })
              .contexts()
              .flatMap((c) => c.pages());

          if (pages.length === 0) {
            return {
              toolName: 'browser',
              success: false,
              output: '',
              error: 'No active page',
              durationMs: Date.now() - start,
            };
          }

          const page = pages[0] as unknown;
          await (page as { click: (selector: string, opts: { timeout: number }) => Promise<void> })
            .click(
              selector,
              { timeout },
            );

          return {
            toolName: 'browser',
            success: true,
            output: `Clicked element: ${selector}`,
            durationMs: Date.now() - start,
          };
        } catch (error) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Click failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Type action
      if (action === 'type') {
        const selector = String(args.selector ?? '').trim();
        const text = String(args.text ?? '');

        try {
          const pages =
            await (browserInstance as { contexts(): Array<{ pages(): Array<unknown> }> })
              .contexts()
              .flatMap((c) => c.pages());

          if (pages.length === 0) {
            return {
              toolName: 'browser',
              success: false,
              output: '',
              error: 'No active page',
              durationMs: Date.now() - start,
            };
          }

          const page = pages[0] as unknown;
          await (page as {
            type: (selector: string, text: string, opts: { timeout: number }) => Promise<void>;
          }).type(
            selector,
            text,
            { timeout },
          );

          return {
            toolName: 'browser',
            success: true,
            output: `Typed text into ${selector}`,
            durationMs: Date.now() - start,
          };
        } catch (error) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Type failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Evaluate action (run JavaScript)
      if (action === 'evaluate') {
        const script = String(args.script ?? '').trim();

        // Require supervisor approval for evaluate (arbitrary JavaScript)
        const decision = await requestSupervisorDecision({
          tool: 'browser',
          query: `evaluate: ${script.substring(0, 100)}${script.length > 100 ? '...' : ''}`,
          requestReason: reason || 'JavaScript execution for testing',
          sessionId: context.sessionId || 'unknown',
          agentId: context.agentId || 'unknown',
          dataClassification: 'sensitive',
          sampleData: `JavaScript: ${script.substring(0, 200)}`,
        });

        if (!decision.allowed) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Evaluate access denied: ${decision.reason}`,
            durationMs: Date.now() - start,
          };
        }

        try {
          const pages =
            await (browserInstance as { contexts(): Array<{ pages(): Array<unknown> }> })
              .contexts()
              .flatMap((c) => c.pages());

          if (pages.length === 0) {
            return {
              toolName: 'browser',
              success: false,
              output: '',
              error: 'No active page',
              durationMs: Date.now() - start,
            };
          }

          const page = pages[0] as unknown;
          const result = await (page as { evaluate: (fn: () => unknown) => Promise<unknown> })
            .evaluate(() => eval(script));

          return {
            toolName: 'browser',
            success: true,
            output: JSON.stringify(result, null, 2),
            durationMs: Date.now() - start,
          };
        } catch (error) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Evaluate failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Wait action
      if (action === 'wait') {
        const selector = String(args.selector ?? '').trim();

        try {
          const pages =
            await (browserInstance as { contexts(): Array<{ pages(): Array<unknown> }> })
              .contexts()
              .flatMap((c) => c.pages());

          if (pages.length === 0) {
            return {
              toolName: 'browser',
              success: false,
              output: '',
              error: 'No active page',
              durationMs: Date.now() - start,
            };
          }

          const page = pages[0] as unknown;

          if (selector) {
            await (page as {
              waitForSelector: (selector: string, opts: { timeout: number }) => Promise<void>;
            })
              .waitForSelector(selector, { timeout });
          } else {
            // Wait without selector just waits the timeout
            await new Promise((resolve) => setTimeout(resolve, Math.min(timeout, 5000)));
          }

          return {
            toolName: 'browser',
            success: true,
            output: `Wait complete${selector ? ` for selector: ${selector}` : ''}`,
            durationMs: Date.now() - start,
          };
        } catch (error) {
          return {
            toolName: 'browser',
            success: false,
            output: '',
            error: `Wait failed: ${error instanceof Error ? error.message : String(error)}`,
            durationMs: Date.now() - start,
          };
        }
      }

      return {
        toolName: 'browser',
        success: false,
        output: '',
        error: `Unknown action: ${action}`,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'browser',
        success: false,
        output: '',
        error: `Browser action failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default browserTool;

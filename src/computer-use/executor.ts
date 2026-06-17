/**
 * Computer Use Action Executor
 *
 * Coordinates display management, screenshot capture, mouse control,
 * and keyboard input to execute computer use actions.
 */

import type { ComputerActionRequest, ComputerActionResult, ComputerUseConfig } from './types.ts';
import { getVirtualDisplay, type VirtualDisplay } from './display.ts';
import { captureScreenshot } from './screenshot.ts';
import { createMouseController, type MouseController } from './mouse.ts';
import { createKeyboardController, type KeyboardController } from './keyboard.ts';
import { PATHS } from '../config/paths.ts';
import { join } from '@std/path';

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_SCROLL_AMOUNT = 3;

/**
 * Computer Use Executor
 *
 * Manages a virtual display and provides methods to execute
 * computer use actions.
 */
export class ComputerUseExecutor {
  private display?: VirtualDisplay;
  private mouse?: MouseController;
  private keyboard?: KeyboardController;
  private config: ComputerUseConfig;
  private screenshotDir: string;

  constructor(config: ComputerUseConfig) {
    this.config = config;
    // Default screenshot directory in data/screenshots
    this.screenshotDir = config.screenshot_dir ??
      join(PATHS.dataDir, 'screenshots');
  }

  /**
   * Initialize the executor (start display, create controllers)
   */
  async initialize(): Promise<void> {
    // Ensure screenshot directory exists
    try {
      await Deno.mkdir(this.screenshotDir, { recursive: true });
    } catch {
      // Directory might already exist
    }

    // Start virtual display
    this.display = await getVirtualDisplay(this.config);

    const displayString = this.display.getDisplayString();

    // Create controllers
    this.mouse = createMouseController(displayString);
    this.keyboard = createKeyboardController(displayString);
  }

  /**
   * Execute a computer use action
   */
  async execute(action: ComputerActionRequest): Promise<ComputerActionResult> {
    if (!this.display || !this.mouse || !this.keyboard) {
      return {
        success: false,
        error: 'Executor not initialized. Call initialize() first.',
      };
    }

    const timeout = this.config.action_timeout_ms ?? DEFAULT_TIMEOUT_MS;

    try {
      // Execute action with timeout
      const result = await Promise.race([
        this.executeAction(action),
        this.timeoutPromise(timeout),
      ]);

      return result as ComputerActionResult;
    } catch (err) {
      return {
        success: false,
        error: (err as Error).message,
      };
    }
  }

  /**
   * Execute the specific action
   */
  private async executeAction(action: ComputerActionRequest): Promise<ComputerActionResult> {
    const displayString = this.display!.getDisplayString();

    switch (action.action) {
      case 'screenshot': {
        const saveScreenshots = this.config.save_screenshots ?? true;
        let screenshot: string | undefined;
        let screenshotPath: string | undefined;

        if (saveScreenshots) {
          // Save to file
          const filename = `screenshot_${Date.now()}.${this.config.screenshot_format ?? 'png'}`;
          screenshotPath = join(this.screenshotDir, filename);

          await captureScreenshot({
            display: displayString,
            format: this.config.screenshot_format,
            quality: this.config.screenshot_quality,
            savePath: screenshotPath,
          });
        } else {
          // Return base64
          screenshot = await captureScreenshot({
            display: displayString,
            format: this.config.screenshot_format,
            quality: this.config.screenshot_quality,
          });
        }

        const position = await this.mouse!.getPosition();

        return {
          success: true,
          screenshot,
          screenshot_path: screenshotPath,
          cursor_position: position,
          display_info: this.display!.getDisplayInfo(),
        };
      }

      case 'left_click': {
        const [x, y] = action.coordinate ?? [0, 0];
        await this.mouse!.click('left', x, y);
        return { success: true };
      }

      case 'right_click': {
        const [x, y] = action.coordinate ?? [0, 0];
        await this.mouse!.click('right', x, y);
        return { success: true };
      }

      case 'middle_click': {
        const [x, y] = action.coordinate ?? [0, 0];
        await this.mouse!.click('middle', x, y);
        return { success: true };
      }

      case 'double_click': {
        const coords = action.coordinate;
        if (coords) {
          await this.mouse!.doubleClick(coords[0], coords[1]);
        } else {
          await this.mouse!.doubleClick();
        }
        return { success: true };
      }

      case 'triple_click': {
        const coords = action.coordinate;
        if (coords) {
          await this.mouse!.tripleClick(coords[0], coords[1]);
        } else {
          await this.mouse!.tripleClick();
        }
        return { success: true };
      }

      case 'mouse_move': {
        if (!action.coordinate) {
          return { success: false, error: 'mouse_move requires coordinate' };
        }
        const [x, y] = action.coordinate;
        await this.mouse!.move(x, y);
        return { success: true };
      }

      case 'left_click_drag': {
        if (!action.coordinate || !action.drag_to) {
          return {
            success: false,
            error: 'left_click_drag requires coordinate and drag_to',
          };
        }
        await this.mouse!.drag(action.coordinate, action.drag_to);
        return { success: true };
      }

      case 'left_mouse_down': {
        await this.mouse!.mouseDown('left');
        return { success: true };
      }

      case 'left_mouse_up': {
        await this.mouse!.mouseUp('left');
        return { success: true };
      }

      case 'type': {
        if (!action.text) {
          return { success: false, error: 'type action requires text' };
        }
        await this.keyboard!.type(action.text);
        return { success: true };
      }

      case 'key': {
        if (!action.text) {
          return { success: false, error: 'key action requires text (key name)' };
        }
        await this.keyboard!.press(action.text);
        return { success: true };
      }

      case 'hold_key': {
        if (!action.text) {
          return { success: false, error: 'hold_key requires text (key name)' };
        }
        const duration = action.duration ?? 1.0;
        await this.keyboard!.hold(action.text, duration);
        return { success: true };
      }

      case 'scroll': {
        if (!action.scroll_direction) {
          return { success: false, error: 'scroll action requires scroll_direction' };
        }
        const amount = action.scroll_amount ?? DEFAULT_SCROLL_AMOUNT;
        await this.mouse!.scroll(action.scroll_direction, amount);
        return { success: true };
      }

      case 'wait': {
        const duration = action.duration ?? 1.0;
        await new Promise((resolve) => setTimeout(resolve, duration * 1000));
        return { success: true };
      }

      default:
        return {
          success: false,
          error: `Unknown action: ${action.action}`,
        };
    }
  }

  /**
   * Create a timeout promise that rejects after the specified duration
   */
  private timeoutPromise(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Action timed out after ${ms}ms`));
      }, ms);
    });
  }

  /**
   * Shutdown the executor (stop display)
   */
  async shutdown(): Promise<void> {
    if (this.display) {
      await this.display.stop();
      this.display = undefined;
    }
    this.mouse = undefined;
    this.keyboard = undefined;
  }
}

/**
 * Execute a single computer action with automatic setup and teardown
 *
 * For one-off actions. For multiple actions, create a ComputerUseExecutor
 * instance and reuse it.
 */
export async function executeComputerAction(
  action: ComputerActionRequest,
  config: ComputerUseConfig,
): Promise<ComputerActionResult> {
  const executor = new ComputerUseExecutor(config);

  try {
    await executor.initialize();
    return await executor.execute(action);
  } finally {
    await executor.shutdown();
  }
}

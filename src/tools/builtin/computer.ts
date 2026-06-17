/**
 * Computer Use Tool
 *
 * Enables AI agents to interact with graphical user interfaces through
 * screenshots, mouse control, and keyboard input.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import type {
  ComputerAction,
  ComputerActionRequest,
  ComputerUseConfig,
} from '../../computer-use/types.ts';
import { executeComputerAction } from '../../computer-use/executor.ts';
import { isComputerUseAvailable } from '../../computer-use/display.ts';
import { loadConfig } from '../../config/config.ts';

const DEFAULT_CONFIG: ComputerUseConfig = {
  display_width: 1024,
  display_height: 768,
  runtime: 'native',
  enable_scaling: false,
  screenshot_format: 'png',
  screenshot_quality: 85,
  action_timeout_ms: 5000,
  save_screenshots: true, // Save to disk to avoid truncation issues
};

/**
 * Get computer use configuration
 *
 * Loads configuration from the global config file, falling back to defaults.
 */
async function getComputerUseConfig(_context: ToolContext): Promise<ComputerUseConfig> {
  try {
    const config = await loadConfig();
    const cu = config.computerUse;

    if (!cu || !cu.enabled) {
      return DEFAULT_CONFIG;
    }

    return {
      display_width: cu.displayWidth ?? DEFAULT_CONFIG.display_width,
      display_height: cu.displayHeight ?? DEFAULT_CONFIG.display_height,
      runtime: cu.runtime ?? DEFAULT_CONFIG.runtime,
      docker_image: cu.dockerImage,
      enable_scaling: DEFAULT_CONFIG.enable_scaling,
      screenshot_format: cu.screenshotFormat ?? DEFAULT_CONFIG.screenshot_format,
      screenshot_quality: cu.screenshotQuality ?? DEFAULT_CONFIG.screenshot_quality,
      action_timeout_ms: cu.actionTimeoutMs ?? DEFAULT_CONFIG.action_timeout_ms,
      save_screenshots: true,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export const computerTool: Tool = {
  definition: {
    name: 'computer',
    description: `
Interact with a desktop environment through screenshots, mouse, and keyboard.

IMPORTANT CONSTRAINTS:
- Coordinates are in pixels: [x, y] where (0,0) is top-left
- Display resolution: ${DEFAULT_CONFIG.display_width}x${DEFAULT_CONFIG.display_height}
- Always take a screenshot first to see the current state
- Wait briefly after actions before checking results
- Use keyboard shortcuts when available (faster than mouse)

SECURITY:
- Requires user approval for each action
- Cannot access host filesystem directly (use file_read/file_write tools)
- Runs in isolated virtual display environment

AVAILABLE ACTIONS:
- screenshot: Capture current display state
- left_click: Click at coordinates [x, y]
- right_click: Right-click at coordinates
- middle_click: Middle-click at coordinates
- double_click: Double-click at coordinates
- triple_click: Triple-click at coordinates (useful for selecting lines)
- mouse_move: Move cursor to coordinates
- left_click_drag: Click and drag from coordinate to drag_to
- left_mouse_down / left_mouse_up: Fine-grained click control
- type: Type text string
- key: Press key or key combination (e.g., "ctrl+s", "Return", "Escape")
- hold_key: Hold down a key for specified duration
- scroll: Scroll with direction and amount control
- wait: Pause between actions (duration in seconds)

COMMON KEY NAMES:
- Modifiers: ctrl, alt, shift, super (Win/Cmd key)
- Special: Return, Escape, Tab, Backspace, Delete, Space
- Arrow keys: Up, Down, Left, Right
- Function keys: F1-F12
- Examples: "ctrl+c", "alt+tab", "shift+Return"
    `.trim(),
    capabilities: ['computer:control'],
    params: [
      {
        name: 'action',
        type: 'string',
        description: 'Action to perform',
        required: true,
        enum: [
          'screenshot',
          'left_click',
          'right_click',
          'middle_click',
          'double_click',
          'triple_click',
          'mouse_move',
          'left_click_drag',
          'left_mouse_down',
          'left_mouse_up',
          'type',
          'key',
          'hold_key',
          'scroll',
          'wait',
        ],
      },
      {
        name: 'coordinate',
        type: 'array',
        description: 'Pixel coordinates [x, y] for click/move actions',
        required: false,
      },
      {
        name: 'text',
        type: 'string',
        description: 'Text to type (for type action) or key name (for key action)',
        required: false,
      },
      {
        name: 'scroll_direction',
        type: 'string',
        description: 'Scroll direction: up, down, left, right',
        required: false,
        enum: ['up', 'down', 'left', 'right'],
      },
      {
        name: 'scroll_amount',
        type: 'number',
        description: 'Number of scroll units (default: 3)',
        required: false,
      },
      {
        name: 'drag_to',
        type: 'array',
        description: 'End coordinates [x, y] for drag action',
        required: false,
      },
      {
        name: 'duration',
        type: 'number',
        description: 'Duration in seconds for hold_key or wait actions',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();

    // Check if computer use is enabled in configuration
    const configData = await loadConfig();
    if (!configData.computerUse?.enabled) {
      return {
        toolName: 'computer',
        success: false,
        output: '',
        error: 'Computer use is disabled. Enable it in Settings → Computer Use.',
        durationMs: Date.now() - start,
      };
    }

    // Check if computer use is available on this system
    const available = await isComputerUseAvailable();
    if (!available) {
      return {
        toolName: 'computer',
        success: false,
        output: '',
        error:
          'Computer use not available. Install required dependencies: apt-get install xvfb xdotool scrot (Debian/Ubuntu)',
        durationMs: Date.now() - start,
      };
    }

    const action = String(args.action ?? 'unknown');

    // Approval gate for computer use
    if (context.approvalGate) {
      let preview = `Computer use: ${action}`;

      // Add more context for certain actions
      if (action === 'type' && args.text) {
        const text = String(args.text);
        // Truncate long text for preview
        const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
        preview += ` "${truncated}"`;
      } else if (action === 'key' && args.text) {
        preview += ` ${args.text}`;
      } else if (args.coordinate) {
        const coord = args.coordinate as [number, number];
        preview += ` at [${coord[0]}, ${coord[1]}]`;
      }

      const approved = await context.approvalGate('computer', preview);
      if (!approved) {
        return {
          toolName: 'computer',
          success: false,
          output: '',
          error: `User denied computer use action: ${action}`,
          durationMs: Date.now() - start,
        };
      }
    }

    // Build action request
    const actionRequest: ComputerActionRequest = {
      action: args.action as ComputerAction,
      coordinate: args.coordinate as [number, number] | undefined,
      text: args.text as string | undefined,
      scroll_direction: args.scroll_direction as 'up' | 'down' | 'left' | 'right' | undefined,
      scroll_amount: args.scroll_amount as number | undefined,
      drag_to: args.drag_to as [number, number] | undefined,
      duration: args.duration as number | undefined,
    };

    // Get config
    const config = await getComputerUseConfig(context);

    try {
      const result = await executeComputerAction(actionRequest, config);

      if (!result.success) {
        return {
          toolName: 'computer',
          success: false,
          output: '',
          error: result.error ?? 'Computer action failed',
          durationMs: Date.now() - start,
        };
      }

      // Format output
      let output = `Action "${action}" completed successfully.`;

      if (result.screenshot_path) {
        output += `\nScreenshot saved to: ${result.screenshot_path}`;
      } else if (result.screenshot) {
        // If returned as base64 (shouldn't happen with save_screenshots=true, but just in case)
        output += `\nScreenshot captured (${result.screenshot.length} bytes base64)`;
      }

      if (result.cursor_position) {
        output += `\nCursor position: [${result.cursor_position[0]}, ${result.cursor_position[1]}]`;
      }

      if (result.display_info) {
        output += `\nDisplay: ${result.display_info.width}x${result.display_info.height}`;
      }

      return {
        toolName: 'computer',
        success: true,
        output,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        toolName: 'computer',
        success: false,
        output: '',
        error: (err as Error).message,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default computerTool;

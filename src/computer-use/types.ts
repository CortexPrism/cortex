/**
 * Computer Use Types
 *
 * Type definitions for computer use functionality - enables AI agents
 * to interact with graphical user interfaces through screenshots,
 * mouse control, and keyboard input.
 */

export type ComputerAction =
  | 'screenshot'
  | 'left_click'
  | 'right_click'
  | 'middle_click'
  | 'double_click'
  | 'triple_click'
  | 'mouse_move'
  | 'left_click_drag'
  | 'left_mouse_down'
  | 'left_mouse_up'
  | 'type'
  | 'key'
  | 'hold_key'
  | 'scroll'
  | 'wait';

export interface ComputerActionRequest {
  action: ComputerAction;
  coordinate?: [number, number]; // For click/move actions
  text?: string; // For type/key actions
  scroll_direction?: 'up' | 'down' | 'left' | 'right';
  scroll_amount?: number; // Number of scroll units
  drag_to?: [number, number]; // For drag actions
  duration?: number; // For hold_key and wait (seconds)
}

export interface ComputerActionResult {
  success: boolean;
  screenshot?: string; // Base64-encoded PNG
  screenshot_path?: string; // Path to saved screenshot file
  error?: string;
  cursor_position?: [number, number];
  display_info?: DisplayInfo;
}

export interface DisplayInfo {
  width: number;
  height: number;
  display_number: number;
  scale: number;
}

export interface ComputerUseConfig {
  display_width: number;
  display_height: number;
  display_number?: number;
  runtime: 'native' | 'docker';
  docker_image?: string;
  enable_scaling: boolean;
  screenshot_format?: 'png' | 'jpeg';
  screenshot_quality?: number; // For JPEG
  action_timeout_ms?: number;
  save_screenshots?: boolean; // Save screenshots to disk instead of returning inline
  screenshot_dir?: string; // Directory to save screenshots
}

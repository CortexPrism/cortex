/**
 * Display Management
 *
 * Manages virtual X11 displays using Xvfb for computer use operations.
 * Handles starting, stopping, and querying virtual displays.
 */

import type { ComputerUseConfig, DisplayInfo } from './types.ts';

const DISPLAY_ALLOCATIONS = new Map<number, boolean>();
const MIN_DISPLAY_NUM = 99;
const MAX_DISPLAY_NUM = 999;

/**
 * Check if Xvfb is available on the system
 */
export async function isXvfbAvailable(): Promise<boolean> {
  try {
    const cmd = new Deno.Command('which', {
      args: ['Xvfb'],
      stdout: 'null',
      stderr: 'null',
    });
    const { code } = await cmd.output();
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Check if xdotool is available (required for mouse/keyboard control)
 */
export async function isXdotoolAvailable(): Promise<boolean> {
  try {
    const cmd = new Deno.Command('which', {
      args: ['xdotool'],
      stdout: 'null',
      stderr: 'null',
    });
    const { code } = await cmd.output();
    return code === 0;
  } catch {
    return false;
  }
}

/**
 * Allocate a free display number
 */
function allocateDisplayNumber(): number {
  for (let num = MIN_DISPLAY_NUM; num <= MAX_DISPLAY_NUM; num++) {
    if (!DISPLAY_ALLOCATIONS.get(num)) {
      DISPLAY_ALLOCATIONS.set(num, true);
      return num;
    }
  }
  throw new Error('No available display numbers');
}

/**
 * Free a display number
 */
function freeDisplayNumber(num: number): void {
  DISPLAY_ALLOCATIONS.delete(num);
}

/**
 * Check if a display is currently running
 */
async function isDisplayRunning(displayNum: number): Promise<boolean> {
  try {
    const lockFile = `/tmp/.X${displayNum}-lock`;
    try {
      await Deno.stat(lockFile);
      return true;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

export class VirtualDisplay {
  private displayNumber: number;
  private width: number;
  private height: number;
  private xvfbProcess?: Deno.ChildProcess;
  private isStarted = false;

  constructor(config: { width: number; height: number; displayNumber?: number }) {
    this.width = config.width;
    this.height = config.height;
    this.displayNumber = config.displayNumber ?? allocateDisplayNumber();
  }

  /**
   * Start the virtual display
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    // Check if display is already running
    if (await isDisplayRunning(this.displayNumber)) {
      console.warn(`Display :${this.displayNumber} already running, reusing`);
      this.isStarted = true;
      return;
    }

    const available = await isXvfbAvailable();
    if (!available) {
      throw new Error(
        'Xvfb not found. Install with: apt-get install xvfb (Debian/Ubuntu) or dnf install xorg-x11-server-Xvfb (Fedora/RHEL)',
      );
    }

    try {
      // Start Xvfb: Xvfb :99 -screen 0 1024x768x24 -ac +extension GLX +render -noreset
      const cmd = new Deno.Command('Xvfb', {
        args: [
          `:${this.displayNumber}`,
          '-screen',
          '0',
          `${this.width}x${this.height}x24`,
          '-ac', // disable access control
          '+extension',
          'GLX',
          '+render',
          '-noreset',
        ],
        stdout: 'null',
        stderr: 'piped',
      });

      this.xvfbProcess = cmd.spawn();

      // Wait a bit for Xvfb to start
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Verify it's running
      if (!(await isDisplayRunning(this.displayNumber))) {
        throw new Error(`Failed to start Xvfb on display :${this.displayNumber}`);
      }

      this.isStarted = true;
    } catch (err) {
      freeDisplayNumber(this.displayNumber);
      throw new Error(`Failed to start virtual display: ${(err as Error).message}`);
    }
  }

  /**
   * Stop the virtual display
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    try {
      if (this.xvfbProcess) {
        this.xvfbProcess.kill('SIGTERM');
        // Give it time to shut down gracefully
        await new Promise((resolve) => setTimeout(resolve, 500));
        try {
          this.xvfbProcess.kill('SIGKILL');
        } catch {
          // Already dead
        }
        this.xvfbProcess = undefined;
      }

      // Clean up lock file if it exists
      try {
        await Deno.remove(`/tmp/.X${this.displayNumber}-lock`);
      } catch {
        // Ignore
      }
    } finally {
      freeDisplayNumber(this.displayNumber);
      this.isStarted = false;
    }
  }

  /**
   * Check if display is running
   */
  async isRunning(): Promise<boolean> {
    return this.isStarted && await isDisplayRunning(this.displayNumber);
  }

  /**
   * Get the display number
   */
  getDisplayNumber(): number {
    return this.displayNumber;
  }

  /**
   * Get the DISPLAY environment variable value
   */
  getDisplayString(): string {
    return `:${this.displayNumber}`;
  }

  /**
   * Get display info
   */
  getDisplayInfo(): DisplayInfo {
    return {
      width: this.width,
      height: this.height,
      display_number: this.displayNumber,
      scale: 1.0,
    };
  }
}

/**
 * Get or create a virtual display based on configuration
 */
export async function getVirtualDisplay(config: ComputerUseConfig): Promise<VirtualDisplay> {
  const display = new VirtualDisplay({
    width: config.display_width,
    height: config.display_height,
    displayNumber: config.display_number,
  });

  await display.start();
  return display;
}

/**
 * Check if all required tools for computer use are available
 */
export async function isComputerUseAvailable(): Promise<boolean> {
  const [xvfb, xdotool] = await Promise.all([
    isXvfbAvailable(),
    isXdotoolAvailable(),
  ]);

  return xvfb && xdotool;
}

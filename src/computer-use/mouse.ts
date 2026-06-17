/**
 * Mouse Control
 *
 * Provides mouse control functionality using xdotool.
 * Supports moving, clicking, dragging, and scrolling operations.
 */

export interface MouseController {
  move(x: number, y: number): Promise<void>;
  click(button: 'left' | 'right' | 'middle', x?: number, y?: number): Promise<void>;
  doubleClick(x?: number, y?: number): Promise<void>;
  tripleClick(x?: number, y?: number): Promise<void>;
  mouseDown(button: 'left' | 'right' | 'middle'): Promise<void>;
  mouseUp(button: 'left' | 'right' | 'middle'): Promise<void>;
  drag(from: [number, number], to: [number, number]): Promise<void>;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void>;
  getPosition(): Promise<[number, number]>;
}

/**
 * Convert button name to xdotool button number
 */
function buttonToNumber(button: 'left' | 'right' | 'middle'): number {
  switch (button) {
    case 'left':
      return 1;
    case 'middle':
      return 2;
    case 'right':
      return 3;
  }
}

/**
 * Convert scroll direction to xdotool button number
 */
function scrollToButton(direction: 'up' | 'down' | 'left' | 'right'): number {
  switch (direction) {
    case 'up':
      return 4;
    case 'down':
      return 5;
    case 'left':
      return 6;
    case 'right':
      return 7;
  }
}

/**
 * Execute xdotool command
 */
async function execXdotool(display: string, args: string[]): Promise<string> {
  const cmd = new Deno.Command('xdotool', {
    args,
    env: { DISPLAY: display },
    stdout: 'piped',
    stderr: 'piped',
  });

  const { code, stdout, stderr } = await cmd.output();

  if (code !== 0) {
    const error = new TextDecoder().decode(stderr);
    throw new Error(`xdotool command failed: ${error}`);
  }

  return new TextDecoder().decode(stdout).trim();
}

class XdotoolMouseController implements MouseController {
  constructor(private display: string) {}

  async move(x: number, y: number): Promise<void> {
    await execXdotool(this.display, ['mousemove', x.toString(), y.toString()]);
  }

  async click(button: 'left' | 'right' | 'middle', x?: number, y?: number): Promise<void> {
    const buttonNum = buttonToNumber(button);
    const args = ['click', buttonNum.toString()];

    if (x !== undefined && y !== undefined) {
      // xdotool click with coordinates: click --coord x y button
      args.splice(1, 0, x.toString(), y.toString());
    }

    await execXdotool(this.display, args);
  }

  async doubleClick(x?: number, y?: number): Promise<void> {
    if (x !== undefined && y !== undefined) {
      await this.move(x, y);
    }
    await execXdotool(this.display, ['click', '--repeat', '2', '1']);
  }

  async tripleClick(x?: number, y?: number): Promise<void> {
    if (x !== undefined && y !== undefined) {
      await this.move(x, y);
    }
    await execXdotool(this.display, ['click', '--repeat', '3', '1']);
  }

  async mouseDown(button: 'left' | 'right' | 'middle'): Promise<void> {
    const buttonNum = buttonToNumber(button);
    await execXdotool(this.display, ['mousedown', buttonNum.toString()]);
  }

  async mouseUp(button: 'left' | 'right' | 'middle'): Promise<void> {
    const buttonNum = buttonToNumber(button);
    await execXdotool(this.display, ['mouseup', buttonNum.toString()]);
  }

  async drag(from: [number, number], to: [number, number]): Promise<void> {
    // Move to start position
    await this.move(from[0], from[1]);
    // Mouse down
    await this.mouseDown('left');
    // Small delay to ensure drag is registered
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Move to end position (this creates the drag)
    await this.move(to[0], to[1]);
    // Mouse up
    await this.mouseUp('left');
  }

  async scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<void> {
    const buttonNum = scrollToButton(direction);
    // Scroll by clicking the scroll button multiple times
    for (let i = 0; i < amount; i++) {
      await execXdotool(this.display, ['click', buttonNum.toString()]);
      // Small delay between scroll events
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async getPosition(): Promise<[number, number]> {
    const output = await execXdotool(this.display, ['getmouselocation', '--shell']);
    // Output format: X=123\nY=456\nSCREEN=0\nWINDOW=12345
    const lines = output.split('\n');
    const xLine = lines.find((line) => line.startsWith('X='));
    const yLine = lines.find((line) => line.startsWith('Y='));

    if (!xLine || !yLine) {
      throw new Error('Failed to parse mouse position');
    }

    const x = parseInt(xLine.split('=')[1], 10);
    const y = parseInt(yLine.split('=')[1], 10);

    return [x, y];
  }
}

/**
 * Create a mouse controller for the specified display
 */
export function createMouseController(display: string): MouseController {
  return new XdotoolMouseController(display);
}

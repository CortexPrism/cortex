import { assertEquals, assertExists } from '@std/assert';
import {
  isXdotoolAvailable,
  isXvfbAvailable,
  VirtualDisplay,
} from '../../src/computer-use/display.ts';

Deno.test('Computer Use - Display - Check Xvfb availability', async () => {
  const available = await isXvfbAvailable();
  // This test will pass or fail depending on whether Xvfb is installed
  // In CI without Xvfb, this will be false
  console.log(`Xvfb available: ${available}`);
});

Deno.test('Computer Use - Display - Check xdotool availability', async () => {
  const available = await isXdotoolAvailable();
  // This test will pass or fail depending on whether xdotool is installed
  console.log(`xdotool available: ${available}`);
});

Deno.test({
  name: 'Computer Use - Display - Start and stop virtual display',
  ignore: !(await isXvfbAvailable()), // Skip if Xvfb not available
  fn: async () => {
    const display = new VirtualDisplay({
      width: 800,
      height: 600,
    });

    try {
      await display.start();

      const displayNum = display.getDisplayNumber();
      assertExists(displayNum);
      assertEquals(typeof displayNum, 'number');

      const displayStr = display.getDisplayString();
      assertExists(displayStr);
      assertEquals(displayStr.startsWith(':'), true);

      const isRunning = await display.isRunning();
      assertEquals(isRunning, true);

      const info = display.getDisplayInfo();
      assertEquals(info.width, 800);
      assertEquals(info.height, 600);
    } finally {
      await display.stop();
    }
  },
});

Deno.test({
  name: 'Computer Use - Display - Multiple displays with different numbers',
  ignore: !(await isXvfbAvailable()),
  fn: async () => {
    const display1 = new VirtualDisplay({
      width: 1024,
      height: 768,
    });

    const display2 = new VirtualDisplay({
      width: 800,
      height: 600,
    });

    try {
      await display1.start();
      await display2.start();

      const num1 = display1.getDisplayNumber();
      const num2 = display2.getDisplayNumber();

      // Display numbers should be different
      assertEquals(num1 !== num2, true);
    } finally {
      await display1.stop();
      await display2.stop();
    }
  },
});

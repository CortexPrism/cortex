/**
 * Screenshot Capture
 *
 * Captures screenshots from X11 displays using various tools (scrot, ImageMagick, xwd).
 * Supports PNG and JPEG formats with optional quality settings.
 */

import { encodeBase64 } from '@std/encoding/base64';

export interface ScreenshotOptions {
  display: string; // DISPLAY environment variable value (e.g., ":99")
  format?: 'png' | 'jpeg';
  quality?: number; // For JPEG (1-100)
  savePath?: string; // If provided, save to this path instead of returning base64
}

export type ScreenshotTool = 'scrot' | 'import' | 'xwd' | null;

/**
 * Check which screenshot tool is available
 */
export async function getAvailableScreenshotTool(): Promise<ScreenshotTool> {
  const tools: Array<'scrot' | 'import' | 'xwd'> = ['scrot', 'import', 'xwd'];

  for (const tool of tools) {
    try {
      const cmd = new Deno.Command('which', {
        args: [tool],
        stdout: 'null',
        stderr: 'null',
      });
      const { code } = await cmd.output();
      if (code === 0) {
        return tool;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Capture screenshot using scrot
 */
async function captureWithScrot(
  display: string,
  format: 'png' | 'jpeg',
  quality: number,
  outputPath: string,
): Promise<void> {
  const args = [outputPath];

  if (format === 'jpeg') {
    args.push('--quality', quality.toString());
  }

  const cmd = new Deno.Command('scrot', {
    args,
    env: { DISPLAY: display },
    stdout: 'null',
    stderr: 'piped',
  });

  const { code, stderr } = await cmd.output();

  if (code !== 0) {
    const error = new TextDecoder().decode(stderr);
    throw new Error(`scrot failed: ${error}`);
  }
}

/**
 * Capture screenshot using ImageMagick's import command
 */
async function captureWithImport(
  display: string,
  format: 'png' | 'jpeg',
  quality: number,
  outputPath: string,
): Promise<void> {
  const args = ['-window', 'root'];

  if (format === 'jpeg') {
    args.push('-quality', quality.toString());
  }

  args.push(outputPath);

  const cmd = new Deno.Command('import', {
    args,
    env: { DISPLAY: display },
    stdout: 'null',
    stderr: 'piped',
  });

  const { code, stderr } = await cmd.output();

  if (code !== 0) {
    const error = new TextDecoder().decode(stderr);
    throw new Error(`import failed: ${error}`);
  }
}

/**
 * Capture screenshot using xwd and convert to PNG/JPEG
 */
async function captureWithXwd(
  display: string,
  format: 'png' | 'jpeg',
  quality: number,
  outputPath: string,
): Promise<void> {
  // xwd outputs to stdout, so we need to pipe it
  const xwdCmd = new Deno.Command('xwd', {
    args: ['-root', '-display', display],
    stdout: 'piped',
    stderr: 'piped',
  });

  const xwdProc = xwdCmd.spawn();
  const xwdOutput = await xwdProc.output();

  if (xwdOutput.code !== 0) {
    const error = new TextDecoder().decode(xwdOutput.stderr);
    throw new Error(`xwd failed: ${error}`);
  }

  // Convert xwd to the desired format using ImageMagick's convert
  const convertArgs = ['xwd:-'];

  if (format === 'jpeg') {
    convertArgs.push('-quality', quality.toString());
  }

  convertArgs.push(outputPath);

  const convertCmd = new Deno.Command('convert', {
    args: convertArgs,
    stdin: 'piped',
    stdout: 'null',
    stderr: 'piped',
  });

  const convertProc = convertCmd.spawn();

  // Write xwd output to convert's stdin
  const writer = convertProc.stdin.getWriter();
  await writer.write(xwdOutput.stdout);
  await writer.close();

  const convertOutput = await convertProc.output();

  if (convertOutput.code !== 0) {
    const error = new TextDecoder().decode(convertOutput.stderr);
    throw new Error(`convert failed: ${error}`);
  }
}

/**
 * Capture a screenshot from the specified display
 *
 * @param options Screenshot options including display, format, and quality
 * @returns Base64-encoded image data or undefined if saved to file
 */
export async function captureScreenshot(options: ScreenshotOptions): Promise<string | undefined> {
  const format = options.format ?? 'png';
  const quality = options.quality ?? 85;
  const display = options.display;

  // Determine output path
  const tempFile = options.savePath ?? await Deno.makeTempFile({
    suffix: `.${format}`,
  });

  try {
    // Determine which tool to use
    const tool = await getAvailableScreenshotTool();

    if (!tool) {
      throw new Error(
        'No screenshot tool available. Install scrot (apt-get install scrot) or ImageMagick (apt-get install imagemagick)',
      );
    }

    // Capture screenshot based on available tool
    switch (tool) {
      case 'scrot':
        await captureWithScrot(display, format, quality, tempFile);
        break;
      case 'import':
        await captureWithImport(display, format, quality, tempFile);
        break;
      case 'xwd':
        await captureWithXwd(display, format, quality, tempFile);
        break;
    }

    // If savePath was provided, we're done
    if (options.savePath) {
      return undefined;
    }

    // Otherwise, read the file and return base64
    const imageData = await Deno.readFile(tempFile);
    const base64 = encodeBase64(imageData);

    // Clean up temp file
    try {
      await Deno.remove(tempFile);
    } catch {
      // Ignore cleanup errors
    }

    return base64;
  } catch (err) {
    // Clean up temp file on error
    if (!options.savePath) {
      try {
        await Deno.remove(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw err;
  }
}

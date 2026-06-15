export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type DesktopAction =
  | { action: 'screenshot'; format: 'png' | 'jpeg' }
  | { action: 'click'; x: number; y: number }
  | { action: 'dblclick'; x: number; y: number }
  | { action: 'type'; text: string }
  | { action: 'keypress'; key: string; modifiers?: string[] }
  | { action: 'drag'; from: Point; to: Point }
  | { action: 'get_clipboard' }
  | { action: 'set_clipboard'; text: string }
  | { action: 'wait'; ms: number }
  | { action: 'move'; x: number; y: number }
  | { action: 'scroll'; direction: 'up' | 'down'; amount?: number };

export interface DesktopActionResult {
  success: boolean;
  error?: string;
  durationMs: number;
  output?: string;
  screenshot?: Uint8Array;
}

async function spawn(cmd: string, args: string[], stdin?: string): Promise<{ stdout: string; stderr: string; code: number }> {
  const command = new Deno.Command(cmd, {
    args,
    stdin: stdin ? 'piped' : 'null',
    stdout: 'piped',
    stderr: 'piped',
  });

  const proc = command.spawn();

  if (stdin) {
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(stdin));
    writer.close();
  }

  const { code, stdout, stderr } = await proc.output();
  return {
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
    code,
  };
}

export async function executeDesktopAction(action: DesktopAction): Promise<DesktopActionResult> {
  const t0 = Date.now();

  try {
    switch (action.action) {
      case 'screenshot': {
        const tmp = `/tmp/cortex-screenshot-${Date.now()}.${action.format}`;
        const result = await spawn('scrot', ['--overwrite', '--quality', '90', tmp]);
        if (result.code !== 0) throw new Error(result.stderr);
        const data = await Deno.readFile(tmp);
        await Deno.remove(tmp).catch(() => {});
        return { success: true, durationMs: Date.now() - t0, screenshot: data };
      }

      case 'click':
        await spawn('xdotool', ['mousemove', String(action.x), String(action.y), 'click', '1']);
        return { success: true, durationMs: Date.now() - t0 };

      case 'dblclick':
        await spawn('xdotool', ['mousemove', String(action.x), String(action.y), 'click', '--repeat', '2', '1']);
        return { success: true, durationMs: Date.now() - t0 };

      case 'type': {
        const escaped = action.text.replace(/['"\\]/g, '\\$&');
        await spawn('sh', ['-c', `echo '${escaped}' | xdotool type --file -`]);
        return { success: true, durationMs: Date.now() - t0 };
      }

      case 'keypress': {
        const args = ['key'];
        if (action.modifiers) {
          const keyCombo = [...action.modifiers, action.key].join('+');
          args.push(keyCombo);
        } else {
          args.push(action.key);
        }
        await spawn('xdotool', args);
        return { success: true, durationMs: Date.now() - t0 };
      }

      case 'drag':
        await spawn('xdotool', [
          'mousemove', String(action.from.x), String(action.from.y),
          'mousedown', '1',
          'mousemove', String(action.to.x), String(action.to.y),
          'mouseup', '1',
        ]);
        return { success: true, durationMs: Date.now() - t0 };

      case 'get_clipboard': {
        const result = await spawn('xclip', ['-selection', 'clipboard', '-o']);
        if (result.code !== 0) throw new Error(result.stderr);
        return { success: true, durationMs: Date.now() - t0, output: result.stdout };
      }

      case 'set_clipboard':
        await spawn('xclip', ['-selection', 'clipboard'], action.text);
        return { success: true, durationMs: Date.now() - t0 };

      case 'wait':
        await new Promise((r) => setTimeout(r, action.ms));
        return { success: true, durationMs: Date.now() - t0 };

      case 'move':
        await spawn('xdotool', ['mousemove', String(action.x), String(action.y)]);
        return { success: true, durationMs: Date.now() - t0 };

      case 'scroll': {
        const dir = action.direction === 'down' ? '5' : '4';
        await spawn('xdotool', ['click', '--repeat', String(action.amount ?? 3), dir]);
        return { success: true, durationMs: Date.now() - t0 };
      }

      default:
        throw new Error(`Unknown action`);
    }
  } catch (e) {
    return {
      success: false,
      error: (e as Error).message,
      durationMs: Date.now() - t0,
    };
  }
}

export function getDockerfile(): string {
  return `FROM ubuntu:22.04

RUN apt-get update && apt-get install -y --no-install-recommends \\
    xfce4 xfce4-goodies \\
    novnc websockify \\
    xdotool scrot xclip \\
    firefox \\
    x11vnc xvfb \\
    dbus-x11 \\
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /root/.vnc && \\
    echo "cortex" | vncpasswd -f > /root/.vnc/passwd && \\
    chmod 600 /root/.vnc/passwd

EXPOSE 6080 5900

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
`;
}

export function getEntrypointScript(): string {
  return `#!/bin/bash
set -e

export DISPLAY=:99
Xvfb :99 -screen 0 1280x720x24 &
sleep 1

startxfce4 &
sleep 2

x11vnc -display :99 -forever -passwd cortex -rfbport 5900 &
websockify --web /usr/share/novnc/ 6080 localhost:5900 &

echo "Desktop ready. VNC: localhost:5900, noVNC: http://localhost:6080"

wait
`;
}

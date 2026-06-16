import type { DesktopAction, DesktopActionResult, DesktopAutomation } from './types.ts';

async function spawn(
  cmd: string,
  args: string[],
  stdin?: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
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

function escapeAppleScriptString(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function osascript(script: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return spawn('osascript', ['-e', script]);
}

export const darwinAutomation: DesktopAutomation = {
  async executeDesktopAction(action: DesktopAction): Promise<DesktopActionResult> {
    const t0 = Date.now();

    try {
      switch (action.action) {
        case 'screenshot': {
          const tmp = `/tmp/cortex-screenshot-${Date.now()}.${action.format}`;
          const formatFlag = action.format === 'jpeg' ? 'jpg' : 'png';
          const result = await spawn('screencapture', ['-t', formatFlag, tmp]);
          if (result.code !== 0) throw new Error(result.stderr);
          const data = await Deno.readFile(tmp);
          await Deno.remove(tmp).catch(() => {});
          return { success: true, durationMs: Date.now() - t0, screenshot: data };
        }

        case 'click':
        case 'dblclick': {
          const clicks = action.action === 'dblclick' ? 2 : 1;
          await osascript(`
            tell application "System Events"
              set clickCount to ${clicks}
              do shell script "cliclick c:" & ${action.x} & "," & ${action.y} & " w:100"
            end tell
          `);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'type': {
          const escaped = escapeAppleScriptString(action.text);
          await osascript(`tell application "System Events" to keystroke "${escaped}"`);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'keypress': {
          let keyStr = escapeAppleScriptString(action.key);
          if (action.modifiers?.length) {
            const modMap: Record<string, string> = {
              ctrl: 'control',
              alt: 'option',
              shift: 'shift',
              meta: 'command',
            };
            const mods = action.modifiers.map((m) => modMap[m.toLowerCase()] || m).join(', ');
            await osascript(
              `tell application "System Events" to keystroke "${keyStr}" using {${mods}}`,
            );
          } else {
            await osascript(
              `tell application "System Events" to keystroke "${keyStr}"`,
            );
          }
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'drag': {
          await osascript(`
            tell application "System Events"
              do shell script "cliclick dd:" & ${action.from.x} & "," & ${action.from.y} & " du:" & ${action.to.x} & "," & ${action.to.y}
            end tell
          `);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'get_clipboard': {
          const result = await spawn('pbpaste', []);
          if (result.code !== 0) throw new Error(result.stderr);
          return { success: true, durationMs: Date.now() - t0, output: result.stdout };
        }

        case 'set_clipboard': {
          const result = await spawn('pbcopy', [], action.text);
          if (result.code !== 0) throw new Error(result.stderr);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'wait':
          await new Promise((r) => setTimeout(r, action.ms));
          return { success: true, durationMs: Date.now() - t0 };

        case 'move': {
          await osascript(
            `tell application "System Events" to do shell script "cliclick m:" & ${action.x} & "," & ${action.y}`,
          );
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'scroll': {
          const amount = action.amount ?? 3;
          const dir = action.direction === 'down' ? amount : -amount;
          await osascript(`
            tell application "System Events"
              do shell script "cliclick w:${dir * 100}"
            end tell
          `);
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
  },

  getDockerfile(): string {
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
  },

  getEntrypointScript(): string {
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
  },
};

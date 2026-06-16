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

function psCommand(script: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return spawn('powershell.exe', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; ${script}`,
  ]);
}

export const windowsAutomation: DesktopAutomation = {
  async executeDesktopAction(action: DesktopAction): Promise<DesktopActionResult> {
    const t0 = Date.now();

    try {
      switch (action.action) {
        case 'screenshot': {
          const tmp = Deno.env.get('TEMP') || Deno.env.get('TMP') || Deno.cwd();
          const file = `${tmp}\\cortex-screenshot-${Date.now()}.${action.format}`;
          const format = action.format === 'jpeg' ? 'JPEG' : 'PNG';
          const result = await psCommand(`
            $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds;
            $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height);
            $g = [System.Drawing.Graphics]::FromImage($bmp);
            $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size);
            $bmp.Save('${file.replace(/\\/g, '\\\\')}', [System.Drawing.Imaging.ImageFormat]::${format});
            $bmp.Dispose();
            $g.Dispose();
          `);
          if (result.code !== 0) throw new Error(result.stderr);
          const data = await Deno.readFile(file);
          await Deno.remove(file).catch(() => {});
          return { success: true, durationMs: Date.now() - t0, screenshot: data };
        }

        case 'click':
        case 'dblclick': {
          const clicks = action.action === 'dblclick' ? 2 : 1;
          await psCommand(`
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${action.x}, ${action.y});
            for ($i = 0; $i -lt ${clicks}; $i++) {
              [System.Windows.Forms.SendKeys]::SendWait('{CLICK}');
              Start-Sleep -Milliseconds 50;
            }
          `);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'type': {
          const escaped = action.text
            .replace(/[+^%~(){}[\]]/g, '{$&}')
            .replace(/\n/g, '{ENTER}');
          await psCommand(`[System.Windows.Forms.SendKeys]::SendWait('${escaped}');`);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'keypress': {
          let keyStr = action.key;
          if (action.modifiers?.length) {
            const modMap: Record<string, string> = {
              ctrl: '^',
              alt: '%',
              shift: '+',
              meta: '^',
            };
            const mods = action.modifiers.map((m) => modMap[m.toLowerCase()] || '').join('');
            keyStr = `${mods}{${action.key}}`;
          }
          await psCommand(`[System.Windows.Forms.SendKeys]::SendWait('${keyStr}');`);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'drag': {
          await psCommand(`
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${action.from.x}, ${action.from.y});
            Start-Sleep -Milliseconds 50;
            [System.Windows.Forms.SendKeys]::SendWait('{LEFT DOWN}');
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${action.to.x}, ${action.to.y});
            [System.Windows.Forms.SendKeys]::SendWait('{LEFT UP}');
          `);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'get_clipboard': {
          const result = await spawn('powershell.exe', [
            '-NoProfile',
            '-Command',
            'Get-Clipboard',
          ]);
          if (result.code !== 0) throw new Error(result.stderr);
          return { success: true, durationMs: Date.now() - t0, output: result.stdout };
        }

        case 'set_clipboard': {
          const result = await spawn('powershell.exe', [
            '-NoProfile',
            '-Command',
            `Set-Clipboard -Value '${action.text.replace(/'/g, "''")}'`,
          ]);
          if (result.code !== 0) throw new Error(result.stderr);
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'wait':
          await new Promise((r) => setTimeout(r, action.ms));
          return { success: true, durationMs: Date.now() - t0 };

        case 'move': {
          await psCommand(
            `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${action.x}, ${action.y});`,
          );
          return { success: true, durationMs: Date.now() - t0 };
        }

        case 'scroll': {
          const amount = action.amount ?? 3;
          const dir = action.direction === 'down' ? `{DOWN ${amount}}` : `{UP ${amount}}`;
          await psCommand(`[System.Windows.Forms.SendKeys]::SendWait('${dir}');`);
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

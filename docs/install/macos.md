# Installing CortexPrism on macOS

## Requirements

- macOS 11.0 (Big Sur) or later
- Apple Silicon (M1/M2/M3) or Intel processor
- Git (pre-installed or via `xcode-select --install`)

## Quick Install

```bash
curl -fsSL https://raw.githubusercontent.com/CortexPrism/cortex/main/install.sh | bash
```

Or clone manually:

```bash
git clone --depth 1 https://github.com/CortexPrism/cortex.git ~/.cortex
cd ~/.cortex
deno run --allow-all src/main.ts setup
```

## Install Deno (if needed)

```bash
curl -fsSL https://deno.land/install.sh | sh
```

Add to `~/.zshrc` or `~/.bash_profile`:

```bash
export PATH="$HOME/.deno/bin:$PATH"
```

## PATH Setup

After installation, ensure Deno is in your PATH. If using the install script, it creates a `cortex` wrapper at `~/.deno/bin/cortex`.

Add to your shell profile:
```bash
echo 'export PATH="$HOME/.deno/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

## Start Using CortexPrism

```bash
cortex setup       # Configure your LLM provider
cortex chat        # Start chatting in the terminal
cortex serve       # Start the web UI at http://localhost:3000
```

## Uninstall

```bash
rm -rf ~/.cortex ~/.deno/bin/cortex
```

## Notes

- The desktop automation (`cortex desktop`) uses `osascript` for key presses and `screencapture` for screenshots — both built into macOS.
- For mouse clicks and drags, install `cliclick`: `brew install cliclick`
- Docker sandbox requires Docker Desktop from https://www.docker.com/products/docker-desktop/

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `deno: command not found` | Add `~/.deno/bin` to PATH (see above) |
| `cortex: Permission denied` | Run `chmod +x ~/.deno/bin/cortex` |
| "Not from identified developer" | Right-click → Open, or run `xattr -d com.apple.quarantine /path/to/cortex` |
| Docker not working | Install Docker Desktop, ensure it's running |

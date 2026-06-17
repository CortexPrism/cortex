# Computer Use

Computer Use enables CortexPrism AI agents to interact with graphical user interfaces through screenshots, mouse control, and keyboard input. This allows agents to automate GUI-based tasks, interact with web browsers, and control desktop applications.

## Overview

The computer use feature provides agents with the ability to:
- **See** the screen via screenshots
- **Control** the mouse (move, click, drag, scroll)
- **Type** using keyboard input and shortcuts
- **Interact** with any GUI application or web browser

This implementation is based on Anthropic's Computer Use API and provides a standardized interface for desktop automation.

## Requirements

### Linux (Primary Platform)

Computer use requires the following system packages:

```bash
# Debian/Ubuntu
sudo apt-get install xvfb xdotool scrot x11-utils

# Fedora/RHEL
sudo dnf install xorg-x11-server-Xvfb xdotool scrot xorg-x11-utils

# Arch Linux
sudo pacman -S xorg-server-xvfb xdotool scrot xorg-utils
```

**Package descriptions:**
- `xvfb` - X Virtual Frame Buffer (creates virtual displays)
- `xdotool` - Command-line X11 automation (mouse and keyboard control)
- `scrot` - Screenshot utility
- `x11-utils` - X11 utilities

### Docker (Optional)

For a fully isolated environment, use the provided Docker image:

```bash
# Build the computer use Docker image
docker build -f docker/computer-use.Dockerfile -t cortex/computer-use .

# Run a container
docker run -d --name cortex-computer cortex/computer-use

# Execute commands inside
docker exec cortex-computer xdotool getmouselocation
```

## Usage

### Basic Example

The computer tool is available as a built-in tool named `computer` with the following actions:

```typescript
// Take a screenshot
{
  "action": "screenshot"
}

// Click at coordinates
{
  "action": "left_click",
  "coordinate": [100, 200]
}

// Type text
{
  "action": "type",
  "text": "Hello, world!"
}

// Press keyboard shortcut
{
  "action": "key",
  "text": "ctrl+s"
}

// Scroll
{
  "action": "scroll",
  "scroll_direction": "down",
  "scroll_amount": 5
}
```

### Available Actions

| Action | Description | Required Parameters | Optional Parameters |
|--------|-------------|---------------------|---------------------|
| `screenshot` | Capture current display | None | None |
| `left_click` | Left-click at position | None | `coordinate` |
| `right_click` | Right-click at position | None | `coordinate` |
| `middle_click` | Middle-click at position | None | `coordinate` |
| `double_click` | Double-click at position | None | `coordinate` |
| `triple_click` | Triple-click at position | None | `coordinate` |
| `mouse_move` | Move cursor to position | `coordinate` | None |
| `left_click_drag` | Drag from one point to another | `coordinate`, `drag_to` | None |
| `left_mouse_down` | Press left mouse button | None | None |
| `left_mouse_up` | Release left mouse button | None | None |
| `type` | Type text string | `text` | None |
| `key` | Press key or key combination | `text` | None |
| `hold_key` | Hold key for duration | `text`, `duration` | None |
| `scroll` | Scroll in direction | `scroll_direction` | `scroll_amount` |
| `wait` | Pause execution | None | `duration` |

### Common Key Names

**Modifiers:**
- `ctrl`, `control` - Control key
- `alt`, `option` - Alt key
- `shift` - Shift key
- `super`, `win`, `cmd` - Windows/Command/Super key

**Special Keys:**
- `Return`, `Enter` - Enter/Return key
- `Escape`, `Esc` - Escape key
- `Tab` - Tab key
- `Space` - Space bar
- `Backspace` - Backspace key
- `Delete`, `Del` - Delete key

**Arrow Keys:**
- `Up`, `Down`, `Left`, `Right`

**Function Keys:**
- `F1` through `F12`

**Key Combinations:**
Use `+` to combine keys: `ctrl+s`, `alt+tab`, `shift+Return`

## Configuration

Computer use configuration can be customized (future enhancement - currently uses defaults):

```typescript
{
  "computer_use": {
    "enabled": true,
    "display_width": 1024,
    "display_height": 768,
    "runtime": "native",  // or "docker"
    "screenshot_format": "png",  // or "jpeg"
    "screenshot_quality": 85,
    "action_timeout_ms": 5000,
    "save_screenshots": true
  }
}
```

## Security

Computer use operations are subject to several security measures:

1. **Approval Gate**: All computer use actions require user approval by default
2. **Policy Validation**: Actions are checked against security policies before execution
3. **Audit Logging**: All computer use operations are logged to the Cortex Lens audit system
4. **Sensitive Data Detection**: Attempts to type potentially sensitive data (passwords, API keys) are blocked
5. **Virtual Display Isolation**: Operations run in isolated virtual displays, not the host's main display

### Policy Example

Computer use policies can be defined in the security system:

```typescript
{
  "id": "computer-use-require-approval",
  "kind": "computer",
  "pattern": "*",
  "effect": "allow",
  "conditions": ["requires_approval"]
}
```

## Architecture

### Module Structure

```
src/computer-use/
├── types.ts              # Type definitions
├── display.ts            # Virtual display management (Xvfb)
├── screenshot.ts         # Screenshot capture
├── mouse.ts              # Mouse control
├── keyboard.ts           # Keyboard control
└── executor.ts           # Action coordinator
```

### Execution Flow

1. Agent requests a computer use action through the `computer` tool
2. Tool validates the request and checks approval gate
3. Security validator checks policies
4. Virtual display is started (if not already running)
5. Action is executed via appropriate controller (mouse/keyboard/screenshot)
6. Result is returned to agent (screenshot path, cursor position, etc.)
7. Operation is logged to audit system

### Screenshot Handling

Screenshots are saved to disk by default to avoid the 8,000 character tool output truncation limit:

- Saved to: `~/.cortex/data/screenshots/`
- Format: `screenshot_<timestamp>.png` (or `.jpeg`)
- Tool returns file path instead of base64 data

## Example Workflows

### Web Research

```typescript
// 1. Take initial screenshot
{ action: 'screenshot' }

// 2. Click Firefox icon
{ action: 'left_click', coordinate: [100, 50] }

// 3. Wait for Firefox to load
{ action: 'wait', duration: 2 }

// 4. Focus address bar
{ action: 'key', text: 'ctrl+l' }

// 5. Type URL
{ action: 'type', text: 'https://example.com' }

// 6. Navigate
{ action: 'key', text: 'Return' }

// 7. Wait for page load
{ action: 'wait', duration: 3 }

// 8. Capture result
{ action: 'screenshot' }
```

### Document Editing

```typescript
// 1. Open text editor
{ action: 'left_click', coordinate: [150, 100] }

// 2. Wait for editor
{ action: 'wait', duration: 1 }

// 3. Type content
{ action: 'type', text: 'Hello, world!' }

// 4. Save file
{ action: 'key', text: 'ctrl+s' }

// 5. Enter filename
{ action: 'type', text: 'document.txt' }

// 6. Confirm
{ action: 'key', text: 'Return' }
```

## Troubleshooting

### Xvfb not found

**Error**: `Xvfb not found. Install with: apt-get install xvfb`

**Solution**: Install the required system packages as described in the Requirements section.

### Display already running

**Error**: `Display :99 already running`

**Solution**: The display manager reuses existing displays. This is not an error and can be ignored.

### Screenshot tool not found

**Error**: `No screenshot tool available`

**Solution**: Install either `scrot` or `imagemagick`:
```bash
sudo apt-get install scrot
# OR
sudo apt-get install imagemagick
```

### Permission denied

**Error**: `Cannot create virtual display: Permission denied`

**Solution**: Ensure your user has permission to create X11 displays. May require running in a container or with appropriate permissions.

## Limitations

1. **Platform**: Currently Linux-only (macOS and Windows support planned for future releases)
2. **Display Resolution**: Fixed resolution per session (default: 1024x768)
3. **Single Display**: One virtual display per executor instance
4. **No GUI Observation**: Agent cannot directly see GUI elements, only screenshots
5. **Coordinate-based**: Actions use pixel coordinates, no element identification

## Future Enhancements

Planned improvements include:

1. **OCR Integration** - Extract text from screenshots
2. **Visual Element Detection** - Find UI elements by description
3. **Smart Waiting** - Wait for UI elements to appear
4. **Recording/Playback** - Record and replay action sequences
5. **Browser DevTools** - Direct browser automation via Chrome DevTools Protocol
6. **Accessibility APIs** - Use platform accessibility APIs for better element identification
7. **Multi-monitor Support** - Handle multiple displays
8. **macOS/Windows Support** - Native support for other platforms

## References

- [Anthropic Computer Use Documentation](https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/computer-use-tool)
- [Xvfb Documentation](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml)
- [xdotool Documentation](https://www.semicomplete.com/projects/xdotool/)
- [scrot Documentation](https://github.com/resurrecting-open-source-projects/scrot)

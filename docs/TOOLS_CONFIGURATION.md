# Tools Configuration Guide

This guide explains how to configure API keys and settings for CortexPrism's external tools through the web UI.

## Overview

CortexPrism provides a centralized Tools & APIs settings panel where you can securely configure API keys for web search, web scraping, and other external services. All credentials are encrypted using AES-256-GCM and stored in the vault.

## Accessing Tool Settings

1. Open the CortexPrism web UI at `http://localhost:3000`
2. Navigate to **Settings** in the sidebar
3. Click the **Tools & APIs** tab

## Supported Tools

### 1. Brave Search API
- **Purpose**: Premium web search with high-quality results
- **Used By**: `web_search_enhanced` tool
- **Sign Up**: https://brave.com/search/api/
- **Configuration**:
  - Tool: `brave_search_api_key`
  - Value: Your Brave Search API key (e.g., `BSA...`)

### 2. Tavily Search API
- **Purpose**: AI-optimized search with curated results
- **Used By**: `web_search_enhanced` tool
- **Sign Up**: https://tavily.com/
- **Configuration**:
  - Tool: `tavily_api_key`
  - Value: Your Tavily API key (e.g., `tvly-...`)

### 3. Firecrawl
- **Purpose**: Web scraping and crawling service
- **Used By**: `firecrawl` tool
- **Sign Up**: https://firecrawl.dev/
- **Configuration**:
  - **API Key**: `firecrawl_api_key` → Your Firecrawl API key
  - **Self-Hosted URL** (optional): `firecrawl_url` → Your self-hosted Firecrawl instance URL (e.g., `https://firecrawl.example.com`)

### 4. SerpAPI
- **Purpose**: Google Search API wrapper
- **Used By**: `serpapi_search` tool
- **Sign Up**: https://serpapi.com/
- **Configuration**:
  - Tool: `serpapi_api_key`
  - Value: Your SerpAPI key

## Adding or Updating a Tool

1. In the **Tools & APIs** tab, scroll to **Add / Update Tool Configuration**
2. Select the tool from the dropdown menu
3. Enter the API key or URL in the value field
4. Click **Save Tool Configuration**

The tool will appear in the "Configured Tools" section with a masked key display (e.g., `sk-abc...xyz`).

## Editing a Tool

1. Find the tool in the **Configured Tools** section
2. Click the **Edit** button
3. The tool will be pre-selected in the form below
4. Update the value and click **Save Tool Configuration**

## Removing a Tool

1. Find the tool in the **Configured Tools** section
2. Click the **Remove** button
3. Confirm the deletion

The tool configuration will be removed from the vault.

## How Tool Configuration Works

### Priority Order

When a tool needs an API key, CortexPrism checks in this order:
1. **Vault** — checks the encrypted vault first
2. **Environment Variable** — falls back to environment variables (e.g., `BRAVE_SEARCH_API_KEY`)

### Security

- All API keys are encrypted using AES-256-GCM before storage
- Keys are never exposed in logs or API responses
- Only masked versions are shown in the UI (first 6 + last 4 characters)
- Vault requires `CORTEX_VAULT_KEY` environment variable to be set

### Storage Location

- **Vault Database**: `~/.cortex/data/vault.db`
- **Encryption**: AES-256-GCM with PBKDF2 key derivation
- **Key Derivation**: 100,000 iterations of PBKDF2-SHA256

## API Endpoints

For programmatic access, use these REST endpoints:

### GET /api/tools/config
Returns all tool configurations with masked keys.

**Response:**
```json
{
  "brave_search_api_key": {
    "configured": true,
    "masked": "BSA12a...xyz9"
  },
  "tavily_api_key": {
    "configured": false
  }
}
```

### PUT /api/tools/config
Add or update a tool configuration.

**Request:**
```json
{
  "tool": "brave_search_api_key",
  "value": "BSA12a3b4c5d6e7f8g9h0i1j2k3l4m5n6o7p8q9r0s1t2u3v4w5x6y7z8",
  "service": "tool"
}
```

**Response:**
```json
{
  "ok": true
}
```

### DELETE /api/tools/config/:tool
Remove a tool configuration.

**Example:**
```bash
curl -X DELETE http://localhost:3000/api/tools/config/brave_search_api_key
```

**Response:**
```json
{
  "ok": true
}
```

## Environment Variable Fallback

If you prefer environment variables, you can still use them:

```bash
export BRAVE_SEARCH_API_KEY="your-key-here"
export TAVILY_API_KEY="your-key-here"
export FIRECRAWL_API_KEY="your-key-here"
export SERPAPI_API_KEY="your-key-here"
```

Environment variables are **not encrypted** and should only be used in trusted environments.

## Setting Up the Vault

If the vault key is not set, you'll see an error when trying to save tool configurations.

**Set the vault key:**
```bash
export CORTEX_VAULT_KEY="your-secure-passphrase-here"
```

**Generate a secure key:**
```bash
# Generate a random 32-character key
openssl rand -base64 32
```

**Persist the key** (add to your shell profile):
```bash
# In ~/.bashrc, ~/.zshrc, or equivalent
export CORTEX_VAULT_KEY="your-secure-passphrase-here"
```

## Troubleshooting

### "Vault key not set" Error
- Make sure `CORTEX_VAULT_KEY` is set in your environment
- Restart CortexPrism after setting the key

### Tool Not Using Configured Key
- Check that the tool is configured in Settings → Tools & APIs
- Verify the vault key is correct
- Restart CortexPrism to reload configurations

### Key Not Saving
- Ensure you have write permissions to `~/.cortex/data/`
- Check that the vault database (`vault.db`) is not corrupted
- Try deleting `vault.db` and reconfiguring (this will delete all stored keys)

### Tool Still Using Environment Variable
- The system prioritizes vault keys over environment variables
- If a key is in both locations, the vault key is used
- Remove the environment variable if you want to use only the vault

## Chrome Bridge

Chrome Bridge provides 60 real-browser automation tools accessible to the LLM as `chrome_*` prefixed tools (e.g., `chrome_navigate`, `chrome_screenshot_diff`, `chrome_accessibility_audit`). It connects to a Chrome browser via the chrome-bridge MCP server and CDP (Chrome DevTools Protocol).

### Prerequisites

- **Node.js 18+** — required to run the chrome-bridge MCP server
- **Chrome 111+** — browser with DevTools Protocol support
- **chrome-bridge** — server + Chrome extension

### Installation

```bash
# Clone and install chrome-bridge
mkdir -p ~/.cortex/chrome-bridge
cd ~/.cortex/chrome-bridge
git clone https://github.com/frsorrentino/chrome-bridge.git
cd chrome-bridge
npm install
```

### Extension Setup

1. Open `chrome://extensions` in Chrome
2. Enable "Developer mode"
3. Click "Load unpacked" and select `~/.cortex/chrome-bridge/chrome-bridge/extension`

### Configuration

Add to `~/.cortex/config.json`:

```json
{
  "chromeBridge": {
    "enabled": true,
    "autoStart": true,
    "autoRegisterTools": true,
    "toolPrefix": "chrome_",
    "serverPath": "/home/user/.cortex/chrome-bridge/chrome-bridge/server/index.js",
    "nodePath": "/usr/bin/node"
  }
}
```

**Settings:**

| Field | Default | Description |
|---|---|---|
| `enabled` | `false` | Enable chrome-bridge integration |
| `autoStart` | `false` | Start on Cortex server boot |
| `autoRegisterTools` | `true` | Auto-register tools on connect |
| `toolPrefix` | `"chrome_"` | Prefix for registered tool names |
| `serverPath` | (required) | Path to `chrome-bridge/server/index.js` |
| `nodePath` | `"node"` | Path to Node.js binary |
| `port` | `8765` | WebSocket port |
| `token` | — | Optional shared secret |
| `env` | — | Environment variables for the subprocess |

### Available Tools (60)

| Category | Count | Example Tools |
|---|---|---|
| Core & Navigation | 8 | `navigate`, `create_tab`, `screenshot`, `get_status` |
| Interaction | 12 | `click`, `type_text`, `fill_form`, `hover`, `press_key`, `drag_and_drop` |
| DOM & Inspection | 10 | `read_page`, `query_dom`, `find_text`, `inject_css`, `watch_dom` |
| Waiting & Discovery | 3 | `wait_for_element`, `wait_for_function`, `wait_for_network_idle` |
| Debugging & Network | 8 | `execute_js`, `monitor_network`, `read_console`, `network_rules` |
| Visual & Responsive | 7 | `element_screenshot`, `full_page_screenshot`, `screenshot_diff`, `viewport_resize` |
| Audits | 6 | `accessibility_audit`, `seo_audit`, `security_headers`, `check_links` |
| State & Storage | 4 | `get_storage`, `set_storage`, `session_fixture` |
| Capture & Files | 2 | `save_page`, `manage_downloads` |

### Example Prompts

**Open a page, take a screenshot, run an accessibility audit:**
```
Navigate to example.com, take a screenshot, then run an accessibility audit
and report any issues found.
```

**Fill a form and extract data:**
```
Navigate to the login page, fill the form with test credentials,
wait for navigation to complete, then extract the main data table.
```

**Visual regression testing:**
```
Compare the homepage screenshot with the baseline. Report any visual
regressions including pixel differences and affected elements.
```

**Network monitoring:**
```
Monitor network requests while I interact with the page, log all XHR/fetch
calls, and export the results when complete.
```

**Mobile responsive testing:**
```
Set the viewport to iPhone 14 size (390×844), navigate to the product page,
take a full-page screenshot, and identify any layout issues.
```

### Security

Chrome Bridge tools pass through CortexPrism's multi-layer security:

- **`chrome_execute_js`** — arbitrary JavaScript execution in the real browser requires explicit policy allow. Add a policy rule to block or require supervisor approval.
- **`chrome_upload_file`** — file paths are checked for `../` traversal and validated against path policy before the browser reads them.
- **`chrome_save_page` / `chrome_manage_downloads`** — output paths are stripped of traversal sequences and validated against path policy.
- **`chrome_network_rules`** — modifying network rules (intercept/block/redirect) requires capability policy approval; `list` and `clear` are always allowed.

Example policy to block execute_js entirely:
```sql
INSERT INTO policy_rules (kind, pattern, action, priority)
VALUES ('tool', 'chrome_execute_js', 'deny', 100);
```

### CLI Management

```bash
cortex chrome-bridge start    # Start the MCP server
cortex chrome-bridge stop     # Stop the MCP server
cortex chrome-bridge status   # Check connection state
cortex chrome-bridge tools    # List registered chrome_* tools
```

### Web UI

Navigate to **Settings → Chrome Bridge** in the web UI for:
- Status cards (connection state, server info, tools registered, calls, errors)
- Registered tools grid with all `chrome_*` prefixed tools
- Start/Stop/Restart buttons
- Quick Setup button that pre-fills the MCP connection form

### Troubleshooting

**"chrome-bridge not configured"** — Add a `chromeBridge` section to `~/.cortex/config.json`.

**"Failed to start chrome-bridge"** — Verify Node.js is installed (`node --version`), the server path is correct, and the Chrome extension is loaded.

**Tools not appearing** — Run `cortex chrome-bridge tools` to check registration. Ensure `autoRegisterTools` is not set to `false`.

**Connection lost repeatedly** — Check that Chrome is running with the chrome-bridge extension enabled. The connection manager will auto-reconnect up to 5 times with exponential backoff.

## Security Supervision

CortexPrism includes a built-in security supervisor system that automatically gates access to sensitive tools. This is configured automatically and requires no setup, but here's what you should know:

### Protected Tools

The following tools require approval for sensitive data access:

- **memory_search** — Searching personal memory (conversations, preferences)
- **db_query** — Querying internal databases (audit logs, user sessions, stored facts)
- **browser** — Taking screenshots (may contain sensitive UI)
- **image_analyze** — Analyzing images (vision models see all content)

### How It Works

1. **Agent requests sensitive data** via a protected tool
2. **Data classification** checks the sensitivity level (PUBLIC → NORMAL → SENSITIVE → SECRET)
3. **LLM supervisor** evaluates the request (< 500ms)
4. **Decision cached** for the session (prevents re-evaluation within 1 hour)
5. **If uncertain or SECRET tier** → Human approval required via CLI or Web UI

### Approval Flows

**In terminal mode** (`deno task dev`):
```
⚠️ SECURITY APPROVAL REQUIRED

Agent "agent_claude" is requesting access to SENSITIVE data.

Tool: memory_search
Query: "user preferences"
Justification: "Personalize UI"

AI Supervisor Reasoning: Request is legitimate for personalization. Confidence: 0.85

Allow this access? [y]es / [n]o / [d]etails: 
```

**In Web UI** (`deno task serve`):
- A modal appears with request details
- Shows AI supervisor's reasoning
- Option to preview sample data
- Approve, deny, or skip buttons

### Security Configuration

Security is enabled by default. To customize:

```json
{
  "security": {
    "enabled": true,
    "supervisorModel": "gemini-2.0-flash",
    "approvalTimeoutSeconds": 300,
    "grantDurationSeconds": 3600
  }
}
```

**Settings:**
- `supervisorModel`: LLM to use (auto-selects fastest/cheapest)
- `approvalTimeoutSeconds`: How long to wait for human approval (default: 5 min)
- `grantDurationSeconds`: Cache approval for N seconds (default: 1 hour)

### Common Scenarios

**Scenario 1: Personalization**
- Agent: "Need to personalize UI based on user preferences"
- Supervisor: ✅ Approves (legitimate, narrow scope)
- **Result:** Access granted, cached for 1 hour

**Scenario 2: Leaked Password**
- Agent: Requests memory search for "password"
- Supervisor: 🚫 Denies or escalates (high-risk access)
- **Result:** Human approval required

**Scenario 3: Audit Log Analysis**
- Agent: "Analyzing system performance issues"
- Supervisor: ⚠️ Uncertain (could be legitimate or reconnaissance)
- **Result:** Human approval required

For detailed information, see [Security Supervisor Architecture](./SECURITY_SUPERVISOR.md).

## Best Practices

1. **Use the vault** for all sensitive credentials in production
2. **Set a strong vault key** with at least 32 characters
3. **Back up your vault key** securely (without it, encrypted keys are unrecoverable)
4. **Remove unused tools** to minimize attack surface
5. **Rotate keys regularly** through the web UI
6. **Use environment variables** only in development or trusted environments

## Example: Setting Up Brave Search

1. Sign up for Brave Search API at https://brave.com/search/api/
2. Copy your API key (starts with `BSA...`)
3. Open CortexPrism Settings → Tools & APIs
4. Select "Brave Search API Key" from the dropdown
5. Paste your key in the value field
6. Click "Save Tool Configuration"
7. Test it by using `web_search_enhanced` with `prefer_provider: "brave"`

The enhanced search tool will now use Brave Search as the primary provider, with automatic fallback to Tavily and DuckDuckGo if needed.

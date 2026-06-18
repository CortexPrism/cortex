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

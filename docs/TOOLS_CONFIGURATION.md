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

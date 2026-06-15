# Publishing to the Marketplace

This guide covers how to publish your plugins to the CortexPrism Marketplace for distribution to all users.

## Account Setup

Before publishing, you need a marketplace account:

1. Register at [cortexprism.io/register](https://cortexprism.io/register)
2. Create an account with your email and username
3. Verify your email address

## Publishing a Plugin

### Step 1: Prepare Your Plugin

Ensure your plugin has a complete manifest and is tested:

```bash
# Test locally
cortex plugins install ./my-plugin
cortex plugins enable my-plugin

# Verify it works in a chat session
cortex chat
```

### Step 2: Submit via Web UI

1. Go to the [Publish Plugin](https://cortexprism.io/marketplace/publish/plugin) page
2. Fill in the required fields:
   - **Basic Info**: Name, version, description
   - **Plugin Details**: Kind (ESM/MCP/WASM), entry point, capabilities
   - **Author & Links**: Author name, website, repository, license
   - **Media**: Icon (256x256 PNG/SVG recommended), screenshots
   - **Tags**: Add relevant tags for discoverability
3. Submit for review

### Step 3: Submit via API (Automated)

For CI/CD pipelines:

```bash
# Authenticate
TOKEN=$(curl -s -X POST https://cortexprism.io/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"user@example.com","password":"your-password"}' \
  | jq -r '.token')

# Submit plugin
curl -X POST https://cortexprism.io/api/marketplace/plugins \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "my-plugin",
    "version": "1.0.0",
    "description": "Does awesome things",
    "kind": "esm",
    "entryPoint": "mod.ts",
    "capabilities": ["tools", "network:fetch"],
    "tags": ["text", "processing"],
    "repository": "https://github.com/user/my-plugin",
    "license": "MIT"
  }'
```

### Step 4: Review Process

After submission:

1. Status is set to **pending**
2. An admin reviews your submission (typically within 48 hours)
3. You receive notification of approval or rejection
4. If approved, your plugin is live on the marketplace

Check submission status on your [Dashboard](https://cortexprism.io/dashboard).

## Plugin Requirements

| Requirement | Details |
|-------------|---------|
| **Naming** | kebab-case, unique across marketplace |
| **Version** | Valid semver (e.g., `1.0.0`) |
| **Entry point** | Must be accessible and valid |
| **Capabilities** | At least one capability defined |
| **License** | SPDX identifier required (MIT, Apache-2.0, etc.) |
| **README** | Strongly recommended: usage instructions, examples |
| **Icon** | Recommended: 256x256 PNG or SVG |

For full submission standards including repository structure, versioning rules, and AI disclosure requirements, see [Submission Standards](submission-standards.md).

## Version Management

Update your plugin by submitting a new version:

```bash
curl -X PUT https://cortexprism.io/api/marketplace/plugins/my-plugin \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "version": "1.1.0",
    "description": "Added new capabilities",
    "entryPoint": "mod.ts",
    "capabilities": ["tools", "network:fetch", "fs:read"]
  }'
```

Each published version is stored in the version history. Users can see the changelog and update their local installations via `cortex plugins update`.

## Marketplace API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/marketplace/plugins` | GET | List plugins with search/filter/pagination |
| `/api/marketplace/plugins` | POST | Submit a new plugin |
| `/api/marketplace/plugins/:id` | GET | Get plugin details |
| `/api/marketplace/plugins/:id` | PUT | Update plugin |
| `/api/marketplace/plugins/:id/download` | GET | Download plugin manifest |
| `/api/marketplace/plugins/:id/reviews` | GET | List reviews |
| `/api/marketplace/plugins/:id/reviews` | POST | Submit a review |

See the [OpenAPI docs](https://cortexprism.io/openapi) for the complete specification.

## Best Practices for Publishing

1. **Write a clear description** — Explain what your plugin does and how to use it
2. **Add tags** — Use relevant tags for search discoverability
3. **Include a README** — Provide detailed usage instructions within the plugin
4. **Use screenshots** — Show the plugin in action
5. **Version carefully** — Follow semantic versioning
6. **Respond to reviews** — Engage with user feedback
7. **Keep dependencies minimal** — Faster install, fewer conflicts
8. **Add a license** — Clearly state usage terms
9. **Link to source** — If open source, link the repository

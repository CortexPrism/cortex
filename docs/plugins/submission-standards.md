# Submission Standards

This guide covers the complete set of standards and requirements for publishing plugins on the CortexPrism Marketplace: repository structure, versioning, AI disclosure, and the official submission procedure.

## Repository Structure

A well-structured repository makes your plugin easier to maintain, review, and adopt.

### Required Layout

```
my-plugin/
├── manifest.json           # Plugin manifest (required)
├── mod.ts                  # Entry point (ESM) or equivalent
├── README.md               # Documentation (required for marketplace)
├── LICENSE                 # License file (required)
├── CHANGELOG.md            # Version history (recommended)
├── test/                   # Tests (recommended)
│   ├── unit/
│   └── integration/
├── screenshots/            # Marketplace screenshots (recommended)
│   ├── screenshot-1.png
│   └── screenshot-2.png
├── .github/                # GitHub-specific files
│   └── workflows/
│       └── publish.yml     # CI/CD for automated publishing
└── examples/               # Usage examples (recommended)
    └── basic-usage.md
```

### Root Files

| File | Required | Purpose |
|------|----------|---------|
| `manifest.json` | Yes | Plugin identity, capabilities, entry point |
| `README.md` | Yes | User-facing documentation |
| `LICENSE` | Yes | SPDX-identified license file |
| `CHANGELOG.md` | Recommended | Version history for users |
| `.gitignore` | Recommended | Exclude build artifacts, secrets |

### README Template

```markdown
# Plugin Name

Brief one-line description.

## Installation

```bash
cortex plugins install marketplace:my-plugin
```

## Configuration

Describe any required configuration in `~/.cortex/config.json`.

## Capabilities

- **capability-name**: What it does, expected input, output format

## Examples

Show typical usage examples the agent would invoke.

## Permissions

List the capabilities/permissions the plugin declares and why.

## Development

Setup instructions for contributing.

## License

MIT
```

### CHANGELOG Template

```markdown
# Changelog

## [1.1.0] — 2026-06-15

### Added
- New capability: batch processing

### Fixed
- Timeout handling for large inputs

## [1.0.0] — 2026-06-01

### Added
- Initial release
```

### Repository Metadata

For best marketplace integration, configure these GitHub repository settings:

- **Description**: Brief one-line description (shown in marketplace cards)
- **Topics**: Add relevant tags (always include `cortex-plugin`, plus `esm`/`mcp`/`wasm`, and category keywords like `development`, `data-processing`, `security`, `productivity`, `analytics`, `communication`)
- **License**: Must match the SPDX identifier in your manifest

## Versioning

### Semantic Versioning

All plugins MUST follow [Semantic Versioning 2.0.0](https://semver.org):

```
MAJOR.MINOR.PATCH
```

| Bump | When | Example |
|------|------|---------|
| **MAJOR** | Breaking changes to capability signatures, removed capabilities, changed behavior | `1.0.0` → `2.0.0` |
| **MINOR** | New capabilities, new parameters (backward compatible) | `1.0.0` → `1.1.0` |
| **PATCH** | Bug fixes, performance improvements, documentation updates | `1.0.0` → `1.0.1` |

### Pre-release Versions

Use pre-release suffixes for development builds:

```json
{ "version": "2.0.0-alpha.1" }
{ "version": "2.0.0-beta.2" }
{ "version": "2.0.0-rc.1" }
```

Pre-release versions are not shown in default marketplace listings.

### Version Rules

1. **Once published, a version is immutable.** Fix released versions by publishing new PATCH versions.
2. **The manifest `version` field must match the git tag.** Tag releases with `v{version}` (e.g., `v1.0.0`).
3. **Minimum version is `1.0.0`** for first stable release. Use `0.x.0` for initial development.
4. **Document breaking changes** in the CHANGELOG with migration instructions.

### Breaking Change Checklist

When preparing a MAJOR version bump:

- All capability signature changes are documented
- Migration path is provided for users of the previous version
- CHANGELOG includes a "Migration from vX" section
- Old capabilities are deprecated for at least one MINOR release before removal
- Deprecation notice is logged at runtime when old capabilities are called

### Dependency Versioning

If your plugin depends on other plugins, specify semver ranges:

```json
{
  "dependencies": {
    "base-plugin": "^1.0.0"
  }
}
```

- `^1.0.0` — Compatible with 1.x.x
- `~1.0.0` — Compatible with 1.0.x
- `1.0.0` — Exact version only

## AI Disclosure

CortexPrism requires transparency about the use of AI-assisted development tools in plugin submissions.

### When to Disclose

You must disclose AI assistance if any part of your plugin submission was:

- **Generated** by an AI coding tool (GitHub Copilot, Claude, ChatGPT, etc.)
- **Translated** from another language using AI
- **Refactored** or **optimized** by AI tools
- **Reviewed** by AI for security or correctness
- **Documented** using AI-generated text

You do NOT need to disclose: standard IDE autocomplete, linting/formatting tools, spell-checking, or dependency resolution.

### Disclosure Format

Include an `AI.md` file (or section in README) at the root of your plugin repository:

```markdown
# AI Disclosure

## Tools Used
- GitHub Copilot (code generation)
- Claude (code review)
- ChatGPT (documentation)

## Scope
- `mod.ts`: Core logic was drafted by Copilot, manually reviewed and modified
- `README.md`: Initial draft by ChatGPT, edited for accuracy

## Review
All AI-generated code was reviewed, tested, and verified by a human developer before submission.

## Certification
I certify that I understand the code being submitted and take full responsibility for its behavior and security.
```

### Manifest Declaration

Add an `aiDisclosure` field to your manifest:

```json
{
  "name": "my-plugin",
  "version": "1.0.0",
  "aiDisclosure": {
    "tools": ["copilot", "claude"],
    "generatedFiles": ["mod.ts", "README.md"],
    "humanReviewed": true,
    "statement": "All AI-generated code was reviewed, tested, and verified."
  }
}
```

### Why Disclosure Matters

1. **Trust**: Users know what to expect from installed code
2. **Review**: Reviewers can focus on human-written vs. AI-generated sections
3. **Security**: AI-generated code may contain subtle vulnerabilities needing extra scrutiny
4. **Attribution**: Proper credit for the development process
5. **License compliance**: Some AI tools have specific attribution requirements

### Review Expectations for AI-Assisted Submissions

Submissions declaring AI assistance receive the same review process, but reviewers will:

- Pay extra attention to security boundaries (input validation, permission checks)
- Verify error handling is complete and not hallucinated
- Check for nonsensical or dead code paths
- Confirm API usage matches documented behavior

## Submission Procedure

### Pre-Submission Checklist

**Repository:**
- Repository is public and accessible
- `manifest.json` is valid JSON and complete
- `README.md` exists with installation and usage documentation
- `LICENSE` file exists with a valid SPDX identifier
- Repository has a clear description and relevant topics
- No secrets, API keys, or credentials in the codebase
- `.gitignore` excludes build artifacts and secrets

**Code:**
- Plugin installs and loads without errors (`cortex plugins install ./my-plugin`)
- All capabilities work correctly
- Plugin works in a chat session (`cortex chat`)
- All permissions declared are actually used
- Error handling covers expected failure modes
- Input validation is implemented for all capability parameters
- Plugin handles timeout and cancellation gracefully

**Versioning:**
- Version follows Semantic Versioning
- Version is not already published on the marketplace
- `CHANGELOG.md` is updated for this version
- Git tag exists matching the version (`git tag v1.0.0`)

**Documentation:**
- README includes installation command, configuration, examples
- Screenshots (if applicable) are prepared in PNG format, 1280x720
- AI disclosure is provided if AI tools were used
- Tags are accurate and descriptive

**Legal:**
- Plugin complies with the CortexPrism Marketplace Terms of Service
- All dependencies have compatible licenses
- Plugin does not violate any third-party intellectual property

### Step-by-Step Submission

#### 1. Prepare Your Release

```bash
# Tag the release
git tag v1.0.0
git push origin v1.0.0

# Verify the build
cortex plugins install ./my-plugin
cortex plugins enable my-plugin
```

#### 2. Submit via Web UI

Navigate to the [Publish Plugin](https://cortexprism.io/marketplace/publish/plugin) page and complete all sections:

- **Basic Information**: Name (must match manifest), version, description
- **Plugin Details**: Kind, entry point, capabilities list
- **Author & Links**: Author name, GitHub repository URL, homepage, license
- **Media**: Icon URL (256x256 PNG/SVG recommended), screenshots
- **Tags**: Add category and feature tags for discoverability

#### 3. Submit via API (CI/CD)

For automated publishing, use the API:

```bash
#!/bin/bash
# publish.sh — Automated plugin publishing script

PLUGIN_NAME="my-plugin"
VERSION=$(jq -r '.version' manifest.json)

TOKEN=$(curl -s -X POST https://cortexprism.io/api/auth/login \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$MARKETPLACE_EMAIL\",\"password\":\"$MARKETPLACE_PASSWORD\"}" \
  | jq -r '.token')

curl -X POST https://cortexprism.io/api/marketplace/plugins \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "$(cat <<JSON
{
  "name": "$PLUGIN_NAME",
  "version": "$VERSION",
  "description": "$(jq -r '.description' manifest.json)",
  "kind": "$(jq -r '.kind' manifest.json)",
  "entryPoint": "$(jq -r '.entryPoint' manifest.json)",
  "capabilities": $(jq -r '.capabilities | tojson' manifest.json 2>/dev/null || echo '[]'),
  "tags": ["cortex-plugin", "esm"],
  "repository": "https://github.com/your-org/$PLUGIN_NAME",
  "license": "$(jq -r '.license // "MIT"' manifest.json)"
}
JSON
)"

echo "Submitted $PLUGIN_NAME v$VERSION for review."
```

#### 4. GitHub Actions CI/CD

Add this workflow to `.github/workflows/publish.yml`:

```yaml
name: Publish to Marketplace

on:
  push:
    tags:
      - 'v*'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
        with:
          deno-version: v2.x
      - run: deno task test

  publish:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Publish plugin
        env:
          MARKETPLACE_EMAIL: ${{ secrets.MARKETPLACE_EMAIL }}
          MARKETPLACE_PASSWORD: ${{ secrets.MARKETPLACE_PASSWORD }}
        run: |
          chmod +x ./publish.sh
          ./publish.sh
```

Set `MARKETPLACE_EMAIL` and `MARKETPLACE_PASSWORD` as [GitHub Actions secrets](https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions).

#### 5. Post-Submission

1. Status is set to `pending` automatically
2. Most submissions are reviewed within 48 hours
3. You receive notification when your plugin is reviewed
4. Check status on your [Dashboard](https://cortexprism.io/dashboard)

### Marketplace Review Standards

Reviewers evaluate submissions against these criteria:

| Criterion | Weight | Description |
|-----------|--------|-------------|
| Functionality | Critical | Plugin works as described, all capabilities execute correctly |
| Security | Critical | No dangerous patterns, permissions are minimal and correct |
| Documentation | High | README is clear, installation works, examples are accurate |
| Code Quality | Medium | Error handling, input validation, performance considerations |
| Compliance | High | Licensing, AI disclosure, naming conventions, versioning |

### Resubmission After Rejection

If your submission is rejected:

1. Read the reviewer notes carefully
2. Fix all identified issues
3. Increment the version (PATCH for fixes, MINOR for significant changes)
4. Update CHANGELOG.md with the changes made
5. Resubmit through the standard process

| Rejection Reason | How to Avoid |
|-----------------|-------------|
| Missing or invalid manifest | Validate manifest JSON before submitting |
| Plugin fails to load | Test `cortex plugins install ./my-plugin` before submitting |
| Insufficient documentation | Write complete README with installation and examples |
| Overly broad permissions | Only declare permissions your plugin actually uses |
| Missing license | Include `LICENSE` file with valid SPDX identifier |
| AI disclosure not provided | Add `AI.md` or `aiDisclosure` field if AI tools were used |
| Version already exists | Increment version for new submission |
| Repository not accessible | Make repository public before submitting |

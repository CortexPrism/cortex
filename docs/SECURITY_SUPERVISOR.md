# Security Supervisor System

## Overview

CortexPrism implements a three-layer LLM-based access control system to protect sensitive data from unauthorized agent access. This document describes the architecture, configuration, and usage of the security supervisor.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              Agent Tool Execution Flow                   │
└─────────────────────────────────────────────────────────┘

Agent requests sensitive data
        │
        ↓
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Data Classification                            │
│  - Check sensitivity level of requested data             │
│  - Levels: PUBLIC, NORMAL, SENSITIVE, SECRET             │
└─────────────────────────────────────────────────────────┘
        │
        ├─→ PUBLIC/NORMAL → Allow (no gate)
        │
        └─→ SENSITIVE/SECRET ↓
                             
┌─────────────────────────────────────────────────────────┐
│  Layer 2: LLM Supervisor                                 │
│  - Fast model (Gemini 2.0 Flash, GPT-4o Mini)           │
│  - Decision caching (1-hour session TTL)                │
│  - Confidence scoring (0.0-1.0)                         │
│  - Automatic human escalation for low confidence        │
└─────────────────────────────────────────────────────────┘
        │
        ├─→ ALLOW (confidence > 0.7) → grant access
        │
        └─→ DENY or low confidence ↓
                                    
┌─────────────────────────────────────────────────────────┐
│  Layer 3: Human Approval                                │
│  - CLI: Interactive color-coded prompt                  │
│  - Web UI: Modal with reasoning and sample data         │
│  - Temporary grant: 1-hour TTL per session+tool         │
└─────────────────────────────────────────────────────────┘
        │
        ├─→ Approve → cache grant, allow access
        │
        └─→ Deny (or timeout) → reject access
```

## Data Classification Levels

### PUBLIC (Level 0)
- Freely accessible by any agent
- No supervision required
- **Example:** System constants, public documentation

### NORMAL (Level 1)
- Standard data with basic policy checks
- May require supervisor review depending on tool
- **Example:** Agent configurations, non-sensitive metadata

### SENSITIVE (Level 2) — *Default*
- Requires LLM supervisor approval
- Contains potentially private or confidential information
- **Example:** User preferences, conversation history, audit logs

**Heuristic triggers:**
- Emails, phone numbers, addresses
- Confidential/private/internal markers
- Medical/personal information

### SECRET (Level 3) — *Most Restrictive*
- Requires human approval
- Supervisor escalates automatically
- **Example:** Passwords, API keys, credit card numbers

**Heuristic triggers:**
- `password`, `api_key`, `token` patterns
- 40+ character alphanumeric strings (tokens)
- Credit card numbers (format matching)
- SSNs (format matching)
- AWS credentials (`AKIA...`)
- PEM private keys
- Database connection strings

## Classification System

### Auto-Classification on Write

When agents write to memory or databases, content is automatically classified:

```typescript
// Example: saving a memory note
await memory_note("user prefers dark mode")
// → Classified as SENSITIVE (defaults to sensitive)

await memory_note("password is secret123")
// → Classified as SECRET (matches password pattern)
```

### Backfill for Existing Data

On first startup after deployment, all existing data is classified using the same heuristics:

```
📊 Running data sensitivity backfill...
  ✓ cortex.db: 1,234 rows classified
  ✓ memory.db: 5,678 rows classified
  ✓ lens.db: 9,012 rows classified
✅ Backfill complete: 15,924 rows in 427ms
```

## LLM Supervisor

### Model Selection

The supervisor automatically selects fast, cost-effective models:

1. **Gemini 2.0 Flash** (preferred — 5x faster than GPT-4)
2. **GPT-4o Mini** (fallback if Google unavailable)
3. **Claude 3.5 Haiku** (fallback if OpenAI unavailable)
4. **Config default** (fallback to user-configured provider)

### Decision Caching

To minimize latency and cost, supervisor decisions are cached per session:

- **Key:** `sessionId:tool:queryHash`
- **TTL:** 1 hour per session
- **Benefit:** Same query approved once, no re-evaluation for 1 hour
- **Estimated cost:** $0.001-0.01 per decision

### Confidence Scoring

The supervisor returns a confidence score (0.0-1.0):

- **> 0.7:** Approved (decision is clear)
- **≤ 0.7:** Escalated to human (uncertainty requires judgment)
- **SECRET data:** Always escalated, regardless of confidence

### Example Supervisor Prompt

```
You are a security supervisor for an AI agent system. An agent is requesting 
access to SENSITIVE data.

Request Details:
- Agent ID: agent_claude_main
- Tool: memory_search
- Query: "what are my user's personal preferences?"
- Justification: "Need to personalize the UI experience"
- Data Classification: SENSITIVE

Your Task:
Decide whether this access should be allowed. Consider:
1. Is the agent's justification legitimate and specific?
2. Does the task genuinely require this data?
3. Could the agent accomplish the goal without accessing SENSITIVE data?
4. Is there a risk of the agent leaking or misusing this data?

Response Format (JSON):
{
  "allowed": boolean,
  "reason": "1-2 sentence explanation",
  "confidence": number,  // 0.0-1.0
  "redactions": ["field1", "field2"],  // optional
  "requiresHuman": boolean
}
```

## Human Approval Flows

### CLI Flow

In terminal mode (`deno task dev`), approval appears as an interactive prompt:

```
⚠️  SECURITY APPROVAL REQUIRED

Agent "agent_claude_main" is requesting access to SENSITIVE data.

Tool: memory_search
Query: "user preferences"
Justification: "Personalize UI experience"

AI Supervisor Reasoning:
The agent's request is legitimate. User preferences are needed for 
personalization and this is a common use case. Confidence: 0.8

Allow this access? [y]es / [n]o / [d]etails: 
```

**Options:**
- `y` / `yes`: Grant access (temporary grant for 1 hour)
- `n` / `no`: Deny access (return error with reasoning)
- `d` / `details`: Show sample data from the result

### Web UI Flow

In Web UI mode (`deno task serve`), a modal appears:

1. **Request Details Panel**
   - Agent ID, tool name, query/search
   - User's justification
   - Data classification badge (color-coded)

2. **Supervisor Reasoning**
   - AI supervisor's analysis
   - Confidence score implied by recommendation

3. **Sample Data (Optional)**
   - Click "Show Sample Data" to preview what would be returned
   - Helps user make informed decision

4. **Action Buttons**
   - `Approve Access` — Grant temporary access
   - `Deny Access` — Reject with error
   - `Show Sample Data` — Toggle data preview

**Timeout:** 5 minutes. If no decision made, access is denied.

## Temporary Grants

When an agent is approved (human or supervisor), a temporary grant is issued:

```typescript
// Automatically created when access is approved
grantTemporaryAccess(sessionId, tool, durationMs = 3600000) // 1 hour default
```

**Benefits:**
- Same agent in same session can repeat the same query without re-approval
- Prevents approval fatigue
- Still requires new approval if query changes

**Limitations:**
- Per-session (new agent = new grant needed)
- Per-tool (different tool = new approval)
- Expires after 1 hour (or configured TTL)

## Configuration

### Environment Variables

No environment variables required. Security is enabled by default.

### Configuration File

Add to `~/.cortex/config.json` to customize:

```json
{
  "security": {
    "enabled": true,
    "supervisorModel": "gemini-2.0-flash",
    "approvalTimeoutSeconds": 300,
    "grantDurationSeconds": 3600,
    "defaultSensitivity": "sensitive"
  }
}
```

**Fields:**
- `enabled`: Enable/disable supervisor (default: true)
- `supervisorModel`: Override automatic model selection
- `approvalTimeoutSeconds`: Human approval timeout (default: 300 = 5 min)
- `grantDurationSeconds`: Temporary grant TTL (default: 3600 = 1 hour)
- `defaultSensitivity`: Default classification for unknown data (default: "sensitive")

## Tools with Security Gates

The following tools are automatically protected:

### P0 (Essential) Tools
- **memory_search** — Searches personal memory (episodic/semantic)
- **db_query** — Reads internal databases (cortex, memory, lens, plugins)

### Future Tools (P1-P3)
- **browser** — Screenshots may contain sensitive data
- **structured_extract** — May extract PII from web content
- **image_analyze** — Vision analysis of potentially sensitive images

### Vault Access
- **vault_read** — NOT YET IMPLEMENTED (requires additional safeguards)
- **vault_write** — Completely blocked

## Testing

### Run Tests

```bash
# Security supervisor tests
deno test --allow-all tests/security_supervisor_test.ts

# All tests
deno task test
```

### Manual Testing

**Test 1: Classify sensitive memory**
```bash
deno task dev
> memory_note "password is secret123"
> memory_search "password"
# Should prompt for approval
```

**Test 2: Query audit logs**
```bash
> db_query database=lens query="SELECT * FROM events LIMIT 5"
# Should trigger supervisor approval (audit logs are sensitive)
```

**Test 3: Approve via CLI**
```bash
# When prompted, type: y
# Access granted, data returned
# Approval is cached for 1 hour
```

**Test 4: Web UI approval**
```bash
deno task serve
# Open http://localhost:3000
# Trigger sensitive data access
# Modal appears with approval request
# Click approve/deny buttons
```

## Troubleshooting

### Supervisor Not Responding

**Problem:** "Supervisor LLM failed to respond" error

**Solution:**
1. Check API key for selected provider: `echo $ANTHROPIC_API_KEY`
2. Verify network connectivity
3. Check LLM provider status page
4. Try different provider: `config set security.supervisorModel gpt-4o-mini`

### Too Many Approval Prompts

**Problem:** Getting asked to approve same query repeatedly

**Possible causes:**
- Grant expired (check TTL in config)
- Different session (new session = new grant)
- Different tool or query (must re-approve)

**Solution:** Increase grant duration: `config set security.grantDurationSeconds 7200`

### Approval Modal Stuck

**Problem:** Web UI approval modal won't respond

**Solution:**
1. Check browser console for errors
2. Verify WebSocket connection (should show "connected" badge)
3. Refresh page: `Ctrl+R`
4. Modal has 5-minute timeout; refresh and try again

## Performance Impact

### Latency
- **Supervisor LLM call:** 200-500ms
- **Cached decision:** <10ms
- **Human approval:** User-dependent (blocks agent waiting)

### Cost
- **Per decision:** $0.001-0.01 (using cheap models)
- **Daily estimate (100 decisions):** $0.10-1.00
- **Reduced via caching:** 90% of decisions are cached repeats

## Security Considerations

### What's Protected
- ✅ Memory searches (episodic/semantic)
- ✅ Database queries (audit logs, user data)
- ✅ Screenshots (may contain sensitive UI)

### What's NOT Protected
- ❌ Vault.db (too sensitive, requires separate tool + safeguards)
- ❌ Public data (classified as PUBLIC)
- ❌ Tools without data access (file_read, web_search)

### Limitations
- Classification is heuristic-based (false positives/negatives possible)
- Supervisor LLM can be misled by clever prompts
- Human approval depends on user awareness
- Temporary grants shared across all tools in session

## Future Enhancements

### Planned
- [ ] Policy-based rules ("always allow memory_note from agent_X")
- [ ] Fine-grained redaction (hide specific fields in results)
- [ ] Audit dashboard (review approval history)
- [ ] PII detection (auto-redact credit cards, SSNs from results)

### Under Consideration
- [ ] Multi-user approval workflows
- [ ] Time-based restrictions (approval only during business hours)
- [ ] Cost tracking dashboard
- [ ] Model usage statistics

---

**Related Documentation:**
- [Tool Configuration](./TOOLS_CONFIGURATION.md)
- [Security Policy Rules](./POLICY_RULES.md)
- [Data Privacy Guide](./PRIVACY.md)

**Issue Tracking:**
- Report security issues privately: security@cortexprism.ai
- Report bugs: https://github.com/Cortex-Prism/cortex/issues

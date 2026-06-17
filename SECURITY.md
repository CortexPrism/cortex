# Security Policy

## Supported Versions

Security fixes are applied to the latest stable release. We strongly recommend always running the
most recent version.

| Version         | Supported           |
| --------------- | ------------------- |
| 0.33.x (latest) | Yes                 |
| < 0.33          | No — please upgrade |

---

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

To report a security issue, email us at:

**security@cortexprism.io**

Include as much of the following as you can:

- A description of the vulnerability and the potential impact
- Steps to reproduce (proof-of-concept code or detailed reproduction steps)
- Affected versions
- Any suggested mitigations or patches

### What to expect

| Timeline            | Action                                                                          |
| ------------------- | ------------------------------------------------------------------------------- |
| Within **48 hours** | Acknowledgement of your report                                                  |
| Within **7 days**   | Initial assessment and severity classification                                  |
| Within **30 days**  | Patch developed and tested (complex issues may take longer)                     |
| On fix release      | Public disclosure in the GitHub Security Advisories with credit to the reporter |

We follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure) — we ask
that you give us reasonable time to patch before any public disclosure.

---

## Security Architecture

CortexPrism is designed with a **defense-in-depth** approach. Multiple independent layers protect
against both local misuse and compromised LLM outputs.

### Parallax Policy Validator

Every tool call an agent makes passes through the **policy validator** before execution:

1. The agent emits a tool intent (e.g. `shell("rm -rf /tmp/cache")`)
2. The validator evaluates the intent against all active policy rules (regex allow/deny)
3. The intent is either **approved** (forwarded to the executor), **denied** (error returned to
   agent), or **held for human approval**

Default deny rules (seeded on first `cortex migrate`):

- `rm\s+-rf\s+/` — recursive delete from root
- `:\(\)\{.*\}` — fork bomb patterns
- `dd\s+if=.*of=/dev/` — direct disk writes
- `chmod\s+777\s+/` — world-write on filesystem root

Custom rules can be added with `cortex policy add`.

### AES-256-GCM Vault

API keys and other credentials are stored in an encrypted SQLite database (`vault.db`) using:

- **AES-256-GCM** symmetric encryption
- **PBKDF2** key derivation (100,000 iterations, SHA-256)
- The passphrase is never persisted — it must be supplied via `CORTEX_VAULT_KEY` at runtime

No credentials are written to `config.json` in plain text once they have been vaulted.

### Activity (Audit Log)

All activity is written to an append-only audit log in `lens.db`:

- Every LLM call (provider, model, token counts)
- Every tool call (name, arguments, result, policy decision)
- Every policy evaluation (rule matched, effect, reason)
- Session start / end events

The Lens timeline is visible in the Web UI and queryable via the REST API.

### Sandbox Isolation

Code execution (`cortex run`, `code_exec` tool) runs inside **ephemeral Docker containers** with:

- No network access by default
- Resource limits on CPU and memory
- No host filesystem mounts
- Container destroyed immediately after execution

A subprocess fallback is available for systems without Docker — this provides less isolation but
retains policy gating.

### No Telemetry

CortexPrism collects **no telemetry**. No usage data, prompts, or credentials are ever sent to
external servers. The update check (`cortex update --check`) is the only outbound request made by
the application itself, and it can be skipped by running with `--check` in offline environments.

---

## Known Limitations

- The policy validator operates on **intent strings** — it is a best-effort filter, not a sandboxing
  solution. For high-risk deployments, combine with OS-level sandboxing.
- LLM outputs are processed as text; prompt injection through untrusted content in files or web
  pages is a risk. Review tool call approvals carefully when the agent has processed external
  content.
- The subprocess fallback for code execution has no container isolation — use Docker when running
  untrusted code.

---

## Dependency Security

Dependencies are managed via `deno.json` and `deno.lock`. To audit for known vulnerabilities:

```bash
deno run --allow-net https://deno.land/x/deno_audit/main.ts
```

We encourage contributors to report outdated or vulnerable dependencies via the private email
channel above, or as a regular GitHub issue if the dependency vulnerability is already public.

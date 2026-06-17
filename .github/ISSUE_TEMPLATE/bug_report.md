---
name: Bug Report
about: Report a reproducible bug in CortexPrism
title: 'fix: <short description>'
labels: bug
assignees: ''
---

## Summary

<!-- A clear and concise description of what the bug is. -->

## Steps to Reproduce

1. Run `cortex ...`
2. ...
3. See error

## Expected Behavior

<!-- What you expected to happen. -->

## Actual Behavior

<!-- What actually happened. Paste the full error output below. -->

```
<paste error output here>
```

## Environment

| Field             | Value                                               |
| ----------------- | --------------------------------------------------- |
| OS                | e.g. macOS 14.5, Ubuntu 24.04, Windows 11           |
| Deno version      | run `deno --version`                                |
| Cortex version    | run `cortex --version` or paste the commit hash     |
| Install method    | one-line installer / manual clone / binary download |
| Docker installed? | Yes / No                                            |
| LLM Provider      | e.g. Anthropic, OpenAI, Ollama                      |

## Relevant Config (redact API keys)

```json
// paste relevant section from ~/.cortex/config.json
```

## Additional Context

- Activity log entries (from `cortex serve` → Activity tab, or `~/.cortex/data/lens.db`)
- Screenshots or screen recordings if helpful
- Any recent changes to your setup (new provider, updated Deno, etc.)

## Checklist

- [ ] I can reproduce the bug reliably
- [ ] I have searched [existing issues](https://github.com/CortexPrism/cortex/issues) and this is
      not a duplicate
- [ ] I have redacted all API keys and sensitive data from this report

# Observability & Logging

CortexPrism ships with a full structured logging and observability stack. All components are
opt-in and default to **errors only**.

---

## Log Levels

| Level    | Description                                      |
|----------|--------------------------------------------------|
| `trace`  | Extremely verbose — every round, chunk, span     |
| `debug`  | Internal state: turn start, tool calls, loop     |
| `info`   | Operational events: server start, plugin load    |
| `warn`   | Recoverable problems: policy denials, retries    |
| `error`  | Failures that need attention (default)           |
| `silent` | No output whatsoever                             |

---

## Configuration

Add a `logging` block to `~/.cortex/config.json`:

```json
{
  "logging": {
    "level": "info",
    "fileEnabled": true,
    "fileMaxBytes": 10485760,
    "fileMaxFiles": 5
  }
}
```

Or set the level at runtime:

```bash
cortex log set-level debug
```

Or via environment variable (overrides config):

```bash
CORTEX_LOG_LEVEL=debug cortex chat
```

Log file location (default): `~/.cortex/data/logs/cortex.log`

---

## CLI Commands

```bash
cortex log status                        # Show current logging config
cortex log show                          # Print last 100 entries
cortex log show --lines=200 --level=warn # Filter by level
cortex log show --ns=agent:*             # Filter by namespace
cortex log tail                          # Live tail (Ctrl+C to stop)
cortex log tail --level=debug --ns=llm:* # Tail with filters
cortex log clear                         # Truncate the log file
cortex log path                          # Print log file path
cortex log set-level info                # Update level in config
```

---

## Namespaces

Each subsystem logs under a dotted namespace:

| Namespace          | Subsystem                        |
|--------------------|----------------------------------|
| `agent:loop`       | Main agent turn loop             |
| `server`           | HTTP server startup              |
| `server:ws`        | WebSocket handler                |
| `tools:executor`   | Tool call execution              |
| `trace`            | Distributed tracing spans        |
| `plugin:<name>`    | Per-plugin logger                |
| `langfuse`         | Langfuse integration             |

Filter with `--ns` patterns:
- `agent:*` — all agent subsystems
- `server:ws` — WebSocket only
- `*` — everything

---

## Prometheus / Grafana

Cortex exposes a Prometheus-compatible metrics endpoint at `GET /metrics`.

### Prometheus scrape config

```yaml
scrape_configs:
  - job_name: cortex
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: /metrics
```

### Grafana Alloy (push to Grafana Cloud)

```river
prometheus.scrape "cortex" {
  targets = [{"__address__" = "localhost:3000"}]
  metrics_path = "/metrics"
  forward_to = [prometheus.remote_write.grafana_cloud.receiver]
}

prometheus.remote_write "grafana_cloud" {
  endpoint {
    url = "https://prometheus-prod-<region>.grafana.net/api/prom/push"
    basic_auth {
      username = "<grafana-cloud-instance-id>"
      password = "<grafana-cloud-api-key>"
    }
  }
}
```

---

## OpenTelemetry (OTLP)

Cortex can push traces, logs, and metrics to any OTLP-compatible collector.

Add to `config.json`:

```json
{
  "logging": {
    "otlp": {
      "endpoint": "http://localhost:4318",
      "headers": {
        "Authorization": "Bearer <token>"
      }
    }
  }
}
```

Or via environment variables:

```bash
CORTEX_OTEL_ENDPOINT=http://localhost:4318
```

### Grafana Cloud OTLP (Loki + Tempo)

```json
{
  "logging": {
    "grafana": {
      "otlpEndpoint": "https://otlp-gateway-prod-<region>.grafana.net/otlp",
      "authToken": "<grafana-cloud-access-policy-token>"
    }
  }
}
```

---

## Langfuse (LLM Observability)

[Langfuse](https://langfuse.com) captures per-turn traces, LLM generations (model, tokens, cost),
and tool spans.

Add to `config.json`:

```json
{
  "logging": {
    "langfuse": {
      "publicKey": "pk-lf-...",
      "secretKey": "sk-lf-...",
      "baseUrl": "https://cloud.langfuse.com"
    }
  }
}
```

For self-hosted Langfuse set `baseUrl` to your instance URL.

Each Cortex agent turn creates a Langfuse **trace** with:
- A **span** per tool call (name, input/output, duration)
- A **generation** per LLM call (model, prompt tokens, completion tokens, cost)

---

## Adding Transport via Code

You can add a custom log transport at startup:

```typescript
import { addLogTransport } from './src/utils/logger.ts';
import type { LogEntry, LogTransport } from './src/utils/logger.ts';

class MyTransport implements LogTransport {
  write(entry: LogEntry): void {
    // ship to your backend
    myBackend.send(entry);
  }
}

addLogTransport(new MyTransport());
```

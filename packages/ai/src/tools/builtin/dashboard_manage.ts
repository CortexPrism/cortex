import { join } from '@std/path';
import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import { PATHS } from '../../../../../src/config/paths.ts';

interface Widget {
  id: string;
  type: string;
  row: number;
  col: number;
  width: number;
  height: number;
  title?: string;
  content?: string;
  refresh?: number;
}

interface DashboardConfig {
  widgets: Widget[];
}

const CONFIG_PATH = join(PATHS.configDir, 'dashboard.json');
const VALID_TYPES = [
  'kpi-grid',
  'server-info',
  'system-resources',
  'daemon-status',
  'memory-stats',
  'recent-sessions',
  'daily-tokens-chart',
  'recent-lens',
  'model-breakdown',
  'agent-breakdown',
  'custom',
];

async function readConfig(): Promise<DashboardConfig> {
  try {
    const raw = await Deno.readTextFile(CONFIG_PATH);
    return JSON.parse(raw);
  } catch {
    return { widgets: [] };
  }
}

async function writeConfig(config: DashboardConfig): Promise<void> {
  await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function nextId(config: DashboardConfig): string {
  return 'dw-' + Date.now().toString(36);
}

export const dashboardManageTool: Tool = {
  definition: {
    name: 'dashboard_manage',
    description: `Manage the Cortex dashboard widgets. Operations:
- list: Show all current dashboard widgets
- add: Add a new widget. For 'custom' type, provide 'content' (HTML), optional 'title' and 'refresh' (seconds, min 5).
- remove: Remove a widget by its id
- update: Change a widget's position, size, title, content, or refresh interval`,
    capabilities: ['fs:write', 'fs:read'],
    params: [
      {
        name: 'operation',
        type: 'string',
        description: 'Operation to perform',
        required: true,
        enum: ['list', 'add', 'remove', 'update'],
      },
      {
        name: 'type',
        type: 'string',
        description:
          'Widget type (required for add). Valid types: kpi-grid, server-info, system-resources, daemon-status, memory-stats, recent-sessions, daily-tokens-chart, recent-lens, model-breakdown, agent-breakdown, custom',
        required: false,
      },
      {
        name: 'id',
        type: 'string',
        description: 'Widget id (required for remove, update)',
        required: false,
      },
      {
        name: 'width',
        type: 'number',
        description: 'Grid column span (default 2)',
        required: false,
      },
      {
        name: 'height',
        type: 'number',
        description: 'Grid row span (default 2)',
        required: false,
      },
      {
        name: 'title',
        type: 'string',
        description: 'Custom title for the widget header. Only used with custom type or update.',
        required: false,
      },
      {
        name: 'content',
        type: 'string',
        description:
          'HTML content for custom widgets. Supports inline CSS. Script tags are stripped for safety.',
        required: false,
      },
      {
        name: 'refresh',
        type: 'number',
        description: 'Auto-refresh interval in seconds (min 5). Only applies to custom widgets.',
        required: false,
      },
    ],
  },

  async execute(
    args: Record<string, unknown>,
    _context: ToolContext,
  ): Promise<ToolCallResult> {
    const start = Date.now();
    const op = String(args.operation ?? 'list');

    try {
      let config = await readConfig();

      switch (op) {
        case 'list': {
          if (!config.widgets.length) {
            return ok(
              'No widgets configured. The dashboard uses default widgets when the config is empty.',
              start,
            );
          }
          const lines = config.widgets.map((w, i) => {
            const extra = w.type === 'custom'
              ? ` title="${w.title || ''}" content=${(w.content || '').length}chars`
              : '';
            return `${
              i + 1
            }. [${w.id}] ${w.type} (${w.width}×${w.height} at row ${w.row}, col ${w.col})${extra}`;
          });
          return ok(`Dashboard widgets (${config.widgets.length}):\n${lines.join('\n')}`, start);
        }

        case 'add': {
          const type = String(args.type ?? '');
          if (!type) return err('Missing required parameter: type', start);
          if (!VALID_TYPES.includes(type)) {
            return err(`Invalid type "${type}". Valid types: ${VALID_TYPES.join(', ')}`, start);
          }

          const width = typeof args.width === 'number' ? Math.max(1, Math.min(4, args.width)) : 2;
          const height = typeof args.height === 'number'
            ? Math.max(1, Math.min(4, args.height))
            : 2;

          // Find max row for placement
          let maxRow = 0;
          for (const w of config.widgets) {
            const bottom = w.row + w.height - 1;
            if (bottom > maxRow) maxRow = bottom;
          }

          const widget: Widget = {
            id: nextId(config),
            type,
            row: maxRow + 1,
            col: 1,
            width,
            height,
          };

          if (type === 'custom') {
            const content = String(args.content ?? '');
            if (!content) {
              return err('Custom widgets require "content" parameter (HTML string)', start);
            }
            widget.content = content;
            if (args.title) widget.title = String(args.title);
            if (typeof args.refresh === 'number') {
              widget.refresh = Math.max(5, args.refresh);
            }
          }
          if (args.title && type !== 'custom') {
            widget.title = String(args.title);
          }

          config.widgets.push(widget);
          await writeConfig(config);
          return ok(
            `Widget added: [${widget.id}] ${type} (${width}×${height}) at row ${
              maxRow + 1
            }. Refresh the dashboard to see it.`,
            start,
          );
        }

        case 'remove': {
          const id = String(args.id ?? '');
          if (!id) return err('Missing required parameter: id', start);
          const idx = config.widgets.findIndex((w) => w.id === id);
          if (idx === -1) {
            return err(`Widget "${id}" not found. Use list to see current widgets.`, start);
          }
          const removed = config.widgets[idx];
          config.widgets.splice(idx, 1);
          await writeConfig(config);
          return ok(
            `Widget removed: [${removed.id}] ${removed.type}. Refresh the dashboard to see changes.`,
            start,
          );
        }

        case 'update': {
          const id = String(args.id ?? '');
          if (!id) return err('Missing required parameter: id', start);
          const widget = config.widgets.find((w) => w.id === id);
          if (!widget) {
            return err(`Widget "${id}" not found. Use list to see current widgets.`, start);
          }

          const changed: string[] = [];
          if (typeof args.width === 'number') {
            widget.width = Math.max(1, Math.min(4, args.width));
            changed.push(`width=${widget.width}`);
          }
          if (typeof args.height === 'number') {
            widget.height = Math.max(1, Math.min(4, args.height));
            changed.push(`height=${widget.height}`);
          }
          if (args.title !== undefined && args.title !== null) {
            widget.title = String(args.title);
            changed.push(`title="${widget.title}"`);
          }
          if (args.content !== undefined && args.content !== null && widget.type === 'custom') {
            widget.content = String(args.content);
            changed.push(`content=${widget.content.length}chars`);
          }
          if (typeof args.refresh === 'number' && widget.type === 'custom') {
            widget.refresh = Math.max(5, args.refresh);
            changed.push(`refresh=${widget.refresh}s`);
          }

          if (!changed.length) {
            return err(
              'No changes specified. Provide at least one of: width, height, title, content, refresh',
              start,
            );
          }
          await writeConfig(config);
          return ok(
            `Widget updated: [${widget.id}] ${widget.type} — ${
              changed.join(', ')
            }. Refresh the dashboard to see changes.`,
            start,
          );
        }

        default:
          return err(`Unknown operation: "${op}". Use list, add, remove, or update.`, start);
      }
    } catch (e) {
      return err(`Dashboard config error: ${(e as Error).message}`, start);
    }
  },
};

function ok(output: string, startMs: number): ToolCallResult {
  return { toolName: 'dashboard_manage', success: true, output, durationMs: Date.now() - startMs };
}

function err(error: string, startMs: number): ToolCallResult {
  return {
    toolName: 'dashboard_manage',
    success: false,
    output: '',
    error,
    durationMs: Date.now() - startMs,
  };
}

export default dashboardManageTool;

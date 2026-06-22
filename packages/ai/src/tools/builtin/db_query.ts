/**
 * Database Query Tool
 *
 * Enables agents to query internal databases (cortex, memory, lens, plugins, session)
 * in read-only mode with security supervision for sensitive data access.
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import {
  getCoreDb,
  getLensDb,
  getMemoryDb,
  getPluginsDb,
  getSessionDb,
} from '../../../../../src/db/client.ts';
import { classifyContent, requiresSupervisor } from '../../../../../src/security/classification.ts';
import { requestSupervisorDecision } from '../../../../../src/security/supervisor.ts';
import type { SensitivityLevel } from '../../../../../src/security/classification.ts';

/**
 * Validate that a SQL query is read-only (SELECT, PRAGMA, EXPLAIN)
 * Blocks: INSERT, UPDATE, DELETE, DROP, ALTER, CREATE, ATTACH, DETACH, VACUUM
 */
function validateReadOnlyQuery(sql: string): { valid: boolean; reason?: string } {
  const normalized = sql.trim().toUpperCase();

  // Block write operations
  const writeKeywords = [
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'ALTER',
    'CREATE',
    'ATTACH',
    'DETACH',
    'VACUUM',
    'REPLACE',
  ];

  for (const keyword of writeKeywords) {
    if (normalized.includes(keyword)) {
      return { valid: false, reason: `Write operations (${keyword}) not allowed` };
    }
  }

  // Allow SELECT, WITH, PRAGMA, EXPLAIN
  const allowedKeywords = ['SELECT', 'WITH', 'PRAGMA', 'EXPLAIN'];
  const startsWithAllowed = allowedKeywords.some((kw) => normalized.startsWith(kw));

  if (!startsWithAllowed && !normalized.startsWith('(')) {
    return {
      valid: false,
      reason: 'Query must be SELECT, WITH, PRAGMA, or EXPLAIN',
    };
  }

  return { valid: true };
}

/**
 * Format query results as table, JSON, or CSV
 */
function formatResults(
  rows: Record<string, unknown>[],
  format: 'table' | 'json' | 'csv',
): string {
  if (rows.length === 0) {
    return format === 'json' ? '[]' : format === 'csv' ? '' : '(no results)';
  }

  if (format === 'json') {
    return JSON.stringify(rows, null, 2);
  }

  if (format === 'csv') {
    const keys = Object.keys(rows[0]);
    const header = keys.map((k) => `"${k}"`).join(',');
    const lines = [header];
    for (const row of rows) {
      const values = keys.map((k) => {
        const v = row[k];
        if (v === null || v === undefined) return '""';
        const s = String(v);
        return `"${s.replace(/"/g, '""')}"`;
      });
      lines.push(values.join(','));
    }
    return lines.join('\n');
  }

  // Table format: ASCII table
  const keys = Object.keys(rows[0]);
  const colWidths = keys.map((k) => {
    const headerLen = k.length;
    const maxValLen = Math.max(
      ...rows.map((r) => String(r[k] ?? '').length),
    );
    return Math.min(Math.max(headerLen, maxValLen), 50); // Cap at 50
  });

  const lines: string[] = [];

  // Header
  const headerLine = keys
    .map((k, i) => k.padEnd(colWidths[i]))
    .join(' | ');
  lines.push(headerLine);
  lines.push('-'.repeat(headerLine.length));

  // Rows
  for (const row of rows) {
    const line = keys
      .map((k, i) => {
        let v = String(row[k] ?? '');
        if (v.length > colWidths[i]) {
          v = v.substring(0, colWidths[i] - 3) + '...';
        }
        return v.padEnd(colWidths[i]);
      })
      .join(' | ');
    lines.push(line);
  }

  return lines.join('\n');
}

export const dbQueryTool: Tool = {
  definition: {
    name: 'db_query',
    description:
      'Query internal CortexPrism databases (cortex, memory, lens, plugins) in read-only mode. Supports SELECT, WITH, PRAGMA, and EXPLAIN. Automatically supervised for sensitive data access. Blocks all write operations (INSERT, UPDATE, DELETE, etc.).',
    params: [
      {
        name: 'database',
        type: 'string',
        description:
          'Database to query: cortex (sessions/agents), memory (episodic/semantic/reflection/graph), lens (audit logs), plugins (plugin registry), or session (session-specific data)',
        required: true,
        enum: ['cortex', 'memory', 'lens', 'plugins', 'session'],
      },
      {
        name: 'query',
        type: 'string',
        description:
          'SQL SELECT query (required). Read-only only. Use PRAGMA table_list or PRAGMA table_info(table_name) to introspect schema.',
        required: true,
      },
      {
        name: 'format',
        type: 'string',
        description: 'Output format (default: "table"). Options: table, json, csv',
        required: false,
        enum: ['table', 'json', 'csv'],
      },
      {
        name: 'sessionId',
        type: 'string',
        description: 'Session ID (required for session database, used for scoping)',
        required: false,
      },
      {
        name: 'reason',
        type: 'string',
        description: 'Justification for query (used by security supervisor for audit trail)',
        required: false,
      },
    ],
    capabilities: ['db:read'],
  },

  async execute(args: Record<string, unknown>, context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      // Validate inputs
      const database = String(args.database ?? '').toLowerCase();
      if (!['cortex', 'memory', 'lens', 'plugins', 'session'].includes(database)) {
        return {
          toolName: 'db_query',
          success: false,
          output: '',
          error: 'database must be one of: cortex, memory, lens, plugins, session',
          durationMs: Date.now() - start,
        };
      }

      const query = String(args.query ?? '').trim();
      if (!query) {
        return {
          toolName: 'db_query',
          success: false,
          output: '',
          error: 'query parameter is required',
          durationMs: Date.now() - start,
        };
      }

      // Validate read-only
      const validation = validateReadOnlyQuery(query);
      if (!validation.valid) {
        return {
          toolName: 'db_query',
          success: false,
          output: '',
          error: validation.reason || 'Invalid query',
          durationMs: Date.now() - start,
        };
      }

      const format = (args.format ?? 'table') as 'table' | 'json' | 'csv';
      const sessionId = (args.sessionId ?? context.sessionId) as string;
      const reason = (args.reason ?? '') as string;

      // Get database connection
      let db;
      if (database === 'cortex') {
        db = await getCoreDb();
      } else if (database === 'memory') {
        db = await getMemoryDb();
      } else if (database === 'lens') {
        db = await getLensDb();
      } else if (database === 'plugins') {
        db = await getPluginsDb();
      } else if (database === 'session') {
        db = await getSessionDb(sessionId);
      } else {
        return {
          toolName: 'db_query',
          success: false,
          output: '',
          error: 'Unknown database',
          durationMs: Date.now() - start,
        };
      }

      // Execute query
      const rows = await db.all(query);

      // Determine sensitivity based on database and content
      let sensitivity: SensitivityLevel = 'normal';
      if (database === 'lens') {
        // Audit logs are at least sensitive
        sensitivity = 'sensitive';
      } else if (rows.length > 0) {
        // Check content sensitivity
        const content = JSON.stringify(rows).substring(0, 1000);
        sensitivity = classifyContent(content) as SensitivityLevel;
      }

      // Apply security gates
      if (requiresSupervisor(sensitivity)) {
        const decision = await requestSupervisorDecision({
          tool: 'db_query',
          query,
          requestReason: reason,
          sessionId: context.sessionId || 'unknown',
          agentId: context.agentId || 'unknown',
          dataClassification: sensitivity,
          sampleData: rows.length > 0 ? JSON.stringify(rows[0]).substring(0, 200) : undefined,
        });

        if (!decision.allowed) {
          return {
            toolName: 'db_query',
            success: false,
            output: '',
            error: `Access denied: ${decision.reason}`,
            durationMs: Date.now() - start,
          };
        }
      }

      // Format and return results
      const formatted = formatResults(rows as Record<string, unknown>[], format);

      return {
        toolName: 'db_query',
        success: true,
        output: formatted,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        toolName: 'db_query',
        success: false,
        output: '',
        error: `Query failed: ${error instanceof Error ? error.message : String(error)}`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default dbQueryTool;

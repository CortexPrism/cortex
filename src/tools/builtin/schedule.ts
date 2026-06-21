/**
 * Schedule Tool
 *
 * Create, list, cancel, and manage scheduled recurring tasks using cron expressions.
 * Integrates with the existing scheduler infrastructure (src/scheduler/).
 */

import type { Tool, ToolCallResult, ToolContext } from '../types.ts';
import {
  cancelJob,
  createJob,
  getDueJobs,
  listJobs,
  markJobDone,
  markJobFailed,
} from '../../scheduler/scheduler.ts';
import { nextCronDate } from '../../scheduler/cron.ts';
import type { JobRow, JobStatus } from '../../scheduler/scheduler.ts';

function formatJob(job: JobRow): string {
  const lines = [
    `  **${job.name}**  \`${job.id}\``,
    `    Status: \`${job.status}\` | Kind: \`${job.kind}\` | Schedule: \`${
      job.schedule ?? 'N/A'
    }\``,
    `    Command: \`${job.command}\``,
    `    Attempts: ${job.attempts}/${job.max_attempts}`,
    job.next_run_at ? `    Next Run: ${job.next_run_at}` : '',
    job.last_run_at ? `    Last Run: ${job.last_run_at}` : '',
    job.last_error ? `    Last Error: ${job.last_error}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

export const scheduleTool: Tool = {
  definition: {
    name: 'schedule',
    description:
      'Create, list, cancel, and manage scheduled recurring tasks. Supports cron expressions for flexible scheduling (e.g., "0 9 * * *" for daily at 9am).',
    params: [
      {
        name: 'action',
        type: 'string',
        description:
          'Schedule action: create (schedule a new job), list (list all jobs), cancel (cancel a job), status (check a specific job), due (list due jobs)',
        required: true,
        enum: ['create', 'list', 'cancel', 'status', 'due'],
      },
      {
        name: 'name',
        type: 'string',
        description: 'Job name (required for create)',
        required: false,
      },
      {
        name: 'cron',
        type: 'string',
        description:
          'Cron expression for scheduling (e.g., "0 9 * * *", "*/15 * * * *"). Required for create.',
        required: false,
      },
      {
        name: 'command',
        type: 'string',
        description: 'Shell command or task to execute on schedule. Required for create.',
        required: false,
      },
      {
        name: 'kind',
        type: 'string',
        description:
          'Schedule kind: "once" (one-time), "cron" (recurring with cron), "interval" (fixed interval). Default: "cron"',
        required: false,
        enum: ['once', 'cron', 'interval'],
      },
      {
        name: 'job_id',
        type: 'string',
        description: 'Job ID (required for cancel and status actions)',
        required: false,
      },
      {
        name: 'max_attempts',
        type: 'number',
        description: 'Maximum retry attempts on failure (default: 3)',
        required: false,
      },
    ],
    capabilities: ['db:read'],
  },

  async execute(args: Record<string, unknown>, _context: ToolContext): Promise<ToolCallResult> {
    const start = Date.now();

    try {
      const action = String(args.action ?? '').toLowerCase();

      if (!['create', 'list', 'cancel', 'status', 'due'].includes(action)) {
        return {
          toolName: 'schedule',
          success: false,
          output: '',
          error: 'action must be one of: create, list, cancel, status, due',
          durationMs: Date.now() - start,
        };
      }

      switch (action) {
        case 'list': {
          const statusFilter = args.status as JobStatus | undefined;
          const jobs = await listJobs(statusFilter);

          if (jobs.length === 0) {
            return {
              toolName: 'schedule',
              success: true,
              output: 'No scheduled jobs found.',
              durationMs: Date.now() - start,
            };
          }

          const output = [
            `**Scheduled Jobs** (${jobs.length} total)`,
            '',
            ...jobs.map((j: JobRow) => formatJob(j)),
          ].join('\n');

          return {
            toolName: 'schedule',
            success: true,
            output,
            durationMs: Date.now() - start,
          };
        }

        case 'due': {
          const jobs = await getDueJobs();

          if (jobs.length === 0) {
            return {
              toolName: 'schedule',
              success: true,
              output: 'No jobs currently due for execution.',
              durationMs: Date.now() - start,
            };
          }

          const output = [
            `**Due Jobs** (${jobs.length} pending)`,
            '',
            ...jobs.map((j: JobRow) => formatJob(j)),
          ].join('\n');

          return {
            toolName: 'schedule',
            success: true,
            output,
            durationMs: Date.now() - start,
          };
        }

        case 'create': {
          const name = String(args.name ?? '').trim();
          if (!name) {
            return {
              toolName: 'schedule',
              success: false,
              output: '',
              error: 'name parameter is required for create action',
              durationMs: Date.now() - start,
            };
          }

          const command = String(args.command ?? '').trim();
          if (!command) {
            return {
              toolName: 'schedule',
              success: false,
              output: '',
              error: 'command parameter is required for create action',
              durationMs: Date.now() - start,
            };
          }

          const kind = (args.kind as string) ?? 'cron';
          const schedule = (args.cron as string) ?? null;

          // Validate cron expression if kind is 'cron'
          if (kind === 'cron') {
            if (!schedule) {
              return {
                toolName: 'schedule',
                success: false,
                output: '',
                error: 'cron parameter is required when kind is "cron"',
                durationMs: Date.now() - start,
              };
            }

            try {
              nextCronDate(schedule);
            } catch (e) {
              return {
                toolName: 'schedule',
                success: false,
                output: '',
                error: `Invalid cron expression: ${schedule}. ${
                  e instanceof Error ? e.message : ''
                }`,
                durationMs: Date.now() - start,
              };
            }
          }

          const maxAttempts = typeof args.max_attempts === 'number' ? args.max_attempts : 3;
          const now = new Date();
          const runAt = kind === 'once' ? now : nextCronDate(schedule ?? '* * * * *');

          const jobId = await createJob({
            name,
            kind: kind as 'once' | 'cron' | 'interval',
            schedule: kind === 'cron' ? schedule : undefined,
            command,
            maxAttempts,
            runAt,
            source: `tool:${_context.agentId ?? 'unknown'}`,
            upsert: true,
          });

          return {
            toolName: 'schedule',
            success: true,
            output: [
              `**Job Created** \`${jobId}\``,
              '',
              `  Name: ${name}`,
              `  Kind: ${kind}`,
              schedule ? `  Cron: \`${schedule}\`` : '',
              `  Next Run: ${runAt.toISOString()}`,
              `  Command: \`${command}\``,
              `  Max Attempts: ${maxAttempts}`,
            ]
              .filter(Boolean)
              .join('\n'),
            durationMs: Date.now() - start,
          };
        }

        case 'cancel': {
          const jobId = String(args.job_id ?? '').trim();
          if (!jobId) {
            return {
              toolName: 'schedule',
              success: false,
              output: '',
              error: 'job_id parameter is required for cancel action',
              durationMs: Date.now() - start,
            };
          }

          await cancelJob(jobId);

          return {
            toolName: 'schedule',
            success: true,
            output: `Job \`${jobId}\` cancelled successfully.`,
            durationMs: Date.now() - start,
          };
        }

        case 'status': {
          const jobId = String(args.job_id ?? '').trim();
          if (!jobId) {
            return {
              toolName: 'schedule',
              success: false,
              output: '',
              error: 'job_id parameter is required for status action',
              durationMs: Date.now() - start,
            };
          }

          const jobs = await listJobs();
          const job = jobs.find((j: JobRow) => j.id === jobId);

          if (!job) {
            return {
              toolName: 'schedule',
              success: false,
              output: '',
              error: `Job not found: ${jobId}`,
              durationMs: Date.now() - start,
            };
          }

          return {
            toolName: 'schedule',
            success: true,
            output: `**Job Status**\n\n${formatJob(job)}`,
            durationMs: Date.now() - start,
          };
        }

        default:
          return {
            toolName: 'schedule',
            success: false,
            output: '',
            error: `Unknown action: ${action}`,
            durationMs: Date.now() - start,
          };
      }
    } catch (error) {
      return {
        toolName: 'schedule',
        success: false,
        output: '',
        error: `Schedule operation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        durationMs: Date.now() - start,
      };
    }
  },
};

export default scheduleTool;

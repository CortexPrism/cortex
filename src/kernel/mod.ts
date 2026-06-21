/**
 * CortexPrism OS Kernel — system call dispatcher, capability enforcement,
 * and resource accounting for the agent operating system.
 *
 * The kernel is a singleton that sits between agent processes (user-space)
 * and OS services (daemons, memory, tools, DB). Every agent operation flows
 * through the kernel for capability checking and resource tracking.
 */
import type { CapabilityGroup } from '../tools/types.ts';
import { CAPABILITY_GROUP_MEMBERS, type ToolCapability } from '../tools/types.ts';
import type { ResourceLimits } from '../config/config.ts';

// ── Kernel Context ───────────────────────────────────────────

export interface KernelContext {
  /** Agent session ID making the call. */
  sessionId: string;
  /** Agent ID for identity-based checks. */
  agentId: string;
  /** Agent role for RBAC. */
  role: KernelRole;
  /** Process ID for resource tracking. */
  pid: number;
  /** Resource limits for this process. */
  limits?: ResourceLimits;
  /** Parent process ID (0 = root). */
  parentPid: number;
}

// ── RBAC Roles ───────────────────────────────────────────────

export type KernelRole = 'admin' | 'operator' | 'user' | 'agent';

/** Capability groups granted to each role by default. */
export const ROLE_CAPABILITIES: Record<KernelRole, CapabilityGroup[]> = {
  admin: [
    'CAP_FILE',
    'CAP_SHELL',
    'CAP_NET',
    'CAP_MEMORY',
    'CAP_GIT',
    'CAP_AGENT',
    'CAP_CODE',
    'CAP_UI',
    'CAP_SYSTEM',
    'CAP_SKILL',
    'CAP_SCHEDULE',
    'CAP_BROWSER',
  ],
  operator: [
    'CAP_FILE',
    'CAP_SHELL',
    'CAP_NET',
    'CAP_MEMORY',
    'CAP_GIT',
    'CAP_CODE',
    'CAP_SKILL',
    'CAP_SCHEDULE',
  ],
  user: [
    'CAP_FILE',
    'CAP_SHELL',
    'CAP_NET',
    'CAP_MEMORY',
    'CAP_GIT',
    'CAP_CODE',
    'CAP_SKILL',
  ],
  agent: [
    'CAP_FILE',
    'CAP_SHELL',
    'CAP_NET',
    'CAP_MEMORY',
    'CAP_GIT',
    'CAP_CODE',
    'CAP_SKILL',
  ],
};

/** Human-readable role labels. */
export const ROLE_LABELS: Record<KernelRole, string> = {
  admin: 'Administrator',
  operator: 'Operator',
  user: 'User',
  agent: 'Agent',
};

// ── Syscall Dispatch ─────────────────────────────────────────

export type KernelSyscall =
  | { op: 'tool_call'; toolName: string; caps: CapabilityGroup[]; args: Record<string, unknown> }
  | { op: 'memory_read'; tier: string }
  | { op: 'memory_write'; tier: string }
  | { op: 'spawn_agent'; agentType: string }
  | { op: 'db_query'; dbName: string }
  | { op: 'schedule_job'; jobKind: string }
  | { op: 'system_info' };

export interface SyscallResult {
  allowed: boolean;
  reason?: string;
  /** Fine-grained capabilities required. */
  requiredCaps: CapabilityGroup[];
  /** Capabilities the caller was missing. */
  missingCaps: CapabilityGroup[];
}

// ── Resource Accounting ──────────────────────────────────────

interface ResourceEntry {
  agentId: string;
  pid: number;
  toolCalls: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  cpuMs: number;
  peakMemoryMb: number;
  lastUpdated: number;
}

// ── Process Registry ─────────────────────────────────────────

interface ProcessEntry {
  pid: number;
  parentPid: number;
  agentId: string;
  sessionId: string;
  role: KernelRole;
  startedAt: number;
  agentType?: string;
  status: 'running' | 'exited';
}

// ── Kernel ───────────────────────────────────────────────────

export class OsKernel {
  private resources = new Map<string, ResourceEntry>();
  private processes = new Map<number, ProcessEntry>();
  private static _instance: OsKernel | null = null;

  static get instance(): OsKernel {
    if (!this._instance) this._instance = new OsKernel();
    return this._instance;
  }

  // ── Capability Enforcement ─────────────────────────────────

  /** Check if a context has the required capability groups. */
  checkCapability(ctx: KernelContext, required: CapabilityGroup[]): SyscallResult {
    const granted = ROLE_CAPABILITIES[ctx.role] ?? [];
    const grantedSet = new Set(granted);
    const missing: CapabilityGroup[] = [];

    for (const cap of required) {
      if (!grantedSet.has(cap)) missing.push(cap);
    }

    if (missing.length > 0) {
      return {
        allowed: false,
        reason: `Role "${ctx.role}" missing capabilities: ${missing.join(', ')}`,
        requiredCaps: required,
        missingCaps: missing,
      };
    }

    return { allowed: true, requiredCaps: required, missingCaps: [] };
  }

  /** Check if a specific tool capability is allowed. */
  checkToolCap(ctx: KernelContext, cap: ToolCapability): boolean {
    const granted = ROLE_CAPABILITIES[ctx.role] ?? [];
    for (const group of granted) {
      const members = CAPABILITY_GROUP_MEMBERS[group] ?? [];
      if (members.includes(cap)) return true;
    }
    return false;
  }

  // ── Resource Accounting ────────────────────────────────────

  /** Record a tool call for resource tracking. */
  recordToolCall(ctx: KernelContext, durationMs: number): void {
    const key = ctx.agentId;
    let entry = this.resources.get(key);
    if (!entry) {
      entry = {
        agentId: ctx.agentId,
        pid: ctx.pid,
        toolCalls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        cpuMs: 0,
        peakMemoryMb: 0,
        lastUpdated: Date.now(),
      };
      this.resources.set(key, entry);
    }
    entry.toolCalls++;
    entry.cpuMs += durationMs;
    entry.lastUpdated = Date.now();
  }

  /** Record token usage for cost tracking. */
  recordTokens(agentId: string, tokensIn: number, tokensOut: number, costUsd: number): void {
    let entry = this.resources.get(agentId);
    if (!entry) {
      entry = {
        agentId,
        pid: 0,
        toolCalls: 0,
        tokensIn: 0,
        tokensOut: 0,
        costUsd: 0,
        cpuMs: 0,
        peakMemoryMb: 0,
        lastUpdated: Date.now(),
      };
      this.resources.set(agentId, entry);
    }
    entry.tokensIn += tokensIn;
    entry.tokensOut += tokensOut;
    entry.costUsd += costUsd;
    entry.lastUpdated = Date.now();
  }

  /** Get resource usage for an agent. */
  getResources(agentId: string): ResourceEntry | undefined {
    return this.resources.get(agentId);
  }

  /** Get all resource entries. */
  getAllResources(): ResourceEntry[] {
    return [...this.resources.values()];
  }

  // ── Process Registry ───────────────────────────────────────

  /** Register a new process in the kernel. */
  registerProcess(entry: Omit<ProcessEntry, 'status' | 'startedAt'>): void {
    this.processes.set(entry.pid, {
      ...entry,
      status: 'running',
      startedAt: Date.now(),
    });
  }

  /** Mark a process as exited. */
  unregisterProcess(pid: number): void {
    const proc = this.processes.get(pid);
    if (proc) proc.status = 'exited';
  }

  /** Get a process by PID. */
  getProcess(pid: number): ProcessEntry | undefined {
    return this.processes.get(pid);
  }

  /** Get all child processes of a parent. */
  getChildProcesses(parentPid: number): ProcessEntry[] {
    return [...this.processes.values()].filter((p) => p.parentPid === parentPid);
  }

  /** Get the full process tree. */
  getProcessTree(): ProcessEntry[] {
    return [...this.processes.values()];
  }

  /** Get process tree as a nested structure for rendering. */
  getProcessTreeForDisplay(): ProcessTreeNode[] {
    const roots = [...this.processes.values()].filter((p) => p.parentPid === 0);
    return roots.map((root) => this._buildTreeNode(root));
  }

  private _buildTreeNode(proc: ProcessEntry): ProcessTreeNode {
    const children = [...this.processes.values()].filter((p) => p.parentPid === proc.pid);
    return {
      pid: proc.pid,
      agentId: proc.agentId,
      sessionId: proc.sessionId,
      role: proc.role,
      agentType: proc.agentType,
      status: proc.status,
      startedAt: proc.startedAt,
      children: children.map((c) => this._buildTreeNode(c)),
    };
  }

  // ── RBAC ───────────────────────────────────────────────────

  /** Get the capability groups for a role. */
  getRoleCapabilities(role: KernelRole): CapabilityGroup[] {
    return ROLE_CAPABILITIES[role] ?? [];
  }

  /** Check if a role has a specific capability group. */
  roleHasCap(role: KernelRole, cap: CapabilityGroup): boolean {
    return (ROLE_CAPABILITIES[role] ?? []).includes(cap);
  }

  /** Resolve a role from a string (for API input). */
  resolveRole(input: string): KernelRole {
    const normalized = input.toLowerCase();
    if (['admin', 'administrator', 'root'].includes(normalized)) return 'admin';
    if (['operator', 'ops', 'devops'].includes(normalized)) return 'operator';
    if (['user', 'owner'].includes(normalized)) return 'user';
    return 'agent';
  }
}

// ── Process Tree Display ─────────────────────────────────────

export interface ProcessTreeNode {
  pid: number;
  agentId: string;
  sessionId: string;
  role: KernelRole;
  agentType?: string;
  status: string;
  startedAt: number;
  children: ProcessTreeNode[];
}

/** Convenience accessor for the kernel singleton. */
export const kernel = OsKernel.instance;

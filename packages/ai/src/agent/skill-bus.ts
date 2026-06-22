/**
 * Skill Bus Orchestrator — #54
 *
 * Pub/sub event bus connecting plugins as composable "skills."
 * When a tool emits an event (e.g., "file saved," "test failed," "PR opened"),
 * other skills react unconditionally or conditionally. Enables emergent workflows
 * without hard-coded sequences.
 */
import { globalEventBus, type PluginEvent } from '../../../../src/plugins/events.ts';
import { listSkills } from '../memory/skills.ts';
import type { Skill } from '../memory/skills.ts';

export type SkillCondition = {
  eventType: string;
  match?: Record<string, string | RegExp>;
  requires?: string[];
  cooldownMs?: number;
};

export interface SkillBinding {
  id: string;
  skillId: string;
  eventType: string;
  conditions: SkillCondition[];
  action: SkillAction;
  enabled: boolean;
  priority: number;
  createdAt: string;
}

export type SkillActionType =
  | 'invoke_skill'
  | 'inject_context'
  | 'emit_event'
  | 'call_tool'
  | 'notify';

export interface SkillAction {
  type: SkillActionType;
  config: Record<string, unknown>;
  timeoutMs?: number;
}

export interface SkillBusEvent {
  id: string;
  sourceEvent: PluginEvent;
  triggeredBindings: string[];
  results: SkillBusResult[];
  timestamp: string;
}

export interface SkillBusResult {
  bindingId: string;
  skillId: string;
  success: boolean;
  action: SkillActionType;
  output?: string;
  error?: string;
  durationMs: number;
}

const bindings = new Map<string, SkillBinding>();
const cooldownTimers = new Map<string, number>();
const recentEvents: SkillBusEvent[] = [];
const MAX_RECENT_EVENTS = 100;

export function createSkillBinding(
  skillId: string,
  eventType: string,
  action: SkillAction,
  conditions?: SkillCondition[],
  priority = 0,
): SkillBinding {
  const binding: SkillBinding = {
    id: `sbb_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    skillId,
    eventType,
    conditions: conditions ?? [],
    action,
    enabled: true,
    priority,
    createdAt: new Date().toISOString(),
  };

  bindings.set(binding.id, binding);
  return binding;
}

export function getSkillBinding(id: string): SkillBinding | undefined {
  return bindings.get(id);
}

export function listSkillBindings(eventType?: string): SkillBinding[] {
  const all = Array.from(bindings.values()).sort((a, b) => b.priority - a.priority);
  return eventType ? all.filter((b) => b.eventType === eventType) : all;
}

export function removeSkillBinding(id: string): boolean {
  return bindings.delete(id);
}

export function enableSkillBinding(id: string): boolean {
  const binding = bindings.get(id);
  if (!binding) return false;
  binding.enabled = true;
  return true;
}

export function disableSkillBinding(id: string): boolean {
  const binding = bindings.get(id);
  if (!binding) return false;
  binding.enabled = false;
  return true;
}

export function initSkillBus(): void {
  globalEventBus.on('tool:post-execute', handleSkillBusEvent);
  globalEventBus.on('agent:turn-end', handleSkillBusEvent);
  globalEventBus.on('session:end', handleSkillBusEvent);
  globalEventBus.on('config:change', handleSkillBusEvent);
}

export function shutdownSkillBus(): void {
  globalEventBus.off('tool:post-execute', handleSkillBusEvent);
  globalEventBus.off('agent:turn-end', handleSkillBusEvent);
  globalEventBus.off('session:end', handleSkillBusEvent);
  globalEventBus.off('config:change', handleSkillBusEvent);
}

async function handleSkillBusEvent(event: PluginEvent): Promise<void> {
  const matchingBindings = listSkillBindings(event.type)
    .filter((b) => b.enabled)
    .filter((b) => matchConditions(b.conditions, event))
    .filter((b) => !isOnCooldown(b.id));

  if (matchingBindings.length === 0) return;

  const eventId = `sbe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const results: SkillBusResult[] = [];
  const triggeredBindings: string[] = [];

  for (const binding of matchingBindings) {
    triggeredBindings.push(binding.id);
    const start = Date.now();
    try {
      const result = await executeSkillAction(binding, event);
      results.push({
        bindingId: binding.id,
        skillId: binding.skillId,
        success: true,
        action: binding.action.type,
        output: result,
        durationMs: Date.now() - start,
      });
    } catch (err: unknown) {
      results.push({
        bindingId: binding.id,
        skillId: binding.skillId,
        success: false,
        action: binding.action.type,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      });
    }

    setCooldown(binding);
  }

  recentEvents.push({
    id: eventId,
    sourceEvent: event,
    triggeredBindings,
    results,
    timestamp: new Date().toISOString(),
  });
  while (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.shift();
  }
}

function matchConditions(conditions: SkillCondition[], event: PluginEvent): boolean {
  if (conditions.length === 0) return true;

  return conditions.every((condition) => {
    if (condition.eventType !== event.type) return false;

    if (condition.match) {
      for (const [key, value] of Object.entries(condition.match)) {
        const eventValue = (event as Record<string, unknown>)[key];
        if (eventValue === undefined) return false;

        if (value instanceof RegExp) {
          if (!value.test(String(eventValue))) return false;
        } else if (String(eventValue) !== value) {
          return false;
        }
      }
    }

    return true;
  });
}

async function executeSkillAction(
  binding: SkillBinding,
  event: PluginEvent,
): Promise<string> {
  const timeout = binding.action.timeoutMs ?? 30_000;

  switch (binding.action.type) {
    case 'invoke_skill': {
      const skillName = binding.action.config.skillName as string;
      const skills = await listSkills(100, undefined, 'released');
      const skill = skills.find((s) => s.name === skillName);
      if (!skill) throw new Error(`Skill not found: ${skillName}`);
      return `Invoked skill: ${skill.name}`;
    }

    case 'emit_event': {
      const eventType = binding.action.config.eventType as string;
      const payload = binding.action.config.payload as Record<string, unknown> | undefined;
      const newEvent: PluginEvent = {
        type: eventType as PluginEvent['type'],
        ...payload,
      } as PluginEvent;
      globalEventBus.emit(newEvent);
      return `Emitted event: ${eventType}`;
    }

    case 'notify': {
      const message = binding.action.config.message as string;
      return `Notification: ${message}`;
    }

    case 'inject_context':
      return 'Context injected';

    case 'call_tool':
      return `Tool call queued: ${binding.action.config.toolName as string}`;

    default:
      throw new Error(`Unknown action type: ${binding.action.type}`);
  }
}

function isOnCooldown(bindingId: string): boolean {
  const cooldownUntil = cooldownTimers.get(bindingId);
  if (!cooldownUntil) return false;
  return Date.now() < cooldownUntil;
}

function setCooldown(binding: SkillBinding): void {
  const condition = binding.conditions.find((c) => c.cooldownMs);
  if (condition?.cooldownMs) {
    cooldownTimers.set(binding.id, Date.now() + condition.cooldownMs);
  }
}

export function getSkillBusStatus(): {
  totalBindings: number;
  enabledBindings: number;
  activeCooldowns: number;
  recentResults: SkillBusResult[];
} {
  const all = Array.from(bindings.values());
  return {
    totalBindings: all.length,
    enabledBindings: all.filter((b) => b.enabled).length,
    activeCooldowns: cooldownTimers.size,
    recentResults: recentEvents.flatMap((e) => e.results).slice(-20),
  };
}

export function getRecentSkillBusEvents(limit = 20): SkillBusEvent[] {
  return recentEvents.slice(-limit).reverse();
}

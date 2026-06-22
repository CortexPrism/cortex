export interface SubAgentTask {
  id: string;
  sessionId: string;
  task: string;
  subAgentType?: string;
  status: 'running' | 'completed' | 'failed';
  startedAt: string;
  endedAt?: string;
  result?: string;
  error?: string;
}

export interface SubAgentMetrics {
  totalSpawned: number;
  totalCompleted: number;
  totalFailed: number;
  byType: Record<string, { spawned: number; completed: number; failed: number }>;
}

const activeTasks = new Map<string, SubAgentTask>();
const completedTasks: SubAgentTask[] = [];
const MAX_COMPLETED = 100;

// Per-type and global metrics
const metrics: SubAgentMetrics = {
  totalSpawned: 0,
  totalCompleted: 0,
  totalFailed: 0,
  byType: {},
};

function ensureTypeMetrics(type: string): void {
  if (!metrics.byType[type]) {
    metrics.byType[type] = { spawned: 0, completed: 0, failed: 0 };
  }
}

export function trackSubAgentStart(
  id: string,
  sessionId: string,
  task: string,
  subAgentType?: string,
): void {
  activeTasks.set(id, {
    id,
    sessionId,
    task: task.slice(0, 200),
    subAgentType,
    status: 'running',
    startedAt: new Date().toISOString(),
  });
  metrics.totalSpawned++;
  const type = subAgentType || 'general';
  ensureTypeMetrics(type);
  metrics.byType[type].spawned++;
}

export function trackSubAgentEnd(
  id: string,
  success: boolean,
  result?: string,
  error?: string,
  subAgentType?: string,
): void {
  const task = activeTasks.get(id);
  if (!task) return;
  task.status = success ? 'completed' : 'failed';
  task.endedAt = new Date().toISOString();
  task.result = result?.slice(0, 500);
  task.error = error?.slice(0, 200);
  activeTasks.delete(id);
  completedTasks.push({ ...task });
  while (completedTasks.length > MAX_COMPLETED) completedTasks.shift();

  if (success) {
    metrics.totalCompleted++;
  } else {
    metrics.totalFailed++;
  }
  const type = task.subAgentType || subAgentType || 'general';
  ensureTypeMetrics(type);
  if (success) {
    metrics.byType[type].completed++;
  } else {
    metrics.byType[type].failed++;
  }
}

export function getSubAgentMetrics(): SubAgentMetrics {
  return {
    totalSpawned: metrics.totalSpawned,
    totalCompleted: metrics.totalCompleted,
    totalFailed: metrics.totalFailed,
    byType: structuredClone(metrics.byType),
  };
}

export function getSubAgentSuccessRate(): number {
  if (metrics.totalSpawned === 0) return 1;
  return metrics.totalCompleted / metrics.totalSpawned;
}

export function getActiveSubAgentTasks(sessionId?: string): SubAgentTask[] {
  const tasks = Array.from(activeTasks.values());
  return sessionId ? tasks.filter((t) => t.sessionId === sessionId) : tasks;
}

export function getSubAgentTaskBoard(): {
  active: SubAgentTask[];
  recent: SubAgentTask[];
  metrics: SubAgentMetrics;
} {
  return {
    active: Array.from(activeTasks.values()),
    recent: completedTasks.slice(-20).reverse(),
    metrics: getSubAgentMetrics(),
  };
}

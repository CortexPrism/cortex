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

const activeTasks = new Map<string, SubAgentTask>();
const completedTasks: SubAgentTask[] = [];
const MAX_COMPLETED = 100;

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
}

export function trackSubAgentEnd(
  id: string,
  success: boolean,
  result?: string,
  error?: string,
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
}

export function getActiveSubAgentTasks(sessionId?: string): SubAgentTask[] {
  const tasks = Array.from(activeTasks.values());
  return sessionId ? tasks.filter((t) => t.sessionId === sessionId) : tasks;
}

export function getSubAgentTaskBoard(): {
  active: SubAgentTask[];
  recent: SubAgentTask[];
} {
  return {
    active: Array.from(activeTasks.values()),
    recent: completedTasks.slice(-20).reverse(),
  };
}

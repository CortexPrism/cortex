/**
 * A2A Protocol Bridge — Barrel exports.
 */
export type {
  A2AConfig,
  AgentCapabilities,
  AgentCard,
  AgentExtension,
  AgentInterface,
  AgentProvider,
  AgentSkill,
  Artifact,
  FilePart,
  ListTasksRequest,
  ListTasksResponse,
  Message,
  Part,
  PushNotificationConfig,
  RemoteAgentConfig,
  SecurityScheme,
  SendMessageConfiguration,
  SendMessageRequest,
  StreamResponse,
  Task,
  TaskArtifactUpdateEvent,
  TaskState,
  TaskStatus,
  TaskStatusUpdateEvent,
} from './types.ts';

export {
  cancelTask,
  fetchAgentCard,
  getTask,
  listTasks,
  sendMessage,
  sendStreamingMessage,
} from './client.ts';
export { getA2AAgentCard, handleA2ARequest, registerA2AExecutor, registerSwarmHandler, setA2ASkills } from './server.ts';
export type { SwarmDirectiveHandler } from './server.ts';
export { createA2AToolWrapper } from './tool-wrapper.ts';
export { generateAgentCard } from './agent-card.ts';
export { createA2AExecutor } from './executor.ts';

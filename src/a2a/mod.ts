/**
 * A2A Protocol Bridge — Barrel exports.
 */
export type {
  AgentCard,
  AgentCapabilities,
  AgentExtension,
  AgentInterface,
  AgentProvider,
  AgentSkill,
  Artifact,
  ListTasksRequest,
  ListTasksResponse,
  Message,
  Part,
  FilePart,
  PushNotificationConfig,
  SendMessageConfiguration,
  SendMessageRequest,
  StreamResponse,
  Task,
  TaskStatus,
  TaskState,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
  A2AConfig,
  RemoteAgentConfig,
  SecurityScheme,
} from './types.ts';

export { fetchAgentCard, sendMessage, sendStreamingMessage, getTask, listTasks, cancelTask } from './client.ts';
export { handleA2ARequest, registerA2AExecutor, setA2ASkills, getA2AAgentCard } from './server.ts';
export { createA2AToolWrapper } from './tool-wrapper.ts';
export { generateAgentCard } from './agent-card.ts';

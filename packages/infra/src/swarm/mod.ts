/**
 * Distributed Agent Swarm — Barrel exports.
 *
 * Cross-instance coordination for CortexPrism using A2A protocol
 * as the wire transport. Provides node registry, swarm coordinator,
 * remote kernel extensions, and A2A-based transport.
 */
export type {
  AggregatedResourceEntry,
  RemoteProcessEntry,
} from './remote-kernel.ts';
export {
  getAggregatedResources,
  getFullProcessTree,
  getRemoteProcessesForNode,
  getSwarmTopology,
  initRemoteKernel,
  registerRemoteProcess,
  syncRemoteResources,
  unregisterRemoteProcess,
} from './remote-kernel.ts';

export {
  discoverPeers,
  getNode,
  heartbeat,
  listNodes,
  markNodesOffline,
  registerNode,
  removeNode,
  updateNodeStatus,
  HEARTBEAT_INTERVAL_MS,
  NODE_STALE_MS,
} from './node-registry.ts';

export { createSwarmTransport } from './transport.ts';

export {
  handleSwarmDirective,
} from './directive-handler.ts';
export type {
  SwarmDirectiveContext,
  SwarmDirectiveResponse,
} from './directive-handler.ts';

export {
  initSwarmCoordinator,
  shutdownSwarmCoordinator,
  swarm,
} from './coordinator.ts';

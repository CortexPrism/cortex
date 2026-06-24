import type { RouteHandler } from './routes/_helpers.ts';
import { authGuard } from './routes/auth-guard.ts';

import { routes as corsRoutes } from './routes/cors.ts';
import { routes as i18nRoutes } from './routes/i18n-routes.ts';
import { routes as publicAuthRoutes } from './routes/public-auth.ts';
import { routes as onboardingRoutes } from './routes/onboarding.ts';
import { routes as healthRoutes } from './routes/health.ts';
import { routes as daemonsRoutes } from './routes/daemons.ts';
import { routes as systemRoutes } from './routes/system.ts';
import { routes as a2aRoutes } from './routes/a2a.ts';

import { routes as sessionsRoutes } from './routes/sessions.ts';
import { routes as jobsBasicRoutes } from './routes/jobs-basic.ts';
import { routes as diagnosticsRoutes } from './routes/diagnostics.ts';
import { routes as memorySearchRoutes } from './routes/memory-search.ts';
import { routes as webhooksRoutes } from './routes/webhooks.ts';
import { routes as channelsWebhookRoutes } from './routes/channels-webhook.ts';
import { routes as mcpServerRoutes } from './routes/mcp-server.ts';
import { routes as metricsRoutes } from './routes/metrics.ts';
import { routes as lensRoutes } from './routes/lens.ts';
import { routes as complianceRoutes } from './routes/compliance.ts';
import { routes as sessionMessagesRoutes } from './routes/session-messages.ts';
import { routes as uploadRoutes } from './routes/upload.ts';
import { routes as memoryAddRoutes } from './routes/memory-add.ts';
import { routes as skillsRoutes } from './routes/skills.ts';
import { routes as policiesRoutes } from './routes/policies.ts';
import { routes as memoryConfigRoutes } from './routes/memory-config.ts';
import { routes as metacognitionRoutes } from './routes/metacognition.ts';
import { routes as memoryGraphRoutes } from './routes/memory-graph.ts';
import { routes as configRoutes } from './routes/config-routes.ts';
import { routes as providersRoutes } from './routes/providers.ts';
import { routes as analyticsRoutes } from './routes/analytics.ts';
import { routes as dashboardConfigRoutes } from './routes/dashboard-config.ts';
import { routes as sessionDeleteRoutes } from './routes/session-delete.ts';
import { routes as pipelineRoutes } from './routes/pipeline.ts';
import { routes as projectsRoutes } from './routes/projects.ts';
import { routes as triggersRoutes } from './routes/triggers.ts';
import { routes as channelsRoutes } from './routes/channels.ts';
import { routes as pluginsRoutes } from './routes/plugins.ts';
import { routes as jobsCrudRoutes } from './routes/jobs-crud.ts';
import { routes as soulRoutes } from './routes/soul.ts';
import { routes as toolsListRoutes } from './routes/tools-list.ts';
import { routes as agentsRoutes } from './routes/agents.ts';
import { routes as securityRoutes } from './routes/security.ts';
import { routes as servicesRoutes } from './routes/services.ts';
import { routes as workspaceRoutes } from './routes/workspace.ts';
import { routes as workspaceHistoryRoutes } from './routes/workspace-history.ts';
import { routes as marketplaceRoutes } from './routes/marketplace.ts';
import { routes as githubRoutes } from './routes/github.ts';
import { routes as gitRoutes } from './routes/git.ts';
import { routes as codeExecRoutes } from './routes/code-exec.ts';
import { routes as nodesRoutes } from './routes/nodes.ts';
import { routes as computerUseRoutes } from './routes/computer-use.ts';
import { routes as vaultRoutes } from './routes/vault.ts';
import { routes as quartermasterRoutes } from './routes/quartermaster.ts';

import { routes as voiceRoutes } from './routes/voice.ts';
import { routes as codegraphRoutes } from './routes/codegraph.ts';
import { routes as workflowsRoutes } from './routes/workflows.ts';
import { routes as cacpRoutes } from './routes/cacp.ts';
import { routes as sandboxRoutes } from './routes/sandbox.ts';
import { routes as mcpConnectionsRoutes } from './routes/mcp-connections.ts';
import { routes as evalRoutes } from './routes/eval-routes.ts';
import { routes as sessionLinksRoutes } from './routes/session-links.ts';
import { routes as workspaceSnapshotsRoutes } from './routes/workspace-snapshots.ts';
import { routes as tunnelRoutes } from './routes/tunnel.ts';
import { routes as swarmRoutes } from './routes/swarm.ts';
import { routes as teamsRoutes } from './routes/teams.ts';
import { routes as sharesRoutes } from './routes/shares.ts';
import { routes as federationRoutes } from './routes/federation.ts';
import { routes as glossaryRoutes } from './routes/glossary-routes.ts';
import { routes as pkmRoutes } from './routes/pkm.ts';
import { routes as promptlabRoutes } from './routes/promptlab.ts';

const publicRoutes: RouteHandler[] = [
  ...corsRoutes,
  ...i18nRoutes,
  ...publicAuthRoutes,
  ...onboardingRoutes,
  ...healthRoutes,
  ...daemonsRoutes,
  ...systemRoutes,
  ...a2aRoutes,
  ...channelsWebhookRoutes,
];

const protectedRoutes: RouteHandler[] = [
  ...sessionsRoutes,
  ...jobsBasicRoutes,
  ...diagnosticsRoutes,
  ...memorySearchRoutes,
  ...webhooksRoutes,
  ...mcpServerRoutes,
  ...metricsRoutes,
  ...lensRoutes,
  ...complianceRoutes,
  ...sessionMessagesRoutes,
  ...uploadRoutes,
  ...memoryAddRoutes,
  ...skillsRoutes,
  ...policiesRoutes,
  ...memoryConfigRoutes,
  ...metacognitionRoutes,
  ...memoryGraphRoutes,
  ...configRoutes,
  ...providersRoutes,
  ...analyticsRoutes,
  ...dashboardConfigRoutes,
  ...sessionDeleteRoutes,
  ...pipelineRoutes,
  ...projectsRoutes,
  ...triggersRoutes,
  ...channelsRoutes,
  ...pluginsRoutes,
  ...jobsCrudRoutes,
  ...soulRoutes,
  ...toolsListRoutes,
  ...agentsRoutes,
  ...securityRoutes,
  ...servicesRoutes,
  ...workspaceRoutes,
  ...workspaceHistoryRoutes,
  ...marketplaceRoutes,
  ...githubRoutes,
  ...gitRoutes,
  ...codeExecRoutes,
  ...nodesRoutes,
  ...computerUseRoutes,
  ...vaultRoutes,
  ...quartermasterRoutes,
  ...tunnelRoutes,
  ...swarmRoutes,
  ...teamsRoutes,
  ...sharesRoutes,
  ...federationRoutes,
  ...glossaryRoutes,
  ...pkmRoutes,
  ...promptlabRoutes,
];

export async function handleApi(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  for (const route of publicRoutes) {
    if (route.method !== req.method) continue;
    const match = path.match(route.pattern);
    if (match) {
      const result = await route.handler(req, path);
      if (result) return result;
    }
  }

  const authError = await authGuard(req);
  if (authError) return authError;

  for (const route of protectedRoutes) {
    if (route.method !== req.method) continue;
    const match = path.match(route.pattern);
    if (match) {
      const result = await route.handler(req, path);
      if (result) return result;
    }
  }

  return null;
}

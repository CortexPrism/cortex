import type { NodeTier } from './node-registry.ts';

export interface TierDefinition {
  tier: NodeTier;
  label: string;
  allowedTools: string[];
  blockedTools: string[];
  allowedPaths: string[];
  forbiddenPaths: string[];
  allowedSudoCommands: string[];
  allowedDomains: string[];
  description: string;
}

const TIER_DEFINITIONS: Record<NodeTier, TierDefinition> = {
  root: {
    tier: 'root',
    label: 'Root (Maximum Privilege)',
    allowedTools: [
      'shell',
      'code_exec',
      'file_read',
      'file_write',
      'file_edit',
      'file_patch',
      'file_delete',
      'file_rename',
      'file_list',
      'file_tree',
      'file_info',
      'file_search',
      'file_undo',
      'file_redo',
      'git',
      'web_search',
      'sub_agent',
    ],
    blockedTools: [],
    allowedPaths: ['/'],
    forbiddenPaths: [],
    allowedSudoCommands: ['.*'],
    allowedDomains: ['*'],
    description: 'Full unrestricted access — all tools, all paths, all commands. Audit-logged.',
  },

  sudo: {
    tier: 'sudo',
    label: 'Sudo (Elevated, Scoped)',
    allowedTools: [
      'shell',
      'code_exec',
      'file_read',
      'file_write',
      'file_edit',
      'file_patch',
      'file_delete',
      'file_rename',
      'file_list',
      'file_tree',
      'file_info',
      'file_search',
      'file_undo',
      'file_redo',
      'git',
      'web_search',
    ],
    blockedTools: [],
    allowedPaths: [
      '/home/',
      '/opt/',
      '/var/',
      '/tmp/',
      '/etc/',
      '/usr/local/',
    ],
    forbiddenPaths: [
      '/etc/shadow',
      '/etc/passwd',
      '/root/',
      '/boot/',
      '/sys/',
      '/proc/',
    ],
    allowedSudoCommands: [
      'systemctl\\s+(restart|start|stop|status)\\s+\\S+',
      'docker\\s+(ps|logs|restart|start|stop)\\b.*',
      'apt-get\\s+(install|update|upgrade)\\b.*',
      'journalctl\\b.*',
      'supervisorctl\\s+(restart|start|stop|status)\\s+\\S+',
    ],
    allowedDomains: ['*'],
    description:
      'Scoped sudo access — managed commands via sudoers, path restrictions on system files.',
  },

  unprivileged: {
    tier: 'unprivileged',
    label: 'Unprivileged (Restricted)',
    allowedTools: [
      'file_read',
      'file_write',
      'file_list',
      'file_tree',
      'file_info',
      'file_search',
      'web_search',
      'git',
    ],
    blockedTools: [
      'shell',
      'code_exec',
      'file_delete',
      'file_edit',
      'file_patch',
      'file_rename',
      'file_undo',
      'file_redo',
    ],
    allowedPaths: [
      '/home/',
      '/tmp/',
    ],
    forbiddenPaths: [
      '/etc/',
      '/root/',
      '/boot/',
      '/sys/',
      '/proc/',
      '/var/',
      '/opt/',
      '/usr/',
    ],
    allowedSudoCommands: [],
    allowedDomains: ['*'],
    description:
      'Read-only exploration + home-directory writes. No shell execution, no system paths.',
  },
};

export function getTierDefinition(tier: NodeTier): TierDefinition {
  return TIER_DEFINITIONS[tier];
}

export function isToolAllowedByTier(tier: NodeTier, toolName: string): boolean {
  const def = TIER_DEFINITIONS[tier];
  if (def.blockedTools.includes(toolName)) return false;
  if (def.allowedTools.length === 0) return true;
  return def.allowedTools.includes(toolName);
}

export function isPathAllowedByTier(
  tier: NodeTier,
  filePath: string,
): { allowed: boolean; reason: string } {
  const def = TIER_DEFINITIONS[tier];
  const normalized = filePath.startsWith('/') ? filePath : `/${filePath}`;

  for (const forbidden of def.forbiddenPaths) {
    if (normalized.startsWith(forbidden) || normalized === forbidden) {
      return {
        allowed: false,
        reason: `Path "${filePath}" forbidden for tier "${tier}": matches forbidden ${forbidden}`,
      };
    }
  }

  if (def.allowedPaths.includes('/')) return { allowed: true, reason: 'All paths allowed' };

  for (const allowed of def.allowedPaths) {
    if (normalized.startsWith(allowed)) {
      return { allowed: true, reason: 'Path in allowed list' };
    }
  }

  return {
    allowed: false,
    reason: `Path "${filePath}" not in tier "${tier}" allowed paths: ${
      def.allowedPaths.join(', ')
    }`,
  };
}

export function isCommandAllowedByTier(
  tier: NodeTier,
  command: string,
): { allowed: boolean; reason: string } {
  const def = TIER_DEFINITIONS[tier];

  if (tier === 'unprivileged') {
    return { allowed: false, reason: 'Shell execution blocked for unprivileged tier' };
  }

  if (tier === 'root') {
    return { allowed: true, reason: 'All commands allowed for root tier' };
  }

  for (const pattern of def.allowedSudoCommands) {
    try {
      const re = new RegExp(pattern, 'i');
      if (re.test(command)) {
        return { allowed: true, reason: `Command matches sudo allow-list pattern: ${pattern}` };
      }
    } catch {
      continue;
    }
  }

  return {
    allowed: false,
    reason: `Command not in sudo allow-list for tier "sudo". Allowed patterns: ${
      def.allowedSudoCommands.join(', ')
    }`,
  };
}

export function getTierCapabilities(tier: NodeTier): string[] {
  const def = TIER_DEFINITIONS[tier];
  return def.allowedTools.filter((t) => !def.blockedTools.includes(t));
}

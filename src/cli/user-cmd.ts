import { Command } from '@cliffy/command';
import { cortexCommand } from '../../packages/cli/src/cli/command-builder.ts';

const AUTH_FILE = `${Deno.env.get('HOME') ?? '/root'}/.cortex/auth.json`;

async function getAuthToken(): Promise<string | null> {
  try {
    const data = await Deno.readTextFile(AUTH_FILE);
    const parsed = JSON.parse(data);
    return parsed.token ?? null;
  } catch {
    return null;
  }
}

async function saveAuthToken(token: string): Promise<void> {
  await Deno.mkdir(AUTH_FILE.replace(/\/[^/]+$/, ''), { recursive: true });
  await Deno.writeTextFile(AUTH_FILE, JSON.stringify({ token, savedAt: new Date().toISOString() }, null, 2));
}

async function clearAuthToken(): Promise<void> {
  try {
    await Deno.remove(AUTH_FILE);
  } catch { /* ok */ }
}

async function apiRequest(
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const token = await getAuthToken();
  const baseUrl = Deno.env.get('CORTEX_API_URL') || 'http://localhost:11434';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  try {
    const resp = await fetch(`${baseUrl}${path}`, opts);
    const data = await resp.json();
    return { status: resp.status, data };
  } catch (e) {
    throw new Error(`Cannot connect to Cortex server at ${baseUrl}. Is it running?`);
  }
}

export const loginCommand = cortexCommand('login')
  .description('Authenticate with a Cortex instance')
  .option('--token <token:string>', 'Login with an API token directly')
  .option('--host <host:string>', 'Server URL (default: http://localhost:11434)')
  .action(async (opts) => {
    const token = (opts as Record<string, string>).token;
    const host = (opts as Record<string, string>).host;

    if (token) {
      await saveAuthToken(token);
      if (host) Deno.env.set('CORTEX_API_URL', host);
      console.log('Logged in with API token.');
      return;
    }

    const username = prompt('Username: ');
    if (!username) {
      console.error('Username required.');
      Deno.exit(1);
    }
    const password = prompt('Password: ');
    if (!password) {
      console.error('Password required.');
      Deno.exit(1);
    }

    try {
      const { status, data } = await apiRequest('/api/auth/login', 'POST', { username, password });
      if (status === 200 && (data as Record<string, unknown>).sessionId) {
        const d = data as Record<string, unknown>;
        console.log(`Logged in as ${username}.${d.user ? ` User ID: ${(d.user as Record<string,string>).id}` : ''}`);
        console.log('Note: Web sessions are ephemeral. Use `cortex login --token <token>` with an API token for persistent CLI auth.');
      } else {
        console.error(`Login failed: ${(data as Record<string, unknown>).error || 'Unknown error'}`);
        Deno.exit(1);
      }
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const logoutCommand = cortexCommand('logout')
  .description('Clear stored authentication')
  .action(async () => {
    await clearAuthToken();
    console.log('Logged out. Auth token cleared.');
  });

export const whoamiCommand = cortexCommand('whoami')
  .description('Show current authenticated user and teams')
  .action(async () => {
    try {
      const token = await getAuthToken();
      if (!token) {
        console.log('Not authenticated. Run `cortex login` to sign in.');
        return;
      }
      const { status, data } = await apiRequest('/api/auth/status');
      if (status === 200 && (data as Record<string, unknown>).user) {
        const u = (data as Record<string, unknown>).user as Record<string, unknown>;
        console.log(`User: ${u.username || 'unknown'} (${u.id || 'unknown'})`);
        const teams = (data as Record<string, unknown>).teams as string[];
        if (teams && teams.length > 0) {
          console.log(`Teams: ${teams.join(', ')}`);
        }
        if (u.isInstanceAdmin) console.log('Role: Instance Admin');
      } else {
        console.log('Not authenticated or session expired.');
      }
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const usersListCommand = cortexCommand('list')
  .description('List all users (instance admin)')
  .action(async () => {
    try {
      const { status, data } = await apiRequest('/api/users');
      if (status !== 200) {
        console.error(`Error: ${(data as Record<string, unknown>).error}`);
        Deno.exit(1);
      }
      const users = data as Array<Record<string, unknown>>;
      if (users.length === 0) {
        console.log('No users found.');
        return;
      }
      console.log('Users:');
      for (const u of users) {
        const statusStr = u.disabled_at ? 'DISABLED' : 'active';
        const admin = u.email ? ` <${u.email}>` : '';
        console.log(`  ${u.username}${admin} — ${statusStr}`);
      }
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const usersCreateCommand = cortexCommand('create')
  .description('Create a new user (instance admin)')
  .arguments('<username:string> <password:string>')
  .action(async (_opts, _ctx, username: string, password: string) => {
    try {
      const { status, data } = await apiRequest('/api/users', 'POST', { username, password });
      if (status === 201) {
        console.log(`User "${username}" created.`);
      } else {
        console.error(`Error: ${(data as Record<string, unknown>).error}`);
        Deno.exit(1);
      }
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const usersDisableCommand = cortexCommand('disable')
  .description('Disable a user (instance admin)')
  .arguments('<userId:string>')
  .action(async (_opts, _ctx, userId: string) => {
    try {
      const { status, data } = await apiRequest(`/api/users/${userId}/disable`, 'POST');
      if (status === 200) console.log(`User ${userId} disabled.`);
      else console.error(`Error: ${(data as Record<string, unknown>).error}`);
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const usersEnableCommand = cortexCommand('enable')
  .description('Enable a disabled user (instance admin)')
  .arguments('<userId:string>')
  .action(async (_opts, _ctx, userId: string) => {
    try {
      const { status, data } = await apiRequest(`/api/users/${userId}/enable`, 'POST');
      if (status === 200) console.log(`User ${userId} enabled.`);
      else console.error(`Error: ${(data as Record<string, unknown>).error}`);
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const usersCommand = new Command()
  .name('users')
  .description('Manage instance users')
  .command('list', usersListCommand._cmd)
  .command('create', usersCreateCommand._cmd)
  .command('disable', usersDisableCommand._cmd)
  .command('enable', usersEnableCommand._cmd);

export const teamsListCommand = cortexCommand('list')
  .description('List your teams')
  .action(async () => {
    try {
      const { status, data } = await apiRequest('/api/teams');
      if (status !== 200) {
        console.error(`Error: ${(data as Record<string, unknown>).error}`);
        Deno.exit(1);
      }
      const teams = data as Array<Record<string, unknown>>;
      if (teams.length === 0) {
        console.log('No teams. Ask an admin to create one.');
        return;
      }
      console.log('Teams:');
      for (const t of teams) {
        console.log(`  ${t.name} (${t.id}) — ${t.member_count || 0} members`);
      }
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const teamsCreateCommand = cortexCommand('create')
  .description('Create a team (instance admin)')
  .arguments('<name:string>')
  .action(async (_opts, _ctx, name: string) => {
    try {
      const { status, data } = await apiRequest('/api/teams', 'POST', { name });
      if (status === 201) console.log(`Team "${name}" created.`);
      else console.error(`Error: ${(data as Record<string, unknown>).error}`);
    } catch (e) {
      console.error((e as Error).message);
      Deno.exit(1);
    }
  });

export const teamsCommand = new Command()
  .name('teams')
  .description('Manage teams')
  .command('list', teamsListCommand._cmd)
  .command('create', teamsCreateCommand._cmd);

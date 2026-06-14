import { listSessions, getSession } from '../db/sessions.ts';
import { getSessionEvents } from '../db/lens.ts';
import { listJobs } from '../scheduler/scheduler.ts';
import { retrieve } from '../memory/store.ts';
import { loadConfig } from '../config/config.ts';
import { buildEmbedder } from '../memory/embeddings.ts';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function notFound(msg = 'Not found'): Response {
  return json({ error: msg }, 404);
}

function err(msg: string, status = 500): Response {
  return json({ error: msg }, status);
}

export async function handleApi(req: Request): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // GET /api/sessions
  if (req.method === 'GET' && path === '/api/sessions') {
    const limit = Number(url.searchParams.get('limit') ?? 20);
    const sessions = await listSessions(limit);
    return json(sessions);
  }

  // GET /api/sessions/:id
  const sessionMatch = path.match(/^\/api\/sessions\/([^/]+)$/);
  if (req.method === 'GET' && sessionMatch) {
    const session = await getSession(sessionMatch[1]);
    if (!session) return notFound('Session not found');
    return json(session);
  }

  // GET /api/sessions/:id/events
  const eventsMatch = path.match(/^\/api\/sessions\/([^/]+)\/events$/);
  if (req.method === 'GET' && eventsMatch) {
    const events = await getSessionEvents(eventsMatch[1]);
    return json(events);
  }

  // GET /api/jobs
  if (req.method === 'GET' && path === '/api/jobs') {
    const status = url.searchParams.get('status') as never ?? undefined;
    const jobs = await listJobs(status);
    return json(jobs);
  }

  // GET /api/memory/search?q=...
  if (req.method === 'GET' && path === '/api/memory/search') {
    const q = url.searchParams.get('q');
    if (!q) return err('Missing query param: q', 400);
    const config = await loadConfig();
    const embedder = buildEmbedder(config);
    const hits = await retrieve(q, embedder, { limit: 10 });
    return json(hits);
  }

  // GET /api/health
  if (req.method === 'GET' && path === '/api/health') {
    return json({ status: 'ok', ts: new Date().toISOString() });
  }

  return null;
}

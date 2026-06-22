import { logger } from '../../../../../src/utils/logger.ts';
import type { Db } from '../../../../../src/db/client.ts';
import type { Message } from '../../llm/types.ts';
import type { TurnContext } from '../pipeline/context.ts';

const _log = logger('agent:loop');

async function loadHybridHistory(
  db: Db,
  query: string,
  recencyWindow = 20,
  semanticK = 5,
): Promise<Message[]> {
  const recentRows = await db.all<{ id: number; role: string; content: string }>(
    `SELECT id, role, content FROM session_messages
     WHERE role IN ('user', 'assistant')
     ORDER BY id DESC LIMIT ?`,
    [recencyWindow],
  );
  recentRows.reverse();
  const recentIds = new Set(recentRows.map((r) => r.id));
  const oldestRecentId = recentRows.length > 0 ? recentRows[0].id : Number.MAX_SAFE_INTEGER;

  let supplementBlock = '';
  if (semanticK > 0 && oldestRecentId > 1) {
    const terms = query
      .replace(/["'\-*()]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
      .slice(0, 8)
      .join(' ');

    if (terms.length > 0) {
      const oldRows = await db.all<
        { id: number; role: string; content: string; created_at: string }
      >(
        `SELECT id, role, content, created_at FROM session_messages
         WHERE role IN ('user', 'assistant')
           AND id < ?
           AND content LIKE ?
         ORDER BY id DESC LIMIT ?`,
        [oldestRecentId, `%${terms.split(' ')[0]}%`, semanticK * 4],
      );

      const scored = oldRows
        .filter((r) => !recentIds.has(r.id))
        .map((r) => {
          const lower = r.content.toLowerCase();
          const hits = terms.split(' ').filter((t) => lower.includes(t)).length;
          return { ...r, hits };
        })
        .filter((r) => r.hits > 0)
        .sort((a, b) => b.hits - a.hits || b.id - a.id)
        .slice(0, semanticK)
        .sort((a, b) => a.id - b.id);

      if (scored.length > 0) {
        const lines = scored.map((r) => {
          const ts = r.created_at ? ` (${r.created_at.slice(0, 16)})` : '';
          const preview = r.content.slice(0, 600);
          return `[turn-${r.id} · ${r.role}${ts}]: ${preview}`;
        });
        supplementBlock =
          `[Relevant earlier context retrieved from this session — treat as background, not the live conversation thread]
${lines.join('\n\n')}
[End of earlier context]`;
      }
    }
  }

  const messages: Message[] = [];
  if (supplementBlock) {
    messages.push({ role: 'user' as const, content: supplementBlock });
    messages.push({
      role: 'assistant' as const,
      content: 'Understood. I have noted the earlier context above.',
    });
  }
  for (const r of recentRows) {
    messages.push({ role: r.role as 'user' | 'assistant', content: r.content });
  }
  return messages;
}

async function persistMessage(
  db: Db,
  role: 'user' | 'assistant',
  content: string,
  tokenCount?: number,
): Promise<void> {
  await db.run(
    `INSERT INTO session_messages (role, content, token_count) VALUES (?, ?, ?)`,
    [role, content, tokenCount ?? null],
  );
}

export async function loadHistory(ctx: TurnContext): Promise<void> {
  const { options, turnId, effectiveInput } = ctx;

  const recencyWindow = options.historyRecencyWindow ?? 20;
  const semanticK = options.historySemanticK ?? 5;
  _log.debug(`Loading history`, { turnId, recencyWindow, semanticK });
  const history = await loadHybridHistory(options.sessionDb, effectiveInput, recencyWindow, semanticK);
  const messages: Message[] = [...history];
  _log.debug(`History loaded`, {
    turnId,
    historyLength: history.length,
    totalMessages: messages.length,
  });

  const hasDocumentContext = messages.some((message) => {
    const content = typeof message.content === 'string' ? message.content : message.content
      .map((block) => block.type === 'text' ? block.text : block.type)
      .join(' ');
    return /=== BEGIN DOCUMENT:|=== END DOCUMENT:|\[File:|file_read\(|Document\(s\) uploaded/i.test(
      content,
    );
  });

  if (
    options.userContentBlocks &&
    options.userContentBlocks.length > 0 &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'user'
  ) {
    messages[messages.length - 1] = {
      role: 'user',
      content: options.userContentBlocks,
    };
    _log.debug(`Applied user content blocks`, {
      turnId,
      blockCount: options.userContentBlocks.length,
    });
  }

  ctx.messages = messages;
  ctx.hasDocumentContext = hasDocumentContext;
}

export { loadHybridHistory, persistMessage };

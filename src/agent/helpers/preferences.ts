import { writeSemantic } from '../../memory/store.ts';
import { appendToMemoryFile } from '../soul.ts';
import { learnFromCorrection } from '../../memory/preference-learner.ts';

const PREFERENCE_PATTERNS: Array<
  { re: RegExp; extract: (m: RegExpMatchArray) => string; category: string }
> = [
  {
    re: /(?:call|refer to|name) (?:yourself|you) (?:as )?["']?([\w\s-]{1,40})["']?/i,
    extract: (m) => `The user wants the assistant to be called "${m[1].trim()}".`,
    category: 'identity',
  },
  {
    re: /(?:i(?:'m| am)|my name(?:'s| is)) ([A-Z][\w\s]{1,30})/,
    extract: (m) => `The user's name is ${m[1].trim()}.`,
    category: 'preference',
  },
  {
    re: /(?:always|please always|i (?:prefer|want|like)) (.{10,120})/i,
    extract: (m) => `User preference: ${m[1].trim()}.`,
    category: 'preference',
  },
  {
    re: /(?:don't|do not|never|stop) (.{5,80})/i,
    extract: (m) => `User instruction: do not ${m[1].trim()}.`,
    category: 'preference',
  },
  {
    re: /(?:remember that|note that|keep in mind) (.{5,200})/i,
    extract: (m) => `User wants this remembered: ${m[1].trim()}.`,
    category: 'preference',
  },
];

async function detectAndPersistPreference(userMessage: string, sessionId: string): Promise<void> {
  void learnFromCorrection(sessionId, userMessage, '');

  for (const { re, extract, category } of PREFERENCE_PATTERNS) {
    const m = userMessage.match(re);
    if (!m) continue;
    const content = extract(m);
    await Promise.all([
      appendToMemoryFile(`- [${category}] ${content}`),
      writeSemantic({ content, category, importance: 0.9 }),
    ]).catch(() => {});
    break;
  }
}

export { detectAndPersistPreference, PREFERENCE_PATTERNS };

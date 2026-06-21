import { Component } from '../component.ts';
import type { RenderContext } from '../component.ts';

const KEYWORDS: Record<string, string[]> = {
  typescript: [
    'const',
    'let',
    'var',
    'function',
    'async',
    'await',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'interface',
    'type',
    'export',
    'import',
    'from',
    'extends',
    'implements',
    'new',
    'throw',
    'try',
    'catch',
    'finally',
    'typeof',
    'instanceof',
    'switch',
    'case',
    'break',
    'continue',
    'default',
    'void',
    'null',
    'undefined',
    'enum',
    'namespace',
    'abstract',
    'readonly',
    'static',
    'private',
    'public',
    'protected',
    'true',
    'false',
    'yield',
    'as',
    'in',
    'of',
    'keyof',
    'infer',
    'never',
    'unknown',
  ],
  javascript: [
    'const',
    'let',
    'var',
    'function',
    'async',
    'await',
    'return',
    'if',
    'else',
    'for',
    'while',
    'class',
    'extends',
    'new',
    'throw',
    'try',
    'catch',
    'finally',
    'typeof',
    'instanceof',
    'switch',
    'case',
    'break',
    'continue',
    'default',
    'void',
    'null',
    'undefined',
    'true',
    'false',
    'yield',
    'export',
    'import',
    'from',
  ],
  python: [
    'def',
    'class',
    'return',
    'if',
    'elif',
    'else',
    'for',
    'while',
    'import',
    'from',
    'as',
    'try',
    'except',
    'finally',
    'raise',
    'with',
    'yield',
    'lambda',
    'pass',
    'break',
    'continue',
    'in',
    'not',
    'and',
    'or',
    'is',
    'None',
    'True',
    'False',
    'async',
    'await',
    'global',
    'nonlocal',
    'assert',
    'del',
  ],
  go: [
    'func',
    'return',
    'if',
    'else',
    'for',
    'range',
    'var',
    'const',
    'type',
    'struct',
    'interface',
    'map',
    'chan',
    'go',
    'select',
    'defer',
    'package',
    'import',
    'nil',
    'true',
    'false',
    'break',
    'continue',
    'switch',
    'case',
    'default',
    'fallthrough',
    'make',
    'new',
    'append',
    'len',
    'cap',
    'error',
  ],
  rust: [
    'fn',
    'let',
    'mut',
    'return',
    'if',
    'else',
    'for',
    'while',
    'loop',
    'match',
    'struct',
    'enum',
    'impl',
    'trait',
    'pub',
    'use',
    'mod',
    'crate',
    'self',
    'super',
    'where',
    'as',
    'in',
    'ref',
    'move',
    'async',
    'await',
    'unsafe',
    'extern',
    'type',
    'const',
    'static',
    'true',
    'false',
    'Some',
    'None',
    'Ok',
    'Err',
  ],
  bash: [
    'if',
    'then',
    'else',
    'elif',
    'fi',
    'for',
    'while',
    'do',
    'done',
    'case',
    'esac',
    'in',
    'function',
    'return',
    'exit',
    'export',
    'local',
    'source',
    'echo',
    'read',
    'shift',
    'alias',
    'unalias',
    'set',
    'unset',
    'declare',
  ],
  json: [],
  yaml: [],
  toml: [],
  sql: [
    'SELECT',
    'FROM',
    'WHERE',
    'INSERT',
    'UPDATE',
    'DELETE',
    'CREATE',
    'ALTER',
    'DROP',
    'TABLE',
    'INDEX',
    'INTO',
    'VALUES',
    'SET',
    'AND',
    'OR',
    'NOT',
    'NULL',
    'JOIN',
    'LEFT',
    'RIGHT',
    'INNER',
    'OUTER',
    'ON',
    'AS',
    'ORDER',
    'BY',
    'GROUP',
    'HAVING',
    'LIMIT',
    'OFFSET',
    'UNION',
    'ALL',
    'EXISTS',
    'BETWEEN',
    'LIKE',
    'IN',
    'IS',
    'TRUE',
    'FALSE',
    'PRIMARY',
    'KEY',
    'FOREIGN',
    'REFERENCES',
    'CASCADE',
  ],
};

const COMMENT_MAP: Record<string, { line: string }> = {
  typescript: { line: '//' },
  javascript: { line: '//' },
  python: { line: '#' },
  go: { line: '//' },
  rust: { line: '//' },
  bash: { line: '#' },
  sql: { line: '--' },
};

export class CodeBlock extends Component {
  private code = '';
  private language = '';

  setCode(code: string, language?: string): void {
    this.code = code;
    this.language = language ?? '';
    this.requestRender();
  }

  render(ctx: RenderContext): void {
    const keywordStyle = ctx.theme.styles['code'] ?? { fg: '33' };
    const stringStyle = ctx.theme.styles['code'] ?? { fg: '32' };
    const commentStyle = ctx.theme.styles['muted'] ?? { dim: true };
    const defaultStyle = ctx.theme.styles['default'] ?? {};

    const lines = this.code.split('\n');
    const lang = this.language.toLowerCase();
    const keywords = new Set(KEYWORDS[lang] ?? []);
    const commentPrefix = COMMENT_MAP[lang]?.line;

    let y = ctx.y;
    for (let i = 0; i < lines.length && y < ctx.y + ctx.height; i++) {
      const line = lines[i];
      const segments = this.tokenize(line, keywords, commentPrefix);
      let cx = ctx.x;

      for (const seg of segments) {
        if (cx >= ctx.x + ctx.width) break;
        const text = seg.text.slice(0, ctx.x + ctx.width - cx);
        const style = seg.type === 'keyword'
          ? keywordStyle
          : seg.type === 'string'
          ? stringStyle
          : seg.type === 'comment'
          ? commentStyle
          : defaultStyle;
        ctx.buffer.drawText(cx, y, text, style);
        cx += text.length;
      }
      y++;
    }
  }

  private tokenize(
    line: string,
    keywords: Set<string>,
    commentPrefix: string | undefined,
  ): Array<{ text: string; type: 'keyword' | 'string' | 'comment' | 'plain' }> {
    const segments: Array<{ text: string; type: 'keyword' | 'string' | 'comment' | 'plain' }> = [];

    if (commentPrefix && line.trimStart().startsWith(commentPrefix)) {
      segments.push({ text: line, type: 'comment' });
      return segments;
    }

    let i = 0;
    while (i < line.length) {
      if (line[i] === '"' || line[i] === "'" || line[i] === '`') {
        const quote = line[i];
        const end = line.indexOf(quote, i + 1);
        if (end > i) {
          segments.push({ text: line.slice(i, end + 1), type: 'string' });
          i = end + 1;
          continue;
        }
      }

      if (i < line.length - 1 && line[i] === '/' && line[i + 1] === '/') {
        segments.push({ text: line.slice(i), type: 'comment' });
        break;
      }

      if (/\w/.test(line[i])) {
        let j = i;
        while (j < line.length && /\w/.test(line[j])) j++;
        const word = line.slice(i, j);
        segments.push({
          text: word,
          type: keywords.has(word) ? 'keyword' : 'plain',
        });
        i = j;
        continue;
      }

      let j = i;
      while (
        j < line.length && !/[\w"'`]/.test(line[j]) &&
        !(j < line.length - 1 && line[j] === '/' && line[j + 1] === '/')
      ) {
        j++;
      }
      if (j > i) {
        segments.push({ text: line.slice(i, j), type: 'plain' });
      }
      i = j;
    }

    return segments;
  }
}

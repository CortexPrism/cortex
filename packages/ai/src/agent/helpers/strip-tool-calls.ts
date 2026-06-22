export function stripToolCallMarkup(text: string): string {
  // Remove <tool_call>...</tool_call> blocks
  let out = text.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '');

  // Remove bare JSON tool calls using a brace-depth walker so nested args
  // like {"tool":"x","args":{"path":"..."}} are fully consumed.
  const bareToolRe = /\{\s*"(tool|name)"\s*:/g;
  let bm: RegExpExecArray | null;
  const regions: Array<[number, number]> = [];
  while ((bm = bareToolRe.exec(out)) !== null) {
    const start = bm.index;
    let depth = 0;
    let inStr = false;
    let esc = false;
    let end = -1;
    for (let i = start; i < out.length; i++) {
      const ch = out[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') {
        esc = true;
        continue;
      }
      if (ch === '"') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end > start) regions.push([start, end]);
  }
  // Remove matched regions right-to-left so indices stay valid
  for (let i = regions.length - 1; i >= 0; i--) {
    out = out.slice(0, regions[i][0]) + out.slice(regions[i][1]);
  }

  // Remove fenced code blocks that contain tool call JSON
  out = out.replace(/```[\s\S]*?```/g, (block) => {
    return /\{\s*"(tool|name)"\s*:/.test(block) ? '' : block;
  });

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

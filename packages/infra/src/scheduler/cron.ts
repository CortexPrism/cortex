export function nextCronDate(expr: string): Date {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Invalid cron expression: ${expr}`);

  const [minExpr, hourExpr, domExpr, monExpr, dowExpr] = parts;

  const now = new Date();
  const candidate = new Date(now);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);

  for (let i = 0; i < 527040; i++) {
    if (
      matchField(candidate.getMonth() + 1, monExpr, 1, 12) &&
      matchField(candidate.getDate(), domExpr, 1, 31) &&
      matchField(candidate.getDay(), dowExpr, 0, 6) &&
      matchField(candidate.getHours(), hourExpr, 0, 23) &&
      matchField(candidate.getMinutes(), minExpr, 0, 59)
    ) {
      return candidate;
    }
    candidate.setMinutes(candidate.getMinutes() + 1);
  }

  throw new Error(`Could not find next occurrence for: ${expr}`);
}

function matchField(value: number, expr: string, min: number, max: number): boolean {
  if (expr === '*') return true;

  for (const part of expr.split(',')) {
    if (part.includes('/')) {
      const [range, step] = part.split('/');
      const stepN = parseInt(step);
      const [start] = range === '*' ? [min] : range.split('-').map(Number);
      if ((value - start) % stepN === 0 && value >= start) return true;
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number);
      if (value >= lo && value <= hi) return true;
    } else {
      if (parseInt(part) === value) return true;
    }
  }

  return false;
}
